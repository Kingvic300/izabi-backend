import { Controller, Get, Post, Body, Query, Param, UseInterceptors, UploadedFile, BadRequestException, InternalServerErrorException, UseGuards, Req } from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { VoiceService } from './voice.service';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { STUDY_PROMPTS } from './study.prompts';
import { IngestRemoteDto } from './dto/ingest-remote.dto';

@Controller('api/study')
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly aiService: AiService,
    private readonly voiceService: VoiceService,
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@Req() req: any) {
    try {
      const userId = req.user.userId;
      return await this.studyService.findAll(userId);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to fetch history');
    }
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('userId') userId?: string) {
    const leaderboard = await this.usersService.getLeaderboard(userId);
    return {
      success: true,
      data: leaderboard
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('summarize')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB limit
  async summarize(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.studyService.generateMaterial(req.user.userId, file, 'summary');
  }

  @UseGuards(JwtAuthGuard)
  @Post('flashcards')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB limit
  async generateFlashcards(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.studyService.generateMaterial(req.user.userId, file, 'flashcards');
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-questions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB limit
  async generateQuestions(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body('numberOfQuestions') num: string,
  ) {
    const count = parseInt(num) || 5;
    return this.studyService.generateMaterial(req.user.userId, file, 'quiz', { count });
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-study-material')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB limit
  async generateStudyMaterial(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.studyService.generateMaterial(req.user.userId, file, 'study-guide');
  }

  @UseGuards(JwtAuthGuard)
  @Post('history')
  async addHistory(@Body() body: any, @Req() req: any) {
    try {
      const { ...data } = body;
      const userId = req.user.userId;
      return this.studyService.create(userId, data);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('upload-signature')
  async getSignature() {
    return this.cloudinaryService.generateSignature();
  }

  // HOW: Initiates processing for a file uploaded directly to the backend
  // WHY: Removes direct frontend -> Cloudinary dependency, more reliable for restricted environments
  @UseGuards(JwtAuthGuard)
  @Post('ingest-direct')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } })) // 100MB limit
  async ingestDirect(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body('type') type: string,
    @Body('options') options?: string,
  ) {
    if (!file) throw new BadRequestException('File is required for direct ingestion.');
    const userId = req.user.userId;
    
    // FormData bodies are strings, need to parse options if provided
    const parsedOptions = options ? JSON.parse(options) : {};
    
    return this.studyService.startDirectUpload(userId, file, { 
      type: type as any, 
      options: parsedOptions 
    });
  }

  // HOW: Triggers background processing for a file already hosted on Cloudinary
  // WHY: Allows the UI to be responsive (O(1) request time) even for large document analysis
  @UseGuards(JwtAuthGuard)
  @Post('ingest-remote')
  async ingestRemote(@Body() data: IngestRemoteDto, @Req() req: any) {
    const userId = req.user.userId;
    const { url, fileName, type, options } = data;
    
    if (!url) {
      throw new BadRequestException('Document URL (Cloudinary) is required for ingestion mapping.');
    }
    
    return this.studyService.startRemoteGeneration(userId, { url, fileName, type: type as any, options });
  }

  @Get('job-status/:id')
  async getJobStatus(@Param('id') id: string) {
    return this.studyService.getJobStatus(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-voice')
  async generateVoice(
    @Body('text') text: string, 
    @Body('lang') lang: string, 
    @Body('isPidgin') isPidgin: boolean,
    @Req() req: any
  ) {
    try {
      const userId = req.user.userId;
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
