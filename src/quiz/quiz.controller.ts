import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { QuizService } from './quiz.service';

@Controller('api/quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('results')
  async getResults(@Query('userId') userId: string) {
    return this.quizService.findAll(userId || 'default-user');
  }

  @Post('results')
  async submitResult(@Body() body: any) {
    const { userId, ...data } = body;
    return this.quizService.create(userId || 'default-user', data);
  }
}
