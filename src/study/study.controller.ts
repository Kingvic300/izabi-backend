import { Controller, Get, Post, Body, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from '../ai/ai.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

import { VoiceService } from './voice.service';
import { UsersService } from '../users/users.service';

@Controller('api/study')
export class StudyController {
  constructor(
    private readonly studyService: StudyService,
    private readonly aiService: AiService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly voiceService: VoiceService,
    private readonly usersService: UsersService,
  ) {}

  @Get('history')
  async getHistory(@Query('userId') userId: string) {
    return this.studyService.findAll(userId || 'default-user');
  }

  @Get('leaderboard')
  async getLeaderboard() {
    return this.usersService.getLeaderboard();
  }

  @Post('summarize')
  @UseInterceptors(FileInterceptor('file'))
  async summarize(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    
    const prompt = `You are an expert academic summarizer. Analyze the provided study material and generate a high-density summary. 
    Structure the summary as follows:
    - **Core Objective**: The main goal of the material in 1 sentence.
    - **Key Concepts**: A bulleted list of 5-10 most important ideas with a brief explanation for each.
    - **Cohesive Summary**: A 2-3 paragraph summary connecting the concepts.
    - **Critical Takeaways**: 3-5 bullet points of essential information to remember.
    Use professional, academic language and ensure no important nuances are lost.`;
    const [summary, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(err => {
        console.error('Cloudinary upload failed:', err);
        return { url: null };
      })
    ]);
    
    // Save to history
    await Promise.all([
      this.studyService.create(userId || 'default-user', {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        summary,
        type: 'summary',
        createdAt: new Date(),
      }),
      this.usersService.addPoints(userId || 'default-user', 10, 'summaries')
    ]);
    
    return { summary };
  }

  @Post('flashcards')
  @UseInterceptors(FileInterceptor('file'))
  async generateFlashcards(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    
    const prompt = `Convert this study material into a set of 10 digital flashcards.
    Return ONLY a JSON array with this structure:
    [{"front": "term or question", "back": "definition or answer"}]
    Keep the "front" punchy and the "back" informative but concise.`;
    
    const [material, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(() => ({ url: null }))
    ]);

    try {
      const cleaned = material.replace(/```json|```/g, '').trim();
      const flashcards = JSON.parse(cleaned);
      
      await Promise.all([
        this.studyService.create(userId || 'default-user', {
          fileName: file.originalname,
          fileUrl: uploadResult.url,
          flashcards,
          type: 'flashcards',
          createdAt: new Date(),
        }),
        this.usersService.addPoints(userId || 'default-user', 15, 'flashcards')
      ]);
      
      return { flashcards };
    } catch (e) {
      return { error: 'Failed to parse flashcards', raw: material };
    }
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
    const prompt = `Act as a professional educator. Based on the provided material, generate exactly ${count} assessment questions. 
    CONSTRAINTS:
    1. Return ONLY a valid JSON array. No markdown blocks, no preamble, no postamble.
    2. Mix of "multiple_choice" and "short_answer".
    3. Multiple choice must have exactly 4 options.
    4. Correct answers must be accurate and derived directly from the text.
    JSON STRUCTURE:
    [
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "answer": "string",
        "questionType": "multiple_choice" | "short_answer",
        "explanation": "A brief explanation of why this is the correct answer."
      }
    ]`;
    
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
      await Promise.all([
        this.studyService.create(userId || 'default-user', {
          fileName: file.originalname,
          fileUrl: uploadResult.url,
          questions,
          type: 'quiz',
          createdAt: new Date(),
        }),
        this.usersService.addPoints(userId || 'default-user', 20, 'quizzes')
      ]);
      
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
    
    const prompt = `You are a curriculum designer. Transform this study material into a structured "Ultimate Study Guide".
    REQUIREMENTS:
    1. Use Markdown with hierarchical headings (#, ##, ###).
    2. Start with a "Learning Objectives" section.
    3. Group related information into logical modules.
    4. Bold all technical terms or key names.
    5. Include a "Cheat Sheet" section at the end with a summary of formulas, dates, or definitions.
    6. The guide must be comprehensive enough to serve as the primary source for exam preparation.`;
    const [material, uploadResult] = await Promise.all([
      this.aiService.generateFromFiles(prompt, file),
      this.cloudinaryService.uploadFile(file).catch(err => {
        console.error('Cloudinary upload failed:', err);
        return { url: null };
      })
    ]);
    
    // Save to history
    await Promise.all([
      this.studyService.create(userId || 'default-user', {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        summary: material,
        type: 'study-guide',
        createdAt: new Date(),
      }),
      this.usersService.addPoints(userId || 'default-user', 25, 'guides')
    ]);
    
    return { summary: material };
  }

  @Post('history')
  async addHistory(@Body() body: any) {
    const { userId, ...data } = body;
    return this.studyService.create(userId || 'default-user', data);
  }

  @Post('generate-voice')
  async generateVoice(@Body('text') text: string, @Body('lang') lang: string, @Body('isPidgin') isPidgin: boolean) {
    if (!text) throw new BadRequestException('Text is required');
    
    let processedText = text;
    
    if (isPidgin) {
      const pidginPrompt = `Rewrite the following text in very clear, standard West African Pidgin English. 
      Keep the core study meanings but make it sound natural to a Pidgin speaker.
      TEXT: ${text}`;
      processedText = await this.aiService.getResponse(pidginPrompt);
    }

    // Clean text: remove markdown artifacts for better speech
    const cleanText = processedText
      .replace(/[#*`]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // remove markdown links
      .trim();

    const voiceUrl = await this.voiceService.generateVoice(cleanText, lang || 'en');
    return { voiceUrl, text: processedText };
  }
}
