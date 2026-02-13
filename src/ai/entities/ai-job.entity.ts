import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiJobDocument = AiJob & Document;

export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

@Schema({ timestamps: true })
export class AiJob {
    @Prop({ required: true, enum: ['summarization'], index: true })
    type!: 'summarization';

    @Prop({ required: true, index: true })
    userId!: string;

    @Prop({ required: true })
    input!: string;

    @Prop({ type: Object, default: {} })
    meta!: Record<string, any>;

    @Prop({
        required: true,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued',
        index: true,
    })
    status!: AiJobStatus;

    @Prop({ default: 0 })
    attempts!: number;

    @Prop({ default: 3 })
    maxAttempts!: number;

    @Prop({ default: 0 })
    priority!: number;

    @Prop({ type: Date, default: () => new Date(), index: true })
    availableAt!: Date;

    @Prop({ type: Date })
    startedAt?: Date;

    @Prop({ type: Date })
    finishedAt?: Date;

    @Prop()
    result?: string;

    @Prop()
    error?: string;

    @Prop({ index: true })
    dedupeKey?: string;
}

export const AiJobSchema = SchemaFactory.createForClass(AiJob);
AiJobSchema.index({ status: 1, availableAt: 1, priority: -1, createdAt: 1 });
