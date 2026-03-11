import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from './audit.service';
import { MailService } from '../mail/mail.service';
import { CronLog, CronLogDocument } from './entities/cron-log.entity';
import { getAuditDigestTemplate } from '../mail/mail.templates';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditScheduler {
    private readonly logger = new Logger(AuditScheduler.name);
    private readonly adminEmail: string;
    private readonly DAILY_JOB_NAME = 'daily-audit-summary';

    constructor(
        private auditService: AuditService,
        private mailService: MailService,
        private configService: ConfigService,
        @InjectModel(CronLog.name) private cronLogModel: Model<CronLogDocument>,
    ) {
        this.adminEmail =
            this.configService.get<string>('AUDIT_ADMIN_EMAIL') ||
            'victor7ishola@gmail.com';
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        return String(error);
    }

    // HOW: Triggered by internal cron or external HTTP call
    // WHY: Consolidates all daily audit activity into one summary email
    @Cron('5 0 * * *', { timeZone: 'UTC' })
    async handleDailySummary(isExternal = false, force = false) {
        if (!force && !(await this.shouldRunToday(this.DAILY_JOB_NAME))) {
            return { status: 'skipped', reason: 'Daily report already sent' };
        }

        const { startOfTodayUtc } = this.getTodayUtcWindow();
        this.logger.log(
            `Running Daily Audit Summary (Trigger: ${isExternal ? 'External' : 'Cron'}, Force: ${force})...`,
        );
        const days = await this.auditService.getUnsentDaysBefore(startOfTodayUtc);

        if (days.length === 0) {
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'SUCCESS',
                'No events to send',
            );
            return { status: 'success', message: 'No events' };
        }

        const allEvents: any[] = [];
        const failedDays: string[] = [];
        const successfulDayIds: string[] = [];

        for (const day of days) {
            try {
                const events = await this.auditService.getLogsForDay(day);
                allEvents.push(...events);
                successfulDayIds.push(day._id.toString());
            } catch (error) {
                failedDays.push(day.dateKey);
                this.logger.error(
                    `Failed to fetch audit logs for ${day.dateKey}`,
                    error as any,
                );
            }
        }

        if (failedDays.length > 0) {
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'FAILURE',
                `Failed days: ${failedDays.join(', ')}`,
            );
            return { status: 'partial', failedDays };
        }

        if (allEvents.length === 0) {
            await this.auditService.markDaysAsEmailed(successfulDayIds);
            await this.updateLastRun(
                this.DAILY_JOB_NAME,
                'SUCCESS',
                'No events to send',
            );
            return { status: 'success', message: 'No events' };
        }

        const dateKeys = days.map((day) => day.dateKey).sort();
        const rangeLabel =
            dateKeys.length > 1
                ? `${dateKeys[0]} → ${dateKeys[dateKeys.length - 1]}`
                : dateKeys[0];

        await this.sendDigest(
            `Audit Digest (${rangeLabel}, UTC)`,
            allEvents,
            `Consolidated report of all audit activity captured across ${days.length} day(s) (UTC).`,
        );

        await this.auditService.markDaysAsEmailed(successfulDayIds);
        await this.updateLastRun(
            this.DAILY_JOB_NAME,
            'SUCCESS',
            `Sent ${allEvents.length} events across ${days.length} day(s)`,
        );
        return { status: 'success', sent: allEvents.length, days: days.length };
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

        await this.mailService.sendCustomEmail(this.adminEmail, subject, html);
    }
}
