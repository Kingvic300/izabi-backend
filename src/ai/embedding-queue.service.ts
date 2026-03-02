import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    EmbeddingJob,
    EmbeddingJobDocument,
} from './entities/embedding-job.entity.js';

export type EmbeddingJobPayload = {
    userId: string;
    textHash: string;
    promptHash: string;
    normalizedText: string;
};

@Injectable()
export class EmbeddingQueueService {
    constructor(
        @InjectModel(EmbeddingJob.name)
        private readonly embeddingJobModel: Model<EmbeddingJobDocument>,
    ) {}

    async enqueueEmbeddingJob(payload: EmbeddingJobPayload): Promise<void> {
        const dedupeKey = `${payload.userId}:${payload.promptHash}:${payload.textHash}`;
        const existing = await this.embeddingJobModel
            .findOne({
                dedupeKey,
                status: { $in: ['queued', 'processing', 'completed'] },
            })
            .select('_id')
            .lean()
            .exec();

        if (existing) return;

        await this.embeddingJobModel.create({
            ...payload,
            dedupeKey,
            status: 'queued',
            availableAt: new Date(),
            priority: 0,
        });
    }
}
