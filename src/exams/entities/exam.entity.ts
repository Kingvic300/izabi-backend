import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExamDocument = Exam & Document;

@Schema({ timestamps: true })
export class Exam {
    @Prop({ required: true })
    title!: string;

    @Prop({ required: true })
    type!: string; // 'JAMB' | 'WAEC' | 'NECO' | 'POST-UTME' | 'UNI-COURSE'

    @Prop()
    category?: string; // 'Secondary' | 'University'

    @Prop()
    subject?: string;

    @Prop()
    year?: number;

    @Prop()
    institution?: string; // For specialized Uni past questions

    @Prop({ type: Array })
    questions?: {
        question: string;
        options: string[];
        answer: string;
        explanation: string;
    }[];

    @Prop({ default: 60 })
    duration!: number; // In minutes
}

export const ExamSchema = SchemaFactory.createForClass(Exam);
