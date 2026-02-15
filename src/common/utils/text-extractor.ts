import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { MAX_UPLOAD_SIZE_MB } from '../constants/upload.constants';

// Optimal limits for high-speed processing on Render
const MAX_EXTRACTION_CHARS = 700000;
const MAX_PDF_PAGES = 300;
const PDF_PAGE_CONCURRENCY = 5;
const DEFAULT_OCR_MAX_PDF_PAGES = 25;
const OCR_MAX_PDF_PAGES = Number(
    process.env.OCR_MAX_PDF_PAGES || DEFAULT_OCR_MAX_PDF_PAGES,
);
const OCR_TEXT_MIN_CHARS = 10;
const OCR_RENDER_SCALE = 2.0;
const ENABLE_HTML_PARSING = process.env.ENABLE_HTML_PARSING === 'true';
const LARGE_TEXT_STREAM_MB = 25;

let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

const getOcrWorker = async () => {
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = createWorker('eng');
    }
    return ocrWorkerPromise;
};

const resetOcrWorker = async () => {
    if (!ocrWorkerPromise) return;
    try {
        const worker = await ocrWorkerPromise;
        await worker.terminate();
    } catch {
        // Best-effort cleanup.
    } finally {
        ocrWorkerPromise = null;
    }
};

const runOcr = async (image: Buffer | Uint8Array): Promise<string> => {
    const worker = await getOcrWorker();
    const task = ocrQueue.then(() => worker.recognize(image));
    ocrQueue = task.then(
        () => undefined,
        () => undefined,
    );
    try {
        const { data } = await task;
        return data?.text || '';
    } catch (error) {
        await resetOcrWorker();
        throw error;
    }
};

const startsWithBytes = (buffer: Buffer, bytes: number[]): boolean => {
    if (buffer.length < bytes.length) return false;
    for (let i = 0; i < bytes.length; i += 1) {
        if (buffer[i] !== bytes[i]) return false;
    }
    return true;
};

const looksLikeText = (buffer: Buffer): boolean => {
    const sample = buffer.subarray(0, 4096);
    if (sample.length === 0) return false;

    let printable = 0;
    for (const byte of sample) {
        if (byte === 0) return false;
        if (
            byte === 9 ||
            byte === 10 ||
            byte === 13 ||
            (byte >= 32 && byte <= 126)
        ) {
            printable += 1;
        }
    }

    return printable / sample.length > 0.85;
};

const looksLikeHtml = (buffer: Buffer): boolean => {
    const preview = buffer.subarray(0, 4096).toString('utf-8');
    return /<!doctype\s+html|<html|<head|<body|<div|<p|<table|<title/i.test(
        preview,
    );
};

type FileKind =
    | 'pdf'
    | 'docx'
    | 'xlsx'
    | 'png'
    | 'jpeg'
    | 'gif'
    | 'html'
    | 'json'
    | 'csv'
    | 'markdown'
    | 'text'
    | 'unknown';

const detectFileKind = (file: Express.Multer.File): FileKind => {
    const mime = (file.mimetype || '').toLowerCase();
    const fileName = (file.originalname || '').toLowerCase();
    const buffer = file.buffer;

    if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
    if (
        startsWithBytes(buffer, [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ])
    ) {
        return 'png';
    }
    if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    ) {
        return 'gif';
    }

    if (
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/pjpeg'
    ) {
        return 'jpeg';
    }
    if (mime === 'image/png') {
        return 'png';
    }

    const isZip =
        startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08]);
    if (isZip) {
        if (fileName.endsWith('.docx')) return 'docx';
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return 'xlsx';
    }

    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'jpeg';
    if (fileName.endsWith('.png')) return 'png';

    if (
        mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        return 'docx';
    }
    if (
        mime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        return 'xlsx';
    }
    if (
        mime === 'application/vnd.ms-excel' ||
        fileName.endsWith('.xls')
    ) {
        return 'xlsx';
    }
    if (
        mime === 'text/html' ||
        fileName.endsWith('.html') ||
        fileName.endsWith('.htm') ||
        looksLikeHtml(buffer)
    ) {
        return 'html';
    }
    if (
        fileName.endsWith('.txt') ||
        fileName.endsWith('.text') ||
        fileName.endsWith('.log')
    ) {
        return 'text';
    }
    if (mime === 'application/json' || fileName.endsWith('.json')) return 'json';
    if (mime === 'text/csv' || fileName.endsWith('.csv')) return 'csv';
    if (
        mime === 'text/markdown' ||
        fileName.endsWith('.md') ||
        fileName.endsWith('.markdown')
    ) {
        return 'markdown';
    }
    if (mime.startsWith('text/') || looksLikeText(buffer)) return 'text';

    return 'unknown';
};

