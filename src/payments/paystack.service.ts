import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class PaystackService {
    private readonly baseUrl = 'https://api.paystack.co';
    private readonly secretKey: string;

    constructor(private readonly configService: ConfigService) {
        this.secretKey =
            this.configService.get<string>('PAYSTACK_SECRET_KEY') ?? '';

        if (!this.secretKey) {
            console.warn('[PaystackService] PAYSTACK_SECRET_KEY is not set');
        }
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    async initializeTransaction(
        email: string,
        amount: number,
        metadata: any,
        plan?: string,
    ) {
        try {
            const payload: Record<string, any> = {
                email,
                amount: amount * 100,
                metadata,
                callback_url:
                    this.configService.get<string>('PAYSTACK_CALLBACK_URL') ??
                    'https://izabi.onrender.com/payment/verify',
            };

            if (plan) {
                payload.plan = plan;
            }

            const response = await axios.post(
                `${this.baseUrl}/transaction/initialize`,
                payload,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Initialize Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to initialize Paystack transaction',
            );
        }
    }

    async verifyTransaction(reference: string) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transaction/verify/${reference}`,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Verify Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to verify Paystack transaction',
            );
        }
    }

    async getBanks() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/bank?country=nigeria`,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Get Banks Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to fetch banks list',
            );
        }
    }

    async verifyAccountNumber(
        accountNumber: string,
        bankCode: string,
    ): Promise<{
        account_name: string;
        account_number: string;
    }> {
        try {
            const response = await axios.get(`${this.baseUrl}/bank/resolve`, {
                headers: this.headers,
                params: {
                    account_number: accountNumber,
                    bank_code: bankCode,
                },
            });

            return response.data.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Verify Account Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to verify account number',
            );
        }
    }

    async refundTransaction(
        transactionReference: string,
        amount?: number,
        merchantNote?: string,
    ) {
        try {
            const payload: Record<string, any> = {
                transaction: transactionReference,
            };

            if (amount) {
                payload.amount = amount * 100;
            }

            if (merchantNote) {
                payload.merchant_note = merchantNote;
            }

            const response = await axios.post(
                `${this.baseUrl}/refund`,
                payload,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Refund Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException('Failed to process refund');
        }
    }

    async getCustomer(customerCode: string) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/customer/${customerCode}`,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Get Customer Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException('Failed to fetch customer');
        }
    }

    async listTransactions(page = 1, perPage = 50) {
        try {
            const response = await axios.get(`${this.baseUrl}/transaction`, {
                headers: this.headers,
                params: { page, perPage },
            });

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] List Transactions Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to fetch transactions',
            );
        }
    }

    async createPlan(
        name: string,
        amount: number,
        interval: 'daily' | 'weekly' | 'monthly' | 'annually',
        description?: string,
    ) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/plan`,
                {
                    name,
                    amount: amount * 100,
                    interval,
                    description,
                },
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Create Plan Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException('Failed to create plan');
        }
    }

    async subscribeCustomer(
        customerEmail: string,
        planCode: string,
        authorization?: string,
    ) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/subscription`,
                {
                    customer: customerEmail,
                    plan: planCode,
                    authorization,
                },
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Subscribe Customer Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to subscribe customer',
            );
        }
    }

    async cancelSubscription(subscriptionCode: string, emailToken: string) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/subscription/disable`,
                {
                    code: subscriptionCode,
                    token: emailToken,
                },
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Cancel Subscription Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to cancel subscription',
            );
        }
    }

    async fetchSubscription(subscriptionCode: string) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/subscription/${subscriptionCode}`,
                { headers: this.headers },
            );

            return response.data;
        } catch (error: any) {
            console.error(
                '[PaystackService] Fetch Subscription Error:',
                error.response?.data || error.message,
            );

            throw new InternalServerErrorException(
                'Failed to fetch subscription',
            );
        }
    }

    verifyWebhookSignature(payload: string, signature: string): boolean {
        try {
            const hash = crypto
                .createHmac('sha512', this.secretKey)
                .update(payload)
                .digest('hex');

            return hash === signature;
        } catch (error) {
            console.error(
                '[PaystackService] Webhook Verification Error:',
                error,
            );
            return false;
        }
    }
}
