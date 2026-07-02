import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PartnerMessageDocument = PartnerMessage & Document;

@Schema({ timestamps: true })
export class PartnerMessage {
    @Prop({ type: Types.ObjectId, ref: 'Partnership', required: true })
    partnershipId!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    senderId!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    recipientId!: string;

    @Prop({ default: 'message' })
    type!: 'message' | 'nudge';

    @Prop({ required: true })
    content!: string;

    @Prop({ default: false })
    read!: boolean;

    @Prop()
    readAt?: Date;

    createdAt?: Date;
    updatedAt?: Date;
}

export const PartnerMessageSchema =
    SchemaFactory.createForClass(PartnerMessage);
PartnerMessageSchema.index({ partnershipId: 1, createdAt: -1 });
