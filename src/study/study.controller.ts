import { Controller, Get, Post, Body, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from '../ai/ai.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('api/study')
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly aiService: AiService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get('history')
  async getHistory(@Query('userId') userId: string) {
    return this.studyService.findAll(userId || 'default-user');
  }

  @Post('summarize')
  @UseInterceptors(FileInterceptor('file'))
  async summarize(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    
    const prompt = "Please provide a concise and clear summary of this study material. Focus on key concepts and important details.";
    const [summary, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(err => {
        console.error('Cloudinary upload failed:', err);
        return { url: null };
      })
    ]);
    
    // Save to history
    await this.studyService.create(userId || 'default-user', {
      fileName: file.originalname,
      fileUrl: uploadResult.url,
      summary,
      type: 'summary',
      createdAt: new Date(),
    });
    
    return { summary };
  }

  @Post('generate-questions')
  @UseInterceptors(FileInterceptor('file'))
  async generateQuestions(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
    @Body('numberOfQuestions') num: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    
    const count = parseInt(num) || 5;
    const prompt = `Based on this study material, generate ${count} multiple-choice questions or short-answer questions. 
    Return the response ONLY as a JSON array of objects with the following structure: 
    [{"question": string, "options": string[], "answer": string, "questionType": "multiple_choice" | "short_answer"}]
    If multi-choice, provide 4 options.`;
    
    const [responseText, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(err => {
        console.error('Cloudinary upload failed:', err);
        return { url: null };
      })
    ]);
    
    try {
      // Clean up response if it has markdown code blocks
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const questions = JSON.parse(cleaned);
      
      // Save to history
      await this.studyService.create(userId || 'default-user', {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        questions,
        type: 'quiz',
        createdAt: new Date(),
      });
      
      return questions;
    } catch (e) {
      console.error('Failed to parse AI response into JSON:', responseText);
      return { error: 'Failed to generate structured questions', raw: responseText };
    }
  }

  @Post('generate-study-material')
  @UseInterceptors(FileInterceptor('file'))
  async generateStudyMaterial(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    
    const prompt = "Please transform this study material into a comprehensive study guide. Use markdown formatting with clear headings, bullet points, and key terms highlighted.";
    const [material, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(err => {
        console.error('Cloudinary upload failed:', err);
        return { url: null };
      })
    ]);
    
    // Save to history
    await this.studyService.create(userId || 'default-user', {
      fileName: file.originalname,
      fileUrl: uploadResult.url,
      summary: material,
      type: 'study-guide',
      createdAt: new Date(),
    });
    
    return { summary: material };
  }

  @Post('history')
  async addHistory(@Body() body: any) {
    const { userId, ...data } = body;
    return this.studyService.create(userId || 'default-user', data);
  }
}
