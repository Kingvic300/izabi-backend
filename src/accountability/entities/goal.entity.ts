import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GoalDocument = Goal & Document;

@Schema({ timestamps: true })
export class Goal {
    @Prop({ type: Types.ObjectId, ref: 'Partnership', required: true })
    partnershipId!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    createdBy!: string;

    @Prop({ required: true })
    title!: string;

    @Prop()
    description?: string;

    @Prop({ default: 'daily' })
    cadence!: 'daily' | 'weekly';

    @Prop()
    deadline?: Date;

    @Prop({ default: true })
    isActive!: boolean;

    createdAt?: Date;
    updatedAt?: Date;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
GoalSchema.index({ partnershipId: 1, isActive: 1 });
