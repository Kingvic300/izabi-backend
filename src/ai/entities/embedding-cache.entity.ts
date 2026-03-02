import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmbeddingCacheDocument = EmbeddingCache & Document;

@Schema({ timestamps: true })
export class EmbeddingCache {
    @Prop({ required: true, index: true })
    textHash!: string;

    @Prop({ required: true, default: 'default', index: true })
    embeddingModel!: string;

    @Prop({ type: [Number], required: true })
    embedding!: number[];

    @Prop({ required: true, index: true })
    expiresAt!: Date;
}

export const EmbeddingCacheSchema = SchemaFactory.createForClass(EmbeddingCache);
EmbeddingCacheSchema.index(
    { textHash: 1, embeddingModel: 1 },
    { unique: true },
);
EmbeddingCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
