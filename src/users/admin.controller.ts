import {
    Controller,
    Get,
    Delete,
    Param,
    UseGuards,
    NotFoundException,
    Post,
    Body,
    Req,
    ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotesService } from '../notes/notes.service';
import { QuizService } from '../quiz/quiz.service';
import { MailService } from '../mail/mail.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
    private readonly STREAK_RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

    constructor(
        private readonly usersService: UsersService,
        private readonly notesService: NotesService,
        private readonly quizService: QuizService,
        private readonly mailService: MailService,
    ) {}

    /**
     * Helper to calculate a live streak from raw DB data.
     * Aligns with UsersService rolling 24-hour logic.
     */
    private calculateLiveStreak(streak: number, lastDate: Date | null): number {
        if (!lastDate) return 0;
        const diffMs = new Date().getTime() - new Date(lastDate).getTime();
        return diffMs <= this.STREAK_RESET_WINDOW_MS ? streak || 0 : 0;
    }

    /**
     * Get admin dashboard statistics
     */
    @Get('stats')
    async getStats() {
        try {
            const users = await this.usersService.findAll();
            const notes = await this.notesService.countAll();
            const contributedKeys =
                await this.usersService.getContributedKeysCount();

            // Active users (logged in within last 24 hours)
            const oneDayAgo = new Date();
            oneDayAgo.setHours(oneDayAgo.getHours() - 24);
            const activeUsers = users.filter(
                (u: any) =>
                    u.lastStudyDate && new Date(u.lastStudyDate) > oneDayAgo,
            );

            // New users in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const newUsers = users.filter(
                (u: any) => new Date(u.createdAt) > thirtyDaysAgo,
            );
            const growth =
                users.length > 0
                    ? ((newUsers.length / users.length) * 100).toFixed(1)
                    : 0;

            // User growth chart (7 days)
            const userGrowthChart = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dayStart = new Date(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                );
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);

                const count = users.filter((u: any) => {
                    const created = new Date(u.createdAt);
                    return created >= dayStart && created < dayEnd;
                }).length;

                userGrowthChart.push({
                    date: dayStart.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                    }),
                    users: count,
                });
            }

            // Activity trend (7 days)
            const activityChart = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dayStart = new Date(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                );
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);

                const active = users.filter((u: any) => {
                    if (!u.lastStudyDate) return false;
                    const lastStudy = new Date(u.lastStudyDate);
                    return lastStudy >= dayStart && lastStudy < dayEnd;
                }).length;

                activityChart.push({
                    date: dayStart.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                    }),
                    active,
                });
            }

            const latestNotes = await this.notesService.findLatestGlobal(10);
            const latestQuizzes = await this.quizService.findLatest(10);

            const recentActivities = [
                ...latestNotes.map((n: any) => ({
                    type: 'NOTE_CREATED',
                    user: n.userId,
                    title: n.title,
                    date: n.createdAt,
                })),
                ...latestQuizzes.map((q: any) => ({
                    type: 'QUIZ_COMPLETED',
                    user: q.userId,
                    title: q.quizTitle,
                    score: q.score,
                    date: q.createdAt,
                })),
            ]
                .sort(
                    (a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime(),
                )
                .slice(0, 15);

            return {
                success: true,
                data: {
                    totalUsers: users.length,
                    activeNow: activeUsers.length,
                    totalNotes: notes,
                    contributedKeys: contributedKeys,
                    growth: parseFloat(growth as string),
                    userGrowthChart,
                    activityChart,
                    recentActivities,
                },
            };
        } catch (error) {
            console.error('Error fetching admin stats:', error);
            return {
                success: false,
                message: 'Failed to fetch admin statistics',
            };
        }
    }

    /**
     * Get all users with live global streak status
     */
    @Get('users')
    async getAllUsers() {
        try {
            const users = await this.usersService.findAll();
            return {
                success: true,
                data: users.map((user) => ({
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName || 'N/A',
                    lastName: user.lastName || 'N/A',
                    role: user.role || 'USER',
                    isVerified: user.isVerified,
                    // Use the UTC-aligned helper for live streak calculation
                    streak: this.calculateLiveStreak(
                        user.streak || 0,
                        user.lastStreakDate || null,
                    ),
                    points: user.points || 0,
                    createdAt: user.createdAt,
                    lastActive: user.lastStudyDate,
                })),
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to fetch users',
                data: [],
            };
        }
    }

    /**
     * Get user history and full granular streak details
     */
    @Get('users/:id/history')
    async getUserHistory(@Param('id') userId: string) {
        try {
            const user = await this.usersService.findOne(userId);
            if (!user) throw new NotFoundException('User not found');

            // Use the service method to get the granular "Live" streak breakdown
            const liveStreaks = await this.usersService.getStreakNumber(userId);

            const notes = await this.notesService.findAll(userId);
            const quizzes = await this.quizService.findAll(userId);

            const history = [
                ...notes.map((n) => ({
                    type: 'NOTE_CREATED',
                    date: n.createdAt,
                    details: { title: n.title, id: n._id },
                })),
                ...quizzes.map((q) => ({
                    type: 'QUIZ_COMPLETED',
                    date: q.createdAt,
                    details: { title: q.quizTitle, score: q.score, id: q._id },
                })),
                {
                    type: 'ACCOUNT_CREATED',
                    date: user.createdAt,
                    details: null,
                },
            ].sort(
                (a: any, b: any) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
            );

            const missingActions = [];
            if (notes.length === 0)
                missingActions.push('Has not created any notes yet');
            if (quizzes.length === 0)
                missingActions.push('Has not taken any quizzes yet');
            if (!user.isVerified) missingActions.push('Has not verified email');

            return {
                success: true,
                data: {
                    user: {
                        id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        createdAt: user.createdAt,
                        points: user.points,
                        // Full Streak Detail
                        streaks: {
                            global: liveStreaks.academicStreak,
                            login: liveStreaks.loginStreak,
                            longest: liveStreaks.longestStreak,
                        },
                        studyStats: user.studyStats,
                        pet: user.pet,
                    },
                    history,
                    missingActions,
                },
            };
        } catch (error: any) {
            throw new NotFoundException(
                error.message || 'Failed to fetch user history',
            );
        }
    }

    /**
     * Send the live announcement email to all non-admin users.
     * Optional body:
     * - dryRun: boolean (if true, do not send)
     * - limit: number (max recipients)
     */
    @Post('announce-live')
    async announceLive(
        @Req() req: any,
        @Body() body?: { dryRun?: boolean; limit?: number },
    ) {
        const role = req?.user?.role || '';
        if (!['ADMIN', 'admin'].includes(role)) {
            throw new ForbiddenException('Admin access required.');
        }

        const users = await this.usersService.findAll();
        const recipients = users.filter(
            (user: any) =>
                user?.email &&
                !['ADMIN', 'admin'].includes(user.role || ''),
        );

        const limit =
            body?.limit && body.limit > 0
                ? Math.min(body.limit, recipients.length)
                : recipients.length;
        const targetUsers = recipients.slice(0, limit);

        if (body?.dryRun) {
            return {
                success: true,
                dryRun: true,
                total: targetUsers.length,
                sent: 0,
                failed: 0,
            };
        }

        let sent = 0;
        let failed = 0;
        const failures: string[] = [];

        for (const user of targetUsers) {
            const displayName =
                `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                user.email;
            const ok = await this.mailService.sendLiveAnnouncement(
                user.email,
                displayName,
            );
            if (ok) {
                sent += 1;
            } else {
                failed += 1;
                if (failures.length < 20) failures.push(user.email);
            }
        }

        return {
            success: true,
            total: targetUsers.length,
            sent,
            failed,
            failures,
        };
    }

    /**
     * Get all contributed Groq API keys
     */
    @Get('contributed-keys')
    async getContributedKeys() {
        try {
            const usersWithKeys = await this.usersService.getUsersWithKeys();
            return {
                success: true,
                data: usersWithKeys.map((user) => ({
                    id: user._id,
                    userId: user._id,
                    apiKey: user.groqApiKey,
                    createdAt: user.createdAt,
                })),
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to fetch contributed keys',
                data: [],
            };
        }
    }

    /**
     * Delete a user
     */
    @Delete('users/:id')
    async deleteUser(@Param('id') userId: string) {
        try {
            await this.usersService.delete(userId);
            return { success: true, message: 'User deleted successfully' };
        } catch (error) {
            return { success: false, message: 'Failed to delete user' };
        }
    }
}
