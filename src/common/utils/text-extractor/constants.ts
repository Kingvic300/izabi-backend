export const MAX_EXTRACTION_CHARS = 700000;
export const MAX_PDF_PAGES = 300;
export const PDF_PAGE_CONCURRENCY = 5;
export const DEFAULT_OCR_MAX_PDF_PAGES = 25;
export const OCR_MAX_PDF_PAGES = Number(
    process.env.OCR_MAX_PDF_PAGES || DEFAULT_OCR_MAX_PDF_PAGES,
);
export const OCR_TEXT_MIN_CHARS = 10;
export const OCR_RENDER_SCALE = 2.0;
export const ENABLE_HTML_PARSING = process.env.ENABLE_HTML_PARSING === 'true';
export const LARGE_TEXT_STREAM_MB = 25;
export const OCR_MAX_QUEUE = Number(process.env.OCR_MAX_QUEUE || 20);
