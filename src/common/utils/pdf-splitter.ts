import { BadRequestException } from '@nestjs/common';

/**
 * PDF Analysis Result Interface
 */
export interface PDFAnalysisResult {
  needsSplitting: boolean;
  pageCount: number;
  estimatedChars: number;
  fileSizeMB: number;
  reason?: string;
  suggestions?: SplitSuggestion[];
}

/**
 * Split Suggestion Interface
 */
export interface SplitSuggestion {
  id: string;
  strategy: 'chapter' | 'page-range' | 'custom';
  label: string;
  pageStart: number;
  pageEnd: number;
  estimatedChars: number;
  detectedTitle?: string;
  recommendedFor?: string;
}

/**
 * PDF Metadata Interface
 */
export interface PDFMetadata {
  pageCount: number;
  fileSizeMB: number;
  hasTableOfContents: boolean;
  detectedChapters: Chapter[];
  textDensity: number; // chars per page average
}

export interface Chapter {
  title: string;
  pageStart: number;
  pageEnd?: number;
  level: number; // 1 for main chapters, 2 for subsections
}

// Thresholds for splitting decisions
const THRESHOLDS = {
  MAX_PAGES: 40,
  MAX_CHARS: 400000,
  MAX_SIZE_MB: 25,
  IDEAL_CHUNK_PAGES: 25,
  MIN_CHUNK_PAGES: 10,
};

/**
 * Analyzes PDF before full extraction to determine if splitting is needed
 */
