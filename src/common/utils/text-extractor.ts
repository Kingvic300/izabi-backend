import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { MAX_UPLOAD_SIZE_MB } from '../constants/upload.constants';

// Optimal limits for high-speed processing on Render
const MAX_EXTRACTION_CHARS = 700000;
const MAX_PDF_PAGES = 300;

const isPdfFile = (file: Express.Multer.File): boolean => {
    const mime = (file.mimetype || '').toLowerCase();
    const fileName = (file.originalname || '').toLowerCase();
    return mime.includes('pdf') || fileName.endsWith('.pdf');
};

const loadPdfJs = async (): Promise<any> => {
    try {
        // Prefer legacy build for Node.js runtime compatibility.
        return await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
        return await import('pdfjs-dist/build/pdf.mjs');
    }
};

const loadModernPdfJs = async (): Promise<any> => {
    try {
        return await import('pdfjs-dist/build/pdf.mjs');
    } catch {
        return await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
};

const tryExtractTextFromPdf = async (
    file: Express.Multer.File,
    pdfjs: any,
    strategy: 'compat' | 'strict',
) => {
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(file.buffer),
        useSystemFonts: strategy === 'compat',
        disableFontFace: strategy === 'compat',
    }).promise;

    const numPages = Math.min(doc.numPages, MAX_PDF_PAGES);
    let fullText = '';
    let pagesWithText = 0;
    let failedPages = 0;

    for (let i = 1; i <= numPages; i++) {
        try {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items
                .map((item: any) =>
                    typeof item?.str === 'string' ? item.str : '',
                )
                .filter(Boolean);

            if (strings.length > 0) {
                fullText += strings.join(' ') + '\n';
                pagesWithText += 1;
            }
        } catch {
            failedPages += 1;
        }
    }

    return {
        text: fullText,
        numPages,
        pagesWithText,
        failedPages,
    };
};

