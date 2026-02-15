import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

@Schema({ timestamps: true, collection: 'chat_sessions' })
export class ChatSession {
    @Prop({ required: true, unique: true, index: true })
    userId!: string;

    @Prop({
        type: [
            {
                role: {
                    type: String,
                    enum: ['user', 'assistant'],
                    required: true,
                },
                content: { type: String, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        default: [],
    })
    messages!: { role: 'user' | 'assistant'; content: string; timestamp: Date }[];
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
