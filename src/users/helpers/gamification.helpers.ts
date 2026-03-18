import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserDocument } from '../entities/user.entity';

type UpdateStreak = (user: UserDocument, activityType: string) => void;
type GetMidnightUTC = (date: Date) => number;
type Broadcast = (reason: string) => void;

export const addPointsForUser = async ({
    userModel,
    userId,
    pointsToAdd,
    actionType,
    updateStreak,
    getMidnightUTC,
    broadcast,
}: {
    userModel: Model<UserDocument>;
    userId: string;
    pointsToAdd: number;
    actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards';
    updateStreak: UpdateStreak;
    getMidnightUTC: GetMidnightUTC;
    broadcast: Broadcast;
}): Promise<UserDocument> => {
    const user = await userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = getMidnightUTC(now);
    const lastUTC = user.lastStudyDate ? getMidnightUTC(user.lastStudyDate) : null;

    if (lastUTC === null || todayUTC > lastUTC) {
        user.dailyPoints = 0;
        user.dailyDocs = 0;
        user.dailyMessages = 0;
    }

    updateStreak(user, actionType);

    user.points += pointsToAdd;
    user.dailyPoints += pointsToAdd;
    user.dailyDocs += 1; // Tracks successful ingestion
    user.lastStudyDate = now;

    if (!user.pet)
        user.pet = {
            name: 'Izabi Pet',
            type: 'owl',
            level: 1,
            mood: 'happy',
        };
    user.pet.level = Math.floor(user.streak / 5) + 1;
    user.pet.mood = user.streak > 1 ? 'happy' : 'neutral';
    user.markModified('pet');

    if (!user.studyStats)
        user.studyStats = {
            summaries: 0,
            quizzes: 0,
            guides: 0,
            flashcards: 0,
        };
    user.studyStats[actionType] = (user.studyStats[actionType] || 0) + 1;
    user.markModified('studyStats');

    user.totalStudyMinutes = (user.totalStudyMinutes || 0) + 5;
    const saved = await user.save();
    broadcast('points');
    return saved;
};

export const checkInUser = async ({
    userModel,
    userId,
    updateStreak,
    getMidnightUTC,
    broadcast,
}: {
    userModel: Model<UserDocument>;
    userId: string;
    updateStreak: UpdateStreak;
    getMidnightUTC: GetMidnightUTC;
    broadcast: Broadcast;
}): Promise<UserDocument> => {
    const user = await userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = getMidnightUTC(now);
    const lastUTC = user.lastStudyDate ? getMidnightUTC(user.lastStudyDate) : null;

    if (lastUTC === null || todayUTC > lastUTC) {
        user.dailyPoints = 0;
        user.dailyDocs = 0;
        user.dailyMessages = 0;
    }

    updateStreak(user, 'login');
    user.lastStudyDate = now;

    if (!user.pet)
        user.pet = {
            name: 'Izabi Pet',
            type: 'owl',
            level: 1,
            mood: 'happy',
        };
    user.pet.level = Math.floor(user.streak / 5) + 1;
    user.pet.mood = user.streak > 1 ? 'happy' : 'neutral';
    user.markModified('pet');

    const saved = await user.save();
    broadcast('check-in');
    return saved;
};

export const checkUsageLimitForUser = async ({
    userModel,
    userId,
    type,
    getMidnightUTC,
}: {
    userModel: Model<UserDocument>;
    userId: string;
    type: 'dailyDocs' | 'dailyMessages';
    getMidnightUTC: GetMidnightUTC;
}): Promise<{ allowed: boolean; reason?: string }> => {
    const user = await userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const subscriptionsEnabled = process.env.SUBSCRIPTIONS_ENABLED === 'true';
    if (!subscriptionsEnabled) {
        return { allowed: true };
    }

    const now = new Date();
    const todayUTC = getMidnightUTC(now);
    const lastUTC = user.lastStudyDate ? getMidnightUTC(user.lastStudyDate) : null;

    // Reset daily counters if it's a new day
    if (lastUTC === null || todayUTC > lastUTC) {
        user.dailyDocs = 0;
        user.dailyMessages = 0;
        user.lastStudyDate = now;
        await user.save();
    }

    // Check if user has a paid subscription (Pro or Premium)
    if (
        user.subscriptionStatus === 'pro' ||
        user.subscriptionStatus === 'premium'
    ) {
        // Check if subscription expired
        if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
            user.subscriptionStatus = 'free';
            await user.save();
            // Fall through to free tier limits below
        } else {
            // Pro and Premium have higher limits
            const isPremium = user.subscriptionStatus === 'premium';
            const PAID_LIMITS = {
                dailyDocs: isPremium ? 30 : 15, // Premium: 30, Pro: 15
                dailyMessages: isPremium ? 45 : 30, // Premium: 45, Pro: 30
            };

            const currentUsage = user[type] || 0;
            if (currentUsage >= PAID_LIMITS[type]) {
                return {
                    allowed: false,
                    reason: `Daily ${type} limit reached.`,
                };
            }

            return { allowed: true };
        }
    }

    // Free tier limits
    const FREE_LIMITS = {
        dailyDocs: 5,
        dailyMessages: 10,
    };

    const usage = user[type] || 0;
    if (usage >= FREE_LIMITS[type]) {
        return {
            allowed: false,
            reason: `Daily ${type} limit reached.`,
        };
    }

    return { allowed: true };
};

export const buyStreakFreezeForUser = async ({
    userModel,
    userId,
}: {
    userModel: Model<UserDocument>;
    userId: string;
}): Promise<UserDocument> => {
    const user = await userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const COST = 50;
    if (user.points < COST)
        throw new BadRequestException(`Need ${COST} XP to buy a freeze.`);
    if ((user.streakFreezes || 0) >= 3)
        throw new BadRequestException('Inventory full (Max 3).');

    user.points -= COST;
    user.streakFreezes = (user.streakFreezes || 0) + 1;
    return user.save();
};

export const addStreakFreezesForUser = async ({
    userModel,
    userId,
    count,
}: {
    userModel: Model<UserDocument>;
    userId: string;
    count: number;
}): Promise<UserDocument> => {
    const user = await userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.streakFreezes = (user.streakFreezes || 0) + count;
    return user.save();
};
