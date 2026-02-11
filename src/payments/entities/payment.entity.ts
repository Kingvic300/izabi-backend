import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    reference: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ default: 'pending' })
    status: 'pending' | 'success' | 'failed' | 'reversed';

    @Prop({ required: true })
    plan: 'streak_freeze_package' | 'premium_subscription' | 'one_time_credits';

    @Prop({ type: Object })
    metadata: any;

    @Prop()
    paidAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
