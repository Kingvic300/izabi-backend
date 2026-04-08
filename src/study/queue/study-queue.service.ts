import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudyQueueJobPayload } from './study-queue.types.js';

@Injectable()
export class StudyQueueService {
    private readonly logger = new Logger(StudyQueueService.name);

    constructor(private readonly configService: ConfigService) {
        this.logger.warn('Study queue explicitly disabled: System running in serverless-ready direct processing mode without Redis.');
    }

    isEnabled(): boolean {
        return false;
    }

    async enqueue(payload: StudyQueueJobPayload): Promise<void> {
        throw new Error('Study queue is entirely disabled.');
    }

    async enqueueDeadLetter(
        payload: StudyQueueJobPayload,
        error?: string,
    ): Promise<void> {
        return;
    }

    async getQueueState(jobId: string): Promise<string | null> {
        return null;
    }
}
