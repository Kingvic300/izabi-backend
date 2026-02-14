import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PDFSplitHistoryDocument = PDFSplitHistory & Document;

@Schema({ timestamps: true })
export class PDFSplitHistory {
    @Prop({ required: true })
    userId!: string;

    @Prop({ required: true })
    originalFileName!: string;

    @Prop()
    originalFileUrl?: string;

    @Prop({ required: true })
    totalPages!: number;

    @Prop({ type: Object })
    splitSuggestions?: any;

    @Prop({ type: [Object] })
    processedSections?: Array<{
        sectionId: string;
        pageStart: number;
        pageEnd: number;
        status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
        jobId?: string;
        title?: string;
    }>;

    @Prop({ default: 'ACTIVE' })
    status!: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

    @Prop({ type: Object })
    metadata?: any;
}

export const PDFSplitHistorySchema =
    SchemaFactory.createForClass(PDFSplitHistory);
