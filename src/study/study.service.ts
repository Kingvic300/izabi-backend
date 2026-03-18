import {
    Injectable,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Readable } from 'stream';
import {
    StudyHistory,
    StudyHistoryDocument,
} from './entities/study-history.entity.js';
import { AiService } from '../ai/ai.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { UsersService } from '../users/users.service.js';
import { STUDY_PROMPTS } from './study.prompts.js';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants.js';
import {
    STUDY_QUEUE_NAME,
    StudyQueueJobPayload,
} from './queue/study-queue.types.js';
import { StudyQueueService } from './queue/study-queue.service.js';
import { StudyJobService } from './study-job.service.js';

@Injectable()
export class StudyService {
    private readonly maxCombinedChars = Number(
        process.env.MAX_COMBINED_TEXT_CHARS || 500000,
    );
    constructor(
        @InjectModel(StudyHistory.name)
        private studyModel: Model<StudyHistoryDocument>,
        private readonly aiService: AiService,
        private readonly cloudinaryService: CloudinaryService,
        private readonly usersService: UsersService,
        private readonly studyQueueService: StudyQueueService,
        private readonly studyJobService: StudyJobService,
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
        let format: 'json' | 'markdown' = 'markdown';
        let actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards' =
            'summaries';
        let quizOptions: {
            count: number;
            difficulty: 'easy' | 'balanced' | 'hard';
            questionStyle: 'mixed' | 'mcq' | 'short';
            shuffle: boolean;
        } | null = null;

        switch (type) {
            case 'summary':
                prompt = STUDY_PROMPTS.SUMMARY;
                points = 10;
                actionType = 'summaries';
                format = 'markdown';
                break;
            case 'flashcards':
                prompt = STUDY_PROMPTS.FLASHCARDS;
                points = 15;
                actionType = 'flashcards';
                format = 'json';
                break;
            case 'quiz':
                quizOptions = this.normalizeQuizOptions(options);
                prompt = STUDY_PROMPTS.QUIZ(quizOptions.count, quizOptions);
                points = 20;
                actionType = 'quizzes';
                format = 'json';
                break;
            case 'study-guide':
                prompt = STUDY_PROMPTS.STUDY_GUIDE;
                points = 25;
                actionType = 'guides';
                format = 'markdown';
                break;
        }
        return { prompt, points, actionType, quizOptions, format };
    }

    private normalizeQuizOptions(options?: any) {
        const count = Math.max(1, Number(options?.count) || 5);
        const difficulty =
            options?.difficulty === 'easy' ||
            options?.difficulty === 'hard' ||
            options?.difficulty === 'balanced'
                ? options.difficulty
                : 'balanced';
        const questionStyle =
            options?.questionStyle === 'mcq' ||
            options?.questionStyle === 'short' ||
            options?.questionStyle === 'mixed'
                ? options.questionStyle
                : 'mixed';
        const shuffle = Boolean(options?.shuffle);
        return { count, difficulty, questionStyle, shuffle };
    }

    private normalizeLanguage(language?: string): string {
        const cleaned = (language || '').trim().toLowerCase();
        if (!cleaned) return 'en';
        if (cleaned === 'english' || cleaned === 'en' || cleaned.startsWith('en-')) {
            return 'en';
        }
        return cleaned;
    }

    private async resolveLanguage(
        userId: string,
        override?: string,
    ): Promise<string> {
        if (override && override.trim()) {
            return this.normalizeLanguage(override);
        }
        try {
            const user = await this.usersService.findOne(userId);
            return this.normalizeLanguage((user as any).preferredLanguage);
        } catch {
            return 'en';
        }
    }

    private buildLanguageCacheQuery(
        base: Record<string, any>,
        language: string,
    ) {
        const normalized = this.normalizeLanguage(language);
        const isEnglish = normalized === 'en';
        if (isEnglish) {
            return {
                ...base,
                $or: [
                    { language: { $exists: false } },
                    { language: null },
                    { language: { $in: ['en', 'english', 'en-us', 'en-gb'] } },
                ],
            };
        }
        return { ...base, language: normalized };
    }

