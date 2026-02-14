import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditService } from './audit.service';
import { AuditDay, AuditDaySchema } from './entities/audit-day.entity';
import { CronLog, CronLogSchema } from './entities/cron-log.entity';
import { AuditScheduler } from './audit.scheduler';
import { AuditInterceptor } from './audit.interceptor';
import { CronController } from './audit-cron.controller';
import { MailModule } from '../mail/mail.module';
import { User, UserSchema } from '../users/entities/user.entity';

// HOW: AuditModule is Global to ensure the Interceptor can be used application-wide
// WHY: Centralizes monitoring without requiring manual imports in every feature module
@Global()
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: AuditDay.name, schema: AuditDaySchema },
            { name: CronLog.name, schema: CronLogSchema },
            { name: User.name, schema: UserSchema }, // For fetching user details in AuditInterceptor
        ]),
        MailModule,
    ],
    controllers: [CronController],
    providers: [
        AuditService,
        AuditScheduler,
        {
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
        },
    ],
    exports: [AuditService],
})
export class AuditModule {}
