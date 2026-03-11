import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
    EmbeddingJob,
    EmbeddingJobDocument,
    EmbeddingJobStatus,
} from './entities/embedding-job.entity.js';
import { AiCacheService } from './ai-cache.service.js';

@Injectable()
export class EmbeddingWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(EmbeddingWorkerService.name);
    private readonly pollIntervalMs: number;
    private readonly concurrency: number;
    private activeWorkers = 0;
    private timer?: NodeJS.Timeout;

    constructor(
        @InjectModel(EmbeddingJob.name)
        private readonly embeddingJobModel: Model<EmbeddingJobDocument>,
        private readonly aiCacheService: AiCacheService,
        private readonly configService: ConfigService,
    ) {
        this.pollIntervalMs = Number(
            this.configService.get('AI_EMBEDDING_QUEUE_POLL_MS') ?? 750,
        );
        this.concurrency = Number(
            this.configService.get('AI_EMBEDDING_CONCURRENCY') ?? 2,
        );
    }

    onModuleInit() {
        this.logger.log(
            `Starting embedding workers (interval=${this.pollIntervalMs}ms, concurrency=${this.concurrency})`,
        );
        this.timer = setInterval(() => {
            this.drainQueue().catch((err) =>
                this.logger.error('[EmbeddingWorker] drainQueue failed', err),
            );
        }, this.pollIntervalMs);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    private async drainQueue() {
        if (this.activeWorkers >= this.concurrency) return;

        while (this.activeWorkers < this.concurrency) {
            const job = await this.embeddingJobModel.findOneAndUpdate(
                {
                    status: 'queued',
                    availableAt: { $lte: new Date() },
                },
                {
                    $set: { status: 'processing', startedAt: new Date() },
                },
                {
                    sort: { priority: -1, createdAt: 1 },
                    new: true,
                },
            );

            if (!job) return;

            this.activeWorkers++;
            this.processJob(job).finally(() => {
                this.activeWorkers--;
            });
        }
    }

    private classifyError(error: any, attempt: number): {
        retryAfterMs: number;
        finalStatus: EmbeddingJobStatus;
    } {
        let retryAfterMs = 1500 * Math.pow(2, attempt);
        retryAfterMs = Math.min(retryAfterMs, 20000);

        if (error?.response?.status === 429) {
            retryAfterMs = Math.max(retryAfterMs, 5000);
        }

        const finalStatus: EmbeddingJobStatus = 'queued';
        return { retryAfterMs, finalStatus };
    }

    private async processJob(job: EmbeddingJobDocument) {
        const attemptNumber = job.attempts + 1;
        try {
            await this.aiCacheService.processEmbeddingJob({
                userId: job.userId,
                textHash: job.textHash,
                promptHash: job.promptHash,
                normalizedText: job.normalizedText,
            });

            job.status = 'completed';
            job.finishedAt = new Date();
            job.attempts = attemptNumber;
            job.error = undefined;
            await job.save();
        } catch (error: any) {
            const { retryAfterMs } = this.classifyError(error, attemptNumber - 1);
            job.attempts = attemptNumber;
            job.error = error?.message || 'Unknown error';

            if (job.attempts >= job.maxAttempts) {
                job.status = 'failed';
                job.finishedAt = new Date();
            } else {
                job.status = 'queued';
                job.availableAt = new Date(Date.now() + retryAfterMs);
            }

            await job.save();
            this.logger.warn(
                `[EmbeddingWorker] Job ${job._id?.toString()} attempt ${attemptNumber} failed: ${job.error}. Next retry in ${job.status === 'queued' ? retryAfterMs : 0}ms`,
            );
        }
    }
}
