import {
    BadRequestException,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service.js';
import {
    AiJob,
    AiJobDocument,
    AiJobStatus,
} from './entities/ai-job.entity.js';

interface ProcessClassifierResult {
    retryAfterMs: number;
    finalStatus: AiJobStatus;
}

@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AiQueueService.name);
    private readonly pollIntervalMs: number;
    private readonly concurrency: number;
    private activeWorkers = 0;
    private timer?: NodeJS.Timeout;

    constructor(
        @InjectModel(AiJob.name) private readonly aiJobModel: Model<AiJobDocument>,
        private readonly aiService: AiService,
        private readonly configService: ConfigService,
    ) {
        this.pollIntervalMs = Number(
            this.configService.get('AI_QUEUE_POLL_MS') ?? 250,
        );
        this.concurrency = Number(
            this.configService.get('AI_SUMMARY_CONCURRENCY') ?? 4,
        );
    }

    onModuleInit() {
        this.logger.log(
            `Starting AI background workers (interval=${this.pollIntervalMs}ms, concurrency=${this.concurrency})`,
        );
        this.timer = setInterval(() => {
            this.drainQueue().catch((err) =>
                this.logger.error('[Queue] drainQueue failed', err),
            );
        }, this.pollIntervalMs);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    async enqueueSummarization(
        userId: string,
        input: string,
        meta: Record<string, any> = {},
    ): Promise<AiJobDocument> {
        if (!input || !input.trim()) {
            throw new BadRequestException('Text to summarize is required');
        }

        const dedupeKey = this.aiService.generateHash(`${userId}:${input}`);
        const existing = await this.aiJobModel
            .findOne({
                userId,
                type: 'summarization',
                dedupeKey,
                status: { $in: ['queued', 'processing', 'completed'] },
            })
            .exec();

        if (existing) {
            return existing;
        }

        return await this.aiJobModel.create({
            type: 'summarization',
            userId,
            input,
            meta,
            dedupeKey,
            priority: meta.priority ?? 0,
            availableAt: new Date(),
        });
    }

    async getJob(jobId: string): Promise<AiJobDocument | null> {
        return this.aiJobModel.findById(jobId).exec();
    }

    private async drainQueue() {
        if (this.activeWorkers >= this.concurrency) return;

        while (this.activeWorkers < this.concurrency) {
            const job = await this.aiJobModel.findOneAndUpdate(
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

    private classifyError(error: any, attempt: number): ProcessClassifierResult {
        let retryAfterMs = 1500 * Math.pow(2, attempt);
        retryAfterMs = Math.min(retryAfterMs, 20000);

        if (error?.response?.status === 429) {
            retryAfterMs = Math.max(retryAfterMs, 5000);
        }

        const finalStatus: AiJobStatus = 'queued';
        return { retryAfterMs, finalStatus };
    }

    private async processJob(job: AiJobDocument) {
        const attemptNumber = job.attempts + 1;
        try {
            const summary = await this.aiService.summarizeText(
                job.input,
                job.userId,
                {
                    jobId: job._id?.toString(),
                },
            );

            job.status = 'completed';
            job.result = summary;
            job.finishedAt = new Date();
            job.attempts = attemptNumber;
            job.error = undefined;
            await job.save();
            this.logger.log(
                `[Queue] Job ${job._id?.toString()} completed with key metrics snapshot.`,
            );
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
                `[Queue] Job ${job._id?.toString()} attempt ${attemptNumber} failed: ${job.error}. Next retry in ${job.status === 'queued' ? retryAfterMs : 0}ms`,
            );
        }
    }
}
