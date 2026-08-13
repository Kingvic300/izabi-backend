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

    @Prop({ default: 'en' })
    language?: string;

    // On-demand translation cache for flashcards.
    // Key: normalized language code (e.g. "en", "fr", "es").
    // Value: the flashcard array translated into that language.
    // `flashcards` above stays the canonical, source-language set (the
    // language the material was originally generated in); every other
    // language is compiled lazily the first time it's requested and then
    // cached here so subsequent fetches are instant.
    @Prop({ type: Map, of: [Object], default: {} })
    flashcardsByLanguage?: Map<string, any[]>;

    // Same on-demand-translate-and-cache pattern as flashcardsByLanguage,
    // applied to the review quiz questions and the text summary.
    @Prop({ type: Map, of: [Object], default: {} })
    questionsByLanguage?: Map<string, any>;

    @Prop({ type: Map, of: String, default: {} })
    summaryByLanguage?: Map<string, string>;

    @Prop({ type: Object })
    metadata?: Record<string, any>;
}

export const StudyHistorySchema = SchemaFactory.createForClass(StudyHistory);
