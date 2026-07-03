import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Partnership, PartnershipDocument } from './entities/partnership.entity';
import { Goal, GoalDocument } from './entities/goal.entity';
import {
    GoalCheckIn,
    GoalCheckInDocument,
} from './entities/goal-checkin.entity';
import {
    PartnerMessage,
    PartnerMessageDocument,
} from './entities/partner-message.entity';
import {
    StudyHistory,
    StudyHistoryDocument,
} from '../study/entities/study-history.entity';
import { User, UserDocument } from '../users/entities/user.entity';
import {
    getDisplayName,
    getLiveStreakValue,
    toDate,
    updateActivityOnlyStreak,
} from '../users/helpers/streak.helpers';
import { AccountabilityGateway } from './accountability.gateway';
import { MailService } from '../mail/mail.service';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const STREAK_INCREMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_WINDOW_MS = 26 * 60 * 60 * 1000;
export const FRONTEND_URL = (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    'https://izabi.halixe.com'
)
    .trim()
    .replace(/\/+$/, '');

const getActivityKey = (partnershipId: string) =>
    `accountability_${partnershipId}`;
const getDayKey = (date: Date = new Date()) => date.toISOString().slice(0, 10);

@Injectable()
export class AccountabilityService {
    constructor(
        @InjectModel(Partnership.name)
        private partnershipModel: Model<PartnershipDocument>,
        @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
        @InjectModel(GoalCheckIn.name)
        private checkInModel: Model<GoalCheckInDocument>,
        @InjectModel(PartnerMessage.name)
        private messageModel: Model<PartnerMessageDocument>,
        @InjectModel(StudyHistory.name)
        private studyHistoryModel: Model<StudyHistoryDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private readonly gateway: AccountabilityGateway,
        private readonly mailService: MailService,
    ) {}

    // ---- Shared helpers ----

    private isMember(partnership: PartnershipDocument, userId: string): boolean {
        return (
            String(partnership.userA) === String(userId) ||
            String(partnership.userB) === String(userId)
        );
    }

    private assertMembership(
        partnership: PartnershipDocument,
        userId: string,
    ): void {
        if (!this.isMember(partnership, userId)) {
            throw new ForbiddenException(
                'You are not part of this partnership',
            );
        }
    }

    private getOtherUserId(
        partnership: PartnershipDocument,
        userId: string,
    ): string | undefined {
        const other =
            String(partnership.userA) === String(userId)
                ? partnership.userB
                : partnership.userA;
        return other ? String(other) : undefined;
    }

    private async findActiveOrPendingPartnership(
        userId: string,
    ): Promise<PartnershipDocument | null> {
        return this.partnershipModel
            .findOne({
                $or: [{ userA: userId }, { userB: userId }],
                status: { $in: ['pending', 'active'] },
            })
            .exec();
    }

    private async getActivePartnershipOrThrow(
        userId: string,
    ): Promise<PartnershipDocument> {
        const partnership = await this.partnershipModel
            .findOne({
                $or: [{ userA: userId }, { userB: userId }],
                status: 'active',
            })
            .exec();
        if (!partnership) {
            throw new NotFoundException('No active partnership found');
        }
        return partnership;
    }

    private toPublicProfile(user: UserDocument | null) {
        if (!user) return null;
        return {
            userId: String(user._id),
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicturePath: user.profilePicturePath,
            level: user.level,
        };
    }

    private getLiveActivityStreak(user: UserDocument, activityKey: string): number {
        const activity = user.activityStreaks?.[activityKey];
        const lastActivityAt = toDate(
            activity?.lastActivityAt || activity?.lastDate || null,
        );
        return getLiveStreakValue(
            activity?.current || 0,
            lastActivityAt,
            new Date(),
            STREAK_GRACE_WINDOW_MS,
        );
    }

    // Mongoose docs here serialize with only `_id` (no `id` virtual) — the
    // rest of this app's responses only carry `id` for Note/NoteGroup because
    // the frontend normalizes those specifically. Accountability responses
    // are normalized here instead, so the frontend can rely on `.id` directly.
    private serializeGoal(goal: GoalDocument) {
        return {
            id: String(goal._id),
            partnershipId: String(goal.partnershipId),
            createdBy: String(goal.createdBy),
            title: goal.title,
            description: goal.description,
            cadence: goal.cadence,
            deadline: goal.deadline,
            isActive: goal.isActive,
        };
    }

