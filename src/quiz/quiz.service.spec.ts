import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { QuizService } from './quiz.service';
import { QuizResult } from './entities/quiz-result.entity';
import { Note } from '../notes/entities/note.entity';
import { StudyHistory } from '../study/entities/study-history.entity';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';

describe('QuizService', () => {
    let service: QuizService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QuizService,
                { provide: getModelToken(QuizResult.name), useValue: {} },
                { provide: getModelToken(Note.name), useValue: {} },
                { provide: getModelToken(StudyHistory.name), useValue: {} },
                { provide: AiService, useValue: { getResponse: jest.fn() } },
                {
                    provide: UsersService,
                    useValue: { addPoints: jest.fn(), findOne: jest.fn(), getStreakNumber: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<QuizService>(QuizService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
