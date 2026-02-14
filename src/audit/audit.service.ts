import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditDay, AuditDayDocument } from './entities/audit-day.entity';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectModel(AuditDay.name)
        private auditDayModel: Model<AuditDayDocument>,
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

    // HOW: Save audit events asynchronously to avoid blocking user requests
    // WHY: System observability must not compromise application performance
    async logEvent(event: any): Promise<AuditDayDocument> {
        try {
            const eventTime = event?.timestamp ? new Date(event.timestamp) : new Date();
            const { dateKey, dayStart, dayEnd } = this.getUtcDayRange(eventTime);
            return await this.auditDayModel
                .findOneAndUpdate(
                    { dateKey },
                    {
                        $setOnInsert: { dateKey, dayStart, dayEnd },
                        $push: { events: event },
                    },
                    { upsert: true, new: true },
                )
                .exec();
        } catch (error) {
            this.logger.error('Failed to persist audit log', error);
            throw error;
        }
    }

    // HOW: Fetch pending events for digest processing in a date window
    // WHY: Supports one daily summary email for "today" only
    async getUnsentDaysForWindow(
        startDate: Date,
        endDate: Date,
    ): Promise<AuditDayDocument[]> {
        return this.auditDayModel
            .find({
                dayStart: { $gte: startDate, $lt: endDate },
                emailedAt: { $exists: false },
            })
            .sort({ dayStart: 1 })
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
