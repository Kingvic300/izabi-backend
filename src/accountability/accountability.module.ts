import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountabilityService } from './accountability.service';
import { AccountabilityController } from './accountability.controller';
import { AccountabilityGateway } from './accountability.gateway';
import { AccountabilityScheduler } from './accountability.scheduler';
import { Partnership, PartnershipSchema } from './entities/partnership.entity';
import { Goal, GoalSchema } from './entities/goal.entity';
import { GoalCheckIn, GoalCheckInSchema } from './entities/goal-checkin.entity';
import {
    PartnerMessage,
    PartnerMessageSchema,
} from './entities/partner-message.entity';
import {
    StudyHistory,
    StudyHistorySchema,
} from '../study/entities/study-history.entity';
import { User, UserSchema } from '../users/entities/user.entity';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Partnership.name, schema: PartnershipSchema },
            { name: Goal.name, schema: GoalSchema },
            { name: GoalCheckIn.name, schema: GoalCheckInSchema },
            { name: PartnerMessage.name, schema: PartnerMessageSchema },
            { name: StudyHistory.name, schema: StudyHistorySchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [AccountabilityController],
    providers: [
        AccountabilityService,
        AccountabilityGateway,
        AccountabilityScheduler,
    ],
    exports: [AccountabilityGateway],
})
export class AccountabilityModule {}