    // HOW: Initiates processing for a file uploaded directly to the backend
    // WHY: Removes direct frontend -> Cloudinary dependency for high-security or restrictive networks
    async startDirectUpload(
        userId: string,
        file: Express.Multer.File,
        data: {
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
            lang?: string;
        },
    ) {
        return this.startMultiDirectUpload(userId, [file], data);
    }

    async startMultiDirectUpload(
        userId: string,
        files: Express.Multer.File[],
        data: {
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
            lang?: string;
        },
    ) {
        // 0. Usage Limit Check
        const limit = await this.usersService.checkUsageLimit(
            userId,
            'dailyDocs',
        );
        if (!limit.allowed) {
            throw new BadRequestException(limit.reason);
        }

        if (this.studyQueueService.isEnabled()) {
            return this.enqueueDirectUpload(userId, files, data);
        }

        return this.startMultiDirectUploadInProcess(userId, files, data);
    }

    private async enqueueDirectUpload(
        userId: string,
        files: Express.Multer.File[],
        data: {
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
            lang?: string;
        },
    ) {
        const language = await this.resolveLanguage(userId, data.lang);
        const config = this.getMaterialConfig(data.type, data.options);
        const fileNames = files.map((file) => file.originalname);
        const fileFingerprints = files
            .map((file) => `${file.originalname}:${file.size}`)
            .join('|');
        const dedupeKey = this.aiService.generateHash(
            `${userId}:${data.type}:${JSON.stringify(data.options || {})}:${fileFingerprints}`,
        );

        const existingJob = await this.studyJobService.findByDedupeKey(
            dedupeKey,
        );
        if (existingJob) {
            return {
                success: true,
                jobId: existingJob.historyId || existingJob._id.toString(),
                status: existingJob.status,
                deduped: true,
            };
        }

        const history = await this.create(userId, {
            fileName: fileNames.join(', '),
            type: data.type,
            status: 'PROCESSING',
            language,
            metadata: {
                protocol: 'REDIS_QUEUE_v1',
                timestamp: new Date().toISOString(),
                fileNames,
                progress: 5,
            },
        });

        if (data.type === 'quiz' && config.quizOptions) {
            (history.metadata as any).quizOptions = config.quizOptions;
            (history.metadata as any).quizOptionsHash =
                this.aiService.generateHash(
                    JSON.stringify(config.quizOptions),
                );
        }

        const jobRecord = await this.studyJobService.createJob({
            userId,
            type: data.type,
            fileNames,
            options: data.options,
            dedupeKey,
            historyId: history._id.toString(),
        });

        try {
            const uploadResult = await this.cloudinaryService.uploadFile(
                files[0],
            );
            history.fileUrl = uploadResult.secure_url;

            if (files.length > 1) {
                const allUrls = [uploadResult.secure_url];
                for (let i = 1; i < files.length; i++) {
                    const res = await this.cloudinaryService.uploadFile(
                        files[i],
                    );
                    allUrls.push(res.secure_url);
                }
                (history.metadata as any).fileUrls = allUrls;
            }

            (history.metadata as any).progress = 15;
            await (history as any).save();
            await this.studyJobService.markUploaded(
                jobRecord._id.toString(),
                (history.metadata as any).fileUrls?.length > 0
                    ? (history.metadata as any).fileUrls
                    : [history.fileUrl].filter(Boolean),
            );

            const payload: StudyQueueJobPayload = {
                jobId: jobRecord._id.toString(),
                historyId: history._id.toString(),
                userId,
                type: data.type,
                fileUrls:
                    (history.metadata as any).fileUrls?.length > 0
                        ? (history.metadata as any).fileUrls
                        : [history.fileUrl].filter(Boolean),
                fileNames,
                language,
                options: data.options,
            };

            await this.studyQueueService.enqueue(payload);
            await this.studyJobService.markQueued(
                jobRecord._id.toString(),
                payload.fileUrls,
            );
        } catch (error: any) {
            history.status = 'FAILED';
            (history.metadata as any) = {
                ...(history.metadata || {}),
                error: error?.message || 'Upload/queue failed',
            };
            await (history as any).save();
            await this.studyJobService.markQueueFailed(
                jobRecord._id.toString(),
                error?.message || 'Upload/queue failed',
            );
            throw error;
        }

        return {
            success: true,
            jobId: history._id,
            status: 'PROCESSING',
        };
    }