const detectFileType = (
    file: Express.Multer.File,
): 'pdf' | 'text' | 'docx' | 'image' | 'unknown' => {
    const kind = detectFileKind(file);
    if (kind === 'pdf' || kind === 'docx') return kind;
    if (kind === 'png' || kind === 'jpeg' || kind === 'gif') return 'image';
    if (
        kind === 'text' ||
        kind === 'html' ||
        kind === 'json' ||
        kind === 'csv' ||
        kind === 'markdown'
    ) {
        return 'text';
    }
    return 'unknown';
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

const loadXlsx = async (): Promise<any> => {
    return await import('xlsx');
};

const loadCanvas = async (): Promise<any | null> => {
    try {
        return await import('@napi-rs/canvas');
    } catch {
        // Fall back to node-canvas if available.
    }

    try {
        return await import('canvas');
    } catch {
        return null;
    }
};

const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                if (currentIndex >= items.length) break;
                results[currentIndex] = await mapper(
                    items[currentIndex],
                    currentIndex,
                );
            }
        },
    );

    await Promise.all(workers);
    return results;
};

const decodeHtmlEntities = (value: string): string =>
    value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(Number(code)),
        );

const stripHtmlToText = (html: string): string => {
    const withoutNoise = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const withBreaks = withoutNoise.replace(
        /<\/(p|div|br|li|tr|td|th|h\d|section|article)>/gi,
        '\n',
    );

    const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
    return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
};

const maybeParseHtml = (text: string): string =>
    ENABLE_HTML_PARSING ? stripHtmlToText(text) : text;

const readTextFromStream = async (
    stream: NodeJS.ReadableStream & { destroy?: (error?: Error) => void },
    maxChars: number,
): Promise<string> => {
    let text = '';
    for await (const chunk of stream) {
        text += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        if (text.length >= maxChars) {
            if ('destroy' in stream && typeof stream.destroy === 'function') {
                stream.destroy();
            }
            break;
        }
    }
    return text.slice(0, maxChars);
};

const extractTextFromXlsx = async (buffer: Buffer): Promise<string> => {
    const xlsx = await loadXlsx();
    const workbook = xlsx.read(buffer, {
        type: 'buffer',
        cellDates: true,
        raw: false,
    });

    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim().length > 0) {
            parts.push(`Sheet: ${sheetName}\n${csv.trim()}`);
        }
    }

    return parts.join('\n\n');
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

    const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
    const pageResults = await mapWithConcurrency(
        pageNumbers,
        PDF_PAGE_CONCURRENCY,
        async (pageNumber) => {
            try {
                const page = await doc.getPage(pageNumber);
                const content = await page.getTextContent();
                const strings = content.items
                    .map((item: any) =>
                        typeof item?.str === 'string' ? item.str : '',
                    )
                    .filter(Boolean);

                if (strings.length > 0) {
                    return {
                        text: strings.join(' '),
                        hasText: true,
                        failed: false,
                    };
                }

                return { text: '', hasText: false, failed: false };
            } catch {
                return { text: '', hasText: false, failed: true };
            }
        },
    );

    for (const result of pageResults) {
        if (result.failed) {
            failedPages += 1;
        }
        if (result.hasText) {
            pagesWithText += 1;
            fullText += result.text + '\n';
        }
    }

    return {
        text: fullText,
        numPages,
        pagesWithText,
        failedPages,
    };
};

const extractTextFromPdfOcr = async (
    file: Express.Multer.File,
    pdfjs: any,
): Promise<{ text: string; numPages: number; pagesOcred: number }> => {
    const canvasModule = await loadCanvas();
    if (!canvasModule?.createCanvas) {
        return { text: '', numPages: 0, pagesOcred: 0 };
    }

    const doc = await pdfjs.getDocument({
        data: new Uint8Array(file.buffer),
        useSystemFonts: true,
        disableFontFace: true,
    }).promise;

    const numPages = Math.min(doc.numPages, OCR_MAX_PDF_PAGES);
    let fullText = '';
    let pagesOcred = 0;

    for (let i = 1; i <= numPages; i += 1) {
        try {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
            const canvas = canvasModule.createCanvas(
                viewport.width,
                viewport.height,
            );
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport }).promise;
            const pngBuffer = canvas.toBuffer('image/png');
            const text = await runOcr(pngBuffer);
            if (text.trim().length > 0) {
                fullText += text.trim() + '\n';
                pagesOcred += 1;
            }
            page.cleanup();
        } catch {
            // Skip failed OCR pages.
        }
    }

    return { text: fullText, numPages, pagesOcred };
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
            if (extractedText.trim().length < OCR_TEXT_MIN_CHARS) {
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
            if (extractedText.trim().length < OCR_TEXT_MIN_CHARS) {
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

        const fileKind = detectFileKind(file);
        const fileType = detectFileType(file);

        if (fileType === 'pdf') {
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
