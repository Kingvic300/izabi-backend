import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StudyJobService } from './study-job.service.js';
import { StudyQueueService } from './queue/study-queue.service.js';
import { StudyQueueJobPayload } from './queue/study-queue.types.js';
import { StudyService } from './study.service.js';

@Injectable()
export class StudyRecoveryService {
    private readonly logger = new Logger(StudyRecoveryService.name);

    constructor(
        private readonly studyJobService: StudyJobService,
        private readonly studyQueueService: StudyQueueService,
        private readonly studyService: StudyService,
    ) {}

    @Cron('*/2 * * * *')
    async recoverStuckJobs() {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const stuck = await this.studyJobService.findStuckJobs(cutoff);
        if (stuck.length === 0) return;

        for (const job of stuck) {
            try {
                const payload = await this.buildPayload(job._id.toString());
                if (!payload) continue;
                await this.studyQueueService.enqueue(payload);
                await this.studyJobService.updateStatus(
                    job._id.toString(),
                    'QUEUED',
                );
                this.logger.warn(
                    `[Recovery] Re-queued stuck job ${job._id.toString()}`,
                );
            } catch (error: any) {
                this.logger.error(
                    `[Recovery] Failed to re-queue job ${job._id.toString()}: ${error?.message}`,
                );
            }
        }
    }

    @Cron('*/5 * * * *')
    async recoverQueueFailed() {
        const failed = await this.studyJobService.findQueueFailed(25);
        if (failed.length === 0) return;

        for (const job of failed) {
            try {
                const payload = await this.buildPayload(job._id.toString());
                if (!payload) continue;
                await this.studyQueueService.enqueue(payload);
                await this.studyJobService.updateStatus(
                    job._id.toString(),
                    'QUEUED',
                );
                this.logger.warn(
                    `[Recovery] Re-queued queue-failed job ${job._id.toString()}`,
                );
            } catch (error: any) {
                this.logger.error(
                    `[Recovery] Failed to re-queue queue-failed job ${job._id.toString()}: ${error?.message}`,
                );
            }
        }
    }

    private async buildPayload(
        jobId: string,
    ): Promise<StudyQueueJobPayload | null> {
        const job = await this.studyJobService.findById(jobId);
        if (!job || !job.historyId) return null;
        const history = await this.studyService.getJobStatus(job.historyId);
        if (!history) return null;

        const fileUrls =
            job.fileUrls?.length > 0
                ? job.fileUrls
                : history.fileUrl
                  ? [history.fileUrl]
                  : [];

        if (fileUrls.length === 0) return null;

        return {
            jobId: job._id.toString(),
            historyId: job.historyId,
            userId: job.userId.toString(),
            type: job.type,
            fileUrls,
            fileNames: job.fileNames || [],
            language: history.language || 'en',
            options: job.options || {},
        };
    }
}