    private async startMultiDirectUploadInProcess(
        userId: string,
        files: Express.Multer.File[],
        data: {
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
            lang?: string;
        },
    ) {
        const language = await this.resolveLanguage(userId, data.lang);
        const config = this.getMaterialConfig(data.type, data.options);

        // 1. Content Fingerprinting (Combined)
        const { extractTextFromFile } =
            await import('../common/utils/text-extractor.js');

        let combinedText = '';
        const fileNames = files.map((f) => f.originalname);

        for (const file of files) {
            const text = await extractTextFromFile(file);
            const nextChunk =
                `\n\n--- Source: ${file.originalname} ---\n\n` + text;
            if (combinedText.length + nextChunk.length > this.maxCombinedChars) {
                combinedText +=
                    '\n\n[Content truncated to protect system memory]';
                break;
            }
            combinedText += nextChunk;
        }

        const docHash = this.aiService.generateHash(combinedText);

        // 2. Cache Interception
        const cacheQuery: any = this.buildLanguageCacheQuery(
            {
                docHash,
                type: data.type,
                status: 'COMPLETED',
            },
            language,
        );
        if (data.type === 'quiz' && config.quizOptions) {
            cacheQuery['metadata.quizOptionsHash'] =
                this.aiService.generateHash(
                    JSON.stringify(config.quizOptions),
                );
        }
        const existing = await this.studyModel.findOne(cacheQuery).exec();
        if (existing) {
            const history = await this.create(userId, {
                fileName: fileNames.join(', '),
                fileUrl: existing.fileUrl,
                type: data.type,
                summary: existing.summary,
                questions: existing.questions,
                flashcards: existing.flashcards,
                status: 'COMPLETED',
                docHash,
                language,
                metadata: {
                    protocol: 'CACHE_HITS_v1',
                    reusedFrom: existing._id,
                    fileNames,
                },
            });
            await this.usersService.addPoints(
                userId,
                config.points,
                config.actionType,
            );
            return { success: true, jobId: history._id, status: 'COMPLETED' };
        }

        const history = await this.create(userId, {
            fileName: fileNames.join(', '),
            type: data.type,
            status: 'PROCESSING',
            docHash,
            language,
            metadata: {
                protocol: 'DIRECT_ASYNC_MULTI_v1',
                timestamp: new Date().toISOString(),
                fileNames,
            },
        });

        if (data.type === 'quiz' && config.quizOptions) {
            (history.metadata as any).quizOptions = config.quizOptions;
            (history.metadata as any).quizOptionsHash =
                this.aiService.generateHash(
                    JSON.stringify(config.quizOptions),
                );
        }

        this.processBackgroundMultiDirect(
            history,
            files,
            combinedText,
            config,
        ).catch((err) => {
            console.error(
                `[StudyService] Multi-direct background failure for ${history._id}:`,
                err,
            );
        });

        return {
            success: true,
            jobId: history._id,
            status: 'PROCESSING',
        };
    }

