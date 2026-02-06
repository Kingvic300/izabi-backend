import { BadRequestException } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

/**
 * Redesigned Document Ingestion Node
 * Handles multiple formats with specialized extraction and normalization.
 */
export const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
  let extractedText = '';

  try {
    if (!file || !file.buffer) {
        throw new BadRequestException('Invalid file: No content received.');
    }

    const mime = file.mimetype;
    console.log(`[DocumentNode] Ingesting file: ${file.originalname} (${mime})`);

    if (mime === 'application/pdf') {
      const parser = new PDFParse({ data: file.buffer });
      const data = await parser.getText();
      extractedText = data.text;
    } else if (mime === 'text/plain') {
      extractedText = file.buffer.toString('utf-8');
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/csv' || mime === 'text/markdown') {
      extractedText = file.buffer.toString('utf-8');
    } else {
      throw new BadRequestException(
        `Unsupported document protocol: ${mime}. Please provide PDF, DOCX, or Plain Text.`
      );
    }

    // Advanced Text Normalization
    if (!extractedText || extractedText.trim().length === 0) {
      throw new BadRequestException(
        'Neural extraction failed: Document appears empty or contains non-extractable layers (e.g. image-only scans).'
      );
    }

    // Clean up extraction artifacts
    extractedText = extractedText
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/[^\x20-\x7E\n\t]/g, '') // Remove non-printable characters
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
      .trim();

    // Heuristic: Strip likely front/back matter for very large documents
    const textLength = extractedText.length;
    if (textLength > 30000) {
      const cutSize = Math.floor(textLength * 0.05); // 5% instead of 10% to be safer
      extractedText = extractedText.substring(cutSize, textLength - cutSize);
    }

    console.log(`[DocumentNode] Successfully extracted ${extractedText.length} characters.`);
    return extractedText;
  } catch (error: any) {
    console.error('[DocumentNode] Extraction Failure:', error);
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Document Ingestion failed: ' + (error.message || 'Internal processing error'));
  }
};
