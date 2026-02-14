import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuizResultDocument = QuizResult & Document;

@Schema({ timestamps: true })
export class QuizResult {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId!: string;

    @Prop({ required: true })
    quizTitle!: string;

    @Prop({ required: true })
    score!: number;

    @Prop({ required: true })
    totalQuestions!: number;

    @Prop({ type: Object })
    details?: any;

    // HOW: Track test lifecycle from generation to completion
    // WHY: Prevents retaking same test, enforces time limits, enables cooldown
    @Prop({ default: 'PENDING' })
    status!: string; // PENDING, STARTED, COMPLETED, EXPIRED

    // HOW: Store generated questions to validate answers server-side
    // WHY: Prevents client manipulation, ensures consistent grading
    @Prop({ type: Object })
    questions?: any;

    // HOW: Record time taken to complete
    // WHY: Detect cheating, analyze study patterns
    @Prop()
    timeTaken?: number;

    // HOW: Duration limit in seconds
    // WHY: Enforce timed challenge constraint
    @Prop()
    durationLimit?: number;

    createdAt?: Date;
    updatedAt?: Date;
}

export const QuizResultSchema = SchemaFactory.createForClass(QuizResult);
