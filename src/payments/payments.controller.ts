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
    Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';

@Controller('api/payments')
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly paystackService: PaystackService,
        private readonly configService: ConfigService,
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
        return this.paymentsService.startPayment(req.user.userId, body.plan);
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
     * Get payment history with pagination
     */
    @UseGuards(JwtAuthGuard)
    @Get('history')
    async getHistory(
        @Req() req: any,
        @Query('page') page = 1,
        @Query('limit') limit = 10,
    ) {
        return this.paymentsService.getPaymentHistory(
            req.user.userId,
            Number(page),
            Number(limit),
        );
    }

    /**
     * Get payment statistics
     */
    @UseGuards(JwtAuthGuard)
    @Get('stats')
    async getStats(@Req() req: any) {
        return this.paymentsService.getPaymentStats(req.user.userId);
    }

    /**
     * Get single payment details
     */
    @UseGuards(JwtAuthGuard)
    @Get(':reference')
    async getPayment(@Req() req: any, @Param('reference') reference: string) {
        return this.paymentsService.getPayment(reference, req.user.userId);
    }

    /**
     * Retry failed payment
     */
    @UseGuards(JwtAuthGuard)
    @Post('retry/:reference')
    async retryPayment(@Req() req: any, @Param('reference') reference: string) {
        return this.paymentsService.retryPayment(reference, req.user.userId);
    }

    /**
     * Cancel pending payment
     */
    @UseGuards(JwtAuthGuard)
    @Post('cancel/:reference')
    async cancelPayment(
        @Req() req: any,
        @Param('reference') reference: string,
    ) {
        return this.paymentsService.cancelPayment(reference, req.user.userId);
    }

    /**
     * Process refund (Admin only - add admin guard in production)
     */
    @UseGuards(JwtAuthGuard)
    @Post('refund/:reference')
    async refund(
        @Req() req: any,
        @Param('reference') reference: string,
        @Body('reason') reason?: string,
    ) {
        return this.paymentsService.processRefund(
            reference,
            req.user.userId,
            reason,
        );
    }

    /**
     * Cancel auto-renewal of a subscription
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
     * Paystack Webhook - receives payment notifications
     */
    @Post('webhook')
    async webhook(
        @Body() body: any,
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

        // Process webhook events
        if (body.event === 'charge.success') {
            await this.paymentsService.verifyPayment(body.data.reference);
        }

        return { status: 'success' };
    }
}
