import { UserDocument } from '../entities/user.entity';

export const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    return null;
};

export const getMidnightUTC = (date: Date): number =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const getElapsedMs = (from: Date | null, to: Date): number => {
    if (!from) return Number.POSITIVE_INFINITY;
    return to.getTime() - from.getTime();
};

export const getLiveStreakValue = (
    streak: number,
    lastActivityAt: Date | null,
    now: Date,
    graceWindowMs: number,
): number => {
    const elapsed = getElapsedMs(lastActivityAt, now);
    return elapsed <= graceWindowMs ? streak || 0 : 0;
};

export const getDisplayName = (user: UserDocument): string => {
    const first = (user.firstName || '').trim();
    const last = (user.lastName || '').trim();
    if (first && last) return `${first} ${last[0].toUpperCase()}.`;
    if (first) return first;
    if (last) return last;
    const email = (user.email || '').trim();
    if (email) return email.split('@')[0];
    return 'Scholar';
};

export const computeRollingStreakUpdate = (params: {
    streak: number;
    lastActivityAt: Date | null;
    lastStreakIncrementAt: Date | null;
    now: Date;
    incrementWindowMs: number;
    graceWindowMs: number;
}) => {
    const {
        streak,
        lastActivityAt,
        lastStreakIncrementAt,
        now,
        incrementWindowMs,
        graceWindowMs,
    } = params;
    const hasStreak = (streak || 0) > 0;

    if (!hasStreak) {
        return {
            streak: 1,
            lastActivityAt: now,
            lastStreakIncrementAt: now,
            didIncrement: true,
            didReset: false,
            nextIncrementInMs: incrementWindowMs,
        };
    }

    if (!lastActivityAt || !lastStreakIncrementAt) {
        return {
            streak,
            lastActivityAt: now,
            lastStreakIncrementAt: now,
            didIncrement: false,
            didReset: false,
            nextIncrementInMs: incrementWindowMs,
        };
    }

    const timeSinceLastActivity = now.getTime() - lastActivityAt.getTime();
    const timeSinceLastIncrement =
        now.getTime() - lastStreakIncrementAt.getTime();

    if (timeSinceLastActivity >= graceWindowMs) {
        return {
            streak: 1,
            lastActivityAt: now,
            lastStreakIncrementAt: now,
            didIncrement: false,
            didReset: true,
            nextIncrementInMs: incrementWindowMs,
        };
    }

    if (
        timeSinceLastIncrement >= incrementWindowMs &&
        timeSinceLastActivity < incrementWindowMs
    ) {
        return {
            streak: streak + 1,
            lastActivityAt: now,
            lastStreakIncrementAt: now,
            didIncrement: true,
            didReset: false,
            nextIncrementInMs: incrementWindowMs,
        };
    }

    return {
        streak,
        lastActivityAt: now,
        lastStreakIncrementAt,
        didIncrement: false,
        didReset: false,
        nextIncrementInMs: Math.max(0, incrementWindowMs - timeSinceLastIncrement),
    };
};

export const getNextIncrementInMs = (
    lastStreakIncrementAt: Date | null,
    now: Date,
    incrementWindowMs: number,
): number | null => {
    if (!lastStreakIncrementAt) return null;
    const elapsed = now.getTime() - lastStreakIncrementAt.getTime();
    return Math.max(0, incrementWindowMs - elapsed);
};

