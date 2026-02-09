import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

// Optimal limits for high-speed processing on Render
const MAX_EXTRACTION_CHARS = 700000;
const MAX_PDF_PAGES = 300;
const MAX_FILE_SIZE_MB = 100;

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

  const endMarkers = ['references', 'bibliography', 'appendix', 'index', 'glossary'];

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
  file: Express.Multer.File
): Promise<string> => {
  const startTime = Date.now();
  let extractedText = '';

  try {
    if (!file?.buffer) {
      throw new BadRequestException('Invalid file: No content received.');
    }

    const fileSizeMB = file.buffer.length / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      throw new BadRequestException(
        `File too large (${fileSizeMB.toFixed(1)}MB). Max allowed is ${MAX_FILE_SIZE_MB}MB.`
      );
    }

    const mime = file.mimetype;
    console.log(
      `[DocumentNode] Ingesting: ${file.originalname} (${mime}, ${fileSizeMB.toFixed(2)}MB)`
    );

    if (mime === 'application/pdf') {
      const pdfLib = await import('pdf-parse');
      let pdfParse = (pdfLib as any).default || (pdfLib as any).PDFParse || pdfLib;

      if (typeof pdfParse !== 'function') {
           if ((pdfLib as any).PDFParse) pdfParse = (pdfLib as any).PDFParse;
      }
      
      if (typeof pdfParse !== 'function') {
           throw new Error(`pdf-parse library load failed. Is not a function. Type: ${typeof pdfParse}`);
      }

      const data = await pdfParse(file.buffer, {
        max: MAX_PDF_PAGES,
      });

      extractedText = data.text;

      console.log(
        `[DocumentNode] PDF extracted: ${data.numpages} pages, ${extractedText.length} chars`
      );
    } 
    else if (mime === 'text/plain') {
      extractedText = file.buffer.toString('utf-8');
    } 
    else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } 
    else if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
      console.log('[DocumentNode] OCR processing...');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(file.buffer);
      await worker.terminate();
      extractedText = data.text;
    } 
    else if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'text/csv' ||
      mime === 'text/markdown'
    ) {
      extractedText = file.buffer.toString('utf-8');
    } 
    else {
      throw new BadRequestException(`Unsupported file type: ${mime}`);
    }

    if (!extractedText?.trim()) {
      throw new BadRequestException(
        'Extraction failed: Document appears empty or non-extractable.'
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
      `[DocumentNode] Finished in ${Date.now() - startTime}ms. Yield: ${extractedText.length} chars`
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
  maxChars = 5000
): Promise<string> => {
  try {
    if (!file?.buffer) return '';

    if (file.mimetype === 'application/pdf') {
      const pdfLib = await import('pdf-parse');
      let pdfParse = (pdfLib as any).default || (pdfLib as any).PDFParse || pdfLib;
      
      if (typeof pdfParse !== 'function') {
           console.warn('[DocumentNode] pdf-parse fallback. Lib keys:', Object.keys(pdfLib || {}));
           // Based on logs, PDFParse might be the function
           if ((pdfLib as any).PDFParse) pdfParse = (pdfLib as any).PDFParse;
      }

      if (typeof pdfParse !== 'function') {
           // One last try: if pdfLib itself is the namespace and has no default, but we saw PDFParse key...
           throw new Error(`pdf-parse library load failed. Is not a function. Type: ${typeof pdfParse}`);
      } const data = await pdfParse(file.buffer, { max: 3 });
      return data.text.substring(0, maxChars);
    }

    if (file.mimetype === 'text/plain') {
      return file.buffer.toString('utf-8').substring(0, maxChars);
    }

    return '';
  } catch {
    return '';
  }
};
