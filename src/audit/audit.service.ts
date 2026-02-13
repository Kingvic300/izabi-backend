import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectModel(AuditLog.name)
        private auditLogModel: Model<AuditLogDocument>,
    ) {}

    // HOW: Save audit events asynchronously to avoid blocking user requests
    // WHY: System observability must not compromise application performance
    async logEvent(event: any): Promise<AuditLogDocument> {
        try {
            const log = new this.auditLogModel(event);
            return await log.save();
        } catch (error) {
            this.logger.error('Failed to persist audit log', error);
            throw error;
        }
    }

    // HOW: Fetch pending events for digest processing in a date window
    // WHY: Supports one daily summary email for "today" only
    async getUnsentEventsForWindow(
        startDate: Date,
        endDate: Date,
    ): Promise<AuditLogDocument[]> {
        return this.auditLogModel
            .find({
                createdAt: { $gte: startDate, $lt: endDate },
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