export const analyzePDFForSplitting = async (
  file: Express.Multer.File
): Promise<PDFAnalysisResult> => {
  try {
    const fileSizeMB = file.buffer.length / (1024 * 1024);
    
    // Load PDF.js
    let pdfjs: any;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch (e) {
      pdfjs = require('pdfjs-dist/build/pdf.js');
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(file.buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    const pageCount = doc.numPages;

    // Quick sample: Extract text from first 5 pages to estimate density
    const samplePages = Math.min(5, pageCount);
    let sampleText = '';
    
    for (let i = 1; i <= samplePages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      sampleText += content.items.map((item: any) => item.str).join(' ');
    }

    const avgCharsPerPage = sampleText.length / samplePages;
    const estimatedChars = Math.round(avgCharsPerPage * pageCount);

    // Decision logic
    const needsSplitting = 
      pageCount > THRESHOLDS.MAX_PAGES || 
      estimatedChars > THRESHOLDS.MAX_CHARS ||
      fileSizeMB > THRESHOLDS.MAX_SIZE_MB;

    if (!needsSplitting) {
      return {
        needsSplitting: false,
        pageCount,
        estimatedChars,
        fileSizeMB,
      };
    }

    // If splitting needed, generate suggestions
    const metadata = await extractPDFMetadata(doc);
    const suggestions = generateSplitSuggestions(metadata, file.originalname);

    return {
      needsSplitting: true,
      pageCount,
      estimatedChars,
      fileSizeMB,
      reason: getDynamicReason(pageCount, estimatedChars, fileSizeMB),
      suggestions,
    };
  } catch (error) {
    console.error('[PDF Analysis] Error:', error);
    throw new BadRequestException('Unable to analyze PDF structure.');
  }
};

/**
 * Extracts metadata including chapters and TOC
 */
const extractPDFMetadata = async (doc: any): Promise<PDFMetadata> => {
  const pageCount = doc.numPages;
  const detectedChapters: Chapter[] = [];

  try {
    // Try to extract table of contents (outline)
    const outline = await doc.getOutline();
    
    if (outline && outline.length > 0) {
      for (const item of outline) {
        const dest = await doc.getDestination(item.dest);
        let pageNum = 1;
        
        if (dest && dest[0]) {
          try {
            const pageRef = await doc.getPageIndex(dest[0]);
            pageNum = pageRef + 1; // 1-indexed
          } catch (e) {
            // Fallback: parse from item title if it contains page numbers
            const match = item.title.match(/page\s+(\d+)/i);
            if (match) pageNum = parseInt(match[1]);
          }
        }

        detectedChapters.push({
          title: item.title,
          pageStart: pageNum,
          level: item.items && item.items.length > 0 ? 1 : 2,
        });
      }

      // Sort by page number and infer end pages
      detectedChapters.sort((a, b) => a.pageStart - b.pageStart);
      for (let i = 0; i < detectedChapters.length - 1; i++) {
        detectedChapters[i].pageEnd = detectedChapters[i + 1].pageStart - 1;
      }
      detectedChapters[detectedChapters.length - 1].pageEnd = pageCount;
    }
  } catch (e) {
    console.log('[PDF Metadata] No TOC found, will use heuristic detection');
  }

  // Heuristic chapter detection: Scan first pages for patterns
  if (detectedChapters.length === 0) {
    const chapterPatterns = [
      /chapter\s+(\d+)[:\s]+(.+)/i,
      /section\s+(\d+)[:\s]+(.+)/i,
      /part\s+(\d+)[:\s]+(.+)/i,
      /unit\s+(\d+)[:\s]+(.+)/i,
    ];

    for (let i = 1; i <= Math.min(pageCount, 50); i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');

        for (const pattern of chapterPatterns) {
          const match = text.match(pattern);
          if (match) {
            detectedChapters.push({
              title: match[2]?.trim() || `Chapter ${match[1]}`,
              pageStart: i,
              level: 1,
            });
          }
        }
      } catch (e) {
        // Skip problematic pages
      }
    }
  }

  return {
    pageCount,
    fileSizeMB: 0, // Will be set by caller
    hasTableOfContents: detectedChapters.length > 0,
    detectedChapters,
    textDensity: 0,
  };
};

/**
 * Generates smart split suggestions based on metadata
 */
const generateSplitSuggestions = (
  metadata: PDFMetadata,
  fileName: string
): SplitSuggestion[] => {
  const suggestions: SplitSuggestion[] = [];

  // Strategy 1: Chapter-based splitting (if chapters detected)
  if (metadata.detectedChapters.length > 0) {
    // Group small adjacent chapters to meet minimum size
    let currentGroup: Chapter[] = [];
    let groupStartPage = 1;

    for (let i = 0; i < metadata.detectedChapters.length; i++) {
      const chapter = metadata.detectedChapters[i];
      currentGroup.push(chapter);

      const groupPageCount = (chapter.pageEnd || metadata.pageCount) - groupStartPage + 1;

      // If group is large enough or last chapter, create suggestion
      if (groupPageCount >= THRESHOLDS.MIN_CHUNK_PAGES || i === metadata.detectedChapters.length - 1) {
        suggestions.push({
          id: `chapter-${suggestions.length + 1}`,
          strategy: 'chapter',
          label: currentGroup.length === 1 
            ? currentGroup[0].title 
            : `${currentGroup[0].title} to ${currentGroup[currentGroup.length - 1].title}`,
          pageStart: groupStartPage,
          pageEnd: chapter.pageEnd || metadata.pageCount,
          estimatedChars: groupPageCount * 2000, // Rough estimate
          detectedTitle: currentGroup[0].title,
          recommendedFor: 'Best for textbooks and structured documents',
        });

        // Reset for next group
        currentGroup = [];
        groupStartPage = (chapter.pageEnd || metadata.pageCount) + 1;
      }
    }
  }

  // Strategy 2: Fixed page-range splitting
  const rangeSize = THRESHOLDS.IDEAL_CHUNK_PAGES;
  for (let start = 1; start <= metadata.pageCount; start += rangeSize) {
    const end = Math.min(start + rangeSize - 1, metadata.pageCount);
    
    suggestions.push({
      id: `range-${start}-${end}`,
      strategy: 'page-range',
      label: `Pages ${start}–${end}`,
      pageStart: start,
      pageEnd: end,
      estimatedChars: (end - start + 1) * 2000,
      recommendedFor: 'Quick processing of specific sections',
    });
  }

  // Strategy 3: Custom placeholder (handled by frontend)
  suggestions.push({
    id: 'custom',
    strategy: 'custom',
    label: 'Custom Range',
    pageStart: 1,
    pageEnd: metadata.pageCount,
    estimatedChars: 0,
    recommendedFor: 'Advanced: Choose exact pages you need',
  });

  return suggestions;
};

/**
 * Generates user-friendly explanation
 */
const getDynamicReason = (pages: number, chars: number, sizeMB: number): string => {
  if (pages > THRESHOLDS.MAX_PAGES) {
    return `This ${pages}-page document is large. Breaking it into sections ensures faster, more accurate study materials.`;
  }
  
  if (chars > THRESHOLDS.MAX_CHARS) {
    return `This document contains substantial content. Splitting helps us create more focused and relevant summaries.`;
  }
  
  if (sizeMB > THRESHOLDS.MAX_SIZE_MB) {
    return `This file is ${sizeMB.toFixed(1)}MB. Smaller chunks process more reliably and give you faster results.`;
  }

  return 'Breaking this document into sections will improve processing quality and speed.';
};

/**
 * Extracts text from specific page range
 */
export const extractTextFromPageRange = async (
  file: Express.Multer.File,
  pageStart: number,
  pageEnd: number
): Promise<string> => {
  try {
    let pdfjs: any;
    try {
      pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch (e) {
      pdfjs = require('pdfjs-dist/build/pdf.js');
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(file.buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    if (pageStart < 1 || pageEnd > doc.numPages || pageStart > pageEnd) {
      throw new BadRequestException(`Invalid page range: ${pageStart}-${pageEnd}`);
    }

    let fullText = '';
    
    for (let i = pageStart; i <= pageEnd; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }

    return fullText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    console.error('[Page Range Extraction] Error:', error);
    throw new BadRequestException('Failed to extract specified page range.');
  }
};
