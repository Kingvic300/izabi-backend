import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudyHistoryDocument = StudyHistory & Document;

@Schema({ timestamps: true })
export class StudyHistory {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId!: string;

    @Prop()
    fileName?: string;

    @Prop()
    fileUrl?: string;

    @Prop()
    type?: string;

    @Prop()
    summary?: string;

    @Prop({ type: Object })
    questions?: any;

    @Prop({ type: Array })
    flashcards?: any[];

    @Prop()
    topic?: string; // Keeping for backward compatibility if needed

    @Prop()
    duration?: number;

    @Prop({ default: 'COMPLETED' })
    status!: string;

    @Prop({ index: true })
    docHash?: string;

    @Prop({ type: Object })
    metadata?: Record<string, any>;
}

export const StudyHistorySchema = SchemaFactory.createForClass(StudyHistory);
