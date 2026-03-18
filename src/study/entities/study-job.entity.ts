import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudyJobStatus =
    | 'PENDING'
    | 'UPLOADED'
    | 'QUEUED'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'RETRY'
    | 'FAILED'
    | 'QUEUE_FAILED'
    | 'DEAD_LETTERED';

export type StudyJobDocument = StudyJob & Document;

@Schema({ timestamps: true })
export class StudyJob {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId!: string;

    @Prop({ required: true })
    type!: 'summary' | 'flashcards' | 'quiz' | 'study-guide';

    @Prop({ type: [String], default: [] })
    fileNames!: string[];

    @Prop({ type: [String], default: [] })
    fileUrls!: string[];

    @Prop({ index: true, unique: true })
    dedupeKey!: string;

    @Prop({ default: 'PENDING', index: true })
    status!: StudyJobStatus;

    @Prop({ default: 0 })
    attempts!: number;

    @Prop()
    lastError?: string;

    @Prop()
    leaseUntil?: Date;

    @Prop({ type: Object })
    options?: Record<string, any>;

    @Prop()
    historyId?: string;

    @Prop({ default: 0 })
    retryAfterMs?: number;
}

export const StudyJobSchema = SchemaFactory.createForClass(StudyJob);
