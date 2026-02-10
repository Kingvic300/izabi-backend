import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from './entities/payment.entity';
import { PaystackService } from './paystack.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    private paystackService: PaystackService,
    private usersService: UsersService,
  ) {}

  private readonly PLANS: Record<string, any> = {
    pro_monthly: {
      name: 'Pro Scholar Monthly',
      amount: 199900, // 1,999 NGN in kobo
      tier: 'pro',
      duration: 30, // days
      paystackPlan: 'PLN_pro_scholar_monthly', // You'll need to create this in Paystack Dashboard
    },
    premium_monthly: {
      name: 'Premium Scholar Monthly',
      amount: 299900, // 2,999 NGN in kobo
      tier: 'premium',
      duration: 30, // days
      paystackPlan: 'PLN_premium_scholar_monthly', // You'll need to create this in Paystack Dashboard
    },
  };

  async startPayment(
    userId: string,
    plan: 'pro_monthly' | 'premium_monthly',
  ) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    const selectedPlan = this.PLANS[plan];
    if (!selectedPlan) throw new BadRequestException('Invalid plan selected');

    // 1. Initialize with Paystack
    const paystackRes = await this.paystackService.initializeTransaction(
      user.email,
      selectedPlan.amount,
      { userId, plan },
      selectedPlan.paystackPlan,
    );

    // 2. Log pending payment in DB
    await this.paymentModel.create({
      userId,
      email: user.email,
      reference: paystackRes.data.reference,
      amount: selectedPlan.amount,
      plan,
      status: 'pending',
      metadata: { name: selectedPlan.name, tier: selectedPlan.tier },
    });

    return {
      authorization_url: paystackRes.data.authorization_url,
      reference: paystackRes.data.reference,
    };
  }

  async verifyPayment(reference: string) {
    // 1. Check if payment already processed
    const payment = await this.paymentModel.findOne({ reference });
    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.status === 'success')
      return { success: true, message: 'Payment already verified' };

    // 2. Verify with Paystack
    const verification =
      await this.paystackService.verifyTransaction(reference);

    if (verification.data.status === 'success') {
      // 3. Update payment record
      payment.status = 'success';
      payment.paidAt = new Date(verification.data.paid_at);
      await payment.save();

      // 4. Grant benefits
      const customerCode = verification.data.customer?.customer_code;
      await this.grantBenefits(
        payment.userId,
        payment.plan as any,
        customerCode,
      );

      return { success: true, reference };
    } else {
      payment.status = 'failed';
      await payment.save();
      return { success: false, message: 'Payment verification failed' };
    }
  }

  private async grantBenefits(
    userId: string,
    plan: 'pro_monthly' | 'premium_monthly',
    customerCode?: string,
  ) {
    const selectedPlan = this.PLANS[plan];
    if (!selectedPlan) return;

    // Calculate expiry date
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + selectedPlan.duration);

    // Update user subscription
    await this.usersService.updateSubscription(userId, {
      status: selectedPlan.tier as any,
      expiry: expiry,
      customerCode: customerCode,
    });
  }

  /**
   * Cancel auto-renewal for a user's subscription
   */
  async cancelAutoRenew(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.paystackSubscriptionCode) {
      throw new BadRequestException('No active recurring subscription found');
    }

    try {
      // 1. Fetch subscription to get the email token if we don't have it
      const sub = await this.paystackService.fetchSubscription(user.paystackSubscriptionCode);
      const emailToken = sub.data.email_token;

      // 2. Disable subscription
      await this.paystackService.cancelSubscription(user.paystackSubscriptionCode, emailToken);

      // 3. Clear from user profile
      await this.usersService.updateSubscription(userId, {
        status: user.subscriptionStatus as any, // Keep status until it expires
        expiry: user.subscriptionExpiry,
        customerCode: user.paystackCustomerCode,
      });
      
      // Update the subscription code to null so it doesn't try to cancel again
      await (user as any).updateOne({ paystackSubscriptionCode: null, paystackEmailToken: null });

      return {
        success: true,
        message: 'Auto-renewal successfully cancelled. Your benefits will remain active until ' + 
                 user.subscriptionExpiry.toLocaleDateString(),
      };
    } catch (error) {
      console.error('[PaymentsService] Cancel Auto-renew Error:', error);
      throw new BadRequestException('Failed to cancel auto-renewal with Paystack');
    }
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    payments: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.paymentModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.paymentModel.countDocuments({ userId }),
    ]);

    return {
      payments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get payment statistics for a user
   */
  async getPaymentStats(userId: string) {
    const stats = await this.paymentModel.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const totalSpent = await this.paymentModel.aggregate([
      { $match: { userId, status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return {
      stats,
      totalSpent: totalSpent[0]?.total || 0,
      totalTransactions: stats.reduce((sum, s) => sum + s.count, 0),
    };
  }

  /**
   * Retry failed payment
   */
  async retryPayment(reference: string, userId: string) {
    const payment = await this.paymentModel.findOne({ reference, userId });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'failed') {
      throw new BadRequestException('Only failed payments can be retried');
    }

    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    const selectedPlan = this.PLANS[payment.plan as any];
    if (!selectedPlan) throw new BadRequestException('Invalid plan');

    // Initialize new transaction
    const paystackRes = await this.paystackService.initializeTransaction(
      user.email,
      selectedPlan.amount,
      { userId, plan: payment.plan },
    );

    // Update old payment to cancelled
    payment.status = 'failed';
    payment.metadata = {
      ...payment.metadata,
      retried: true,
      retriedAt: new Date(),
      newReference: paystackRes.data.reference,
    };
    await payment.save();

    // Create new payment record
    await this.paymentModel.create({
      userId,
      email: user.email,
      reference: paystackRes.data.reference,
      amount: selectedPlan.amount,
      plan: payment.plan,
      status: 'pending',
      metadata: {
        name: selectedPlan.name,
        tier: selectedPlan.tier,
        retryOf: reference,
      },
    });

    return {
      authorization_url: paystackRes.data.authorization_url,
      reference: paystackRes.data.reference,
    };
  }

  /**
   * Process refund for a payment
   */
  async processRefund(
    reference: string,
    userId: string,
    reason?: string,
  ) {
    const payment = await this.paymentModel.findOne({ reference, userId });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'success') {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    // Call Paystack refund API
    const refundResult = await this.paystackService.refundTransaction(
      reference,
      undefined, // Full refund
      reason,
    );

    // Update payment status
    payment.status = 'reversed';
    payment.metadata = {
      ...payment.metadata,
      refunded: true,
      refundedAt: new Date(),
      refundReason: reason,
      refundData: refundResult.data,
    };
    await payment.save();

    // Revoke user benefits
    await this.usersService.updateSubscription(userId, {
      status: 'free',
      expiry: new Date(),
    });

    return {
      success: true,
      message: 'Refund processed successfully',
      refundData: refundResult.data,
    };
  }

  /**
   * Get single payment by reference
   */
  async getPayment(reference: string, userId: string) {
    const payment = await this.paymentModel.findOne({ reference, userId });
    if (!payment) throw new NotFoundException('Payment not found');

    return payment;
  }

  /**
   * Cancel pending payment
   */
  async cancelPayment(reference: string, userId: string) {
    const payment = await this.paymentModel.findOne({ reference, userId });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending') {
      throw new BadRequestException('Only pending payments can be cancelled');
    }

    payment.status = 'failed';
    payment.metadata = {
      ...payment.metadata,
      cancelled: true,
      cancelledAt: new Date(),
    };
    await payment.save();

    return {
      success: true,
      message: 'Payment cancelled successfully',
    };
  }
}
