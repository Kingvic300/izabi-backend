import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    StudyJob,
    StudyJobDocument,
    StudyJobStatus,
} from './entities/study-job.entity.js';

@Injectable()
export class StudyJobService {
    constructor(
        @InjectModel(StudyJob.name)
        private readonly jobModel: Model<StudyJobDocument>,
    ) {}

    async findById(id: string) {
        return this.jobModel.findById(id).exec();
    }

    async findByDedupeKey(dedupeKey: string) {
        return this.jobModel.findOne({ dedupeKey }).exec();
    }

    async createJob(payload: {
        userId: string;
        type: StudyJob['type'];
        fileNames: string[];
        options?: Record<string, any>;
        dedupeKey: string;
        historyId?: string;
    }) {
        return this.jobModel.create({
            userId: payload.userId,
            type: payload.type,
            fileNames: payload.fileNames,
            options: payload.options,
            dedupeKey: payload.dedupeKey,
            status: 'PENDING',
            historyId: payload.historyId,
        });
    }

    async updateStatus(
        id: string,
        status: StudyJobStatus,
        updates: Partial<StudyJobDocument> = {},
    ) {
        return this.jobModel
            .findByIdAndUpdate(
                id,
                { status, ...updates },
                { new: true },
            )
            .exec();
    }

    async markQueued(id: string, fileUrls: string[]) {
        return this.updateStatus(id, 'QUEUED', { fileUrls });
    }

    async markUploaded(id: string, fileUrls: string[]) {
        return this.updateStatus(id, 'UPLOADED', { fileUrls });
    }

    async markQueueFailed(id: string, error: string) {
        return this.updateStatus(id, 'QUEUE_FAILED', {
            lastError: error,
        });
    }

    async acquireLease(
        id: string,
        leaseMs: number,
        attempts: number,
    ) {
        const leaseUntil = new Date(Date.now() + leaseMs);
        return this.jobModel.findOneAndUpdate(
            {
                _id: id,
                $or: [
                    { leaseUntil: { $exists: false } },
                    { leaseUntil: { $lte: new Date() } },
                ],
            },
            {
                status: 'PROCESSING',
                leaseUntil,
                attempts,
            },
            { new: true },
        );
    }

    async releaseLease(id: string) {
        return this.jobModel
            .findByIdAndUpdate(id, { $unset: { leaseUntil: '' } })
            .exec();
    }

    async findStuckJobs(cutoff: Date) {
        return this.jobModel
            .find({
                status: 'PROCESSING',
                leaseUntil: { $lte: cutoff },
            })
            .exec();
    }

    async findQueueFailed(limit = 25) {
        return this.jobModel
            .find({ status: 'QUEUE_FAILED' })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .exec();
    }
}
