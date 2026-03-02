import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiCacheChunkDocument = AiCacheChunk & Document;

@Schema({ timestamps: true })
export class AiCacheChunk {
    @Prop({ required: true, index: true })
    userId!: string;

    @Prop({ required: true, index: true })
    textHash!: string;

    @Prop({ required: true, index: true })
    promptHash!: string;

    @Prop({ required: true })
    chunkIndex!: number;

    @Prop({ required: true })
    chunkHash!: string;

    @Prop({ required: true })
    chunkText!: string;

    @Prop({ type: [Number], required: true })
    embedding!: number[];

    @Prop({ default: 'default' })
    embeddingModel?: string;

    @Prop({ type: Object, default: {} })
    metadata!: Record<string, any>;

    @Prop({ required: true, index: true })
    expiresAt!: Date;
}

export const AiCacheChunkSchema = SchemaFactory.createForClass(AiCacheChunk);
AiCacheChunkSchema.index(
    { userId: 1, textHash: 1, promptHash: 1, chunkIndex: 1 },
    { unique: true },
);
AiCacheChunkSchema.index({ userId: 1, promptHash: 1, createdAt: -1 });
AiCacheChunkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
