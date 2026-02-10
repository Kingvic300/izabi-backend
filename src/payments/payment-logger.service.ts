import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PaymentLog,
  PaymentLogDocument,
} from './entities/payment-log.entity';

@Injectable()
export class PaymentLoggerService {
  private readonly logger = new Logger(PaymentLoggerService.name);

  constructor(
    @InjectModel(PaymentLog.name)
    private paymentLogModel: Model<PaymentLogDocument>,
  ) {}

  /**
   * Log payment initialization
   */
  async logInitialization(
    userId: string,
    reference: string,
    amount: number,
    plan: string,
    metadata?: any,
  ) {
    try {
      await this.paymentLogModel.create({
        userId,
        reference,
        amount,
        plan,
        event: 'initialized',
        metadata: {
          ...metadata,
          timestamp: new Date(),
        },
      });

      this.logger.log(
        `Payment initialized - User: ${userId}, Reference: ${reference}, Amount: ${amount}`,
      );
    } catch (error) {
      this.logger.error('Failed to log payment initialization', error);
    }
  }

  /**
   * Log payment verification attempt
   */
  async logVerification(
    reference: string,
    success: boolean,
    paystackData?: any,
    error?: string,
  ) {
    try {
      await this.paymentLogModel.create({
        reference,
        event: success ? 'verified_success' : 'verified_failed',
        metadata: {
          paystackData,
          error,
          timestamp: new Date(),
        },
      });

      this.logger.log(
        `Payment verification - Reference: ${reference}, Success: ${success}`,
      );
    } catch (error) {
      this.logger.error('Failed to log payment verification', error);
    }
  }

  /**
   * Log webhook event
   */
  async logWebhook(event: string, data: any) {
    try {
      await this.paymentLogModel.create({
        reference: data.reference,
        event: `webhook_${event}`,
        metadata: {
          webhookData: data,
          timestamp: new Date(),
        },
      });

      this.logger.log(`Webhook received - Event: ${event}, Reference: ${data.reference}`);
    } catch (error) {
      this.logger.error('Failed to log webhook event', error);
    }
  }

  /**
   * Log refund
   */
  async logRefund(
    reference: string,
    userId: string,
    amount: number,
    reason?: string,
  ) {
    try {
      await this.paymentLogModel.create({
        userId,
        reference,
        amount,
        event: 'refunded',
        metadata: {
          reason,
          timestamp: new Date(),
        },
      });

      this.logger.log(
        `Refund processed - Reference: ${reference}, Amount: ${amount}`,
      );
    } catch (error) {
      this.logger.error('Failed to log refund', error);
    }
  }

  /**
   * Get logs for a specific payment
   */
  async getPaymentLogs(reference: string) {
    return this.paymentLogModel
      .find({ reference })
      .sort({ createdAt: 1 })
      .lean();
  }

  /**
   * Get logs for a user
   */
  async getUserLogs(userId: string, limit = 50) {
    return this.paymentLogModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
