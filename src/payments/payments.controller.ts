import { Controller, Post, Body, Get, Param, UseGuards, Req, Headers, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Controller('api/payments')
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly configService: ConfigService
    ) {}

    @UseGuards(JwtAuthGuard)
    @Post('initialize')
    async initialize(@Req() req: any, @Body() body: { plan: 'streak_freeze_package' | 'premium_subscription' }) {
        return this.paymentsService.startPayment(req.user.userId, body.plan);
    }

    @UseGuards(JwtAuthGuard)
    @Get('verify/:reference')
    async verify(@Param('reference') reference: string) {
        return this.paymentsService.verifyPayment(reference);
    }

    // Paystack Webhook
    @Post('webhook')
    async webhook(@Body() body: any, @Headers('x-paystack-signature') signature: string) {
        const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
        if (!signature || !secret) {
            throw new BadRequestException('Invalid signature or secret');
        }

        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');

        if (hash !== signature) {
            throw new BadRequestException('Invalid signature');
        }

        if (body.event === 'charge.success') {
            await this.paymentsService.verifyPayment(body.data.reference);
        }

        return { status: 'success' };
    }
}
