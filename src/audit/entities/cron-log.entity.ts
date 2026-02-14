import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CronLogDocument = CronLog & Document;

@Schema({ timestamps: true })
export class CronLog {
    // HOW: Unified job identifier
    // WHY: Allow multi-job tracking (medium-digest, low-digest)
    @Prop({ required: true, unique: true })
    jobName!: string;

    // HOW: Track precisely when the job logic was last executed successfully
    // WHY: UptimeRobot triggers every 5 mins, but we need 15-min and daily precision
    @Prop({ required: true })
    lastRunAt!: Date;

    @Prop()
    status?: 'SUCCESS' | 'FAILURE';

    @Prop()
    details?: string;
}

export const CronLogSchema = SchemaFactory.createForClass(CronLog);
