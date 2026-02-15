import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditDayDocument = AuditDay & Document;

@Schema({ timestamps: true })
export class AuditDay {
    @Prop({ required: true, unique: true })
    dateKey!: string; // YYYY-MM-DD (UTC)

    @Prop({ required: true })
    dayStart!: Date;

    @Prop({ required: true })
    dayEnd!: Date;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'AuditLog' }], default: [] })
    logs!: Types.ObjectId[];

    @Prop()
    emailedAt?: Date;

    createdAt?: Date;
    updatedAt?: Date;
}

export const AuditDaySchema = SchemaFactory.createForClass(AuditDay);

AuditDaySchema.index({ dateKey: 1 }, { unique: true });
AuditDaySchema.index({ emailedAt: 1, dayStart: 1 });
