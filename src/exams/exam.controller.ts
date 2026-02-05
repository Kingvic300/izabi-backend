import { Controller, Get, Post, Body, Query, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ExamsService } from './exam.service';
import { AiService } from '../ai/ai.service';

@Controller('api/exams')
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly aiService: AiService,
  ) {}

  @Get('simulation')
  async getSimulation(@Query('type') type: string, @Query('subject') subject: string) {
    return this.examsService.findSimulation(type, subject);
  }

  @Get('past-questions')
  async getPastQuestions(
    @Query('category') category: string,
    @Query('type') type?: string,
    @Query('institution') institution?: string,
    @Query('subject') subject?: string,
  ) {
    return this.examsService.findPastQuestions(category, type, institution, subject);
  }

  @Post('generate-mock')
  async generateMock(@Body('topic') topic: string, @Body('type') type: string) {
    // Generate a mock exam using AI
    const prompt = `Generate a realistic mock ${type} exam for the topic: ${topic}. 
    Include 20 multiple choice questions.
    Return ONLY a JSON object with this structure:
    {
      "title": "string",
      "questions": [{"question": "string", "options": ["string"], "answer": "string", "explanation": "string"}]
    }`;
    
    const response = await this.aiService.getResponse(prompt);
    const cleaned = response.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }

  @Post()
  async create(@Body() data: any) {
    return this.examsService.createExam(data);
  }
}
