import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';
import { CreateUserDto, UpdateProfileDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import {
    buildLeaderboard,
    buildLeaderboardShare,
    buildPublicLeaderboard,
    snapshotPreviousRanks,
} from './helpers/leaderboard.helpers';
import {
    getDisplayName,
    getLiveStreakValue,
    getMidnightUTC,
    getNextIncrementInMs,
    toDate,
    updateStreak,
} from './helpers/streak.helpers';
import {
    addPointsForUser,
    addStreakFreezesForUser,
    buyStreakFreezeForUser,
    checkInUser,
    checkUsageLimitForUser,
} from './helpers/gamification.helpers';

@Injectable()
export class UsersService {
    private readonly STREAK_INCREMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
    private readonly STREAK_GRACE_WINDOW_MS = 26 * 60 * 60 * 1000;

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private readonly leaderboardGateway: LeaderboardGateway,
    ) {}

    // --- Core User Management ---

    private getDefaultAvatar(email: string): string {
        const seed = encodeURIComponent((email || 'scholar').toLowerCase());
        return `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}`;
    }
    async create(createUserDto: CreateUserDto): Promise<UserDocument> {
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
        const normalizedEmail = createUserDto.email.toLowerCase();
        const user = new this.userModel({
            ...createUserDto,
            email: normalizedEmail,
            password: hashedPassword,
            level: 1,
            streakFreezes: 0,
            profilePicturePath: this.getDefaultAvatar(normalizedEmail),
        });
        return user.save();
    }
    async findByEmail(email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).select('+password').exec();
    }
    async findByGoogleId(googleId: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ googleId }).exec();
    }
    async findOrCreateFromGoogle(profile: {
        googleId: string;
        email: string;
        firstName: string;
        lastName: string;
        profilePicture?: string;
    }): Promise<UserDocument> {
        const normalizedEmail = profile.email.toLowerCase();
        const googleAvatar =
            profile.profilePicture || this.getDefaultAvatar(normalizedEmail);

        const user = await this.userModel
            .findOne({
                $or: [
                    { googleId: profile.googleId },
                    { email: normalizedEmail },
                ],
            })
            .exec();

        if (user) {
            let needsSave = false;

            // Mark as verified since Google verifies emails
            if (!user.isVerified) {
                user.isVerified = true;
                needsSave = true;
            }

            // Update existing user if they didn't have googleId but email matches
            if (!user.googleId) {
                user.googleId = profile.googleId;
                user.authProvider = 'google';
                if (!user.firstName) user.firstName = profile.firstName;
                if (!user.lastName) user.lastName = profile.lastName;
                user.profilePicturePath = googleAvatar;
                needsSave = true;
            }

            if (
                user.authProvider === 'google' &&
                profile.profilePicture &&
                user.profilePicturePath !== profile.profilePicture
            ) {
                user.profilePicturePath = profile.profilePicture;
                needsSave = true;
            }

            if (needsSave) {
                await user.save();
            }
            return user;
        }

        // Create new user
        const newUser = new this.userModel({
            email: normalizedEmail,
            googleId: profile.googleId,
            firstName: profile.firstName,
            lastName: profile.lastName,
            profilePicturePath: googleAvatar,
            authProvider: 'google',
            isVerified: true,
            level: 1,
            points: 0,
            streak: 0,
            streakFreezes: 0,
            pet: { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' },
        });

        return newUser.save();
    }

    async findOne(id: string): Promise<UserDocument> {
        // Validate MongoDB ObjectId format
        if (!isValidObjectId(id)) {
            throw new BadRequestException(`Invalid user ID format: ${id}`);
        }
        const user = await this.userModel.findById(id).exec();
        if (!user) throw new NotFoundException(`User with ID ${id} not found`);
        return user;
    }

    async updateProfile(
        id: string,
        updateProfileDto: UpdateProfileDto,
    ): Promise<UserDocument> {
        const user = await this.userModel
            .findByIdAndUpdate(id, updateProfileDto, { new: true })
            .exec();
        if (!user) throw new NotFoundException(`User with ID ${id} not found`);
        return user;
    }

    // --- Auth Helpers ---

    async updateOtp(email: string, otp: string, expires: Date): Promise<void> {
        await this.userModel
            .updateOne({ email }, { otp, otpExpires: expires })
            .exec();
    }

    async verifyUser(email: string): Promise<void> {
        await this.userModel
            .updateOne(
                { email },
                { isVerified: true, otp: null, otpExpires: null },
            )
            .exec();
    }

    async updateRefreshToken(
        userId: string,
        refreshToken: string | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(userId, { refreshToken }).exec();
    }

    async updatePassword(
        userId: string,
        hashedPassword: string,
    ): Promise<void> {
        await this.userModel
            .findByIdAndUpdate(userId, { password: hashedPassword })
            .exec();
    }

    // --- Professional Streak Engine ---
    /**
     * Safely convert a value to a Date object.
     * Handles strings, Date objects, and null/undefined.
     */
    private toDate(value: any): Date | null {
        return toDate(value);
    }

    private getMidnightUTC(date: Date): number {
        return getMidnightUTC(date);
    }

    private getLiveStreakValue(
        streak: number,
        lastActivityAt: Date | null,
        now: Date = new Date(),
    ): number {
        return getLiveStreakValue(
            streak,
            lastActivityAt,
            now,
            this.STREAK_GRACE_WINDOW_MS,
        );
    }

    private getDisplayName(user: UserDocument): string {
        return getDisplayName(user);
    }

    private getNextIncrementInMs(
        lastStreakIncrementAt: Date | null,
        now: Date,
    ): number | null {
        return getNextIncrementInMs(
            lastStreakIncrementAt,
            now,
            this.STREAK_INCREMENT_WINDOW_MS,
        );
    }

    private updateStreak(user: UserDocument, activityType: string) {
        return updateStreak(
            user,
            activityType,
            this.STREAK_INCREMENT_WINDOW_MS,
            this.STREAK_GRACE_WINDOW_MS,
        );
    }

    // --- Core Gamification Methods ---
    async addPoints(
        userId: string,
        pointsToAdd: number,
        actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards',
    ): Promise<UserDocument> {
        return addPointsForUser({
            userModel: this.userModel,
            userId,
            pointsToAdd,
            actionType,
            updateStreak: this.updateStreak.bind(this),
            getMidnightUTC: this.getMidnightUTC.bind(this),
            broadcast: (reason) => this.leaderboardGateway.broadcastUpdate(reason),
        });
    }
    async checkIn(userId: string): Promise<UserDocument> {
        return checkInUser({
            userModel: this.userModel,
            userId,
            updateStreak: this.updateStreak.bind(this),
            getMidnightUTC: this.getMidnightUTC.bind(this),
            broadcast: (reason) => this.leaderboardGateway.broadcastUpdate(reason),
        });
    }
    async buyStreakFreeze(userId: string): Promise<UserDocument> {
        return buyStreakFreezeForUser({
            userModel: this.userModel,
            userId,
        });
    }
    async addStreakFreezes(
        userId: string,
        count: number,
    ): Promise<UserDocument> {
        return addStreakFreezesForUser({
            userModel: this.userModel,
            userId,
            count,
        });
    }

    async updateSubscription(
        userId: string,
        data: {
            status: 'free' | 'pro' | 'premium';
            expiry: Date | undefined;
            customerCode?: string;
        },
    ) {
        const user = await this.userModel.findById(userId);
        if (!user) throw new NotFoundException('User not found');

        user.subscriptionStatus = data.status;
        user.subscriptionExpiry = data.expiry;
        if (data.customerCode) user.paystackCustomerCode = data.customerCode;

        return user.save();
    }
    async checkUsageLimit(
        userId: string,
        type: 'dailyDocs' | 'dailyMessages',
    ): Promise<{ allowed: boolean; reason?: string }> {
        return checkUsageLimitForUser({
            userModel: this.userModel,
            userId,
            type,
            getMidnightUTC: this.getMidnightUTC.bind(this),
        });
    }

    async getStreakNumber(userId: string) {
        const user = await this.userModel.findById(userId).exec();
        if (!user) throw new NotFoundException('User not found');

        const now = new Date();

        // Safely convert date fields to handle strings or malformed dates in DB
        const lastActivityAt = this.toDate(user.lastActivityAt || user.lastStreakDate || null);
        const lastStreakIncrementAt = this.toDate(user.lastStreakIncrementAt || user.lastStreakDate || null);

        const liveStreak = this.getLiveStreakValue(
            user.streak || 0,
            lastActivityAt,
            now,
        );
        const nextIncrementInMs = this.getNextIncrementInMs(
            lastStreakIncrementAt,
            now,
        );
        let status = 'active';

        if (liveStreak === 0 && (user.streak || 0) > 0) {
            status = 'expired';
        }

        // Safely handle activityStreaks.login
        const loginActivity = user.activityStreaks?.login;
        const loginLastActivityAt = this.toDate(
            loginActivity?.lastActivityAt || loginActivity?.lastDate || null
        );

        return {
            academicStreak: liveStreak,
            loginStreak: this.getLiveStreakValue(
                loginActivity?.current || 0,
                loginLastActivityAt,
                now,
            ),
            streakFreezes: user.streakFreezes || 0,
            status: status,
            longestStreak: user.longestStreak || 0,
            nextIncrementInMs: nextIncrementInMs,
        };
    }

    async getLeaderboard(userId?: string) {
        return buildLeaderboard({
            userModel: this.userModel,
            userId,
            getLiveStreakValue: this.getLiveStreakValue.bind(this),
            streakGraceWindowMs: this.STREAK_GRACE_WINDOW_MS,
        });
    }

    async getPublicLeaderboard(userId?: string) {
        const leaderboard = await this.getLeaderboard(userId);
        return buildPublicLeaderboard(leaderboard);
    }
    async getLeaderboardShare(userId: string, type: string = 'xp') {
        return buildLeaderboardShare({
            userModel: this.userModel,
            userId,
            type,
            getLiveStreakValue: this.getLiveStreakValue.bind(this),
            getDisplayName: this.getDisplayName.bind(this),
            streakGraceWindowMs: this.STREAK_GRACE_WINDOW_MS,
        });
    }

    /**
     * Snapshots the current ranks of all users and saves them to previousRank fields.
     * WHY: To provide the "rank change" visuals in the Hall of Fame.
     */
    async updatePreviousRanks() {
        const result = await snapshotPreviousRanks(this.userModel);
        this.leaderboardGateway.broadcastUpdate('rank-snapshot');
        return result;
    }

    // --- Admin & Utils ---
    async checkActivityLimit(
        userId: string,
        type: 'dailyDocs' | 'dailyMessages',
    ): Promise<void> {
        const check = await this.checkUsageLimit(userId, type);
        if (!check.allowed) {
            throw new BadRequestException(check.reason);
        }
    }

    async incrementActivityCount(
        userId: string,
        type: 'dailyDocs' | 'dailyMessages',
    ): Promise<void> {
        await this.userModel
            .findByIdAndUpdate(userId, {
                $inc: { [type]: 1 },
                lastStudyDate: new Date(),
            })
            .exec();
    }

    async findAll(): Promise<UserDocument[]> {
        return this.userModel.find().select('-password -refreshToken').exec();
    }

    async findAllForAdmin(): Promise<any[]> {
        return this.userModel
            .find()
            .select(
                'email firstName lastName role isVerified streak lastActivityAt lastStreakDate points createdAt lastStudyDate',
            )
            .lean()
            .exec();
    }

    async countAllUsers(): Promise<number> {
        return this.userModel.countDocuments({}).exec();
    }

    async countActiveSince(since: Date): Promise<number> {
        return this.userModel
            .countDocuments({ lastStudyDate: { $gt: since } })
            .exec();
    }

    async countNewSince(since: Date): Promise<number> {
        return this.userModel
            .countDocuments({ createdAt: { $gt: since } })
            .exec();
    }

    async getDailyCounts(
        field: 'createdAt' | 'lastStudyDate',
        days: number,
    ): Promise<Record<string, number>> {
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        start.setHours(0, 0, 0, 0);

        const results = await this.userModel.aggregate([
            { $match: { [field]: { $gte: start } } },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: `$${field}`,
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const map: Record<string, number> = {};
        results.forEach((row: any) => {
            map[row._id] = row.count;
        });
        return map;
    }

    async delete(userId: string): Promise<void> {
        await this.userModel.findByIdAndDelete(userId).exec();
    }

    async feedPet(userId: string): Promise<UserDocument> {
        const user = await this.userModel.findById(userId);
        if (!user || user.points < 50)
            throw new BadRequestException('Cannot feed pet.');
        user.points -= 50;
        if (!user.pet)
            user.pet = {
                name: 'Izabi Pet',
                type: 'owl',
                level: 1,
                mood: 'happy',
            };
        user.pet.mood = 'super-happy';
        user.markModified('pet');
        return user.save();
    }
}
