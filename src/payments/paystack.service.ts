import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
    private readonly baseUrl = 'https://api.paystack.co';
    private readonly secretKey: string;

    constructor(private configService: ConfigService) {
        this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
        if (!this.secretKey) {
            console.warn('[PaystackService] Warning: PAYSTACK_SECRET_KEY is not defined in environment variables');
        }
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    async initializeTransaction(email: string, amount: number, metadata: any) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/transaction/initialize`,
                {
                    email,
                    amount: amount * 100, // Paystack expects amount in kobo/cents
                    metadata,
                    callback_url: this.configService.get<string>('PAYSTACK_CALLBACK_URL') || 'https://izabi.onrender.com/payment/verify',
                },
                { headers: this.headers }
            );

            return response.data;
        } catch (error) {
            console.error('[PaystackService] Initialize Error:', error.response?.data || error.message);
            throw new InternalServerErrorException('Failed to initialize Paystack transaction');
        }
    }

    async verifyTransaction(reference: string) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transaction/verify/${reference}`,
                { headers: this.headers }
            );

            return response.data;
        } catch (error) {
            console.error('[PaystackService] Verify Error:', error.response?.data || error.message);
            throw new InternalServerErrorException('Failed to verify Paystack transaction');
        }
    }
}
