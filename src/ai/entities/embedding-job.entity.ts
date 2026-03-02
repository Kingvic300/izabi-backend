import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmbeddingJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type EmbeddingJobDocument = EmbeddingJob & Document;

@Schema({ timestamps: true })
export class EmbeddingJob {
    @Prop({ required: true, index: true })
    userId!: string;

    @Prop({ required: true, index: true })
    textHash!: string;

    @Prop({ required: true, index: true })
    promptHash!: string;

    @Prop({ required: true })
    normalizedText!: string;

    @Prop({ required: true, index: true })
    dedupeKey!: string;

    @Prop({ type: String, required: true, default: 'queued', index: true })
    status!: EmbeddingJobStatus;

    @Prop({ default: 0 })
    attempts!: number;

    @Prop({ default: 4 })
    maxAttempts!: number;

    @Prop({ default: 0 })
    priority!: number;

    @Prop({ type: Date, default: null })
    startedAt?: Date | null;

    @Prop({ type: Date, default: null })
    finishedAt?: Date | null;

    @Prop({ type: Date, default: null })
    availableAt?: Date | null;

    @Prop({ type: String, default: null })
    error?: string | null;
}

export const EmbeddingJobSchema = SchemaFactory.createForClass(EmbeddingJob);
EmbeddingJobSchema.index({ status: 1, availableAt: 1, priority: -1 });
EmbeddingJobSchema.index({ dedupeKey: 1 }, { unique: true });
