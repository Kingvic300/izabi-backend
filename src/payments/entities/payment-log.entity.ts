import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentLogDocument = PaymentLog & Document;

@Schema({ timestamps: true })
export class PaymentLog {
  @Prop()
  userId?: string;

  @Prop({ required: true })
  reference: string;

  @Prop()
  amount?: number;

  @Prop()
  plan?: string;

  @Prop({ required: true })
  event: string;

  @Prop({ type: Object })
  metadata?: any;
}

export const PaymentLogSchema = SchemaFactory.createForClass(PaymentLog);
