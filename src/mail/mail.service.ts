import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
import { getOtpEmailTemplate } from './mail.templates';

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
    sendSmtpEmail.htmlContent = getOtpEmailTemplate(otp);
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
