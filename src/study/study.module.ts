import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyService } from './study.service';
import { StudyController } from './study.controller';
import {
    StudyHistory,
    StudyHistorySchema,
} from './entities/study-history.entity';
import { AiModule } from '../ai/ai.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { VoiceService } from './voice.service';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: StudyHistory.name, schema: StudyHistorySchema },
        ]),
        AiModule,
        CloudinaryModule,
        UsersModule,
    ],
    controllers: [StudyController],
    providers: [StudyService, VoiceService],
})
export class StudyModule {}
