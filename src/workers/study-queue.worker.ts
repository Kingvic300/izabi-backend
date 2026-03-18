import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from '../app.module.js';
import { StudyService } from '../study/study.service.js';
import {
    STUDY_QUEUE_NAME,
    StudyQueueJobPayload,
} from '../study/queue/study-queue.types.js';

const logger = new Logger('StudyQueueWorker');

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });

    const configService = app.get(ConfigService);
    const redisUrl =
        configService.get<string>('UPSTASH_REDIS_URL') ||
        configService.get<string>('REDIS_URL');

    if (!redisUrl) {
        throw new Error('UPSTASH_REDIS_URL/REDIS_URL not configured.');
    }

    const studyService = app.get(StudyService);
    const concurrency = Number(
        configService.get('STUDY_QUEUE_CONCURRENCY') ?? 2,
    );

    const worker = new Worker<StudyQueueJobPayload>(
        STUDY_QUEUE_NAME,
        async (job) => {
            await studyService.processQueuedDirectUpload(job.data);
        },
        {
            connection: {
                url: redisUrl,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            },
            concurrency,
        },
    );

    worker.on('completed', (job) => {
        logger.log(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`Job ${job?.id} failed: ${err?.message}`);
    });

    logger.log(`Study queue worker started (concurrency=${concurrency}).`);
}

bootstrap().catch((err) => {
    logger.error('Worker bootstrap failed', err);
    process.exit(1);
});