    private serializeMessage(message: PartnerMessageDocument) {
        return {
            id: String(message._id),
            partnershipId: String(message.partnershipId),
            senderId: String(message.senderId),
            recipientId: String(message.recipientId),
            type: message.type,
            content: message.content,
            read: message.read,
            createdAt: message.createdAt,
        };
    }

    private async serializePartnership(
        partnership: PartnershipDocument,
        forUserId: string,
    ) {
        const otherUserId = this.getOtherUserId(partnership, forUserId);
        const partner = otherUserId
            ? await this.userModel.findById(otherUserId).exec()
            : null;

        return {
            id: String(partnership._id),
            status: partnership.status,
            isInitiator: String(partnership.initiatedBy) === String(forUserId),
            createdAt: partnership.createdAt,
            partner: this.toPublicProfile(partner),
            awaitingYourResponse:
                partnership.status === 'pending' &&
                String(partnership.userB) === String(forUserId),
        };
    }

    // ---- Partnerships ----

    async createInvite(userId: string, inviteeEmail: string) {
        const email = (inviteeEmail || '').trim().toLowerCase();
        if (!email) throw new BadRequestException('Email is required');

        const inviter = await this.userModel.findById(userId).exec();
        if (!inviter) throw new NotFoundException('User not found');
        if (email === (inviter.email || '').toLowerCase()) {
            throw new BadRequestException('You cannot invite yourself');
        }

        const existing = await this.findActiveOrPendingPartnership(userId);
        if (existing) {
            throw new ConflictException(
                'You already have an active or pending partnership',
            );
        }

        const inviteeUser = await this.userModel.findOne({ email }).exec();
        if (inviteeUser) {
            const inviteeExisting = await this.findActiveOrPendingPartnership(
                String(inviteeUser._id),
            );
            if (inviteeExisting) {
                throw new ConflictException(
                    'This user already has an active or pending partnership',
                );
            }
        }

        const partnership = new this.partnershipModel({
            userA: userId,
            userB: inviteeUser ? String(inviteeUser._id) : undefined,
            inviteeEmail: email,
            inviteCode: uuidv4(),
            initiatedBy: userId,
            status: 'pending',
            expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
        });
        await partnership.save();

        const acceptUrl = `${FRONTEND_URL}/dashboard/partner?code=${partnership.inviteCode}`;
        await this.mailService.sendPartnerInvite(
            email,
            getDisplayName(inviter),
            acceptUrl,
        );

        return this.serializePartnership(partnership, userId);
    }

    async redeemInvite(userId: string, code: string) {
        const partnership = await this.partnershipModel
            .findOne({ inviteCode: code })
            .exec();
        if (!partnership) throw new NotFoundException('Invite not found');
        if (partnership.status !== 'pending') {
            throw new BadRequestException('This invite is no longer valid');
        }
        if (partnership.expiresAt && partnership.expiresAt < new Date()) {
            partnership.status = 'expired';
            await partnership.save();
            throw new BadRequestException('This invite has expired');
        }
        if (partnership.userB && String(partnership.userB) !== String(userId)) {
            throw new ForbiddenException('This invite belongs to someone else');
        }
        if (String(partnership.userA) === String(userId)) {
            throw new BadRequestException('You cannot accept your own invite');
        }

        const existing = await this.findActiveOrPendingPartnership(userId);
        if (existing && String(existing._id) !== String(partnership._id)) {
            throw new ConflictException(
                'You already have an active or pending partnership',
            );
        }

        partnership.userB = userId;
        partnership.status = 'active';
        await partnership.save();
        this.gateway.broadcast(String(partnership._id), 'partnership');

        return this.serializePartnership(partnership, userId);
    }

