import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
        streak_freeze_package: {
            name: '5 Streak Freezes',
            amount: 1000, // 1000 NGN
            freezes: 5,
        },
        premium_subscription: {
            name: 'Premium Monthly',
            amount: 5000,
            freezes: 10,
        }
    };

    async startPayment(userId: string, plan: 'streak_freeze_package' | 'premium_subscription') {
        const user = await this.usersService.findOne(userId);
        if (!user) throw new NotFoundException('User not found');

        const selectedPlan = this.PLANS[plan];
        if (!selectedPlan) throw new BadRequestException('Invalid plan selected');

        // 1. Initialize with Paystack
        const paystackRes = await this.paystackService.initializeTransaction(
            user.email,
            selectedPlan.amount,
            { userId, plan }
        );

        // 2. Log pending payment in DB
        await this.paymentModel.create({
            userId,
            email: user.email,
            reference: paystackRes.data.reference,
            amount: selectedPlan.amount,
            plan,
            status: 'pending',
            metadata: { name: selectedPlan.name }
        });

        return {
            authorization_url: paystackRes.data.authorization_url,
            reference: paystackRes.data.reference
        };
    }

    async verifyPayment(reference: string) {
        // 1. Check if payment already processed
        const payment = await this.paymentModel.findOne({ reference });
        if (!payment) throw new NotFoundException('Payment record not found');
        if (payment.status === 'success') return { success: true, message: 'Payment already verified' };

        // 2. Verify with Paystack
        const verification = await this.paystackService.verifyTransaction(reference);

        if (verification.data.status === 'success') {
            // 3. Update payment record
            payment.status = 'success';
            payment.paidAt = new Date(verification.data.paid_at);
            await payment.save();

            // 4. Grant benefits
            const customerCode = verification.data.customer?.customer_code;
            await this.grantBenefits(payment.userId, payment.plan as any, customerCode);

            return { success: true, reference };
        } else {
            payment.status = 'failed';
            await payment.save();
            return { success: false, message: 'Payment verification failed' };
        }
    }

    private async grantBenefits(userId: string, plan: 'streak_freeze_package' | 'premium_subscription', customerCode?: string) {
        const selectedPlan = this.PLANS[plan];
        if (!selectedPlan) return;

        if (selectedPlan.freezes) {
            await this.usersService.addStreakFreezes(userId, selectedPlan.freezes);
        }

        if (plan === 'premium_subscription') {
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1); // 1 month subscription
            await this.usersService.updateSubscription(userId, {
                status: 'premium',
                expiry: expiry,
                customerCode: customerCode
            });
        }
    }
}
