import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from './users.service';

@Injectable()
export class UsersScheduler {
  private readonly logger = new Logger(UsersScheduler.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Snapshot ranks every day at midnight UTC.
   * WHY: This allows us to track if a user moved UP or DOWN in the leaderboard.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRankSnapshot() {
    this.logger.log('Starting daily leaderboard rank snapshot...');
    try {
      const result = await this.usersService.updatePreviousRanks();
      this.logger.log(`Leaderboard snapshot completed. Processed ${result.totalProcessed} users.`);
    } catch (error) {
      this.logger.error('Failed to update leaderboard snapshots', error.stack);
    }
  }

  /**
   * Run every 4 hours to ensure ranks stay relatively fresh even if streak changes mid-day
   * but doesn't overwrite the "daily" baseline too often.
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async handleFrequentSync() {
      // Optional: could do more frequent syncs if needed
  }
}
