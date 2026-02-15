import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatDocument = Chat & Document;

@Schema({ timestamps: true })
export class Chat {
    @Prop({ required: true })
    userId!: string;

    @Prop({ required: true, index: true })
    sessionId!: string;

    @Prop()
    title?: string;

    @Prop({ default: 0 })
    promptCount!: number;

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
    messages!: { role: string; content: string; timestamp: Date }[];

    createdAt!: Date;
    updatedAt!: Date;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
ChatSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
