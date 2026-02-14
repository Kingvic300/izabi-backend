import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from './audit.service';
import { MailService } from '../mail/mail.service';
import { CronLog, CronLogDocument } from './entities/cron-log.entity';
import { getAuditDigestTemplate } from '../mail/mail.templates';

@Injectable()
export class AuditScheduler {
    private readonly logger = new Logger(AuditScheduler.name);
    private readonly ADMIN_EMAIL = 'victor7ishola@gmail.com';
    private readonly DAILY_JOB_NAME = 'daily-audit-summary';

    constructor(
        private auditService: AuditService,
        private mailService: MailService,
        @InjectModel(CronLog.name) private cronLogModel: Model<CronLogDocument>,
    ) {}

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        return String(error);
    }

    // HOW: Triggered by internal cron or external HTTP call
    // WHY: Consolidates all daily audit activity into one summary email
    @Cron('59 23 * * *')
    async handleDailySummary(isExternal = false) {
        if (!(await this.shouldRunToday(this.DAILY_JOB_NAME))) {
            return { status: 'skipped', reason: 'Daily report already sent' };
        }

        const { startOfTodayUtc, startOfTomorrowUtc } =
            this.getTodayUtcWindow();
        this.logger.log(
            `Running Daily Audit Summary (Trigger: ${isExternal ? 'External' : 'Cron'})...`,
        );
        const days = await this.auditService.getUnsentDaysForWindow(
            startOfTodayUtc,
            startOfTomorrowUtc,
        );

        if (days.length === 0) {
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'SUCCESS',
                'No events to send',
            );
            return { status: 'success', message: 'No events' };
        }

        const events = days.flatMap((day) =>
            (day.events || []).map((event: any) => ({
                ...event,
                createdAt: event?.createdAt || event?.timestamp || day.dayStart,
            })),
        );

        try {
            const subjectDate = startOfTodayUtc.toISOString().split('T')[0];
            await this.sendDigest(
                `Daily Audit Summary (${subjectDate}, UTC)`,
                events,
                'Consolidated report of all audit activity captured today.',
            );
            await this.auditService.markDaysAsEmailed(
                days.map((day) => day._id.toString()),
            );
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'SUCCESS',
                `Sent ${events.length} events`,
            );
            return { status: 'success', sent: events.length };
        } catch (error) {
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'FAILURE',
                this.getErrorMessage(error),
            );
            throw error;
        }
    }

    private getTodayUtcWindow(now = new Date()): {
        startOfTodayUtc: Date;
        startOfTomorrowUtc: Date;
    } {
        const startOfTodayUtc = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const startOfTomorrowUtc = new Date(startOfTodayUtc);
        startOfTomorrowUtc.setUTCDate(startOfTomorrowUtc.getUTCDate() + 1);

        return { startOfTodayUtc, startOfTomorrowUtc };
    }

    // HOW: Check if the daily summary has already run for the current UTC day
    // WHY: Prevent duplicate emails when external systems call the endpoint repeatedly
    private async shouldRunToday(jobName: string): Promise<boolean> {
        const log = await this.cronLogModel.findOne({ jobName }).exec();
        if (!log) return true;

        const { startOfTodayUtc } = this.getTodayUtcWindow();
        return log.lastRunAt < startOfTodayUtc;
    }

    private async updateLastRun(
        jobName: string,
        status: 'SUCCESS' | 'FAILURE',
        details: string,
    ) {
        await this.cronLogModel
            .findOneAndUpdate(
                { jobName },
                {
                    lastRunAt: new Date(),
                    status,
                    details,
                },
                { upsert: true, new: true },
            )
            .exec();
    }

    private async sendDigest(
        subject: string,
        events: any[],
        description: string,
    ) {
        const grouped = events.reduce(
            (acc, event) => {
                acc[event.action] = (acc[event.action] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const html = getAuditDigestTemplate({
            subject,
            description,
            totalEvents: events.length,
            grouped,
            events,
        });

        await this.mailService.sendCustomEmail(this.ADMIN_EMAIL, subject, html);
    }
}
