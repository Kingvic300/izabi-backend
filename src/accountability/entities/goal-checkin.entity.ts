import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GoalCheckInDocument = GoalCheckIn & Document;

@Schema({ timestamps: true })
export class GoalCheckIn {
    @Prop({ type: Types.ObjectId, ref: 'Partnership', required: true })
    partnershipId!: string;

    @Prop({ type: Types.ObjectId, ref: 'Goal', required: true })
    goalId!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId!: string;

    // 'YYYY-MM-DD' in UTC — one check-in per user per goal per day
    @Prop({ required: true })
    day!: string;

    @Prop()
    note?: string;

    createdAt?: Date;
    updatedAt?: Date;
}

export const GoalCheckInSchema = SchemaFactory.createForClass(GoalCheckIn);
GoalCheckInSchema.index(
    { goalId: 1, userId: 1, day: 1 },
    { unique: true },
);
