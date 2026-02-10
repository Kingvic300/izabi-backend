import { Controller, Post, Body, UnauthorizedException, Get, Param, Put, UseGuards, Inject, forwardRef, BadRequestException, InternalServerErrorException, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

@Controller('api/user')
export class UsersController {
    constructor(
        @Inject(forwardRef(() => AuthService))
        private authService: AuthService,
        private usersService: UsersService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('stats')
    async getStats(@Req() req: any) {
        try {
            const userId = req.user.userId;
            const user = await this.usersService.findOne(userId);
            const streaks = await this.usersService.getStreakNumber(userId);
            
            return {
                success: true,
                data: {
                    totalPoints: user.points,
                    dailyPoints: user.dailyPoints,
                    level: user.level,
                    streakData: streaks,
                    studyStats: user.studyStats || { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 },
                    pet: user.pet,
                    isVerified: user.isVerified,
                    subscriptionStatus: user.subscriptionStatus || 'free',
                    subscriptionExpiry: user.subscriptionExpiry
                }
            };
        } catch (error: any) {
            throw new BadRequestException(error.message);
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('streak')
    async getStreak(@Req() req: any) {
        const data = await this.usersService.getStreakNumber(req.user.userId);
        return { success: true, data };
    }

    @UseGuards(JwtAuthGuard)
    @Post('check-in')
    async checkIn(@Req() req: any) {
        const user = await this.usersService.checkIn(req.user.userId);
        return { success: true, data: { streak: user.streak, pet: user.pet } };
    }

    @UseGuards(JwtAuthGuard)
    @Post('purchase/streak-freeze')
    async buyFreeze(@Req() req: any) {
        const user = await this.usersService.buyStreakFreeze(req.user.userId);
        return { success: true, data: { freezes: user.streakFreezes, points: user.points } };
    }

    @Post('login')
    async login(@Body() body: any) {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        return await this.authService.login(user);
    }

    @Post('register')
    async register(@Body() body: any) {
        return await this.authService.register(body.email, body.otp);
    }

    @Post('send-verification-otp')
    async sendOtp(@Body() body: any) {
        return await this.authService.sendOtp(body.email, body.password, body.role, body.firstName, body.lastName);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    async getProfile(@Req() req: any) {
        try {
            const userId = req.user.userId;
            
            // 1. Fetch the full user document from DB
            const user = await this.usersService.findOne(userId);
            
            // 2. Calculate live streak status (to see if they are currently "frozen" or "active")
            const streaks = await this.usersService.getStreakNumber(userId);

            // 3. Convert Mongoose document to a plain JSON object
            const userObj = user.toObject();

            // 4. Remove sensitive fields
            const { password, refreshToken, otp, otpExpires, ...result } = userObj;

            // 5. Return EVERYTHING else + the live calculated streak
            return { 
                success: true, 
                data: { 
                    ...result, 
                    liveStreak: streaks.academicStreak,
                    streakStatus: streaks.status 
                } 
            };
        } catch (error: any) {
            throw new BadRequestException('User profile not found');
        }
    }

    @UseGuards(JwtAuthGuard)
    @Put('profile')
    async updateProfile(@Req() req: any, @Body() body: any) {
        const updated = await this.usersService.updateProfile(req.user.userId, body);
        return { success: true, data: updated };
    }

    @UseGuards(JwtAuthGuard)
    @Post('pet/feed')
    async feedPet(@Req() req: any) {
        const user = await this.usersService.feedPet(req.user.userId);
        return { success: true, data: { pet: user.pet, points: user.points } };
    }

    @UseGuards(JwtAuthGuard)
    @Post('submit-groq-key')
    async submitGroqKey(@Req() req: any, @Body() body: { apiKey: string }) {
        await this.usersService.updateGroqKey(req.user.userId, body.apiKey);
        return { success: true, message: 'API key updated' };
    }

    @Post('logout')
    async logout() {
        return { success: true, message: 'Logged out successfully' };
    }
}