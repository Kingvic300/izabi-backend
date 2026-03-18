import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserDocument } from '../entities/user.entity';

type GetLiveStreakValue = (
    streak: number,
    lastActivityAt: Date | null,
) => number;

type GetDisplayName = (user: UserDocument) => string;

export const buildLeaderboard = async ({
    userModel,
    userId,
    getLiveStreakValue,
    streakGraceWindowMs,
}: {
    userModel: Model<UserDocument>;
    userId?: string;
    getLiveStreakValue: GetLiveStreakValue;
    streakGraceWindowMs: number;
}) => {
    const filter = { role: { $nin: ['ADMIN', 'admin'] } };
    const projection = {
        firstName: 1,
        lastName: 1,
        email: 1,
        points: 1,
        dailyPoints: 1,
        streak: 1,
        level: 1,
        institution: 1,
        studyStats: 1,
        profilePicturePath: 1,
        previousXpRank: 1,
        previousStreakRank: 1,
    };
    const graceDate = new Date(Date.now() - streakGraceWindowMs);

    const topStudents = await userModel
        .find(filter)
        .sort({ points: -1, _id: 1 })
        .limit(100)
        .select(projection)
        .lean()
        .exec();

    const topStreaks = await userModel.aggregate([
        { $match: filter },
        { $project: { ...projection, lastActivityAt: 1, lastStreakDate: 1 } },
        {
            $addFields: {
                _lastActivity: {
                    $ifNull: ['$lastActivityAt', '$lastStreakDate'],
                },
            },
        },
        {
            $addFields: {
                liveStreak: {
                    $cond: [
                        {
                            $and: [
                                { $ne: ['$_lastActivity', null] },
                                { $gte: ['$_lastActivity', graceDate] },
                            ],
                        },
                        '$streak',
                        0,
                    ],
                },
            },
        },
        { $project: { ...projection, liveStreak: 1 } },
        { $sort: { liveStreak: -1, _id: 1 } },
        { $limit: 100 },
    ]);

    const topStudentsWithChange = topStudents.map((user: any, index) => {
        const currentRank = index + 1;
        const prev = user.previousXpRank || currentRank;
        return {
            ...user,
            rank: currentRank,
            rankChange: prev - currentRank, // Positive = Up, Negative = Down
        };
    });

    const topStreaksWithChange = topStreaks.map((user: any, index) => {
        const currentRank = index + 1;
        const prev = user.previousStreakRank || currentRank;
        return {
            ...user,
            streak: user.liveStreak ?? user.streak ?? 0,
            rank: currentRank,
            rankChange: prev - currentRank,
        };
    });

    let userRank = {
        xp: 'Not Ranked',
        streak: 'Not Ranked',
        xpChange: 0,
        streakChange: 0,
    };
    const cleanUserId = userId?.trim();

    if (cleanUserId && /^[0-9a-fA-F]{24}$/.test(cleanUserId)) {
        const user = await userModel
            .findById(cleanUserId)
            .select(
                'points streak lastActivityAt lastStreakDate role previousXpRank previousStreakRank',
            )
            .lean()
            .exec();
        if (user) {
            if (['ADMIN', 'admin'].includes(user.role)) {
                userRank = {
                    xp: 'Admin',
                    streak: 'Admin',
                    xpChange: 0,
                    streakChange: 0,
                };
            } else {
                const userPoints = user.points ?? 0;
                const userStreak = getLiveStreakValue(
                    user.streak ?? 0,
                    user.lastActivityAt || user.lastStreakDate || null,
                );

                const xpRank =
                    (await userModel.countDocuments({
                        ...filter,
                        $or: [
                            { points: { $gt: userPoints } },
                            { points: userPoints, _id: { $lt: user._id } },
                        ],
                    })) + 1;

                const streakRankResult = await userModel.aggregate([
                    { $match: filter },
                    {
                        $project: {
                            streak: 1,
                            lastActivityAt: 1,
                            lastStreakDate: 1,
                        },
                    },
                    {
                        $addFields: {
                            _lastActivity: {
                                $ifNull: [
                                    '$lastActivityAt',
                                    '$lastStreakDate',
                                ],
                            },
                        },
                    },
                    {
                        $addFields: {
                            liveStreak: {
                                $cond: [
                                    {
                                        $and: [
                                            {
                                                $ne: [
                                                    '$_lastActivity',
                                                    null,
                                                ],
                                            },
                                            {
                                                $gte: [
                                                    '$_lastActivity',
                                                    graceDate,
                                                ],
                                            },
                                        ],
                                    },
                                    '$streak',
                                    0,
                                ],
                            },
                        },
                    },
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $gt: ['$liveStreak', userStreak] },
                                    {
                                        $and: [
                                            {
                                                $eq: [
                                                    '$liveStreak',
                                                    userStreak,
                                                ],
                                            },
                                            { $lt: ['$_id', user._id] },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                    { $count: 'count' },
                ]);
                const streakRank =
                    (streakRankResult[0]?.count ?? 0) + 1;

                userRank = {
                    xp: xpRank.toString(),
                    streak: streakRank.toString(),
                    xpChange: (user.previousXpRank || xpRank) - xpRank,
                    streakChange:
                        (user.previousStreakRank || streakRank) - streakRank,
                };
            }
        }
    }
    return {
        topStudents: topStudentsWithChange,
        topStreaks: topStreaksWithChange,
        userRank,
    };
};

export const buildPublicLeaderboard = (leaderboard: any) => {
    const stripEmail = (user: any) => {
        if (!user) return user;
        const { email, ...rest } = user;
        return rest;
    };
    return {
        topStudents: (leaderboard.topStudents || []).map(stripEmail),
        topStreaks: (leaderboard.topStreaks || []).map(stripEmail),
        userRank: leaderboard.userRank,
    };
};

export const buildLeaderboardShare = async ({
    userModel,
    userId,
    type = 'xp',
    getLiveStreakValue,
    getDisplayName,
    streakGraceWindowMs,
}: {
    userModel: Model<UserDocument>;
    userId: string;
    type?: string;
    getLiveStreakValue: GetLiveStreakValue;
    getDisplayName: GetDisplayName;
    streakGraceWindowMs: number;
}) => {
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId) {
        throw new BadRequestException('userId is required');
    }
    if (!/^[0-9a-fA-F]{24}$/.test(cleanUserId)) {
        throw new BadRequestException('Invalid userId format');
    }

    const normalizedType = (type || 'xp').toLowerCase();
    if (normalizedType !== 'xp' && normalizedType !== 'streak') {
        throw new BadRequestException('type must be \"xp\" or \"streak\"');
    }

    const user = await userModel
        .findById(cleanUserId)
        .select(
            'firstName lastName email points streak lastActivityAt lastStreakDate profilePicturePath role',
        )
        .lean()
        .exec();
    if (!user) throw new NotFoundException('User not found');
    if (['ADMIN', 'admin'].includes(user.role)) {
        return {
            disabled: true,
            reason: 'Admins are not ranked',
            type: normalizedType,
            generatedAt: new Date().toISOString(),
        };
    }

    const points = user.points ?? 0;
    const liveStreak = getLiveStreakValue(
        user.streak ?? 0,
        user.lastActivityAt || user.lastStreakDate || null,
    );
    const filter = { role: { $nin: ['ADMIN', 'admin'] } };

    let rank: number | null = null;
    if (normalizedType === 'xp') {
        rank =
            (await userModel.countDocuments({
                ...filter,
                $or: [
                    { points: { $gt: points } },
                    { points: points, _id: { $lt: user._id } },
                ],
            })) + 1;
    } else {
        const graceDate = new Date(Date.now() - streakGraceWindowMs);
        const streakRankResult = await userModel.aggregate([
            { $match: filter },
            {
                $project: {
                    streak: 1,
                    lastActivityAt: 1,
                    lastStreakDate: 1,
                },
            },
            {
                $addFields: {
                    _lastActivity: {
                        $ifNull: ['$lastActivityAt', '$lastStreakDate'],
                    },
                },
            },
            {
                $addFields: {
                    liveStreak: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$_lastActivity', null] },
                                    {
                                        $gte: [
                                            '$_lastActivity',
                                            graceDate,
                                        ],
                                    },
                                ],
                            },
                            '$streak',
                            0,
                        ],
                    },
                },
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $gt: ['$liveStreak', liveStreak] },
                            {
                                $and: [
                                    { $eq: ['$liveStreak', liveStreak] },
                                    { $lt: ['$_id', user._id] },
                                ],
                            },
                        ],
                    },
                },
            },
            { $count: 'count' },
        ]);
        rank = (streakRankResult[0]?.count ?? 0) + 1;
    }

    const displayName = getDisplayName(user as any);
    const score =
        normalizedType === 'xp' ? points : Math.max(liveStreak, 0);
    const scoreLabel =
        normalizedType === 'xp' ? `${score} XP` : `${score} day streak`;
    const rankLabel = rank ? `#${rank}` : 'Not Ranked';
    // Public base URL for share links (can be overridden via env).
    const baseUrl = (process.env.PUBLIC_APP_URL ||
        process.env.APP_PUBLIC_URL ||
        'https://izabi.halixe.com'
    )
        .trim()
        .replace(/\/+$/, '');
    const shareUrl = `${baseUrl}/leaderboard?userId=${user._id.toString()}`;
    const shareBody =
        rank && rank > 0
            ? `I’m ranked ${rankLabel} on Izabi 🚀 Can you beat me?`
            : `I’m on the Izabi leaderboard 🚀 Can you beat me?`;
    const shareText = `${shareBody}\\nCheck it out: ${shareUrl}`;

    return {
        userId: String(user._id),
        type: normalizedType,
        displayName,
        profilePicturePath: user.profilePicturePath,
        rank,
        rankLabel,
        score,
        scoreLabel,
        shareUrl,
        shareBody,
        shareText,
        generatedAt: new Date().toISOString(),
    };
};

export const snapshotPreviousRanks = async (
    userModel: Model<UserDocument>,
) => {
    const filter = { role: { $nin: ['ADMIN', 'admin'] } };

    // 1. Snapshot XP Ranks
    const sortedByXP = await userModel
        .find(filter)
        .sort({ points: -1, _id: 1 })
        .select('_id')
        .exec();
    const xpUpdates = sortedByXP.map((user, index) => ({
        updateOne: {
            filter: { _id: user._id },
            update: { previousXpRank: index + 1 },
        },
    }));

    // 2. Snapshot Streak Ranks
    const sortedByStreak = await userModel
        .find(filter)
        .sort({ streak: -1, _id: 1 })
        .select('_id')
        .exec();
    const streakUpdates = sortedByStreak.map((user, index) => ({
        updateOne: {
            filter: { _id: user._id },
            update: { previousStreakRank: index + 1 },
        },
    }));

    if (xpUpdates.length > 0) await userModel.bulkWrite(xpUpdates);
    if (streakUpdates.length > 0) await userModel.bulkWrite(streakUpdates);

    return { totalProcessed: sortedByXP.length };
};
