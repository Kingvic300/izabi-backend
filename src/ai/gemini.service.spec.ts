import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
    generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
            getGenerativeModel: mockGetGenerativeModel,
        })),
    };
});

function buildConfigService(values: Record<string, string | undefined>) {
    return {
        get: (key: string) => values[key],
    } as unknown as ConfigService;
}

describe('GeminiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reports not configured when GEMINI_API_KEY is missing', () => {
        const service = new GeminiService(buildConfigService({}));
        expect(service.isConfigured()).toBe(false);
    });

    it('reports configured when GEMINI_API_KEY is present', () => {
        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );
        expect(service.isConfigured()).toBe(true);
    });

    it('throws ServiceUnavailableException when translating without a key', async () => {
        const service = new GeminiService(buildConfigService({}));
        await expect(
            service.translateFlashcards(
                [{ front: 'Hola', back: 'Hello' }],
                'fr',
                'es',
            ),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns an empty array without calling Gemini for empty input', async () => {
        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );
        const result = await service.translateFlashcards([], 'fr', 'es');
        expect(result).toEqual([]);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('parses a valid JSON translation response', async () => {
        const translated = [{ front: 'Bonjour', back: 'Hello' }];
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify(translated) },
        });

        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );
        const result = await service.translateFlashcards(
            [{ front: 'Hola', back: 'Hello' }],
            'fr',
            'es',
        );

        expect(result).toEqual(translated);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('strips markdown fences before parsing', async () => {
        const translated = [{ front: 'Bonjour', back: 'Hello' }];
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () => '```json\n' + JSON.stringify(translated) + '\n```',
            },
        });

        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );
        const result = await service.translateFlashcards(
            [{ front: 'Hola', back: 'Hello' }],
            'fr',
            'es',
        );

        expect(result).toEqual(translated);
    });

    it('falls back to the original cards on a shape mismatch', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify([{ front: 'only-one' }]) },
        });

        const original = [
            { front: 'Hola', back: 'Hello' },
            { front: 'Adios', back: 'Goodbye' },
        ];
        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );
        const result = await service.translateFlashcards(
            original,
            'fr',
            'es',
        );

        expect(result).toEqual(original);
    });

    it('wraps unparsable responses in an InternalServerErrorException', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => 'not json at all' },
        });

        const service = new GeminiService(
            buildConfigService({ GEMINI_API_KEY: 'test-key' }),
        );

        await expect(
            service.translateFlashcards(
                [{ front: 'Hola', back: 'Hello' }],
                'fr',
                'es',
            ),
        ).rejects.toThrow(
            'Failed to translate flashcards. Please try again shortly.',
        );
    });

    describe('translateQuestions', () => {
        it('parses a valid JSON translation response', async () => {
            const translated = [
                { question: 'Quelle est la capitale?', options: ['Paris'] },
            ];
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => JSON.stringify(translated) },
            });

            const service = new GeminiService(
                buildConfigService({ GEMINI_API_KEY: 'test-key' }),
            );
            const result = await service.translateQuestions(
                [{ question: 'What is the capital?', options: ['Paris'] }],
                'fr',
                'en',
            );

            expect(result).toEqual(translated);
        });

        it('throws ServiceUnavailableException without a key', async () => {
            const service = new GeminiService(buildConfigService({}));
            await expect(
                service.translateQuestions(
                    [{ question: 'What is the capital?' }],
                    'fr',
                    'en',
                ),
            ).rejects.toBeInstanceOf(ServiceUnavailableException);
        });
    });

    describe('translateText', () => {
        it('throws ServiceUnavailableException without a key', async () => {
            const service = new GeminiService(buildConfigService({}));
            await expect(
                service.translateText('## Summary', 'fr', 'en'),
            ).rejects.toBeInstanceOf(ServiceUnavailableException);
        });

        it('returns the input unchanged for empty text without calling Gemini', async () => {
            const service = new GeminiService(
                buildConfigService({ GEMINI_API_KEY: 'test-key' }),
            );
            const result = await service.translateText('   ', 'fr', 'en');
            expect(result).toBe('   ');
            expect(mockGenerateContent).not.toHaveBeenCalled();
        });

        it('returns the translated text trimmed', async () => {
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => '  ## Résumé\nBonjour  ' },
            });

            const service = new GeminiService(
                buildConfigService({ GEMINI_API_KEY: 'test-key' }),
            );
            const result = await service.translateText(
                '## Summary\nHello',
                'fr',
                'en',
            );

            expect(result).toBe('## Résumé\nBonjour');
        });

        it('wraps failures in an InternalServerErrorException', async () => {
            mockGenerateContent.mockRejectedValueOnce(new Error('boom'));

            const service = new GeminiService(
                buildConfigService({ GEMINI_API_KEY: 'test-key' }),
            );

            await expect(
                service.translateText('## Summary', 'fr', 'en'),
            ).rejects.toThrow(
                'Failed to translate summary. Please try again shortly.',
            );
        });
    });
});
