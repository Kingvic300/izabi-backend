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
const PAGE_EXTRACTION_CONCURRENCY = Number(
    process.env.PDF_PAGE_CONCURRENCY || 3,
);
const MAX_PAGE_RANGE = Number(process.env.PDF_MAX_PAGE_RANGE || 50);

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

/**
 * OPTIMIZED: Analyzes PDF with parallel processing and early exit
 */
export const analyzePDFForSplitting = async (
    file: Express.Multer.File,
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

        try {
            const pageCount = doc.numPages;

            // OPTIMIZATION 1: Sample fewer pages for large documents (3 instead of 5)
            const samplePages = Math.min(3, pageCount);

            const pages = Array.from({ length: samplePages }, (_, i) => i + 1);
            const pageTexts = await mapWithConcurrency(
                pages,
                PAGE_EXTRACTION_CONCURRENCY,
                async (pageNumber) => {
                    const page = await doc.getPage(pageNumber);
                    const content = await page.getTextContent();
                    page.cleanup?.();
                    return content.items.map((item: any) => item.str).join(' ');
                },
            );
            const sampleText = pageTexts.join(' ');

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

            // OPTIMIZATION 3: Lightweight metadata extraction (skip TOC parsing for speed)
            const metadata: PDFMetadata = {
                pageCount,
                fileSizeMB,
                hasTableOfContents: false,
                detectedChapters: [],
                textDensity: avgCharsPerPage,
            };

            const suggestions = generateSplitSuggestions(
                metadata,
                file.originalname,
            );

            return {
                needsSplitting: true,
                pageCount,
                estimatedChars,
                fileSizeMB,
                reason: getDynamicReason(pageCount, estimatedChars, fileSizeMB),
                suggestions,
            };
        } finally {
            if (typeof doc.destroy === 'function') {
                await doc.destroy();
            }
        }
    } catch (error) {
        console.error('[PDF Analysis] Error:', error);
        throw new BadRequestException('Unable to analyze PDF structure.');
    }
};

/**
 * OPTIMIZED: Lightweight split suggestions without heavy chapter detection
 */
const generateSplitSuggestions = (
    metadata: PDFMetadata,
    fileName: string,
): SplitSuggestion[] => {
    const suggestions: SplitSuggestion[] = [];

    // Strategy: Fixed page-range splitting (most reliable and fast)
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

    // Strategy: Custom placeholder (handled by frontend)
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
const getDynamicReason = (
    pages: number,
    chars: number,
    sizeMB: number,
): string => {
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
 * OPTIMIZED: Extracts text from specific page range with parallel processing
 */
export const extractTextFromPageRange = async (
    file: Express.Multer.File,
    pageStart: number,
    pageEnd: number,
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
            throw new BadRequestException(
                `Invalid page range: ${pageStart}-${pageEnd}`,
            );
        }
        if (pageEnd - pageStart + 1 > MAX_PAGE_RANGE) {
            throw new BadRequestException(
                `Page range too large (max ${MAX_PAGE_RANGE} pages).`,
            );
        }

        try {
            const pages = Array.from(
                { length: pageEnd - pageStart + 1 },
                (_, i) => pageStart + i,
            );
            const pageTexts = await mapWithConcurrency(
                pages,
                PAGE_EXTRACTION_CONCURRENCY,
                async (pageNumber) => {
                    const page = await doc.getPage(pageNumber);
                    const content = await page.getTextContent();
                    page.cleanup?.();
                    return (
                        content.items.map((item: any) => item.str).join(' ') +
                        '\n'
                    );
                },
            );
            const fullText = pageTexts.join('');

            return fullText
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        } finally {
            if (typeof doc.destroy === 'function') {
                await doc.destroy();
            }
        }
    } catch (error) {
        console.error('[Page Range Extraction] Error:', error);
        throw new BadRequestException(
            'Failed to extract specified page range.',
        );
    }
};
