import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    UseGuards,
    Req,
    Headers,
    BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';

@Controller('api/payments')
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly paystackService: PaystackService,
    ) {}

    /**
     * Initialize a new payment
     */
    @UseGuards(JwtAuthGuard)
    @Post('initialize')
    async initialize(
        @Req() req: any,
        @Body() body: { plan: 'pro_monthly' | 'premium_monthly' },
    ) {
        return this.paymentsService.startPayment(
            req.user.userId,
            body.plan,
        );
    }

    /**
     * Verify payment by reference
     */
    @UseGuards(JwtAuthGuard)
    @Get('verify/:reference')
    async verify(@Param('reference') reference: string) {
        return this.paymentsService.verifyPayment(reference);
    }

    /**
     * Retry failed payment
     */
    @UseGuards(JwtAuthGuard)
    @Post('retry/:reference')
    async retryPayment(
        @Req() req: any,
        @Param('reference') reference: string,
    ) {
        return this.paymentsService.retryPayment(
            reference,
            req.user.userId,
        );
    }

    /**
     * Cancel auto-renewal
     */
    @UseGuards(JwtAuthGuard)
    @Post('cancel-auto-renew')
    async cancelAutoRenew(@Req() req: any) {
        return this.paymentsService.cancelAutoRenew(req.user.userId);
    }

    /**
     * Get list of banks
     */
    @UseGuards(JwtAuthGuard)
    @Get('banks/list')
    async getBanks() {
        return this.paystackService.getBanks();
    }

    /**
     * Verify bank account
     */
    @UseGuards(JwtAuthGuard)
    @Post('banks/verify')
    async verifyAccount(
        @Body('accountNumber') accountNumber: string,
        @Body('bankCode') bankCode: string,
    ) {
        return this.paystackService.verifyAccountNumber(
            accountNumber,
            bankCode,
        );
    }

    /**
     * Paystack Webhook
     */
    @Post('webhook')
    async webhook(
        @Body() body: {
            event: string;
            data?: { reference?: string };
        },
        @Headers('x-paystack-signature') signature: string,
    ) {
        if (!signature) {
            throw new BadRequestException('Missing signature header');
        }

        const payload = JSON.stringify(body);

        const isValid = this.paystackService.verifyWebhookSignature(
            payload,
            signature,
        );

        if (!isValid) {
            throw new BadRequestException('Invalid webhook signature');
        }

        if (
            body.event === 'charge.success' &&
            body.data?.reference
        ) {
            await this.paymentsService.verifyPayment(
                body.data.reference,
            );
        }

        return { status: 'success' };
    }
}
