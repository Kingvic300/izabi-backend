import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { MAX_UPLOAD_SIZE_MB } from '../constants/upload.constants';
import {
    LARGE_TEXT_STREAM_MB,
    MAX_EXTRACTION_CHARS,
} from './text-extractor/constants';
import { detectFileKind, detectFileType } from './text-extractor/detect';
import { runOcr } from './text-extractor/ocr';
import {
    extractTextFallbackFromPdfBinary,
    extractTextFromPdfOcr,
    loadModernPdfJs,
    loadPdfJs,
    shouldAttemptOcr,
    tryExtractTextFromPdf,
} from './text-extractor/pdf';
import { maybeParseHtml, readTextFromStream } from './text-extractor/text';
import { extractTextFromXlsx } from './text-extractor/xlsx';
import { cleanTextContent } from './text-extractor/utils';

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

        const mime = (file.mimetype || '').toLowerCase();
        const fileKind = detectFileKind(file);
        const fileType = detectFileType(file);
        console.log(
            `[DocumentNode] Ingesting: ${file.originalname} (${mime}, ${fileSizeMB.toFixed(
                2,
            )}MB, ${fileType}/${fileKind})`,
        );

        if (fileType === 'pdf') {
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

            // Strategy 3: OCR fallback for image-only PDFs
            if (shouldAttemptOcr(extractedText)) {
                try {
                    const ocrResult = await extractTextFromPdfOcr(
                        file,
                        legacyPdfJs,
                    );
                    if (ocrResult.numPages === 0) {
                        console.warn(
                            '[DocumentNode] PDF OCR skipped (canvas module not available).',
                        );
                    } else if (
                        ocrResult.text.trim().length >
                        extractedText.trim().length
                    ) {
                        extractedText = ocrResult.text;
                    }
                    console.log(
                        `[DocumentNode] PDF OCR fallback: ${ocrResult.numPages} pages, ${ocrResult.pagesOcred} pages OCRed, ${ocrResult.text.length} chars`,
                    );
                } catch (ocrErr) {
                    console.warn(
                        '[DocumentNode] PDF OCR fallback failed:',
                        ocrErr,
                    );
                }
            }

            // Strategy 4: Raw binary text sniffing for unusual PDFs
            if (shouldAttemptOcr(extractedText)) {
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
        } else if (fileType === 'text') {
            if (file.stream && fileSizeMB > LARGE_TEXT_STREAM_MB) {
                // For large text-like files, prefer streaming to reduce peak memory usage.
                extractedText = await readTextFromStream(
                    file.stream,
                    MAX_EXTRACTION_CHARS,
                );
            } else {
                extractedText = file.buffer.toString('utf-8');
            }

            if (fileKind === 'html') {
                extractedText = maybeParseHtml(extractedText);
            }
        } else if (fileType === 'docx' || mime === 'application/msword') {
            const result = await mammoth.extractRawText({
                buffer: file.buffer,
            });
            extractedText = result.value;
        } else if (fileKind === 'xlsx') {
            extractedText = await extractTextFromXlsx(file.buffer);
        } else if (fileType === 'image') {
            console.log('[DocumentNode] OCR processing...');
            extractedText = await runOcr(file.buffer);
            console.log(
                `[DocumentNode] OCR output length: ${extractedText.length} chars`,
            );
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
            .replace(/\\r\\n/g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();

        if (extractedText.length > MAX_EXTRACTION_CHARS) {
            extractedText =
                extractedText.slice(0, MAX_EXTRACTION_CHARS) +
                '\\n\\n[Document truncated for processing limits]';
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

        const fileKind = detectFileKind(file);
        const fileType = detectFileType(file);

        if (fileType === 'pdf') {
            const pdfjs = await loadPdfJs();

            const doc = await pdfjs.getDocument({
                data: new Uint8Array(file.buffer),
                useSystemFonts: true,
                disableFontFace: true,
            }).promise;

            try {
                let text = '';
                // Limit to first 3 pages
                const numPages = Math.min(doc.numPages, 3);

                for (let i = 1; i <= numPages; i++) {
                    const page = await doc.getPage(i);
                    const content = await page.getTextContent();
                    page.cleanup?.();
                    text += content.items.map((item: any) => item.str).join(' ');
                }
                return text.substring(0, maxChars);
            } finally {
                if (typeof doc.destroy === 'function') {
                    await doc.destroy();
                }
            }
        }

        if (fileType === 'text') {
            const raw = file.buffer.toString('utf-8').substring(0, maxChars);
            return fileKind === 'html' ? maybeParseHtml(raw) : raw;
        }

        if (fileKind === 'xlsx') {
            const text = await extractTextFromXlsx(file.buffer);
            return text.substring(0, maxChars);
        }

        return '';
    } catch {
        return '';
    }
};