    async respondToInvite(
        userId: string,
        partnershipId: string,
        accept: boolean,
    ) {
        if (!isValidObjectId(partnershipId)) {
            throw new BadRequestException('Invalid partnership id');
        }
        const partnership = await this.partnershipModel
            .findById(partnershipId)
            .exec();
        if (!partnership) throw new NotFoundException('Partnership not found');
        if (String(partnership.userB) !== String(userId)) {
            throw new ForbiddenException(
                'Only the invited user can respond to this invite',
            );
        }
        if (partnership.status !== 'pending') {
            throw new BadRequestException('This invite is no longer pending');
        }

        partnership.status = accept ? 'active' : 'declined';
        await partnership.save();
        this.gateway.broadcast(String(partnership._id), 'partnership');

        return this.serializePartnership(partnership, userId);
    }

    async endPartnership(userId: string, partnershipId: string) {
        if (!isValidObjectId(partnershipId)) {
            throw new BadRequestException('Invalid partnership id');
        }
        const partnership = await this.partnershipModel
            .findById(partnershipId)
            .exec();
        if (!partnership) throw new NotFoundException('Partnership not found');
        this.assertMembership(partnership, userId);
        if (!['active', 'pending'].includes(partnership.status)) {
            throw new BadRequestException('This partnership is already over');
        }

        partnership.status = 'ended';
        partnership.endedBy = userId;
        partnership.endedAt = new Date();
        await partnership.save();
        this.gateway.broadcast(String(partnership._id), 'partnership');

        return { success: true };
    }

    async getMyPartnership(userId: string) {
        const partnership = await this.findActiveOrPendingPartnership(userId);
        if (!partnership) return null;
        return this.serializePartnership(partnership, userId);
    }

    // ---- Goals & check-ins ----

    async saveGoal(
        userId: string,
        dto: {
            title: string;
            description?: string;
            cadence?: 'daily' | 'weekly';
            deadline?: string;
        },
    ) {
        const partnership = await this.getActivePartnershipOrThrow(userId);

        await this.goalModel
            .updateMany(
                { partnershipId: String(partnership._id), isActive: true },
                { isActive: false },
            )
            .exec();

        const goal = new this.goalModel({
            partnershipId: String(partnership._id),
            createdBy: userId,
            title: dto.title,
            description: dto.description,
            cadence: dto.cadence || 'daily',
            deadline: dto.deadline ? new Date(dto.deadline) : undefined,
            isActive: true,
        });
        await goal.save();
        this.gateway.broadcast(String(partnership._id), 'goal');

        return this.serializeGoal(goal);
    }

    async getActiveGoal(userId: string) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const goal = await this.goalModel
            .findOne({ partnershipId: String(partnership._id), isActive: true })
            .exec();

        if (!goal) {
            return { goal: null, checkInStatus: null };
        }

        const otherUserId = this.getOtherUserId(partnership, userId);
        const today = getDayKey();
        const [yourCheckIn, partnerCheckIn] = await Promise.all([
            this.checkInModel
                .exists({ goalId: String(goal._id), userId, day: today })
                .exec(),
            otherUserId
                ? this.checkInModel
                      .exists({
                          goalId: String(goal._id),
                          userId: otherUserId,
                          day: today,
                      })
                      .exec()
                : null,
        ]);

