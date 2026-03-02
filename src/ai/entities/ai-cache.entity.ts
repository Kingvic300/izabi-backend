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

    @Prop({ default: 0 })
    chunkCount?: number;

    @Prop({ default: 'default' })
    embeddingModel?: string;

    @Prop({ required: true })
    aiOutput!: string;

    @Prop({ type: Object, default: {} })
    metadata!: Record<string, any>;

    @Prop({ required: true, index: true })
    expiresAt!: Date;
}

export const AiCacheSchema = SchemaFactory.createForClass(AiCache);
AiCacheSchema.index({ userId: 1, textHash: 1, promptHash: 1 }, { unique: true });
AiCacheSchema.index({ userId: 1, promptHash: 1, createdAt: -1 });
AiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
