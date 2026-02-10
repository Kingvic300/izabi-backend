import { Module, forwardRef } from '@nestjs/common'; // Add forwardRef
import { MongooseModule } from '@nestjs/mongoose';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizResult, QuizResultSchema } from './entities/quiz-result.entity';
import { Note, NoteSchema } from '../notes/entities/note.entity';
import {
  StudyHistory,
  StudyHistorySchema,
} from '../study/entities/study-history.entity';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module'; // Import UsersModule

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuizResult.name, schema: QuizResultSchema },
      { name: Note.name, schema: NoteSchema },
      { name: StudyHistory.name, schema: StudyHistorySchema },
    ]),
    AiModule,
    forwardRef(() => UsersModule), // Use forwardRef here
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
