import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ImpersonationAuditDocument = ImpersonationAudit & Document;

@Schema({ timestamps: true })
export class ImpersonationAudit {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    adminId!: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    targetUserId!: Types.ObjectId;

    @Prop({ required: true, default: 'STARTED' })
    action!: 'STARTED' | 'STOPPED' | 'EXPIRED';

    @Prop({ required: true })
    startedAt!: Date;

    @Prop()
    endedAt?: Date;

    @Prop({ type: Object, default: {} })
    actionsPerformed!: Record<string, any>;

    @Prop()
    ipAddress?: string;

    @Prop()
    userAgent?: string;

    @Prop({ default: false })
    wasManual!: boolean;
}

export const ImpersonationAuditSchema = SchemaFactory.createForClass(ImpersonationAudit);

// Index for efficient queries
ImpersonationAuditSchema.index({ adminId: 1, startedAt: -1 });
ImpersonationAuditSchema.index({ targetUserId: 1, startedAt: -1 });

