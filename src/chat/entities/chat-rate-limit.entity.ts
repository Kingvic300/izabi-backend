import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatRateLimitDocument = ChatRateLimit & Document;

@Schema({ timestamps: true, collection: 'chat_rate_limits' })
export class ChatRateLimit {
    @Prop({ required: true, unique: true, index: true })
    userId!: string;

    @Prop({ required: true })
    count!: number;

    @Prop({ required: true })
    resetAt!: Date;

    @Prop({ required: true, expires: 0 })
    expiresAt!: Date;
}

export const ChatRateLimitSchema = SchemaFactory.createForClass(ChatRateLimit);
