import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';

@Injectable()
export class MailService {
  private apiInstance: any;

  constructor(private configService: ConfigService) {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = this.configService.get<string>('MAIL_PASS');
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  }

  async sendOtp(email: string, otp: string) {
    console.log(`[MailService] Attempting to send OTP via API to ${email}...`);
    
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = 'Verification Code - Izabi';
    sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #333;">Welcome to Izabi</h2>
          <p style="font-size: 16px; color: #555;">Your verification code is:</p>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #777;">This code will expire in 10 minutes.</p>
          <p style="font-size: 14px; color: #777;">If you didn't request this, please ignore this email.</p>
        </div>
    `;
    sendSmtpEmail.sender = { name: 'Izabi Support', email: this.configService.get<string>('MAIL_FROM') };
    sendSmtpEmail.to = [{ email }];

    try {
      const data = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[MailService] OTP API call successful:`, data.messageId);
    } catch (error) {
      console.error(`[MailService] API Error:`, error.response?.text || error.message);
      throw new Error('Failed to send verification email via API.');
    }
  }
}
