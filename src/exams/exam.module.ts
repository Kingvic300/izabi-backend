import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamsService } from './exam.service';
import { ExamsController } from './exam.controller';
import { Exam, ExamSchema } from './entities/exam.entity';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Exam.name, schema: ExamSchema }]),
        AiModule,
    ],
    controllers: [ExamsController],
    providers: [ExamsService],
})
export class ExamsModule {}
