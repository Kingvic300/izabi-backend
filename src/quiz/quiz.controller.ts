import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { QuizService } from './quiz.service';

@Controller('api/quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // HOW: Retrieve all quiz results for a user
  // WHY: Display history of past attempts
  @Get('results')
  async getResults(@Query('userId') userId: string) {
    const data = await this.quizService.findAll(userId);
    return { success: true, data };
  }

  // Legacy endpoint - kept for backward compatibility
  @Post('results')
  async submitResult(@Body() body: any) {
    const { userId, ...data } = body;
    const result = await this.quizService.create(userId, data);
    return { success: true, data: result };
  }

  @Get('daily-challenge')
  async getDailyChallenge(@Query('userId') userId: string) {
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
  @Post('quick-test/start')
  async startQuickTest(@Body() body: { userId: string }) {
    const { userId } = body;
    if (!userId) {
      return { success: false, message: 'userId is required' };
    }
    return await this.quizService.generateQuickTest(userId);
  }

  // HOW: Submit answers and get graded results
  // WHY: Server-side grading prevents manipulation
  @Post('quick-test/submit')
  async submitQuickTest(@Body() body: { quizId: string; userId: string; answers: Record<string, string> }) {
    const { quizId, userId, answers } = body;
    
    if (!quizId || !userId || !answers) {
      return { success: false, message: 'quizId, userId, and answers are required' };
    }

    return await this.quizService.submitQuickTest(quizId, userId, answers);
  }
}
