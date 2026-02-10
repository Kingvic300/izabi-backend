import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @UseGuards(JwtAuthGuard)
  @Get('results')
  async getResults(@Req() req: any) {
    const userId = req.user.userId;
    const data = await this.quizService.findAll(userId);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Post('results')
  async submitResult(@Body() body: any, @Req() req: any) {
    const userId = req.user.userId;
    const result = await this.quizService.create(userId, body);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('daily-challenge')
  async getDailyChallenge(@Req() req: any) {
    const userId = req.user.userId;
    return await this.quizService.getDailyChallenge(userId);
  }

  @Get('practice-questions')
  async getPracticeQuestions(@Query('count') count?: string) {
    const questionCount = count ? parseInt(count, 10) : 5;
    return await this.quizService.getGenericPracticeQuestions(questionCount);
  }

  @UseGuards(JwtAuthGuard)
  @Post('quick-test/start')
  async startQuickTest(@Req() req: any) {
    const userId = req.user.userId;
    return await this.quizService.generateQuickTest(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('quick-test/submit')
  async submitQuickTest(
    @Req() req: any,
    @Body() body: { quizId: string; answers: Record<string, string> },
  ) {
    const userId = req.user.userId;
    const { quizId, answers } = body;

    if (!quizId || !answers) {
      throw new BadRequestException('Quiz ID and answers are required.');
    }

    return await this.quizService.submitQuickTest(quizId, userId, answers);
  }
}
