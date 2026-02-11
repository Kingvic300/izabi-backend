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

type PlanKey = 'pro_monthly' | 'premium_monthly';

@Injectable()
export class PaymentsService {
    constructor(
        @InjectModel(Payment.name)
        private readonly paymentModel: Model<PaymentDocument>,
        private readonly paystackService: PaystackService,
        private readonly usersService: UsersService,
    ) {}

    private readonly PLANS: Record<
        PlanKey,
        {
            name: string;
            tier: 'pro' | 'premium';
            duration: number;
            paystackPlan: string;
        }
    > = {
        pro_monthly: {
            name: 'Pro Scholar Monthly',
            tier: 'pro',
            duration: 30,
            paystackPlan: 'PLN_0p2p5u4xvs5kibg',
        },
        premium_monthly: {
            name: 'Premium Scholar Monthly',
            tier: 'premium',
            duration: 30,
            paystackPlan: 'PLN_55arq8ivwdb48u3',
        },
    };

    async startPayment(userId: string, plan: PlanKey) {
        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const selectedPlan = this.PLANS[plan];

        const paystackRes = await this.paystackService.initializeTransaction(
            user.email,
            0,
            { userId, plan },
            selectedPlan.paystackPlan,
        );

        await this.paymentModel.create({
            userId,
            email: user.email,
            reference: paystackRes.data.reference,
            amount: 0,
            plan,
            status: 'pending',
            metadata: {
                name: selectedPlan.name,
                tier: selectedPlan.tier,
            },
        });

        return {
            authorization_url: paystackRes.data.authorization_url,
            reference: paystackRes.data.reference,
        };
    }

    async verifyPayment(reference: string) {
        const payment = await this.paymentModel.findOne({ reference });
        if (!payment) {
            throw new NotFoundException('Payment record not found');
        }

        if (payment.status === 'success') {
            return { success: true, message: 'Payment already verified' };
        }

        const verification =
            await this.paystackService.verifyTransaction(reference);

        if (verification.data.status !== 'success') {
            payment.status = 'failed';
            await payment.save();
            return { success: false };
        }

        payment.status = 'success';
        payment.paidAt = new Date(verification.data.paid_at);
        await payment.save();

        if (!(payment.plan in this.PLANS)) {
            throw new BadRequestException('Invalid plan');
        }

        const customerCode = verification.data.customer?.customer_code;

        await this.grantBenefits(
            payment.userId,
            payment.plan as PlanKey,
            customerCode,
        );

        return { success: true, reference };
    }

    private async grantBenefits(
        userId: string,
        plan: PlanKey,
        customerCode?: string,
    ) {
        const selectedPlan = this.PLANS[plan];

        const expiry = new Date();
        expiry.setDate(expiry.getDate() + selectedPlan.duration);

        await this.usersService.updateSubscription(userId, {
            status: selectedPlan.tier,
            expiry,
            customerCode,
        });
    }

    async cancelAutoRenew(userId: string) {
        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!user.paystackSubscriptionCode) {
            throw new BadRequestException(
                'No active recurring subscription found',
            );
        }

        const sub = await this.paystackService.fetchSubscription(
            user.paystackSubscriptionCode,
        );

        await this.paystackService.cancelSubscription(
            user.paystackSubscriptionCode,
            sub.data.email_token,
        );

        await this.usersService.updateSubscription(userId, {
            status: user.subscriptionStatus,
            expiry: user.subscriptionExpiry,
            customerCode: user.paystackCustomerCode,
        });

        await (user as any).updateOne({
            paystackSubscriptionCode: null,
            paystackEmailToken: null,
        });

        return {
            success: true,
            message: 'Auto-renewal cancelled. Benefits remain until expiry.',
        };
    }

    async retryPayment(reference: string, userId: string) {
        const payment = await this.paymentModel.findOne({
            reference,
            userId,
        });

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        if (payment.status !== 'failed') {
            throw new BadRequestException(
                'Only failed payments can be retried',
            );
        }

        if (!(payment.plan in this.PLANS)) {
            throw new BadRequestException('Invalid plan');
        }

        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const selectedPlan = this.PLANS[payment.plan as PlanKey];

        const paystackRes = await this.paystackService.initializeTransaction(
            user.email,
            0,
            { userId, plan: payment.plan },
            selectedPlan.paystackPlan,
        );

        payment.metadata = {
            ...payment.metadata,
            retried: true,
            newReference: paystackRes.data.reference,
        };

        await payment.save();

        await this.paymentModel.create({
            userId,
            email: user.email,
            reference: paystackRes.data.reference,
            amount: 0,
            plan: payment.plan,
            status: 'pending',
            metadata: {
                name: selectedPlan.name,
                tier: selectedPlan.tier,
            },
        });

        return {
            authorization_url: paystackRes.data.authorization_url,
            reference: paystackRes.data.reference,
        };
    }
}
