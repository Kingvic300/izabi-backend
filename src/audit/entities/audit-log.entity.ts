import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
    @Prop({ required: true, unique: true })
    eventId!: string;

    @Prop({ required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
    severity!: string;

    @Prop({ required: true })
    action!: string;

    @Prop({ required: true, type: Object })
    user!: {
        userId: string;
        fullName: string;
        email: string;
        username: string | null;
        role: string;
        plan: string;
        status: string;
        signupDate: Date;
        lastActivity: Date;
        ipAddress: string;
        userAgent: string;
    };

    @Prop({ required: true, type: Object })
    request!: {
        method: string;
        route: string;
        resourceId: string | null;
    };

    @Prop({ required: true, enum: ['SUCCESS', 'FAILURE'] })
    outcome!: string;

    @Prop({ type: Object, default: {} })
    metadata!: any;

    // HOW: Track if this event has been processed for email digests
    // WHY: Ensures idempotency and avoids duplicate notifications
    @Prop()
    emailedAt?: Date;

    @Prop()
    errorMessage?: string;

    // HOW: Support Admin Panel Notification Logic
    // WHY: MEDIUM is dismissible, HIGH/CRITICAL are persistent per requirements
    @Prop({ default: false })
    isRead!: boolean;

    @Prop({ default: false })
    isDismissed!: boolean;

    createdAt?: Date;
    updatedAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// HOW: Indexing for fast digest lookups
// WHY: Improves performance of the 15-min and daily scheduled cron jobs
AuditLogSchema.index({ severity: 1, emailedAt: 1, createdAt: 1 });
