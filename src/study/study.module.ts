import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyService } from './study.service';
import { StudyController } from './study.controller';
import { StudyLeaderboardController } from './study.leaderboard.controller';
import { StudyJobsController } from './study.jobs.controller';
import { StudyPdfController } from './study.pdf.controller';
import { StudyVoiceController } from './study.voice.controller';
import {
    StudyHistory,
    StudyHistorySchema,
} from './entities/study-history.entity';
import { AiModule } from '../ai/ai.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { VoiceService } from './voice.service';
import { UsersModule } from '../users/users.module';
import { StudyQueueService } from './queue/study-queue.service';
import { StudyJob, StudyJobSchema } from './entities/study-job.entity';
import { StudyJobService } from './study-job.service';
import { StudyRecoveryService } from './study-recovery.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: StudyHistory.name, schema: StudyHistorySchema },
            { name: StudyJob.name, schema: StudyJobSchema },
        ]),
        AiModule,
        CloudinaryModule,
        UsersModule,
    ],
    controllers: [
        StudyController,
        StudyLeaderboardController,
        StudyJobsController,
        StudyPdfController,
        StudyVoiceController,
    ],
    providers: [
        StudyService,
        VoiceService,
        StudyQueueService,
        StudyJobService,
        StudyRecoveryService,
    ],
})
export class StudyModule {}
