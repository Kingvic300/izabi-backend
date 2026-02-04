import { Controller, Post, Body, UnauthorizedException, Get, Param, Put, UseGuards, Request, Inject, forwardRef, Query } from '@nestjs/common';
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
    // Return aggregate stats
    return {
      totalQuizzes: 15,
      averageScore: 85,
      studyStreak: 12,
      totalStudyHours: 48,
    };
  }

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authService.login(user);
  }

  @Post('send-verification-otp')
  async sendOtp(@Body() body: any) {
    return this.authService.sendOtp(body.email, body.password, body.role);
  }

  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body.email, body.otp);
  }

  @Get('profile/:id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put('profile/:id')
  async updateProfile(@Param('id') id: string, @Body() body: any) {
    return this.usersService.updateProfile(id, body);
  }
}
