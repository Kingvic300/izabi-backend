import { Test, TestingModule } from '@nestjs/testing';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

describe('QuizController', () => {
    let controller: QuizController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [QuizController],
            providers: [
                {
                    provide: QuizService,
                    useValue: {
                        findAll: jest.fn(),
                        getDailyChallenge: jest.fn(),
                        getGenericPracticeQuestions: jest.fn(),
                        generateQuickTest: jest.fn(),
                        submitQuickTest: jest.fn(),
                        create: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<QuizController>(QuizController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
