import { Controller, Get, Post, Body, Query, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // HOW: Retrieve all quiz results for a user
  // WHY: Display history of past attempts
  @UseGuards(JwtAuthGuard)
  @Get('results')
  async getResults(@Req() req: any) {
    const userId = req.user.userId;
    const data = await this.quizService.findAll(userId);
    return { success: true, data };
  }

  // Legacy endpoint - kept for backward compatibility
  @UseGuards(JwtAuthGuard)
  @Post('results')
  async submitResult(@Body() body: any, @Req() req: any) {
    const userId = req.user.userId;
    const { ...data } = body;
    const result = await this.quizService.create(userId, data);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('daily-challenge')
  async getDailyChallenge(@Req() req: any) {
    const userId = req.user.userId;
    const data = await this.quizService.getDailyChallenge(userId);
    return { success: true, data };
  }

  @Get('practice-questions')
  async getPracticeQuestions(@Query('count') count?: string) {
    const questionCount = count ? parseInt(count, 10) : 5;
    const data = await this.quizService.getGenericPracticeQuestions(questionCount);
    return { success: true, data };
  }

  // --- Quick Test Endpoints ---

  // HOW: Generate new Quick Test from user's study materials
  // WHY: Main entry point for Quick Test feature
  @UseGuards(JwtAuthGuard)
  @Post('quick-test/start')
  async startQuickTest(@Req() req: any) {
    const userId = req.user.userId;
    return await this.quizService.generateQuickTest(userId);
  }

  // HOW: Submit answers and get graded results
  // WHY: Server-side grading prevents manipulation
  @UseGuards(JwtAuthGuard)
  @Post('quick-test/submit')
  async submitQuickTest(@Req() req: any, @Body() body: { quizId: string; answers: Record<string, string> }) {
    const userId = req.user.userId;
    const { quizId, answers } = body;
    
    if (!quizId || !answers) {
      throw new BadRequestException('quizId and answers are required');
    }

    return await this.quizService.submitQuickTest(quizId, userId, answers);
  }
}