    async processQueuedDirectUpload(payload: StudyQueueJobPayload) {
        const history = await this.studyModel
            .findById(payload.historyId)
            .exec();

        if (!history) {
            throw new BadRequestException('Queued job history not found.');
        }

        if (history.status === 'COMPLETED') return;

        try {
            const jobRecord = await this.studyJobService.findById(
                payload.jobId,
            );
            if (!jobRecord) {
                throw new BadRequestException('Queue job record not found.');
            }

            const leaseMs = Number(
                process.env.STUDY_JOB_LEASE_MS || 10 * 60 * 1000,
            );
            const acquired = await this.studyJobService.acquireLease(
                jobRecord._id.toString(),
                leaseMs,
                jobRecord.attempts + 1,
            );
            if (!acquired) return;

            const language = payload.language || history.language || 'en';
            const config = this.getMaterialConfig(payload.type, payload.options);

            (history.metadata as any) = {
                ...(history.metadata || {}),
                worker: 'redis',
                queue: STUDY_QUEUE_NAME,
                progress: 25,
            };
            await (history as any).save();

            const { extractTextFromFile } =
                await import('../common/utils/text-extractor.js');

            let combinedText = '';
            const fileUrls =
                payload.fileUrls?.length
                    ? payload.fileUrls
                    : history.fileUrl
                      ? [history.fileUrl]
                      : [];
            const fileNames = payload.fileNames || [];

            if (fileUrls.length === 0) {
                throw new BadRequestException('No file URLs provided for job.');
            }

            for (let i = 0; i < fileUrls.length; i++) {
                const url = fileUrls[i];
                const originalname =
                    fileNames[i] || url.split('/').pop() || 'document';
                const file = await this.fetchFileFromUrl(url, originalname);
                const text = await extractTextFromFile(file);
                const nextChunk =
                    `\n\n--- Source: ${originalname} ---\n\n` + text;
                if (
                    combinedText.length + nextChunk.length >
                    this.maxCombinedChars
                ) {
                    combinedText +=
                        '\n\n[Content truncated to protect system memory]';
                    break;
                }
                combinedText += nextChunk;
            }

            const docHash = this.aiService.generateHash(combinedText);
            history.docHash = docHash;
            history.language = language;
            history.fileName = fileNames.join(', ');
            if (!history.fileUrl && fileUrls.length > 0) {
                history.fileUrl = fileUrls[0];
            }

            const cacheQuery: any = this.buildLanguageCacheQuery(
                {
                    docHash,
                    type: payload.type,
                    status: 'COMPLETED',
                },
                language,
            );
            if (payload.type === 'quiz' && config.quizOptions) {
                cacheQuery['metadata.quizOptionsHash'] =
                    this.aiService.generateHash(
                        JSON.stringify(config.quizOptions),
                    );
            }

            const existing = await this.studyModel.findOne(cacheQuery).exec();
            if (existing) {
                history.summary = existing.summary;
                history.questions = existing.questions;
                history.flashcards = existing.flashcards;
                history.status = 'COMPLETED';
                (history.metadata as any).reusedFrom = existing._id;
                (history.metadata as any).progress = 100;
                await (history as any).save();
                await this.usersService.addPoints(
                    history.userId,
                    config.points,
                    config.actionType,
                );
                return;
            }

            const responseText = await this.aiService.processExtractedText(
                config.prompt,
                combinedText,
                history.userId,
                undefined,
                { language, format: config.format },
            );

            (history.metadata as any).progress = 85;
            await (history as any).save();

            await this.finalizeMaterial(
                history,
                responseText,
                payload.type,
                config,
            );
            await this.studyJobService.updateStatus(
                jobRecord._id.toString(),
                'COMPLETED',
                { lastError: undefined },
            );
            await this.studyJobService.releaseLease(jobRecord._id.toString());
        } catch (error: any) {
            if (payload.jobId) {
                const jobRecord = await this.studyJobService.findById(
                    payload.jobId,
                );
                const maxAttempts = Number(
                    process.env.STUDY_JOB_MAX_ATTEMPTS || 3,
                );
                const nextStatus =
                    jobRecord && jobRecord.attempts >= maxAttempts
                        ? 'FAILED'
                        : 'RETRY';
                await this.studyJobService.updateStatus(payload.jobId, nextStatus, {
                    lastError: error?.message || 'Unknown error',
                });
                await this.studyJobService.releaseLease(payload.jobId);
                if (nextStatus === 'FAILED') {
                    await this.studyQueueService.enqueueDeadLetter(
                        payload,
                        error?.message || 'Unknown error',
                    );
                    history.status = 'FAILED';
                    (history.metadata as any) = {
                        ...(history.metadata || {}),
                        error: error?.message || 'Unknown error',
                    };
                    await (history as any).save();
                }
            }
            throw error;
        }
    }

