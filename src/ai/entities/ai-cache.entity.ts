import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiCacheDocument = AiCache & Document;

@Schema({ timestamps: true })
export class AiCache {
    @Prop({ required: true, index: true })
    userId!: string;

    @Prop({ required: true, index: true })
    textHash!: string;

    @Prop({ required: true, index: true })
    promptHash!: string;

    @Prop({ required: true })
    normalizedText!: string;

    @Prop({ type: [Number] })
    embedding?: number[];

    @Prop({ required: true })
    aiOutput!: string;

    @Prop({ type: Object, default: {} })
    metadata!: Record<string, any>;
}

export const AiCacheSchema = SchemaFactory.createForClass(AiCache);
AiCacheSchema.index({ userId: 1, textHash: 1, promptHash: 1 }, { unique: true });
AiCacheSchema.index({ userId: 1, promptHash: 1, createdAt: -1 });
