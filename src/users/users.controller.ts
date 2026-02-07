import { Controller, Post, Body, UnauthorizedException, Get, Param, Put, UseGuards, Request, Inject, forwardRef, Query, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

@Controller('api/user')
export class UsersController {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Get('stats')
  async getStats(@Query('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      const user = await this.usersService.findOne(userId);
      
      return {
        success: true,
        data: {
          totalPoints: user.points,
          dailyPoints: user.dailyPoints,
          studyStreak: user.streak,
          studyStats: user.studyStats || { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 },
          totalStudyMinutes: user.totalStudyMinutes || 0,
          isVerified: user.isVerified,
          pet: user.pet,
        }
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to fetch stats');
    }
  }

  @Post('check-in')
  async checkIn(@Body('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      const user = await this.usersService.checkIn(userId);
      return {
        success: true,
        data: {
          studyStreak: user.streak,
          lastStudyDate: user.lastStudyDate,
          pet: user.pet,
        }
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Check-in failed');
    }
  }

  @Post('login')
  async login(@Body() body: any) {
    try {
      const user = await this.authService.validateUser(body.email, body.password);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return await this.authService.login(user);
    } catch (error: any) {
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Login failed');
    }
  }

  @Post('send-verification-otp')
  async sendOtp(@Body() body: any) {
    try {
      return await this.authService.sendOtp(body.email, body.password, body.role, body.firstName, body.lastName);
    } catch (error: any) {
      if (error.status === 409) throw error;
      throw new BadRequestException(error.message || 'Failed to send OTP');
    }
  }

  @Post('register')
  async register(@Body() body: any) {
    try {
      return await this.authService.register(body.email, body.otp);
    } catch (error: any) {
      throw new UnauthorizedException(error.message || 'Registration failed');
    }
  }

  @Get('profile/:id')
  async findOne(@Param('id') id: string) {
    try {
      const user = await this.usersService.findOne(id);
      const { password, refreshToken, ...result } = user.toObject();
      return { success: true, data: result };
    } catch (error: any) {
      throw new BadRequestException('User not found');
    }
  }

  @Put('profile/:id')
  async updateProfile(@Param('id') id: string, @Body() body: any) {
    try {
      const updatedUser = await this.usersService.updateProfile(id, body);
      const { password, refreshToken, ...result } = updatedUser.toObject();
      return { success: true, data: result };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Profile update failed');
    }
  }

  @Post('logout')
  async logout(@Body('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      await this.usersService.updateRefreshToken(userId, null);
      return { success: true, message: 'Logged out successfully' };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Logout failed');
    }
  }

  @Post('submit-groq-key')
  async submitGroqKey(@Body() body: { userId: string; apiKey: string }) {
    try {
      const { userId, apiKey } = body;
      if (!userId || !apiKey) throw new BadRequestException('userId and apiKey are required');
      await this.usersService.updateGroqKey(userId, apiKey);
      return { success: true, message: 'API key updated successfully' };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to update API key');
    }
  }
}
