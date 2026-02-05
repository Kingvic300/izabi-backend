import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StudyHistory, StudyHistoryDocument } from './entities/study-history.entity';
import { AiService } from '../ai/ai.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';
import { STUDY_PROMPTS } from './study.prompts';

@Injectable()
export class StudyService {
  constructor(
    @InjectModel(StudyHistory.name) private studyModel: Model<StudyHistoryDocument>,
    private readonly aiService: AiService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly usersService: UsersService,
  ) {}

  async findAll(userId: string): Promise<StudyHistoryDocument[]> {
    return this.studyModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async create(userId: string, data: any): Promise<StudyHistoryDocument> {
    const history = new this.studyModel({ ...data, userId });
    return history.save();
  }

  async generateMaterial(
    userId: string,
    file: Express.Multer.File,
    type: 'summary' | 'flashcards' | 'quiz' | 'study-guide',
    options?: { count?: number }
  ) {
    try {
      if (!file) throw new BadRequestException('File is required');

      let prompt = '';
      let points = 0;
      let actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards' = 'summaries';

      switch (type) {
        case 'summary':
          prompt = STUDY_PROMPTS.SUMMARY;
          points = 10;
          actionType = 'summaries';
          break;
        case 'flashcards':
          prompt = STUDY_PROMPTS.FLASHCARDS;
          points = 15;
          actionType = 'flashcards';
          break;
        case 'quiz':
          prompt = STUDY_PROMPTS.QUIZ(options?.count || 5);
          points = 20;
          actionType = 'quizzes';
          break;
        case 'study-guide':
          prompt = STUDY_PROMPTS.STUDY_GUIDE;
          points = 25;
          actionType = 'guides';
          break;
      }

      const [responseText, uploadResult] = await Promise.all([
        this.aiService.generateFromFiles(prompt, file),
        this.cloudinaryService.uploadFile(file).catch(err => {
          console.error(`[StudyService] Cloudinary upload failed for ${type}:`, err);
          return { url: null };
        }),
      ]);

      let parsedData: any = responseText;
      if (type === 'flashcards' || type === 'quiz') {
        try {
          const cleaned = responseText.replace(/```json|```/g, '').trim();
          parsedData = JSON.parse(cleaned);
        } catch (e) {
          console.error(`[StudyService] JSON parse error for ${type}. Raw:`, responseText);
          throw new InternalServerErrorException(`AI returned invalid JSON for ${type}`);
        }
      }

      const historyData: any = {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        type: type === 'quiz' ? 'quiz' : type,
        createdAt: new Date(),
      };

      if (type === 'flashcards') historyData.flashcards = parsedData;
      else if (type === 'quiz') historyData.questions = parsedData;
      else historyData.summary = parsedData;

      await Promise.all([
        this.create(userId || 'default-user', historyData),
        this.usersService.addPoints(userId || 'default-user', points, actionType)
      ]);

      return { success: true, [type === 'quiz' ? 'questions' : (type === 'flashcards' ? 'flashcards' : 'summary')]: parsedData };
    } catch (error: any) {
      console.error(`[StudyService] ${type} generation error:`, error);
      throw error instanceof BadRequestException || error instanceof InternalServerErrorException 
        ? error 
        : new InternalServerErrorException(`Failed to generate ${type}`);
    }
  }
}
