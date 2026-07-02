import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PartnershipDocument = Partnership & Document;

export type PartnershipStatus =
    | 'pending'
    | 'active'
    | 'declined'
    | 'ended'
    | 'expired';

@Schema({ timestamps: true })
export class Partnership {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userA!: string;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    userB?: string;

    @Prop()
    inviteeEmail?: string;

    @Prop({ required: true, unique: true })
    inviteCode!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    initiatedBy!: string;

    @Prop({ default: 'pending' })
    status!: PartnershipStatus;

    @Prop()
    expiresAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    endedBy?: string;

    @Prop()
    endedAt?: Date;

    createdAt?: Date;
    updatedAt?: Date;
}

export const PartnershipSchema = SchemaFactory.createForClass(Partnership);
PartnershipSchema.index({ userA: 1, status: 1 });
PartnershipSchema.index({ userB: 1, status: 1 });
// inviteCode already gets a unique index from @Prop({ unique: true }) above.
