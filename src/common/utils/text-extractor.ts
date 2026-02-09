import { BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

// Optimal limits for high-speed processing on Render (alleviates OOM and timeouts)
const MAX_EXTRACTION_CHARS = 700000; // ~200k tokens - fits most textbooks while remaining fast
const MAX_PDF_PAGES = 300; // Higher page limit for textbooks
const MAX_FILE_SIZE_MB = 100; // Allow up to 100MB



/**
 * Smartly trims text to focus on main content by removing common book/paper noise.
 */
const cleanTextContent = (text: string): string => {
  // 1. Remove Table of Contents if it's very long (often at start)
  const tocIndices = [
    text.toLowerCase().indexOf('table of contents'),
    text.toLowerCase().indexOf('contents')
  ].filter(i => i !== -1 && i < 50000); // Only look in first 50k chars

  let cleaned = text;
  
  // 2. Look for "Chapter 1" or "Introduction" as a better starting point
  const startMarkers = [
    /chapter\s+1/i,
    /introduction/i,
    /background/i,
    /executive\s+summary/i
  ];

  for (const marker of startMarkers) {
    const match = text.slice(0, 100000).match(marker);
    if (match && match.index && match.index > 5000) {
      // If we find a "Chapter 1" deep in the doc (after 5k chars of preface)
      // we trim the preface
      cleaned = text.slice(match.index);
      break;
    }
  }

  // 3. Trim Bibliographies/References at the end
  // Optimization: use lastIndexOf for efficiency on large strings
  const endMarkers = ['references', 'bibliography', 'appendix', 'index', 'glossary'];

  for (const marker of endMarkers) {
    const lastIndex = cleaned.toLowerCase().lastIndexOf(marker);
    if (lastIndex !== -1 && lastIndex > (cleaned.length * 0.7)) {
      // If marker is in the last 30% of the doc, trim everything after
      cleaned = cleaned.slice(0, lastIndex);
      // Continuous trimming - don't break, multiple markers might exist
    }
  }


  return cleaned;
};

/**
 * Optimized Document Ingestion Node
 * Handles multiple formats with specialized extraction, pagination limits, and smart truncation.
 */
export const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
  const startTime = Date.now();
  let extractedText = '';

  try {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file: No content received.');
    }

    const fileSizeMB = file.buffer.length / (1024 * 1024);
    
    // Early rejection of oversized files to prevent memory issues
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      throw new BadRequestException(
        `File too large (${fileSizeMB.toFixed(1)}MB). Maximum allowed is ${MAX_FILE_SIZE_MB}MB.`
      );
    }

    const mime = file.mimetype;
    console.log(`[DocumentNode] Ingesting: ${file.originalname} (${mime}, ${fileSizeMB.toFixed(2)}MB)`);

    if (mime === 'application/pdf') {
      // Optimized PDF extraction with page limit for large files
      const options = {
        max: MAX_PDF_PAGES, // Limit pages for very large documents
      };
      
      const pdfLib = require('pdf-parse');
      const pdf = typeof pdfLib === 'function' ? pdfLib : (pdfLib.default || pdfLib);

      const data = await pdf(file.buffer, options);
      extractedText = data.text;
      
      console.log(`[DocumentNode] PDF extracted: ${data.numpages} pages, ${extractedText.length} chars`);
      
    } else if (mime === 'text/plain') {
      extractedText = file.buffer.toString('utf-8');
      
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
      
    } else if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
      // OCR for images - can be slow for high-res images
      console.log('[DocumentNode] OCR processing...');
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file.buffer);
      await worker.terminate();
      extractedText = text;
      
    } else if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/csv' || mime === 'text/markdown') {
      extractedText = file.buffer.toString('utf-8');
      
    } else {
      throw new BadRequestException(
        `Unsupported document protocol: ${mime}. Please provide PDF, DOCX, TXT, or Image files.`
      );
    }

    // Advanced Text Normalization
    if (!extractedText || extractedText.trim().length === 0) {
      throw new BadRequestException(
        'Neural extraction failed: Document appears empty or contains non-extractable layers (e.g. image-only scans).'
      );
    }

    // Apply Smart Content Filtering
    const originalLength = extractedText.length;
    extractedText = cleanTextContent(extractedText);
    
    const noiseRemoved = originalLength - extractedText.length;
    if (noiseRemoved > 0) {
      console.log(`[DocumentNode] Filtered out ${noiseRemoved} chars of noise (preface/appendix).`);
    }

    // Efficient text cleanup (regex operations can be slow on huge strings)
    extractedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Final safety truncation for Render memory
    if (extractedText.length > MAX_EXTRACTION_CHARS) {
        console.log(`[DocumentNode] Truncating to ${MAX_EXTRACTION_CHARS} chars.`);
        extractedText = extractedText.substring(0, MAX_EXTRACTION_CHARS) + 
          '\n\n[Note: Document truncated to stay within system processing limits.]';
    }

    // Allow very short inputs (e.g., topic titles like "Biology" or "Photosynthesis")
    if (extractedText.length < 3) {
      throw new BadRequestException('Content too short.');
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[DocumentNode] Finished in ${elapsedMs}ms. Yield: ${extractedText.length} chars.`);
    
    return extractedText;
  } catch (error: any) {
    console.error('[DocumentNode] Extraction Failure:', error);
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Document Ingestion failed.');
  }
};

/**
 * Fast extraction for preview/validation - extracts only first few pages
 */
export const extractTextPreview = async (file: Express.Multer.File, maxChars = 5000): Promise<string> => {
  try {
    if (!file || !file.buffer) return '';
    
    const mime = file.mimetype;
    
    if (mime === 'application/pdf') {
      const pdfLib = require('pdf-parse');
      const pdf = typeof pdfLib === 'function' ? pdfLib : (pdfLib.default || pdfLib);
      const data = await pdf(file.buffer, { max: 3 }); // Only first 3 pages
      return data.text.substring(0, maxChars);
    } else if (mime === 'text/plain') {
      return file.buffer.toString('utf-8').substring(0, maxChars);
    }
    
    return '';
  } catch {
    return '';
  }
};
