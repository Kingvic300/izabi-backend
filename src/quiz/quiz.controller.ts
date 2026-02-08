import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { QuizService } from './quiz.service';

@Controller('api/quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('results')
  async getResults(@Query('userId') userId: string) {
    const data = await this.quizService.findAll(userId); // Removed default-user, should rely on auth logic if possible, but keeping simple for now
    return { success: true, data };
  }

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
}
