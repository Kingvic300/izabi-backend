import {
    MAX_PDF_PAGES,
    OCR_MAX_PDF_PAGES,
    OCR_RENDER_SCALE,
    OCR_TEXT_MIN_CHARS,
    PDF_PAGE_CONCURRENCY,
} from './constants';
import { mapWithConcurrency } from './utils';
import { runOcr } from './ocr';

export const loadPdfJs = async (): Promise<any> => {
    try {
        // Prefer legacy build for Node.js runtime compatibility.
        return await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
        return await import('pdfjs-dist/build/pdf.mjs');
    }
};

export const loadModernPdfJs = async (): Promise<any> => {
    try {
        return await import('pdfjs-dist/build/pdf.mjs');
    } catch {
        return await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
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

export const tryExtractTextFromPdf = async (
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

    try {
        const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
        const pageResults = await mapWithConcurrency(
            pageNumbers,
            PDF_PAGE_CONCURRENCY,
            async (pageNumber) => {
                try {
                    const page = await doc.getPage(pageNumber);
                    const content = await page.getTextContent();
                    page.cleanup?.();
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
                fullText += result.text + '\\n';
            }
        }
    } finally {
        if (typeof doc.destroy === 'function') {
            await doc.destroy();
        }
    }

    return {
        text: fullText,
        numPages,
        pagesWithText,
        failedPages,
    };
};

export const extractTextFromPdfOcr = async (
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

    try {
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
                    fullText += text.trim() + '\\n';
                    pagesOcred += 1;
                }
                page.cleanup?.();
            } catch {
                // Skip failed OCR pages.
            }
        }
    } finally {
        if (typeof doc.destroy === 'function') {
            await doc.destroy();
        }
    }

    return { text: fullText, numPages, pagesOcred };
};

export const extractTextFallbackFromPdfBinary = (buffer: Buffer): string => {
    const raw = buffer.toString('latin1');
    const segments =
        raw.match(
            /[A-Za-z][A-Za-z0-9,.;:'\"()\\-_/+\\s]{5,160}/g,
        ) || [];

    const cleaned = segments
        .map((segment) => segment.replace(/\\s+/g, ' ').trim())
        .filter(
            (segment) =>
                segment.length >= 8 &&
                /[aeiouAEIOU]/.test(segment) &&
                !/[<>{}\\[\\]\\\\]/.test(segment),
        );

    return cleaned.slice(0, 3000).join(' ');
};

export const shouldAttemptOcr = (text: string): boolean =>
    text.trim().length < OCR_TEXT_MIN_CHARS;
