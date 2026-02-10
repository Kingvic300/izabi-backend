import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
import { getOtpEmailTemplate, getLiveAnnouncementTemplate } from './mail.templates';

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

  // HOW: Send arbitrary HTML content to a specific recipient
  // WHY: Needed for audit alerts and digests targeting the system administrator
  async sendCustomEmail(toEmail: string, subject: string, htmlContent: string) {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: 'Izabi System Monitor', email: this.configService.get<string>('MAIL_FROM') };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (error) {
      console.error(`[MailService] Custom Email API Error:`, error.response?.text || error.message);
      // No throw here to allow non-blocking audit flow if used in Tap/Tap
    }
  }

  // HOW: Notify user that a streak freeze was used
  async sendStreakFreezeNotification(email: string, name: string, freezesLeft: number) {
    const { getStreakFreezeTemplate } = require('./mail.templates');
    
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = '❄️ Streak Frozen! (Action Required)';
    sendSmtpEmail.htmlContent = getStreakFreezeTemplate(name, freezesLeft);
    sendSmtpEmail.sender = { name: 'Izabi Gamification', email: this.configService.get<string>('MAIL_FROM') };
    sendSmtpEmail.to = [{ email }];

    try {
      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[MailService] Freeze notification sent to ${email}`);
    } catch (error) {
      console.error(`[MailService] Freeze notification failed:`, error.message);
    }
  }

  async sendLiveAnnouncement(email: string, name: string) {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = '🚀 Izabi is officially LIVE!';
    sendSmtpEmail.htmlContent = getLiveAnnouncementTemplate(name);
    sendSmtpEmail.sender = { name: 'Izabi AI', email: this.configService.get<string>('MAIL_FROM') };
    sendSmtpEmail.to = [{ email }];

    try {
      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[MailService] Live announcement sent to ${email}`);
    } catch (error) {
      console.error(`[MailService] Live announcement failed for ${email}:`, error.message);
    }
  }
}
