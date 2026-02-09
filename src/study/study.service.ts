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

  private getMaterialConfig(type: string, options?: any) {
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
    return { prompt, points, actionType };
  }

  // HOW: Initiates processing for a file uploaded directly to the backend
  // WHY: Removes direct frontend -> Cloudinary dependency for high-security or restrictive networks
  async startDirectUpload(
    userId: string,
    file: Express.Multer.File,
    data: { type: 'summary' | 'flashcards' | 'quiz' | 'study-guide'; options?: any }
  ) {
    const config = this.getMaterialConfig(data.type, data.options);
    
    // Create record in PROCESSING state
    const history = await this.create(userId, {
      fileName: file.originalname,
      type: data.type,
      status: 'PROCESSING',
      metadata: { 
        protocol: 'DIRECT_ASYNC_v1',
        timestamp: new Date().toISOString(),
        fileSize: file.size
      }
    });

    // Start detached background task
    this.processBackgroundDirect(history, file, config).catch(err => {
      console.error(`[StudyService] Direct background failure for ${history._id}:`, err);
    });

    return { 
      success: true, 
      jobId: history._id,
      status: 'PROCESSING'
    };
  }

  private async processBackgroundDirect(
    history: StudyHistoryDocument, 
    file: Express.Multer.File,
    config: any
  ) {
    try {
      const [responseText, uploadResult] = await Promise.all([
        this.aiService.generateFromFiles(config.prompt, file, history.userId, history._id.toString()),
        this.cloudinaryService.uploadFile(file).catch(err => {
          console.warn(`[StudyService] BG Cloudinary fallback failed:`, err);
          return null;
        }),
      ]);

      if (uploadResult && (uploadResult as any).secure_url) {
        history.fileUrl = (uploadResult as any).secure_url;
      }

      await this.finalizeMaterial(history, responseText, history.type, config);
    } catch (error: any) {
      console.error(`[StudyService] Direct BG processing failed for ${history._id}:`, error);
      history.status = 'FAILED';
      (history.metadata as any).error = error.message;
      await history.save();
    }
  }

  async startRemoteGeneration(
    userId: string,
    data: { url: string; fileName: string; type: 'summary' | 'flashcards' | 'quiz' | 'study-guide'; options?: any }
  ) {
    const config = this.getMaterialConfig(data.type, data.options);
    
    const history = await this.create(userId, {
      fileName: data.fileName,
      fileUrl: data.url,
      type: data.type,
      status: 'PROCESSING',
      metadata: { 
        protocol: 'REMOTE_ASYNC_v1',
        timestamp: new Date().toISOString()
      }
    });

    this.processBackground(history, data.type, data.url, config).catch(err => {
      console.error(`[StudyService] Async background failure for ${history._id}:`, err);
    });

    return { 
      success: true, 
      jobId: history._id,
      status: 'PROCESSING'
    };
  }

  private async processBackground(
    history: StudyHistoryDocument, 
    type: string, 
    url: string, 
    config: any
  ) {
    try {
      const responseText = await this.aiService.generateFromUrl(config.prompt, url, history.userId, history._id.toString());
      await this.finalizeMaterial(history, responseText, type, config);
    } catch (error: any) {
      console.error(`[StudyService] Background processing failed for ${history._id}:`, error);
      history.status = 'FAILED';
      (history.metadata as any).error = error.message;
      await history.save();
    }
  }

  private async finalizeMaterial(history: StudyHistoryDocument, responseText: string, type: string, config: any) {
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

    if (type === 'flashcards') history.flashcards = parsedData;
    else if (type === 'quiz') history.questions = parsedData;
    else (history as any).summary = parsedData;

    history.status = 'COMPLETED';
    history.metadata = {
      ...history.metadata,
      charCount: responseText.length,
      finalizedAt: new Date().toISOString()
    };

    await Promise.all([
      history.save(),
      this.usersService.addPoints(history.userId, config.points, config.actionType)
    ]);
  }

  async generateMaterial(
    userId: string,
    file: Express.Multer.File,
    type: 'summary' | 'flashcards' | 'quiz' | 'study-guide',
    options?: { count?: number }
  ) {
    try {
      if (!file) throw new BadRequestException('File is required');
      const history = new this.studyModel({ userId });
      
      const config = this.getMaterialConfig(type, options);

      const [responseText, uploadResult] = await Promise.all([
        this.aiService.generateFromFiles(config.prompt, file, userId, history._id.toString()),
        this.cloudinaryService.uploadFile(file).catch(err => {
          console.error(`[StudyService] Cloudinary upload failed for ${type}:`, err);
          return null;
        }),
      ]);

      const historyData: any = {
        fileName: file.originalname,
        fileUrl: uploadResult && (uploadResult as any).secure_url ? (uploadResult as any).secure_url : '',
        type: type === 'quiz' ? 'quiz' : type,
        status: 'COMPLETED',
        metadata: {
          charCount: responseText.length,
          timestamp: new Date().toISOString(),
          protocol: 'DEEPLAYER_v2'
        }
      };

      history.set(historyData);
      await this.finalizeMaterial(history, responseText, type, config);

      return { 
        success: true, 
        yield: (history as any).summary || history.flashcards || history.questions,
        type,
        telemetry: history.metadata 
      };
    } catch (error: any) {
      console.error(`[NeuralNode] ${type} generation failure:`, error);
      throw error instanceof BadRequestException || error instanceof InternalServerErrorException || (error as any).status === 413
        ? error 
        : new InternalServerErrorException(`Neural synchronization failed for ${type}`);
    }
  }

  async getJobStatus(id: string) {
    return this.studyModel.findById(id).exec();
  }
}
