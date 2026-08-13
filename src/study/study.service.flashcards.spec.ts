import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudyService } from './study.service';

function buildService(overrides: {
    findOneResult: any;
    usersService?: any;
    geminiService?: any;
}) {
    const studyModel = {
        findOne: jest.fn().mockResolvedValue(overrides.findOneResult),
    };
    const geminiService = overrides.geminiService ?? {
        translateFlashcards: jest.fn(),
    };
    const usersService = overrides.usersService ?? {
        findOne: jest.fn().mockResolvedValue({ preferredLanguage: 'en' }),
    };

    // StudyService only needs studyModel, geminiService and usersService for
    // this code path; the remaining constructor deps aren't exercised.
    const service = new (StudyService as any)(
        studyModel,
        {} /* aiService */,
        geminiService,
        {} /* cloudinaryService */,
        usersService,
        {} /* studyQueueService */,
        {} /* studyJobService */,
    ) as StudyService;

    return { service, studyModel, geminiService, usersService };
}

function buildHistoryDoc(overrides: Record<string, any> = {}) {
    const doc: any = {
        language: 'es',
        flashcards: [{ front: 'Hola', back: 'Hello' }],
        flashcardsByLanguage: new Map(),
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return doc;
}

describe('StudyService.getFlashcardsForLanguage', () => {
    it('throws NotFoundException when the study session does not exist', async () => {
        const { service } = buildService({ findOneResult: null });
        await expect(
            service.getFlashcardsForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no flashcards exist yet', async () => {
        const { service } = buildService({
            findOneResult: buildHistoryDoc({ flashcards: [] }),
        });
        await expect(
            service.getFlashcardsForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the source-language flashcards without translating', async () => {
        const history = buildHistoryDoc();
        const geminiService = { translateFlashcards: jest.fn() };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getFlashcardsForLanguage(
            'user1',
            'hist1',
            'es',
        );

        expect(result.translated).toBe(false);
        expect(result.cached).toBe(true);
        expect(result.language).toBe('es');
        expect(result.flashcards).toBe(history.flashcards);
        expect(geminiService.translateFlashcards).not.toHaveBeenCalled();
        expect(history.save).not.toHaveBeenCalled();
    });

    it('returns a cached translation without calling Gemini again', async () => {
        const cachedFrench = [{ front: 'Bonjour', back: 'Hello' }];
        const history = buildHistoryDoc();
        history.flashcardsByLanguage.set('fr', cachedFrench);
        const geminiService = { translateFlashcards: jest.fn() };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getFlashcardsForLanguage(
            'user1',
            'hist1',
            'fr',
        );

        expect(result.translated).toBe(true);
        expect(result.cached).toBe(true);
        expect(result.flashcards).toBe(cachedFrench);
        expect(geminiService.translateFlashcards).not.toHaveBeenCalled();
        expect(history.save).not.toHaveBeenCalled();
    });

    it('translates on demand and persists the result when not cached', async () => {
        const translated = [{ front: 'Bonjour', back: 'Hello' }];
        const history = buildHistoryDoc();
        const geminiService = {
            translateFlashcards: jest.fn().mockResolvedValue(translated),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getFlashcardsForLanguage(
            'user1',
            'hist1',
            'fr',
        );

        expect(geminiService.translateFlashcards).toHaveBeenCalledWith(
            history.flashcards,
            'fr',
            'es',
        );
        expect(result.translated).toBe(true);
        expect(result.cached).toBe(false);
        expect(result.flashcards).toEqual(translated);
        expect(history.flashcardsByLanguage.get('fr')).toEqual(translated);
        expect(history.markModified).toHaveBeenCalledWith(
            'flashcardsByLanguage',
        );
        expect(history.save).toHaveBeenCalledTimes(1);
    });

    it('falls back to the user preferred language when none is requested', async () => {
        const translated = [{ front: 'Bonjour', back: 'Hello' }];
        const history = buildHistoryDoc();
        const geminiService = {
            translateFlashcards: jest.fn().mockResolvedValue(translated),
        };
        const usersService = {
            findOne: jest
                .fn()
                .mockResolvedValue({ preferredLanguage: 'fr' }),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
            usersService,
        });

        const result = await service.getFlashcardsForLanguage(
            'user1',
            'hist1',
            undefined,
        );

        expect(usersService.findOne).toHaveBeenCalledWith('user1');
        expect(result.language).toBe('fr');
        expect(geminiService.translateFlashcards).toHaveBeenCalledWith(
            history.flashcards,
            'fr',
            'es',
        );
    });
});
