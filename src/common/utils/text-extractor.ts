import { BadRequestException } from '@nestjs/common';
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';

export const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
  let extractedText = '';

  try {
    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      extractedText = data.text;
    } else if (file.mimetype === 'text/plain') {
      extractedText = file.buffer.toString('utf-8');
    } else if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else {
      // Fallback for other text-like formats (csv, markdown, etc) if they were allowed by upload
      // Since we allowed text/csv and text/markdown in frontend, we should handle them here as text
      if (file.mimetype.startsWith('text/')) {
          extractedText = file.buffer.toString('utf-8');
      } else {
          throw new BadRequestException(
            `Unsupported file type: ${file.mimetype}. Please upload a supported document format.`
          );
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new BadRequestException(
        'Could not extract any text from the document. Please ensure the file is not empty or scan-only.'
      );
    }

    // "Cut off preface and ending" constraint:
    // Heuristic: If text is sufficiently long, remove the first 10% and last 10% to strip likely front/back matter.
    const textLength = extractedText.length;
    if (textLength > 20000) {
      const cutSize = Math.floor(textLength * 0.1); // 10%
      extractedText = extractedText.substring(cutSize, textLength - cutSize);
    }

    return extractedText;
  } catch (error: any) {
    console.error('[TextExtractor] Error extracting text:', error);
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Failed to extract text from file: ' + error.message);
  }
};
