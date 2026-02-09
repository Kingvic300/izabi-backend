import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditService } from './audit.service';
import { AuditLog, AuditLogSchema } from './entities/audit-log.entity';
import { CronLog, CronLogSchema } from './entities/cron-log.entity';
import { AuditScheduler } from './audit.scheduler';
import { AuditInterceptor } from './audit.interceptor';
import { CronController } from './audit-cron.controller';
import { MailModule } from '../mail/mail.module';

// HOW: AuditModule is Global to ensure the Interceptor can be used application-wide
// WHY: Centralizes monitoring without requiring manual imports in every feature module
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: CronLog.name, schema: CronLogSchema },
    ]),
    MailModule,
  ],
  controllers: [CronController],
  providers: [
    AuditService,
    AuditScheduler,
    AuditInterceptor,
  ],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
