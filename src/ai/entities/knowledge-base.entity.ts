import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KnowledgeBaseDocument = KnowledgeBase & Document;

@Schema({ timestamps: true })
export class KnowledgeBase {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  documentId: string; // Identifier for the source document (e.g., filename or hash)

  @Prop({ required: true })
  content: string; // The chunk of text

  @Prop({ type: [Number], required: true })
  vector: number[]; // The embedding vector

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>; // Additional info (page number, source type, etc.)
}

export const KnowledgeBaseSchema = SchemaFactory.createForClass(KnowledgeBase);
