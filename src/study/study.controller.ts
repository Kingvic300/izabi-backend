import { Controller, Get, Post, Body, Query, UseInterceptors, UploadedFile, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from '../ai/ai.service';
import { VoiceService } from './voice.service';
import { UsersService } from '../users/users.service';
import { STUDY_PROMPTS } from './study.prompts';

@Controller('api/study')
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly aiService: AiService,
    private readonly voiceService: VoiceService,
    private readonly usersService: UsersService,
  ) {}

  @Get('history')
  async getHistory(@Query('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      return await this.studyService.findAll(userId);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to fetch history');
    }
  }

  @Get('leaderboard')
  async getLeaderboard() {
    return this.usersService.getLeaderboard();
  }

  @Post('summarize')
  @UseInterceptors(FileInterceptor('file'))
  async summarize(@UploadedFile() file: Express.Multer.File, @Body('userId') userId: string) {
    return this.studyService.generateMaterial(userId, file, 'summary');
  }

  @Post('flashcards')
  @UseInterceptors(FileInterceptor('file'))
  async generateFlashcards(@UploadedFile() file: Express.Multer.File, @Body('userId') userId: string) {
    return this.studyService.generateMaterial(userId, file, 'flashcards');
  }

  @Post('generate-questions')
  @UseInterceptors(FileInterceptor('file'))
  async generateQuestions(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
    @Body('numberOfQuestions') num: string,
  ) {
    const count = parseInt(num) || 5;
    return this.studyService.generateMaterial(userId, file, 'quiz', { count });
  }

  @Post('generate-study-material')
  @UseInterceptors(FileInterceptor('file'))
  async generateStudyMaterial(@UploadedFile() file: Express.Multer.File, @Body('userId') userId: string) {
    return this.studyService.generateMaterial(userId, file, 'study-guide');
  }

  @Post('history')
  async addHistory(@Body() body: any) {
    try {
      const { userId, ...data } = body;
      if (!userId) throw new BadRequestException('userId is required');
      return await this.studyService.create(userId, data);
    } catch (error: any) {
      throw new BadRequestException('Failed to add study history');
    }
  }

  @Post('generate-voice')
  async generateVoice(
    @Body('text') text: string, 
    @Body('lang') lang: string, 
    @Body('isPidgin') isPidgin: boolean,
    @Body('userId') userId: string
  ) {
    try {
      if (!text) throw new BadRequestException('Text is required');
      
      let processedText = text;
      
      if (isPidgin) {
        processedText = await this.aiService.getResponse(STUDY_PROMPTS.PIDGIN_TRANSLATION(text), userId);
      }

      const cleanText = processedText.replace(/[#*`]/g, '').trim();
      const voiceUrl = await this.voiceService.generateVoice(cleanText, lang || 'en');
      return { success: true, voiceUrl, text: processedText };
    } catch (error: any) {
      console.error('[StudyController] Voice generation error:', error);
      throw new InternalServerErrorException(error.message || 'Failed to generate voice');
    }
  }
}

