import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/entities/user.entity';
import { AccountabilityService, FRONTEND_URL } from './accountability.service';
import { MailService } from '../mail/mail.service';
import { getDisplayName } from '../users/helpers/streak.helpers';

const EXPIRY_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AccountabilityScheduler {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private readonly accountabilityService: AccountabilityService,
        private readonly mailService: MailService,
    ) {}

    // Daily at 18:00 UTC — remind users who haven't checked in, and invitees
    // whose pending invite is about to expire.
    @Cron('0 18 * * *')
    async sendDailyReminders() {
        await this.sendMissedCheckInReminders();
        await this.sendExpiringInviteReminders();
    }

    private async sendMissedCheckInReminders() {
        const partnerships =
            await this.accountabilityService.findActivePartnershipsWithGoals();

        for (const partnership of partnerships) {
            const goal = await this.accountabilityService.findActiveGoalForPartnership(
                String(partnership._id),
            );
            if (!goal) continue;

            const memberIds = [partnership.userA, partnership.userB].filter(
                Boolean,
            ) as string[];
            if (memberIds.length < 2) continue;

            const users = await this.userModel
                .find({ _id: { $in: memberIds } })
                .exec();

            for (const user of users) {
                const checkedIn = await this.accountabilityService.hasCheckedInToday(
                    String(goal._id),
                    String(user._id),
                );
                if (checkedIn || !user.email) continue;

                const partner = users.find(
                    (u) => String(u._id) !== String(user._id),
                );
                const streak =
                    user.activityStreaks?.[`accountability_${partnership._id}`]
                        ?.current || 0;

                await this.mailService.sendPartnerReminder(
                    user.email,
                    getDisplayName(user),
                    partner ? getDisplayName(partner) : 'your partner',
                    streak,
                );
            }
        }
    }

    private async sendExpiringInviteReminders() {
        const expiring =
            await this.accountabilityService.findExpiringPendingPartnerships(
                EXPIRY_WARNING_WINDOW_MS,
            );

        for (const partnership of expiring) {
            if (!partnership.inviteeEmail) continue;
            const inviter = await this.userModel
                .findById(partnership.userA)
                .exec();
            const acceptUrl = `${FRONTEND_URL}/dashboard/partner?code=${partnership.inviteCode}`;
            await this.mailService.sendPartnerInvite(
                partnership.inviteeEmail,
                inviter ? getDisplayName(inviter) : 'A fellow scholar',
                acceptUrl,
            );
        }
    }
}
