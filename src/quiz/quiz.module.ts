import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizResult, QuizResultSchema } from './entities/quiz-result.entity';
import { Note, NoteSchema } from '../notes/entities/note.entity';
import { StudyHistory, StudyHistorySchema } from '../study/entities/study-history.entity';
import { AiModule } from '../ai/ai.module';

// HOW: QuizModule orchestrates Quick Test and quiz functionality
// WHY: Needs access to Notes, StudyHistory, and AI services for content-based test generation
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuizResult.name, schema: QuizResultSchema },
      { name: Note.name, schema: NoteSchema },
      { name: StudyHistory.name, schema: StudyHistorySchema },
    ]),
    AiModule, // Import AI service for question generation
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
