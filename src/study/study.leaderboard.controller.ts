import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('api/study')
export class StudyLeaderboardController {
    constructor(private readonly usersService: UsersService) {}

    @UseGuards(JwtAuthGuard)
    @Get('leaderboard')
    async getLeaderboard(
        @Req() req: any,
        @Query('userId') queryUserId?: string,
    ) {
        const userId = queryUserId || req.user?.userId;
        const leaderboard = await this.usersService.getLeaderboard(userId);
        return {
            success: true,
            data: leaderboard,
        };
    }

    @Get('leaderboard/public')
    async getPublicLeaderboard(@Query('userId') userId?: string) {
        const leaderboard = await this.usersService.getPublicLeaderboard(
            userId,
        );
        return {
            success: true,
            data: leaderboard,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Get('leaderboard/share')
    async getLeaderboardShare(
        @Req() req: any,
        @Query('type') type?: string,
    ) {
        const userId = req.user?.userId;
        const share = await this.usersService.getLeaderboardShare(
            userId,
            type,
        );
        return {
            success: true,
            data: share,
        };
    }
}