const extractTextFallbackFromPdfBinary = (buffer: Buffer): string => {
    const raw = buffer.toString('latin1');
    const segments =
        raw.match(
            /[A-Za-z][A-Za-z0-9,.;:'"()\-_/+\s]{5,160}/g,
        ) || [];

    const cleaned = segments
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter(
            (segment) =>
                segment.length >= 8 &&
                /[aeiouAEIOU]/.test(segment) &&
                !/[<>{}\[\]\\]/.test(segment),
        );

    return cleaned.slice(0, 3000).join(' ');
};

/**
 * Smartly trims text to focus on main content by removing common book/paper noise.
 */
const cleanTextContent = (text: string): string => {
    let cleaned = text;

    const startMarkers = [
        /chapter\s+1/i,
        /introduction/i,
        /background/i,
        /executive\s+summary/i,
    ];

    for (const marker of startMarkers) {
        const match = text.slice(0, 100000).match(marker);
        if (match?.index && match.index > 5000) {
            cleaned = text.slice(match.index);
            break;
        }
    }

    const endMarkers = [
        'references',
        'bibliography',
        'appendix',
        'index',
        'glossary',
    ];

    for (const marker of endMarkers) {
        const lastIndex = cleaned.toLowerCase().lastIndexOf(marker);
        if (lastIndex !== -1 && lastIndex > cleaned.length * 0.7) {
            cleaned = cleaned.slice(0, lastIndex);
        }
    }

    return cleaned;
};

/**
 * Optimized Document Ingestion Node
 */
export const extractTextFromFile = async (
    file: Express.Multer.File,
): Promise<string> => {
    const startTime = Date.now();
    let extractedText = '';

    try {
        if (!file?.buffer) {
            throw new BadRequestException('Invalid file: No content received.');
        }

        const fileSizeMB = file.buffer.length / (1024 * 1024);
        if (fileSizeMB > MAX_UPLOAD_SIZE_MB) {
            throw new BadRequestException(
                `File too large (${fileSizeMB.toFixed(1)}MB). Max allowed is ${MAX_UPLOAD_SIZE_MB}MB.`,
            );
        }

        const mime = file.mimetype;
        console.log(
            `[DocumentNode] Ingesting: ${file.originalname} (${mime}, ${fileSizeMB.toFixed(2)}MB)`,
        );

        if (isPdfFile(file)) {
            // Strategy 1: Legacy/compat extraction
            const legacyPdfJs = await loadPdfJs();
            const legacyResult = await tryExtractTextFromPdf(
                file,
                legacyPdfJs,
                'compat',
            );
            extractedText = legacyResult.text;
            console.log(
                `[DocumentNode] PDF extracted (compat): ${legacyResult.numPages} pages, ${legacyResult.pagesWithText} pages with text, ${legacyResult.failedPages} failed pages, ${extractedText.length} chars`,
            );

            // Strategy 2: Modern/strict fallback if compat yielded almost nothing
            if (extractedText.trim().length < 10) {
                try {
                    const modernPdfJs = await loadModernPdfJs();
                    const modernResult = await tryExtractTextFromPdf(
                        file,
                        modernPdfJs,
                        'strict',
                    );
                    if (modernResult.text.trim().length > extractedText.length) {
                        extractedText = modernResult.text;
                    }
                    console.log(
                        `[DocumentNode] PDF fallback (strict): ${modernResult.numPages} pages, ${modernResult.pagesWithText} pages with text, ${modernResult.failedPages} failed pages, ${modernResult.text.length} chars`,
                    );
                } catch (fallbackErr) {
                    console.warn(
                        '[DocumentNode] PDF strict fallback failed:',
                        fallbackErr,
                    );
                }
            }

            // Strategy 3: Raw binary text sniffing for unusual PDFs
            if (extractedText.trim().length < 10) {
                const binaryFallback = extractTextFallbackFromPdfBinary(
                    file.buffer,
                );
                if (binaryFallback.trim().length > extractedText.trim().length) {
                    extractedText = binaryFallback;
                    console.log(
                        `[DocumentNode] PDF binary fallback recovered ${binaryFallback.length} chars`,
                    );
                }
            }
        } else if (mime === 'text/plain') {
            extractedText = file.buffer.toString('utf-8');
        } else if (
            mime ===
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mime === 'application/msword'
        ) {
            const result = await mammoth.extractRawText({
                buffer: file.buffer,
            });
            extractedText = result.value;
        } else if (
            mime === 'image/png' ||
            mime === 'image/jpeg' ||
            mime === 'image/jpg'
        ) {
            console.log('[DocumentNode] OCR processing...');
            const worker = await createWorker('eng');
            const { data } = await worker.recognize(file.buffer);
            await worker.terminate();
            extractedText = data.text;
        } else if (
            mime.startsWith('text/') ||
            mime === 'application/json' ||
            mime === 'text/csv' ||
            mime === 'text/markdown'
        ) {
            extractedText = file.buffer.toString('utf-8');
        } else {
            throw new BadRequestException(`Unsupported file type: ${mime}`);
        }

        if (!extractedText?.trim()) {
            throw new BadRequestException(
                'Could not read text from this file. It may be an image-only scan. Please upload a clearer text-based document or convert scanned pages to image files (PNG/JPG) for OCR.',
            );
        }

        const originalLength = extractedText.length;
        extractedText = cleanTextContent(extractedText);

        const removed = originalLength - extractedText.length;
        if (removed > 0) {
            console.log(`[DocumentNode] Removed ${removed} chars of noise`);
        }

        extractedText = extractedText
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (extractedText.length > MAX_EXTRACTION_CHARS) {
            extractedText =
                extractedText.slice(0, MAX_EXTRACTION_CHARS) +
                '\n\n[Document truncated for processing limits]';
        }

        if (extractedText.length < 3) {
            throw new BadRequestException('Content too short.');
        }

        console.log(
            `[DocumentNode] Finished in ${Date.now() - startTime}ms. Yield: ${extractedText.length} chars`,
        );

        return extractedText;
    } catch (error) {
        console.error('[DocumentNode] Extraction Failure:', error);
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Document ingestion failed.');
    }
};

/**
 * Fast preview extraction
 */
export const extractTextPreview = async (
    file: Express.Multer.File,
    maxChars = 5000,
): Promise<string> => {
    try {
        if (!file?.buffer) return '';

        if (isPdfFile(file)) {
            const pdfjs = await loadPdfJs();

            const doc = await pdfjs.getDocument({
                data: new Uint8Array(file.buffer),
                useSystemFonts: true,
                disableFontFace: true,
            }).promise;

            let text = '';
            // Limit to first 3 pages
            const numPages = Math.min(doc.numPages, 3);

            for (let i = 1; i <= numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map((item: any) => item.str).join(' ');
            }
            return text.substring(0, maxChars);
        }

        if (file.mimetype === 'text/plain') {
            return file.buffer.toString('utf-8').substring(0, maxChars);
        }

        return '';
    } catch {
        return '';
    }
};
