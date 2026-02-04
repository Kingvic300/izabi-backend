import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizResult, QuizResultSchema } from './entities/quiz-result.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: QuizResult.name, schema: QuizResultSchema }]),
  ],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
