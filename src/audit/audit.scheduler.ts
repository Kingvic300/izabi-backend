import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from './audit.service';
import { MailService } from '../mail/mail.service';
import { AuditLogDocument } from './entities/audit-log.entity';
import { CronLog, CronLogDocument } from './entities/cron-log.entity';

@Injectable()
export class AuditScheduler {
  private readonly logger = new Logger(AuditScheduler.name);
  private readonly ADMIN_EMAIL = 'victor7ishola@gmail.com';

  // HOW: Minimum intervals for job execution
  // WHY: Enforces business logic even if external trigger (UptimeRobot) is more frequent
  private readonly MEDIUM_INTERVAL_MS = 15 * 60 * 1000;
  private readonly LOW_INTERVAL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private auditService: AuditService,
    private mailService: MailService,
    @InjectModel(CronLog.name) private cronLogModel: Model<CronLogDocument>,
  ) {}

  // HOW: Triggered by internal cron or external HTTP call
  // WHY: UptimeRobot calls this every 5 mins, but logic only runs every 15 mins
  @Cron('*/5 * * * *') // Run check every 5 mins internally as fallback
  async handleMediumDigest(isExternal = false) {
    if (!(await this.shouldRunJob('medium-digest', this.MEDIUM_INTERVAL_MS))) {
      return { status: 'skipped', reason: 'Interval not met' };
    }

    this.logger.log(
      `Running MEDIUM digest (Trigger: ${isExternal ? 'External' : 'Cron'})...`,
    );
    const events = await this.auditService.getUnsentEvents('MEDIUM');

    if (events.length === 0) {
      await this.updateLastRun('medium-digest', 'SUCCESS', 'No events to send');
      return { status: 'success', message: 'No events' };
    }

    try {
      await this.sendDigest(
        'MEDIUM Severity Activity Digest (15 min)',
        events,
        'Activity summary for the last 15 minutes.',
      );
      await this.updateLastRun(
        'medium-digest',
        'SUCCESS',
        `Sent ${events.length} events`,
      );
      return { status: 'success', sent: events.length };
    } catch (error) {
      await this.updateLastRun('medium-digest', 'FAILURE', error.message);
      throw error;
    }
  }

  // HOW: Triggered by internal cron or external HTTP call
  // WHY: Ensures daily report is sent once every 24h regardless of trigger frequency
  @Cron('59 23 * * *')
  async handleDailyLowDigest(isExternal = false) {
    // For daily digest, we check if it ran today
    if (!(await this.shouldRunJob('low-digest', this.LOW_INTERVAL_MS))) {
      return { status: 'skipped', reason: 'Daily report already sent' };
    }

    this.logger.log(
      `Running Daily LOW digest (Trigger: ${isExternal ? 'External' : 'Cron'})...`,
    );
    const events = await this.auditService.getUnsentEvents('LOW');

    if (events.length === 0) {
      await this.updateLastRun('low-digest', 'SUCCESS', 'No events to send');
      return { status: 'success', message: 'No events' };
    }

    try {
      await this.sendDigest(
        'Daily Low-Severity Activity Report',
        events,
        'Consolidated report of all read-only actions for today.',
      );
      await this.updateLastRun(
        'low-digest',
        'SUCCESS',
        `Sent ${events.length} events`,
      );
      return { status: 'success', sent: events.length };
    } catch (error) {
      await this.updateLastRun('low-digest', 'FAILURE', error.message);
      throw error;
    }
  }

  // HOW: Check database for last execution time of a specific job
  // WHY: Guarantees idempotency and prevents flooding if the trigger is too aggressive
  private async shouldRunJob(
    jobName: string,
    intervalMs: number,
  ): Promise<boolean> {
    const log = await this.cronLogModel.findOne({ jobName }).exec();
    if (!log) return true;

    const timeSinceLastRun = Date.now() - log.lastRunAt.getTime();
    return timeSinceLastRun >= intervalMs;
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
    events: AuditLogDocument[],
    description: string,
  ) {
    const grouped = events.reduce(
      (acc, event) => {
        acc[event.action] = (acc[event.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const html = `
      <h2>${subject}</h2>
      <p>${description}</p>
      <p><b>Total Events:</b> ${events.length}</p>
      
      <h4>Summary by Action Type:</h4>
      <ul>
        ${Object.entries(grouped)
          .map(([action, count]) => `<li>${action}: ${count}</li>`)
          .join('')}
      </ul>
      
      <h4>Detailed Event Log:</h4>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <tr style="background: #f2f2f2;">
          <th>Time</th>
          <th>User</th>
          <th>Action</th>
          <th>Outcome</th>
        </tr>
        ${events
          .map(
            (e) => `
          <tr>
            <td>${e.createdAt?.toISOString().split('T')[1].split('.')[0]}</td>
            <td>${e.user.fullName} (${e.user.email})</td>
            <td>${e.action}</td>
            <td>${e.outcome}</td>
          </tr>
        `,
          )
          .join('')}
      </table>
    `;

    await this.mailService.sendCustomEmail(this.ADMIN_EMAIL, subject, html);
    await this.auditService.markAsEmailed(events.map((e) => e._id.toString()));
  }
}
