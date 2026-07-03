import {
    Injectable,
    Logger,
    ServiceUnavailableException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// A minimal shape we can safely round-trip through translation without
// clobbering any extra fields (ids, tags, difficulty, etc.) a flashcard
// might carry.
export type FlashcardLike = Record<string, any>;

/**
 * GeminiService is the dedicated "on-demand translator" for the multilingual
 * flashcard flow.
 *
 * WHY a separate service from AiService (which talks to Groq):
 * - Groq/Llama powers the *primary* generation pipeline (summaries, quizzes,
 *   study guides, the source-language flashcards).
 * - Gemini is used narrowly here to translate an already-generated,
 *   structured flashcard set into another language on demand, so we never
 *   have to re-run the (expensive) source-document generation pipeline just
 *   to change the display language.
 */
@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private readonly client: GoogleGenerativeAI | null;
    private readonly modelName: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        this.modelName =
            this.configService.get<string>('GEMINI_MODEL') ||
            'gemini-1.5-flash';
        this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;

        if (!this.client) {
            this.logger.warn(
                'GEMINI_API_KEY is not set. On-demand flashcard translation will be unavailable until it is configured.',
            );
        }
    }

    isConfigured(): boolean {
        return this.client !== null;
    }

    /**
     * Translates a full set of flashcards into `targetLanguage`.
     * Preserves the original JSON shape (front/back/etc.) and any extra
     * fields present on each card, only translating human-readable text.
     */
    async translateFlashcards(
        flashcards: FlashcardLike[],
        targetLanguage: string,
        sourceLanguage: string,
    ): Promise<FlashcardLike[]> {
        return this.translateJsonArray(
            flashcards,
            targetLanguage,
            sourceLanguage,
            `Human-readable fields on flashcards typically include "front", "back", "question", "answer", "hint", "explanation", "term", "definition".`,
        );
    }

    /**
     * Translates a set of quiz questions into `targetLanguage`. Same
     * shape-preservation contract as translateFlashcards: options, the
     * correct answer, and explanations are translated; ids/types/booleans
     * are left untouched.
     */
    async translateQuestions(
        questions: FlashcardLike[],
        targetLanguage: string,
        sourceLanguage: string,
    ): Promise<FlashcardLike[]> {
        return this.translateJsonArray(
            questions,
            targetLanguage,
            sourceLanguage,
            `Human-readable fields on quiz questions typically include "question", "text", "options" (array of strings), "answer", "correctAnswer", "explanation", "title". Every option in an "options" array must be translated too, and the "answer"/"correctAnswer" value must still match its (now translated) corresponding option text.`,
        );
    }

    /**
     * Translates a single block of free text (e.g. a study session summary)
     * into `targetLanguage`. Markdown formatting (headers, bold, lists) is
     * preserved as-is; only the prose is translated.
     */
    async translateText(
        text: string,
        targetLanguage: string,
        sourceLanguage: string,
    ): Promise<string> {
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Translation service is not configured. Set GEMINI_API_KEY on the backend.',
            );
        }
        if (!text || !text.trim()) {
            return text;
        }

        const model = this.client.getGenerativeModel({ model: this.modelName });
        const prompt = [
            `You are a precise study-material translator embedded in an education app.`,
            `Translate the following Markdown text from "${sourceLanguage}" into "${targetLanguage}".`,
            `Rules:`,
            `- Preserve all Markdown formatting exactly (headers, bold, lists, line breaks).`,
            `- Preserve technical terms, proper nouns, and formulas where translating them would change the academic meaning; otherwise translate naturally and idiomatically for a student.`,
            `- Respond with ONLY the translated Markdown text. No commentary, no code fences.`,
            ``,
            `Text:`,
            text,
        ].join('\n');

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error: any) {
            this.logger.error(
                `Gemini text translation failed for language "${targetLanguage}": ${error?.message || error}`,
            );
            throw new InternalServerErrorException(
                'Failed to translate summary. Please try again shortly.',
            );
        }
    }

    private async translateJsonArray(
        items: FlashcardLike[],
        targetLanguage: string,
        sourceLanguage: string,
        fieldsHint: string,
    ): Promise<FlashcardLike[]> {
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Translation service is not configured. Set GEMINI_API_KEY on the backend.',
            );
        }
        if (!Array.isArray(items) || items.length === 0) {
            return [];
        }

        const model = this.client.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                responseMimeType: 'application/json',
            },
        });

        const prompt = this.buildTranslationPrompt(
            items,
            targetLanguage,
            sourceLanguage,
            fieldsHint,
        );

        try {
            const result = await model.generateContent(prompt);
            const rawText = result.response.text();
            return this.parseTranslatedArray(rawText, items);
        } catch (error: any) {
            this.logger.error(
                `Gemini translation failed for language "${targetLanguage}": ${error?.message || error}`,
            );
            throw new InternalServerErrorException(
                'Failed to translate flashcards. Please try again shortly.',
            );
        }
    }

    private buildTranslationPrompt(
        items: FlashcardLike[],
        targetLanguage: string,
        sourceLanguage: string,
        fieldsHint: string,
    ): string {
        return [
            `You are a precise study-material translator embedded in an education app.`,
            `Translate the following JSON array from "${sourceLanguage}" into "${targetLanguage}".`,
            `Rules:`,
            `- Translate ONLY human-readable text values. ${fieldsHint}`,
            `- Keep the exact same JSON array structure, the same number of objects, and the same keys per object.`,
            `- Never translate or alter non-text fields such as ids, numbers, booleans, or arrays of tags meant as identifiers.`,
            `- Preserve technical terms, proper nouns, formulas, and numbers exactly where translating them would change the academic meaning; otherwise translate naturally and idiomatically for a student.`,
            `- Respond with ONLY a valid JSON array. No markdown fences, no commentary.`,
            ``,
            `JSON:`,
            JSON.stringify(items),
        ].join('\n');
    }

    private parseTranslatedArray(
        rawText: string,
        original: FlashcardLike[],
    ): FlashcardLike[] {
        let cleaned = (rawText || '').trim();
        // Defensive: strip markdown fences if the model adds them anyway.
        if (cleaned.startsWith('```')) {
            cleaned = cleaned
                .replace(/^```(?:json)?/i, '')
                .replace(/```$/, '')
                .trim();
        }

        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch (err) {
            this.logger.error(
                `Failed to parse Gemini translation response as JSON: ${err}`,
            );
            throw new InternalServerErrorException(
                'Translation service returned an unexpected format.',
            );
        }

        if (!Array.isArray(parsed) || parsed.length !== original.length) {
            this.logger.warn(
                'Translated content shape mismatch; falling back to original content for safety.',
            );
            return original;
        }

        return parsed;
    }
}
