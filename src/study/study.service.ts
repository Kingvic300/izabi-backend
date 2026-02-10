import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StudyHistory, StudyHistoryDocument } from './entities/study-history.entity.js';
import { AiService } from '../ai/ai.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { UsersService } from '../users/users.service.js';
import { STUDY_PROMPTS } from './study.prompts.js';

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
        // 0. Usage Limit Check
        const limit = await this.usersService.checkUsageLimit(userId);
        if (!limit.allowed) {
            throw new BadRequestException(limit.reason);
        }

        const config = this.getMaterialConfig(data.type, data.options);

        // 1. Content Fingerprinting
        const { extractTextFromFile } = await import('../common/utils/text-extractor.js');
        const extractedText = await extractTextFromFile(file);
        const docHash = this.aiService.generateHash(extractedText);

        // 2. Cache Interception
        const existing = await this.studyModel.findOne({ docHash, type: data.type, status: 'COMPLETED' }).exec();
        if (existing) {
            const history = await this.create(userId, {
                fileName: file.originalname,
                fileUrl: existing.fileUrl,
                type: data.type,
                summary: existing.summary,
                questions: existing.questions,
                flashcards: existing.flashcards,
                status: 'COMPLETED',
                docHash,
                metadata: { protocol: 'CACHE_HITS_v1', reusedFrom: existing._id }
            });
            await this.usersService.addPoints(userId, config.points, config.actionType);
            return { success: true, jobId: history._id, status: 'COMPLETED' };
        }

        const history = await this.create(userId, {
            fileName: file.originalname,
            type: data.type,
            status: 'PROCESSING',
            docHash,
            metadata: {
                protocol: 'DIRECT_ASYNC_v2',
                timestamp: new Date().toISOString()
            }
        });

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

    async startTextIngestion(
        userId: string,
        data: { text: string; fileName: string; type: 'summary' | 'flashcards' | 'quiz' | 'study-guide'; options?: any }
    ) {
        // Usage Limit Check
        const limit = await this.usersService.checkUsageLimit(userId);
        if (!limit.allowed) {
            throw new BadRequestException(limit.reason);
        }

        const config = this.getMaterialConfig(data.type, data.options);
        const docHash = this.aiService.generateHash(data.text);

        // Cache lookup
        const existing = await this.studyModel.findOne({ docHash, type: data.type, status: 'COMPLETED' }).exec();
        if (existing) {
            const history = await this.create(userId, {
                fileName: data.fileName,
                type: data.type,
                summary: existing.summary,
                questions: existing.questions,
                flashcards: existing.flashcards,
                status: 'COMPLETED',
                docHash,
                metadata: { protocol: 'TEXT_CACHE_v1' }
            });
            await this.usersService.addPoints(userId, config.points, config.actionType);
            return { success: true, jobId: history._id, status: 'COMPLETED' };
        }

        const history = await this.create(userId, {
            fileName: data.fileName,
            type: data.type,
            status: 'PROCESSING',
            docHash,
            metadata: {
                protocol: 'TEXT_INJECT_v2',
                timestamp: new Date().toISOString()
            }
        });

        this.processBackgroundText(history, data.text, config).catch(err => {
            console.error(`[StudyService] Text ingestion background failure for ${history._id}:`, err);
        });

        return {
            success: true,
            jobId: history._id,
            status: 'PROCESSING'
        };
    }

    private async processBackgroundText(
        history: StudyHistoryDocument,
        text: string,
        config: any
    ) {
        try {
            const responseText = await this.aiService.processExtractedText(config.prompt, text, history.userId);
            await this.finalizeMaterial(history, responseText, history.type, config);
        } catch (error: any) {
            console.error(`[StudyService] Background text processing failed:`, error);
            history.status = 'FAILED';
            (history.metadata as any).error = error.message;
            await history.save();
        }
    }

    private async finalizeMaterial(history: StudyHistoryDocument, responseText: string, type: string, config: any) {
        let parsedData: any = responseText;
        if (type === 'flashcards' || type === 'quiz') {
            try {
                let cleaned = responseText.replace(/```json|```/g, '').trim();

                // Find the absolute start of JSON structure
                const arrayStart = cleaned.indexOf('[');
                const objStart = cleaned.indexOf('{');

                // Determine whether it starts as an array or object
                let start = -1;
                if (arrayStart > -1 && objStart > -1) {
                    start = Math.min(arrayStart, objStart);
                } else if (arrayStart > -1) {
                    start = arrayStart;
                } else {
                    start = objStart;
                }

                if (start > -1) {
                    const endChar = cleaned[start] === '[' ? ']' : '}';
                    const end = cleaned.lastIndexOf(endChar);
                    if (end > start) {
                        cleaned = cleaned.substring(start, end + 1);
                    }
                }

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

            // Usage Limit Check
            const limit = await this.usersService.checkUsageLimit(userId);
            if (!limit.allowed) {
                throw new BadRequestException(limit.reason);
            }

            const config = this.getMaterialConfig(type, options);

            // 1. EXTRACT HASH FIRST for Caching
            const { extractTextFromFile } = await import('../common/utils/text-extractor.js');
            const extractedText = await extractTextFromFile(file);
            const docHash = this.aiService.generateHash(extractedText);

            // 2. CHECK CACHE (Global wisdom reuse)
            const existing = await this.studyModel.findOne({
                docHash,
                type,
                status: 'COMPLETED'
            }).sort({ createdAt: -1 }).exec();

            if (existing) {
                console.log(`[StudyService] Neural Link established! Reusing existing ${type} for ${file.originalname}`);

                // Clone the existing history for this new user request to maintain their personal history
                const cachedHistory = new this.studyModel({
                    userId,
                    fileName: file.originalname,
                    fileUrl: existing.fileUrl,
                    type: existing.type,
                    summary: existing.summary,
                    questions: existing.questions,
                    flashcards: existing.flashcards,
                    status: 'COMPLETED',
                    docHash: existing.docHash,
                    metadata: {
                        ...existing.metadata,
                        cachedFrom: existing._id,
                        reusedAt: new Date().toISOString()
                    }
                });

                await cachedHistory.save();
                // Add points for the new interaction
                await this.usersService.addPoints(userId, config.points, config.actionType);

                return {
                    success: true,
                    yield: (cachedHistory as any).summary || cachedHistory.flashcards || cachedHistory.questions,
                    type,
                    telemetry: cachedHistory.metadata,
                    cached: true
                };
            }

            // 3. AI GENERATION (Cache Miss)
            const history = new this.studyModel({ userId, docHash });

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
                docHash,
                metadata: {
                    charCount: responseText.length,
                    timestamp: new Date().toISOString(),
                    protocol: 'DEEPLAYER_v3'
                }
            };

            history.set(historyData);
            await this.finalizeMaterial(history, responseText, type, config);

            return {
                success: true,
                yield: (history as any).summary || history.flashcards || history.questions,
                type,
                telemetry: history.metadata,
                cached: false
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