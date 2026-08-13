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
        translateQuestions: jest.fn(),
        translateText: jest.fn(),
    };
    const usersService = overrides.usersService ?? {
        findOne: jest.fn().mockResolvedValue({ preferredLanguage: 'en' }),
    };

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
        questions: [{ question: '¿Qué es la fotosíntesis?', options: [] }],
        summary: 'Resumen del tema en español.',
        questionsByLanguage: new Map(),
        summaryByLanguage: new Map(),
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return doc;
}

describe('StudyService.getQuestionsForLanguage', () => {
    it('throws NotFoundException when the study session does not exist', async () => {
        const { service } = buildService({ findOneResult: null });
        await expect(
            service.getQuestionsForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no questions exist yet', async () => {
        const { service } = buildService({
            findOneResult: buildHistoryDoc({ questions: [] }),
        });
        await expect(
            service.getQuestionsForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns source-language questions without translating', async () => {
        const history = buildHistoryDoc();
        const geminiService = {
            translateQuestions: jest.fn(),
            translateText: jest.fn(),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getQuestionsForLanguage(
            'user1',
            'hist1',
            'es',
        );

        expect(result.translated).toBe(false);
        expect(result.questions).toBe(history.questions);
        expect(geminiService.translateQuestions).not.toHaveBeenCalled();
    });

    it('translates on demand and persists into questionsByLanguage', async () => {
        const translated = [{ question: 'What is photosynthesis?' }];
        const history = buildHistoryDoc();
        const geminiService = {
            translateQuestions: jest.fn().mockResolvedValue(translated),
            translateText: jest.fn(),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getQuestionsForLanguage(
            'user1',
            'hist1',
            'en',
        );

        expect(geminiService.translateQuestions).toHaveBeenCalledWith(
            history.questions,
            'en',
            'es',
        );
        expect(result.cached).toBe(false);
        expect(result.questions).toEqual(translated);
        expect(history.questionsByLanguage.get('en')).toEqual(translated);
        expect(history.markModified).toHaveBeenCalledWith(
            'questionsByLanguage',
        );
        expect(history.save).toHaveBeenCalledTimes(1);
    });

    it('returns a cached translation without calling Gemini again', async () => {
        const cached = [{ question: 'cached' }];
        const history = buildHistoryDoc();
        history.questionsByLanguage.set('en', cached);
        const geminiService = {
            translateQuestions: jest.fn(),
            translateText: jest.fn(),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getQuestionsForLanguage(
            'user1',
            'hist1',
            'en',
        );

        expect(result.cached).toBe(true);
        expect(result.questions).toBe(cached);
        expect(geminiService.translateQuestions).not.toHaveBeenCalled();
    });
});

describe('StudyService.getSummaryForLanguage', () => {
    it('throws NotFoundException when the study session does not exist', async () => {
        const { service } = buildService({ findOneResult: null });
        await expect(
            service.getSummaryForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no summary exists yet', async () => {
        const { service } = buildService({
            findOneResult: buildHistoryDoc({ summary: '' }),
        });
        await expect(
            service.getSummaryForLanguage('user1', 'hist1', 'en'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the source-language summary without translating', async () => {
        const history = buildHistoryDoc();
        const geminiService = {
            translateQuestions: jest.fn(),
            translateText: jest.fn(),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getSummaryForLanguage(
            'user1',
            'hist1',
            'es',
        );

        expect(result.translated).toBe(false);
        expect(result.summary).toBe(history.summary);
        expect(geminiService.translateText).not.toHaveBeenCalled();
    });

    it('translates on demand and persists into summaryByLanguage', async () => {
        const translated = 'Summary of the topic in English.';
        const history = buildHistoryDoc();
        const geminiService = {
            translateQuestions: jest.fn(),
            translateText: jest.fn().mockResolvedValue(translated),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getSummaryForLanguage(
            'user1',
            'hist1',
            'en',
        );

        expect(geminiService.translateText).toHaveBeenCalledWith(
            history.summary,
            'en',
            'es',
        );
        expect(result.cached).toBe(false);
        expect(result.summary).toBe(translated);
        expect(history.summaryByLanguage.get('en')).toBe(translated);
        expect(history.markModified).toHaveBeenCalledWith(
            'summaryByLanguage',
        );
        expect(history.save).toHaveBeenCalledTimes(1);
    });

    it('returns a cached summary translation without calling Gemini again', async () => {
        const history = buildHistoryDoc();
        history.summaryByLanguage.set('en', 'Cached summary.');
        const geminiService = {
            translateQuestions: jest.fn(),
            translateText: jest.fn(),
        };
        const { service } = buildService({
            findOneResult: history,
            geminiService,
        });

        const result = await service.getSummaryForLanguage(
            'user1',
            'hist1',
            'en',
        );

        expect(result.cached).toBe(true);
        expect(result.summary).toBe('Cached summary.');
        expect(geminiService.translateText).not.toHaveBeenCalled();
    });
});
