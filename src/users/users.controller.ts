import { Controller, Post, Body, UnauthorizedException, Get, Param, Put, UseGuards, Request, Inject, forwardRef, Query, BadRequestException, InternalServerErrorException, Req } from '@nestjs/common';
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
      
      return {
        success: true,
        data: {
          totalPoints: user.points,
          dailyPoints: user.dailyPoints,
          studyStreak: user.streak,
          activityStreaks: user.activityStreaks || {},
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

  @UseGuards(JwtAuthGuard)
  @Post('check-in')
  async checkIn(@Req() req: any) {
    try {
      const userId = req.user.userId;
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

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const user = await this.usersService.findOne(userId);
      const { password, refreshToken, ...result } = user.toObject();
      return { success: true, data: result };
    } catch (error: any) {
      throw new BadRequestException('User not found');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req: any, @Body() body: any) {
    try {
      const userId = req.user.userId;
      const updatedUser = await this.usersService.updateProfile(userId, body);
      const { password, refreshToken, ...result } = updatedUser.toObject();
      return { success: true, data: result };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Profile update failed');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any) {
    try {
      const userId = req.user.userId;
      await this.usersService.updateRefreshToken(userId, null);
      return { success: true, message: 'Logged out successfully' };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Logout failed');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('submit-groq-key')
  async submitGroqKey(@Req() req: any, @Body() body: { apiKey: string }) {
    try {
      const userId = req.user.userId;
      const { apiKey } = body;
      if (!apiKey) throw new BadRequestException('apiKey is required');
      await this.usersService.updateGroqKey(userId, apiKey);
      return { success: true, message: 'API key updated successfully' };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to update API key');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('pet/feed')
  async feedPet(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const user = await this.usersService.feedPet(userId);
      return { 
        success: true, 
        message: 'Pet fed successfully', 
        data: {
          points: user.points,
          pet: user.pet
        }
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to feed pet');
    }
  }
}
