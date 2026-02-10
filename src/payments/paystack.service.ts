import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      console.warn(
        '[PaystackService] Warning: PAYSTACK_SECRET_KEY is not defined in environment variables',
      );
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
          callback_url:
            this.configService.get<string>('PAYSTACK_CALLBACK_URL') ||
            'https://izabi.onrender.com/payment/verify',
        },
        { headers: this.headers },
      );

      return response.data;
    } catch (error) {
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
    } catch (error) {
      console.error(
        '[PaystackService] Verify Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to verify Paystack transaction',
      );
    }
  }

  /**
   * Get list of Nigerian banks
   */
  async getBanks() {
    try {
      const response = await axios.get(`${this.baseUrl}/bank?country=nigeria`, {
        headers: this.headers,
      });

      return response.data;
    } catch (error) {
      console.error(
        '[PaystackService] Get Banks Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to fetch banks list');
    }
  }

  /**
   * Verify account number
   */
  async verifyAccountNumber(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ account_name: string; account_number: string }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: this.headers },
      );

      return response.data.data;
    } catch (error) {
      console.error(
        '[PaystackService] Verify Account Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to verify account number',
      );
    }
  }

  /**
   * Process a refund
   */
  async refundTransaction(
    transactionReference: string,
    amount?: number,
    merchantNote?: string,
  ) {
    try {
      const payload: any = {
        transaction: transactionReference,
      };

      if (amount) {
        payload.amount = amount * 100; // Convert to kobo
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
    } catch (error) {
      console.error(
        '[PaystackService] Refund Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to process refund');
    }
  }

  /**
   * Get customer by customer code
   */
  async getCustomer(customerCode: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/customer/${customerCode}`,
        { headers: this.headers },
      );

      return response.data;
    } catch (error) {
      console.error(
        '[PaystackService] Get Customer Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to fetch customer');
    }
  }

  /**
   * List all transactions with pagination
   */
  async listTransactions(page = 1, perPage = 50) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction?page=${page}&perPage=${perPage}`,
        { headers: this.headers },
      );

      return response.data;
    } catch (error) {
      console.error(
        '[PaystackService] List Transactions Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to fetch transactions',
      );
    }
  }

  /**
   * Create subscription plan on Paystack
   */
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
          amount: amount * 100, // Convert to kobo
          interval,
          description,
        },
        { headers: this.headers },
      );

      return response.data;
    } catch (error) {
      console.error(
        '[PaystackService] Create Plan Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to create plan');
    }
  }

  /**
   * Subscribe customer to a plan
   */
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
    } catch (error) {
      console.error(
        '[PaystackService] Subscribe Customer Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to subscribe customer',
      );
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionCode: string,
    emailToken: string,
  ) {
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
    } catch (error) {
      console.error(
        '[PaystackService] Cancel Subscription Error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Failed to cancel subscription',
      );
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
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
