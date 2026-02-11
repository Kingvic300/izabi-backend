import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './entities/audit-log.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);
    private readonly ADMIN_EMAIL = 'victor7ishola@gmail.com';

    constructor(
        @InjectModel(AuditLog.name)
        private auditLogModel: Model<AuditLogDocument>,
        private mailService: MailService,
        private configService: ConfigService,
    ) {}

    // HOW: Save audit events asynchronously to avoid blocking user requests
    // WHY: System observability must not compromise application performance
    async logEvent(event: any): Promise<AuditLogDocument> {
        try {
            const log = new this.auditLogModel(event);
            const saved = await log.save();

            // HOW: Immediate alerting for high-priority events
            // WHY: Admins must be notified of security/signup/critical events instantly
            if (saved.severity === 'HIGH' || saved.severity === 'CRITICAL') {
                this.sendImmediateAlert(saved).catch((err) =>
                    this.logger.error(`Alert failed for ${saved.eventId}`, err),
                );
            }

            return saved;
        } catch (error) {
            this.logger.error('Failed to persist audit log', error);
            throw error;
        }
    }

    // HOW: Send a single transactional alert email
    // WHY: Direct notification for HIGH/CRITICAL severity actions
    private async sendImmediateAlert(log: AuditLogDocument) {
        const subject = `[${log.severity}] Audit Alert: ${log.action}`;
        const content = `
      <h3>${log.severity} Severity Event Detected</h3>
      <p><b>Action:</b> ${log.action}</p>
      <p><b>Outcome:</b> ${log.outcome}</p>
      <p><b>User:</b> ${log.user.fullName} (${log.user.email})</p>
      <p><b>Route:</b> ${log.request.method} ${log.request.route}</p>
      <hr>
      <pre>${JSON.stringify(log.user, null, 2)}</pre>
    `;

        // HOW: Reuse existing MailService to send via Brevo
        // NOTE: MailService needs to be updated to support custom HTML or we use a hack
        // For now, I'll log that we are sending it.
        await this.mailService.sendCustomEmail(
            this.ADMIN_EMAIL,
            subject,
            content,
        );

        log.emailedAt = new Date();
        await log.save();
    }

    // HOW: Fetch pending events for digest processing
    // WHY: Supports batched notification strategy to stay under rate limits
    async getUnsentEvents(severity: string): Promise<AuditLogDocument[]> {
        return this.auditLogModel
            .find({
                severity,
                emailedAt: { $exists: false },
            })
            .sort({ createdAt: 1 })
            .exec();
    }

    async markAsEmailed(ids: string[]) {
        await this.auditLogModel
            .updateMany(
                { _id: { $in: ids } },
                { $set: { emailedAt: new Date() } },
            )
            .exec();
    }
}
