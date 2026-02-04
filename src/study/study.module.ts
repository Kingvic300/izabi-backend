import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyService } from './study.service';
import { StudyController } from './study.controller';
import { StudyHistory, StudyHistorySchema } from './entities/study-history.entity';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StudyHistory.name, schema: StudyHistorySchema }]),
    AiModule,
  ],
  controllers: [StudyController],
  providers: [StudyService],
})
export class StudyModule {}