export const updateStreak = (
    user: UserDocument,
    activityType: string,
    incrementWindowMs: number,
    graceWindowMs: number,
) => {
    const now = new Date();

    // 1. Process Global Streak (rolling 24-hour window)
    const previousStreak = user.streak || 0;
    // Normalize persisted date values that might have been stored as strings/numbers
    const normalizedLastActivityAt = toDate(
        user.lastActivityAt || user.lastStudyDate || user.lastStreakDate || null,
    );
    const normalizedLastIncrementAt = toDate(
        user.lastStreakIncrementAt || user.lastStreakDate || null,
    );
    const globalUpdate = computeRollingStreakUpdate({
        streak: previousStreak,
        lastActivityAt: normalizedLastActivityAt,
        lastStreakIncrementAt: normalizedLastIncrementAt,
        now,
        incrementWindowMs,
        graceWindowMs,
    });

    user.streak = globalUpdate.streak;
    user.lastActivityAt = globalUpdate.lastActivityAt;
    user.lastStreakIncrementAt = globalUpdate.lastStreakIncrementAt;
    // Legacy field (kept for backward compatibility)
    user.lastStreakDate = globalUpdate.lastStreakIncrementAt;

    if (globalUpdate.didIncrement || previousStreak === 0) {
        user.longestStreak = Math.max(user.longestStreak || 0, user.streak);
    }

    // Milestone: Level up every 7 days + 500 XP reward
    if (
        globalUpdate.didIncrement &&
        user.streak > 0 &&
        user.streak % 7 === 0 &&
        user.streak !== previousStreak
    ) {
        user.level = (user.level || 1) + 1;
        user.points += 500;
    }

    // 2. Process Activity Streaks (rolling 24-hour window)
    if (!user.activityStreaks) user.activityStreaks = {};
    const activity = user.activityStreaks[activityType] || {
        current: 0,
        longest: 0,
        lastDate: null,
        lastActivityAt: null,
        lastStreakIncrementAt: null,
    };

    const normalizedActivityLastActivityAt = toDate(
        activity.lastActivityAt || activity.lastDate || null,
    );
    const normalizedActivityLastIncrementAt = toDate(
        activity.lastStreakIncrementAt || activity.lastDate || null,
    );

    const activityUpdate = computeRollingStreakUpdate({
        streak: activity.current || 0,
        lastActivityAt: normalizedActivityLastActivityAt,
        lastStreakIncrementAt: normalizedActivityLastIncrementAt,
        now,
        incrementWindowMs,
        graceWindowMs,
    });

    activity.current = activityUpdate.streak;
    activity.longest = Math.max(activity.longest || 0, activity.current);
    activity.lastActivityAt = activityUpdate.lastActivityAt;
    activity.lastStreakIncrementAt = activityUpdate.lastStreakIncrementAt;
    activity.lastDate = activityUpdate.lastActivityAt;

    user.activityStreaks[activityType] = activity;
    user.markModified('activityStreaks');
};

// HOW: Updates only user.activityStreaks[activityType], skipping the global
// streak/level/points mutation that updateStreak() always performs.
// WHY: Some activity types (e.g. accountability-partner check-ins) need their
// own rolling streak without bumping the user's global streak/XP as a side effect.
export const updateActivityOnlyStreak = (
    user: UserDocument,
    activityType: string,
    incrementWindowMs: number,
    graceWindowMs: number,
) => {
    const now = new Date();

    if (!user.activityStreaks) user.activityStreaks = {};
    const activity = user.activityStreaks[activityType] || {
        current: 0,
        longest: 0,
        lastDate: null,
        lastActivityAt: null,
        lastStreakIncrementAt: null,
    };

    const normalizedActivityLastActivityAt = toDate(
        activity.lastActivityAt || activity.lastDate || null,
    );
    const normalizedActivityLastIncrementAt = toDate(
        activity.lastStreakIncrementAt || activity.lastDate || null,
    );

    const activityUpdate = computeRollingStreakUpdate({
        streak: activity.current || 0,
        lastActivityAt: normalizedActivityLastActivityAt,
        lastStreakIncrementAt: normalizedActivityLastIncrementAt,
        now,
        incrementWindowMs,
        graceWindowMs,
    });

    activity.current = activityUpdate.streak;
    activity.longest = Math.max(activity.longest || 0, activity.current);
    activity.lastActivityAt = activityUpdate.lastActivityAt;
    activity.lastStreakIncrementAt = activityUpdate.lastStreakIncrementAt;
    activity.lastDate = activityUpdate.lastActivityAt;

    user.activityStreaks[activityType] = activity;
    user.markModified('activityStreaks');

    return activity;
};
