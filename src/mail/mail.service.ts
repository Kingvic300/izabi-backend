import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
import * as nodemailer from 'nodemailer';
import {
    getOtpEmailTemplate,
    getLiveAnnouncementTemplate,
    getPartnerInviteTemplate,
    getPartnerReminderTemplate,
} from './mail.templates';

@Injectable()
export class MailService {
    private apiInstance?: any;
    private smtpTransport?: nodemailer.Transporter;
    private readonly mailFrom: string;
    private readonly deliveryMode: 'smtp' | 'api' | 'none';

    constructor(private configService: ConfigService) {
        const mailHost = this.configService.get<string>('MAIL_HOST');
        const mailPortRaw = this.configService.get<string>('MAIL_PORT');
        const mailUser = this.configService.get<string>('MAIL_USER');
        const mailPass = this.configService.get<string>('MAIL_PASS');

        this.mailFrom =
            this.configService.get<string>('MAIL_FROM') ||
            mailUser ||
            'no-reply@izabi.ai';

        const brevoApiKey =
            this.configService.get<string>('BREVO_API_KEY') ||
            this.configService.get<string>('SIB_API_KEY') ||
            mailPass;

        if (brevoApiKey) {
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoApiKey;
            this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            this.deliveryMode = 'api';
            console.log('[MailService] Using Brevo API transport');
            if (!this.configService.get<string>('BREVO_API_KEY')) {
                console.log('[MailService] Using MAIL_PASS as API key');
            }
            return;
        }

        if (mailHost && mailPortRaw && mailUser && mailPass) {
            const mailPort = Number(mailPortRaw);
            this.smtpTransport = nodemailer.createTransport({
                host: mailHost,
                port: mailPort,
                secure: mailPort === 465,
                auth: {
                    user: mailUser,
                    pass: mailPass,
                },
            });
            this.deliveryMode = 'smtp';
            console.log(
                `[MailService] Using SMTP transport (${mailHost}:${mailPort})`,
            );
            return;
        }

        this.deliveryMode = 'none';
        console.error(
            '[MailService] No mail transport configured. Set SMTP vars or BREVO_API_KEY.',
        );
    }

    private async sendEmail(
        toEmail: string,
        subject: string,
        htmlContent: string,
        senderName: string,
    ) {
        if (this.deliveryMode === 'smtp' && this.smtpTransport) {
            await this.smtpTransport.sendMail({
                from: `"${senderName}" <${this.mailFrom}>`,
                to: toEmail,
                subject,
                html: htmlContent,
            });
            return;
        }

        if (this.deliveryMode === 'api' && this.apiInstance) {
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;
            sendSmtpEmail.sender = {
                name: senderName,
                email: this.mailFrom,
            };
            sendSmtpEmail.to = [{ email: toEmail }];

            await this.apiInstance.sendTransacEmail(sendSmtpEmail);
            return;
        }

        throw new Error('Mail transport is not configured');
    }

    async sendOtp(email: string, otp: string) {
        console.log(
            `[MailService] Attempting to send OTP to ${email}...`,
        );

        try {
            await this.sendEmail(
                email,
                'Verification Code - Izabi',
                getOtpEmailTemplate(otp),
                'Izabi Support',
            );
            console.log(`[MailService] OTP send successful`);
        } catch (error: any) {
            console.error(
                `[MailService] OTP send error:`,
                error.response?.text || error.message,
            );
            throw new Error('Failed to send verification email.');
        }
    }

    // HOW: Send arbitrary HTML content to a specific recipient
    // WHY: Needed for audit alerts and digests targeting the system administrator
    async sendCustomEmail(
        toEmail: string,
        subject: string,
        htmlContent: string,
    ) {
        try {
            await this.sendEmail(
                toEmail,
                subject,
                htmlContent,
                'Izabi System Monitor',
            );
        } catch (error: any) {
            console.error(
                `[MailService] Custom Email Error:`,
                error.response?.text || error.message,
            );
            // No throw here to allow non-blocking audit flow if used in Tap/Tap
        }
    }

    // HOW: Notify user that a streak freeze was used
    async sendStreakFreezeNotification(
        email: string,
        name: string,
        freezesLeft: number,
    ) {
        const { getStreakFreezeTemplate } = require('./mail.templates');

        try {
            await this.sendEmail(
                email,
                '❄️ Streak Frozen! (Action Required)',
                getStreakFreezeTemplate(name, freezesLeft),
                'Izabi Gamification',
            );
            console.log(`[MailService] Freeze notification sent to ${email}`);
        } catch (error: any) {
            console.error(
                `[MailService] Freeze notification failed:`,
                error.message,
            );
        }
    }

    // HOW: Invite a user to become someone's accountability partner
    async sendPartnerInvite(email: string, inviterName: string, acceptUrl: string) {
        try {
            await this.sendEmail(
                email,
                '🤝 You have an Accountability Partner invite on Izabi',
                getPartnerInviteTemplate(inviterName, acceptUrl),
                'Izabi',
            );
            console.log(`[MailService] Partner invite sent to ${email}`);
        } catch (error: any) {
            console.error(
                `[MailService] Partner invite failed:`,
                error.message,
            );
        }
    }

    // HOW: Remind a user they haven't checked in on their shared goal today
    async sendPartnerReminder(
        email: string,
        name: string,
        partnerName: string,
        streak: number,
    ) {
        try {
            await this.sendEmail(
                email,
                "🔥 Don't break your streak!",
                getPartnerReminderTemplate(name, partnerName, streak),
                'Izabi',
            );
            console.log(`[MailService] Partner reminder sent to ${email}`);
        } catch (error: any) {
            console.error(
                `[MailService] Partner reminder failed:`,
                error.message,
            );
        }
    }

    async sendLiveAnnouncement(email: string, name: string) {
        try {
            await this.sendEmail(
                email,
                'Izabi is live - your learning command center is ready',
                getLiveAnnouncementTemplate(name),
                'Victor Oladimeji',
            );
            console.log(`[MailService] Live announcement sent to ${email}`);
            return true;
        } catch (error: any) {
            console.error(
                `[MailService] Live announcement failed for ${email}:`,
                error.message,
            );
            return false;
        }
    }
}