    private async fetchFileFromUrl(url: string, originalname: string) {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: MAX_UPLOAD_SIZE_BYTES,
            maxBodyLength: MAX_UPLOAD_SIZE_BYTES,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
            throw new BadRequestException('File exceeds allowed size.');
        }
        const mime = response.headers['content-type'] || 'application/pdf';

        const file: Express.Multer.File = {
            buffer,
            mimetype: mime,
            originalname,
            size: buffer.length,
            fieldname: 'file',
            encoding: '7bit',
            destination: '',
            filename: originalname,
            path: '',
            stream: Readable.from(buffer),
        };

        return file;
    }

    private async processBackgroundMultiDirect(
        history: StudyHistoryDocument,
        files: Express.Multer.File[],
        combinedText: string,
        config: any,
    ) {
        try {
            const userId = history.userId;
            const language = history.language || 'en';

            // Stage 1: Initial Sync & Uploading
            (history.metadata as any).progress = 10;
            await (history as any).save();

            const uploadResult = await this.cloudinaryService.uploadFile(files[0]);
            history.fileUrl = uploadResult.secure_url;
            
            // If multiple files, store all URLs in metadata
            if (files.length > 1) {
                const allUrls = [uploadResult.secure_url];
                for (let i = 1; i < files.length; i++) {
                    const res = await this.cloudinaryService.uploadFile(files[i]);
                    allUrls.push(res.secure_url);
                }
                (history.metadata as any).fileUrls = allUrls;
            }

            (history.metadata as any).progress = 30;
            await (history as any).save();

            // Stage 2: Processing with AI
            const responseText = await this.aiService.processExtractedText(
                config.prompt,
                combinedText,
                userId,
                undefined,
                { language, format: config.format },
            );

            (history.metadata as any).progress = 80;
            await (history as any).save();

            // Stage 3: Finalization
            await this.finalizeMaterial(
                history,
                responseText,
                history.type || 'summary',
                config,
            );

            (history.metadata as any).progress = 100;
            await (history as any).save();
        } catch (error: any) {
            console.error(
                `[StudyService] Multi-direct background failure for ${history._id}:`,
                error,
            );
            history.status = 'FAILED';
            (history.metadata as any).error = error.message;
            await (history as any).save();
        }
    }

    private async processBackgroundDirect(
        history: StudyHistoryDocument,
        file: Express.Multer.File,
        config: any,
    ) {
        const { extractTextFromFile } = await import('../common/utils/text-extractor.js');
        const text = await extractTextFromFile(file);
        return this.processBackgroundMultiDirect(history, [file], text, config);
    }

    async startTextIngestion(
        userId: string,
        data: {
            text: string;
            fileName: string;
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
            lang?: string;
        },
    ) {
        // Usage Limit Check
        const limit = await this.usersService.checkUsageLimit(
            userId,
            'dailyDocs',
        );
        if (!limit.allowed) {
            throw new BadRequestException(limit.reason);
        }

        const language = await this.resolveLanguage(userId, data.lang);
        const config = this.getMaterialConfig(data.type, data.options);
        const docHash = this.aiService.generateHash(data.text);

        // Cache lookup
        const textCacheQuery: any = this.buildLanguageCacheQuery(
            {
                docHash,
                type: data.type,
                status: 'COMPLETED',
            },
            language,
        );
        if (data.type === 'quiz' && config.quizOptions) {
            textCacheQuery['metadata.quizOptionsHash'] =
                this.aiService.generateHash(
                    JSON.stringify(config.quizOptions),
                );
        }
        const existing = await this.studyModel.findOne(textCacheQuery).exec();
        if (existing) {
            const history = await this.create(userId, {
                fileName: data.fileName,
                type: data.type,
                summary: existing.summary,
                questions: existing.questions,
                flashcards: existing.flashcards,
                status: 'COMPLETED',
                docHash,
                language,
                metadata: { protocol: 'TEXT_CACHE_v1' },
            });
            await this.usersService.addPoints(
                userId,
                config.points,
                config.actionType,
            );
            return { success: true, jobId: history._id, status: 'COMPLETED' };
        }

        const history = await this.create(userId, {
            fileName: data.fileName,
            type: data.type,
            status: 'PROCESSING',
            docHash,
            language,
            metadata: {
                protocol: 'TEXT_INJECT_v2',
                timestamp: new Date().toISOString(),
            },
        });
        if (data.type === 'quiz' && config.quizOptions) {
            (history.metadata as any).quizOptions = config.quizOptions;
            (history.metadata as any).quizOptionsHash =
                this.aiService.generateHash(
                    JSON.stringify(config.quizOptions),
                );
        }

        this.processBackgroundText(history, data.text, config).catch((err) => {
            console.error(
                `[StudyService] Text ingestion background failure for ${history._id}:`,
                err,
            );
        });

        return {
            success: true,
            jobId: history._id,
            status: 'PROCESSING',
        };
    }

    private async processBackgroundText(
        history: StudyHistoryDocument,
        text: string,
        config: any,
    ) {
        try {
            (history.metadata as any).progress = 20;
            await (history as any).save();

            const responseText = await this.aiService.processExtractedText(
                config.prompt,
                text,
                history.userId,
                undefined,
                {
                    language: history.language || 'en',
                    format: config.format,
                },
            );

            (history.metadata as any).progress = 80;
            await (history as any).save();

            const historyType = history.type || 'summary';
            await this.finalizeMaterial(
                history,
                responseText,
                historyType,
                config,
            );
        } catch (error: any) {
            console.error(
                `[StudyService] Background text processing failed:`,
                error,
            );
            history.status = 'FAILED';
            (history.metadata as any).error = error.message;
            await (history as any).save();
        }
    }

    private async finalizeMaterial(
        history: StudyHistoryDocument,
        responseText: string,
        type: string,
        config: any,
    ) {
        let parsedData: any = responseText;
        if (type === 'flashcards' || type === 'quiz' || type === 'summary') {
            try {
                const isNotFound =
                    responseText
                        .toLowerCase()
                        .includes('not contain enough information') ||
                    responseText.toLowerCase().includes('information is missing');

                if (isNotFound && !responseText.includes('[') && !responseText.includes('{')) {
                    history.status = 'FAILED';
                    (history.metadata as any).error =
                        'The uploaded materials do not contain enough information to complete this task.';
                    await (history as any).save();
                    return;
                }

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
                console.error(
                    `[StudyService] JSON parse error for ${type}. Raw:`,
                    responseText,
                );
                throw new InternalServerErrorException(
                    `AI returned invalid JSON for ${type}`,
                );
            }
        }

        if (type === 'flashcards') history.flashcards = parsedData;
        else if (type === 'quiz') {
            let questions = Array.isArray(parsedData) ? parsedData : [];
            const quizOptions = config?.quizOptions || null;
            if (quizOptions?.questionStyle === 'mcq') {
                questions = questions.filter(
                    (q: any) =>
                        q.questionType?.toLowerCase() !== 'short_answer',
                );
            } else if (quizOptions?.questionStyle === 'short') {
                questions = questions.filter(
                    (q: any) =>
                        q.questionType?.toLowerCase() === 'short_answer',
                );
            }
            if (quizOptions?.shuffle) {
                questions = questions
                    .map((q: any) => ({ q, sort: Math.random() }))
                    .sort((a: any, b: any) => a.sort - b.sort)
                    .map((item: any) => item.q);
            }
            if (quizOptions?.count) {
                questions = questions.slice(0, quizOptions.count);
            }
            history.questions = questions;
        } else if (type === 'summary') {
            (history as any).summary = JSON.stringify(parsedData);
            (history.metadata as any) = {
                ...(history.metadata || {}),
                summaryFormat: 'json',
            };
        } else {
            (history as any).summary = parsedData;
        }

        if (!history.language) {
            history.language = 'en';
        }
        history.status = 'COMPLETED';
        (history.metadata as any).progress = 100;
        (history.metadata as any).completedAt = new Date().toISOString();

        await (history as any).save();
        await this.usersService.addPoints(
            history.userId,
            config.points,
            config.actionType,
        );
    }

    async generateMaterial(
        userId: string,
        file: Express.Multer.File,
        type: 'summary' | 'flashcards' | 'quiz' | 'study-guide',
        options?: {
            count?: number;
            difficulty?: string;
            questionStyle?: string;
            shuffle?: boolean;
        },
    ) {
        try {
            if (!file) throw new BadRequestException('File is required');

            // Usage Limit Check
            const limit = await this.usersService.checkUsageLimit(
                userId,
                'dailyDocs',
            );
            if (!limit.allowed) {
                throw new BadRequestException(limit.reason);
            }

            const language = await this.resolveLanguage(userId);
            const config = this.getMaterialConfig(type, options);

            // 1. EXTRACT HASH FIRST for Caching
            const { extractTextFromFile } =
                await import('../common/utils/text-extractor.js');
            const extractedText = await extractTextFromFile(file);
            const docHash = this.aiService.generateHash(extractedText);

            // 2. CHECK CACHE (Global wisdom reuse)
            const cacheQuery: any = this.buildLanguageCacheQuery(
                {
                    docHash,
                    type,
                    status: 'COMPLETED',
                },
                language,
            );
            if (type === 'quiz' && config.quizOptions) {
                cacheQuery['metadata.quizOptionsHash'] =
                    this.aiService.generateHash(
                        JSON.stringify(config.quizOptions),
                    );
            }
            const existing = await this.studyModel
                .findOne({
                    ...cacheQuery,
                })
                .sort({ createdAt: -1 })
                .exec();

            if (existing) {
                console.log(
                    `[StudyService] Neural Link established! Reusing existing ${type} for ${file.originalname}`,
                );

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
                    language,
                    metadata: {
                        ...existing.metadata,
                        cachedFrom: existing._id,
                        reusedAt: new Date().toISOString(),
                    },
                });

                await cachedHistory.save();
                // Add points for the new interaction
                await this.usersService.addPoints(
                    userId,
                    config.points,
                    config.actionType,
                );

                return {
                    success: true,
                    yield:
                        (cachedHistory as any).summary ||
                        cachedHistory.flashcards ||
                        cachedHistory.questions,
                    type,
                    telemetry: cachedHistory.metadata,
                    cached: true,
                };
            }

            // 3. AI GENERATION (Cache Miss)
            const history = new this.studyModel({
                userId,
                docHash,
                language,
            });

            const [responseText, uploadResult] = await Promise.all([
                this.aiService.generateFromFiles(
                    config.prompt,
                    file,
                    userId,
                    history._id.toString(),
                    { language, format: config.format },
                ),
                this.cloudinaryService.uploadFile(file).catch((err) => {
                    console.error(
                        `[StudyService] Cloudinary upload failed for ${type}:`,
                        err,
                    );
                    return null;
                }),
            ]);

            const historyData: any = {
                fileName: file.originalname,
                fileUrl:
                    uploadResult && (uploadResult as any).secure_url
                        ? (uploadResult as any).secure_url
                        : '',
                type: type === 'quiz' ? 'quiz' : type,
                status: 'COMPLETED',
                docHash,
                language,
                metadata: {
                    charCount: responseText.length,
                    timestamp: new Date().toISOString(),
                    protocol: 'DEEPLAYER_v3',
                },
            };
            if (type === 'quiz' && config.quizOptions) {
                historyData.metadata.quizOptions = config.quizOptions;
                historyData.metadata.quizOptionsHash =
                    this.aiService.generateHash(
                        JSON.stringify(config.quizOptions),
                    );
            }

            history.set(historyData);
            await this.finalizeMaterial(history, responseText, type, config);

            return {
                success: true,
                yield:
                    (history as any).summary ||
                    history.flashcards ||
                    history.questions,
                type,
                telemetry: history.metadata,
                cached: false,
            };
        } catch (error: any) {
            console.error(`[NeuralNode] ${type} generation failure:`, error);
            throw error instanceof BadRequestException ||
                error instanceof InternalServerErrorException ||
                error.status === 413
                ? error
                : new InternalServerErrorException(
                      `Neural synchronization failed for ${type}`,
                  );
        }
    }

    async getJobStatus(id: string) {
        return this.studyModel.findById(id).exec();
    }
}
