import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { STUDY_QUEUE_NAME, StudyQueueJobPayload } from './study-queue.types.js';

@Injectable()
export class StudyQueueService implements OnModuleDestroy {
    private readonly logger = new Logger(StudyQueueService.name);
    private readonly queue?: Queue<StudyQueueJobPayload>;
    private readonly dlq?: Queue<StudyQueueJobPayload & { error?: string }>;

    constructor(private readonly configService: ConfigService) {
        const redisUrl =
            this.configService.get<string>('UPSTASH_REDIS_URL') ||
            this.configService.get<string>('REDIS_URL');

        if (!redisUrl) {
            this.logger.warn(
                'Study queue disabled: UPSTASH_REDIS_URL/REDIS_URL not set.',
            );
            return;
        }

        this.queue = new Queue(STUDY_QUEUE_NAME, {
            connection: {
                url: redisUrl,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            },
        });

        this.dlq = new Queue(`${STUDY_QUEUE_NAME}-dlq`, {
            connection: {
                url: redisUrl,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            },
        });
    }

    isEnabled(): boolean {
        return Boolean(this.queue);
    }

    async enqueue(payload: StudyQueueJobPayload): Promise<void> {
        if (!this.queue) {
            throw new Error('Study queue is disabled (missing Redis URL).');
        }

        await this.queue.add('ingest', payload, {
            jobId: payload.jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 100,
            removeOnFail: 50,
        });
    }

    async enqueueDeadLetter(
        payload: StudyQueueJobPayload,
        error?: string,
    ): Promise<void> {
        if (!this.dlq) return;

        await this.dlq.add('dead-letter', { ...payload, error }, {
            jobId: `${payload.jobId}-dlq`,
            removeOnComplete: 200,
            removeOnFail: 200,
        });
    }

    async getQueueState(jobId: string): Promise<string | null> {
        if (!this.queue) return null;
        const job = await this.queue.getJob(jobId);
        if (!job) return null;
        return job.getState();
    }

    async onModuleDestroy() {
        if (this.queue) {
            await this.queue.close();
        }
        if (this.dlq) {
            await this.dlq.close();
        }
    }
}
