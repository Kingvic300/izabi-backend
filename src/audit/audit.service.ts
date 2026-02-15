import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditDay, AuditDayDocument } from './entities/audit-day.entity';
import { AuditLog, AuditLogDocument } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectModel(AuditDay.name)
        private auditDayModel: Model<AuditDayDocument>,
        @InjectModel(AuditLog.name)
        private auditLogModel: Model<AuditLogDocument>,
    ) {}

    private getUtcDayRange(date: Date) {
        const dayStart = new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
        const dateKey = dayStart.toISOString().split('T')[0];
        return { dateKey, dayStart, dayEnd };
    }

    private async resolveAuditDay(eventTime: Date): Promise<AuditDayDocument> {
        const { dateKey, dayStart, dayEnd } = this.getUtcDayRange(eventTime);
        try {
            return await this.auditDayModel
                .findOneAndUpdate(
                    { dateKey },
                    { $setOnInsert: { dateKey, dayStart, dayEnd } },
                    { upsert: true, new: true },
                )
                .exec();
        } catch (error: any) {
            // Duplicate key can happen under high concurrency; fetch existing instead.
            if (error?.code === 11000) {
                const existing = await this.auditDayModel
                    .findOne({ dateKey })
                    .exec();
                if (existing) return existing;
            }
            throw error;
        }
    }

    // HOW: Save audit events asynchronously to avoid blocking user requests
    // WHY: System observability must not compromise application performance
    async logEvent(event: any): Promise<AuditLogDocument> {
        try {
            const eventTime = event?.timestamp ? new Date(event.timestamp) : new Date();
            const { dateKey } = this.getUtcDayRange(eventTime);
            const auditDay = await this.resolveAuditDay(eventTime);

            const auditLog = await this.auditLogModel.create({
                ...event,
                dateKey,
                auditDay: auditDay._id,
                timestamp: event?.timestamp || eventTime,
                createdAt: eventTime,
            });

            await this.auditDayModel
                .updateOne(
                    { _id: auditDay._id },
                    { $addToSet: { logs: auditLog._id } },
                )
                .exec();

            return auditLog;
        } catch (error) {
            this.logger.error('Failed to persist audit log', error);
            throw error;
        }
    }

    // HOW: Fetch pending days ready for digest processing
    // WHY: Ensures we only email completed UTC days (no partial-day digests)
    async getUnsentDaysBefore(cutoffDate: Date): Promise<AuditDayDocument[]> {
        return this.auditDayModel
            .find({
                dayEnd: { $lte: cutoffDate },
                emailedAt: { $exists: false },
            })
            .sort({ dayStart: 1 })
            .exec();
    }

    async getLogsForDay(dayId: string | AuditDayDocument): Promise<AuditLogDocument[]> {
        const id = typeof dayId === 'string' ? dayId : dayId._id.toString();
        return this.auditLogModel
            .find({ auditDay: id })
            .sort({ createdAt: 1 })
            .exec();
    }

    async markDaysAsEmailed(ids: string[]) {
        await this.auditDayModel
            .updateMany(
                { _id: { $in: ids } },
                { $set: { emailedAt: new Date() } },
            )
            .exec();
    }
}