        return {
            goal: this.serializeGoal(goal),
            checkInStatus: {
                youCheckedInToday: Boolean(yourCheckIn),
                partnerCheckedInToday: Boolean(partnerCheckIn),
            },
        };
    }

    async checkIn(userId: string, goalId: string, note?: string) {
        if (!isValidObjectId(goalId)) {
            throw new BadRequestException('Invalid goal id');
        }
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const goal = await this.goalModel.findById(goalId).exec();
        if (
            !goal ||
            String(goal.partnershipId) !== String(partnership._id) ||
            !goal.isActive
        ) {
            throw new NotFoundException('Active goal not found');
        }

        try {
            await new this.checkInModel({
                partnershipId: String(partnership._id),
                goalId: String(goal._id),
                userId,
                day: getDayKey(),
                note,
            }).save();
        } catch (error: any) {
            if (error?.code === 11000) {
                throw new ConflictException('Already checked in today');
            }
            throw error;
        }

        const user = await this.userModel.findById(userId).exec();
        if (!user) throw new NotFoundException('User not found');
        const activity = updateActivityOnlyStreak(
            user,
            getActivityKey(String(partnership._id)),
            STREAK_INCREMENT_WINDOW_MS,
            STREAK_GRACE_WINDOW_MS,
        );
        await user.save();

        this.gateway.broadcast(String(partnership._id), 'checkin');

        return { streak: activity.current };
    }

    async getPartnerStreak(userId: string) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const otherUserId = this.getOtherUserId(partnership, userId);
        const activityKey = getActivityKey(String(partnership._id));

        const [you, partner] = await Promise.all([
            this.userModel.findById(userId).exec(),
            otherUserId ? this.userModel.findById(otherUserId).exec() : null,
        ]);
        if (!you) throw new NotFoundException('User not found');

        const yourStreak = this.getLiveActivityStreak(you, activityKey);
        const partnerStreak = partner
            ? this.getLiveActivityStreak(partner, activityKey)
            : 0;

        return {
            yourStreak,
            partnerStreak,
            sharedStreak: Math.min(yourStreak, partnerStreak),
        };
    }

    // ---- Study activity ----

    async getPartnerStudySummary(userId: string) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const otherUserId = this.getOtherUserId(partnership, userId);
        if (!otherUserId) {
            return { todayMinutes: 0, currentStreak: 0, recentSessions: [] };
        }

        const partner = await this.userModel.findById(otherUserId).exec();
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        const [todaySessions, recentSessions] = await Promise.all([
            this.studyHistoryModel
                .find({
                    userId: otherUserId,
                    createdAt: { $gte: startOfToday },
                })
                .select('duration')
                .lean()
                .exec(),
            this.studyHistoryModel
                .find({ userId: otherUserId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('topic type duration createdAt')
                .lean()
                .exec(),
        ]);

        const todayMinutes = todaySessions.reduce(
            (sum: number, s: any) => sum + (s.duration || 0),
            0,
        );

        return {
            todayMinutes,
            currentStreak: partner?.streak || 0,
            recentSessions: recentSessions.map((s: any) => ({
                topic: s.topic,
                type: s.type,
                duration: s.duration,
                createdAt: s.createdAt,
            })),
        };
    }

    // ---- Messaging ----

    async sendMessage(
        userId: string,
        content: string,
        type: 'message' | 'nudge' = 'message',
    ) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const recipientId = this.getOtherUserId(partnership, userId);
        if (!recipientId) {
            throw new BadRequestException('Partner not found');
        }

        const message = new this.messageModel({
            partnershipId: String(partnership._id),
            senderId: userId,
            recipientId,
            type,
            content: content.trim(),
        });
        await message.save();

        this.gateway.broadcast(
            String(partnership._id),
            type === 'nudge' ? 'nudge' : 'message',
        );

        return this.serializeMessage(message);
    }

    async getMessages(userId: string, before?: string, limit: number = 30) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        const filter: Record<string, any> = {
            partnershipId: String(partnership._id),
        };
        if (before) {
            const beforeDate = new Date(before);
            if (!isNaN(beforeDate.getTime())) {
                filter.createdAt = { $lt: beforeDate };
            }
        }

        const messages = await this.messageModel
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(limit, 100))
            .exec();

        return messages.reverse().map((message) => this.serializeMessage(message));
    }

    async markMessagesRead(userId: string) {
        const partnership = await this.getActivePartnershipOrThrow(userId);
        await this.messageModel
            .updateMany(
                {
                    partnershipId: String(partnership._id),
                    recipientId: userId,
                    read: false,
                },
                { read: true, readAt: new Date() },
            )
            .exec();
        return { success: true };
    }

    // ---- Scheduler support ----

    async findActivePartnershipsWithGoals() {
        return this.partnershipModel.find({ status: 'active' }).lean().exec();
    }

    async findActiveGoalForPartnership(partnershipId: string) {
        return this.goalModel
            .findOne({ partnershipId, isActive: true })
            .lean()
            .exec();
    }

    async hasCheckedInToday(goalId: string, userId: string): Promise<boolean> {
        const exists = await this.checkInModel
            .exists({ goalId, userId, day: getDayKey() })
            .exec();
        return Boolean(exists);
    }

    async findExpiringPendingPartnerships(withinMs: number) {
        const threshold = new Date(Date.now() + withinMs);
        return this.partnershipModel
            .find({
                status: 'pending',
                expiresAt: { $lte: threshold, $gte: new Date() },
            })
            .lean()
            .exec();
    }
}
