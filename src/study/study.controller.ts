import { Controller, Get, Post, Body, Query, Param, UseInterceptors, UploadedFile, BadRequestException, InternalServerErrorException, UseGuards, Req } from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { VoiceService } from './voice.service';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { STUDY_PROMPTS } from './study.prompts';
import { IngestTextDto } from './dto/ingest-text.dto';

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
        const userId = req.user.userId;
        return await this.studyService.findAll(userId);
    }

    @Get('leaderboard')
    async getLeaderboard(@Query('userId') userId?: string) {
        const leaderboard = await this.usersService.getLeaderboard(userId);
        return {
            success: true,
            data: leaderboard
        };
    }

    // --- Standard Synchronous Generators ---

    @UseGuards(JwtAuthGuard)
    @Post('summarize')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    async summarize(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        return this.studyService.generateMaterial(req.user.userId, file, 'summary');
    }

    @UseGuards(JwtAuthGuard)
    @Post('flashcards')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    async generateFlashcards(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        return this.studyService.generateMaterial(req.user.userId, file, 'flashcards');
    }

    @UseGuards(JwtAuthGuard)
    @Post('generate-questions')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
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
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    async generateStudyMaterial(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        return this.studyService.generateMaterial(req.user.userId, file, 'study-guide');
    }

    // --- Background Ingestion (For Larger Files/Reliable Jobs) ---

    @UseGuards(JwtAuthGuard)
    @Post('ingest-direct')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    async ingestDirect(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
        @Body('type') type: string,
        @Body('options') options?: string,
    ) {
        if (!file) throw new BadRequestException('File is required for direct ingestion.');
        
        const userId = req.user.userId;
        const parsedOptions = options ? JSON.parse(options) : {};
        
        return this.studyService.startDirectUpload(userId, file, { 
            type: type as any, 
            options: parsedOptions 
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('ingest-text')
    async ingestText(@Body() data: IngestTextDto, @Req() req: any) {
        const userId = req.user.userId;
        return this.studyService.startTextIngestion(userId, data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('job-status/:jobId')
    async getJobStatus(@Param('jobId') jobId: string) {
        const job = await this.studyService.getJobStatus(jobId);
        if (!job) {
            throw new BadRequestException('Job not found');
        }
        return {
            success: true,
            data: {
                status: job.status,
                type: job.type,
                fileName: job.fileName,
                result: job.status === 'COMPLETED' ? {
                    summary: (job as any).summary,
                    flashcards: job.flashcards,
                    questions: job.questions
                } : null,
                error: job.status === 'FAILED' ? (job.metadata as any)?.error : null
            }
        };
    }

    /**
     * PDF Analysis Endpoint - Detects if PDF needs splitting
     * Returns split suggestions instead of processing immediately
     */
    @UseGuards(JwtAuthGuard)
    @Post('analyze-pdf')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    async analyzePDF(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        if (file.mimetype !== 'application/pdf') {
            throw new BadRequestException('Only PDF files can be analyzed for splitting');
        }

        const { analyzePDFForSplitting } = await import('../common/utils/pdf-splitter.js');
        const analysis = await analyzePDFForSplitting(file);

        if (!analysis.needsSplitting) {
            return {
                success: true,
                needsSplitting: false,
                pageCount: analysis.pageCount,
                estimatedChars: analysis.estimatedChars,
                message: 'Document size is optimal. You can proceed with processing.'
            };
        }

        // Store file temporarily for later split processing
        // Upload to Cloudinary for reference
        const uploadResult = await this.cloudinaryService.uploadFile(file);

        return {
            success: true,
            needsSplitting: true,
            pageCount: analysis.pageCount,
            estimatedChars: analysis.estimatedChars,
            fileSizeMB: analysis.fileSizeMB,
            reason: analysis.reason,
            suggestions: analysis.suggestions,
            fileUrl: uploadResult.secure_url,
            fileId: uploadResult.public_id,
            message: analysis.reason
        };
    }

    /**
     * Process specific page range from a PDF
     */
    @UseGuards(JwtAuthGuard)
    @Post('process-pdf-section')
    async processPDFSection(
        @Body() body: {
            fileUrl: string;
            pageStart: number;
            pageEnd: number;
            sectionTitle?: string;
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
        },
        @Req() req: any
    ) {
        const { fileUrl, pageStart, pageEnd, sectionTitle, type, options } = body;

        if (!fileUrl || !pageStart || !pageEnd) {
            throw new BadRequestException('File URL and page range are required');
        }

        // Download file from Cloudinary
        const axios = (await import('axios')).default;
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        const file: Express.Multer.File = {
            buffer,
            originalname: sectionTitle || `pages-${pageStart}-${pageEnd}.pdf`,
            mimetype: 'application/pdf',
            size: buffer.length,
        } as any;

        // Extract specific page range
        const { extractTextFromPageRange } = await import('../common/utils/pdf-splitter.js');
        const extractedText = await extractTextFromPageRange(file, pageStart, pageEnd);

        // Process as text ingestion
        return this.studyService.startTextIngestion(req.user.userId, {
            text: extractedText,
            fileName: sectionTitle || `Pages ${pageStart}-${pageEnd}`,
            type,
            options
        });
    }

    // --- Neural Voice System ---

    @UseGuards(JwtAuthGuard)
    @Post('generate-voice')
    async generateVoice(
        @Body('text') text: string, 
        @Body('lang') lang: string, 
        @Body('isPidgin') isPidgin: boolean,
        @Req() req: any
    ) {
        const userId = req.user.userId;
        if (!text) throw new BadRequestException('Text is required');
        
        let processedText = text;
        
        // Handle Pidgin Translation if requested
        if (isPidgin) {
            processedText = await this.aiService.getResponse(STUDY_PROMPTS.PIDGIN_TRANSLATION(text), userId);
        }

        // Clean Markdown artifacts (#, *, `) before sending to TTS
        const cleanText = processedText.replace(/[#*`]/g, '').trim();
        const voiceUrl = await this.voiceService.generateVoice(cleanText, lang || 'en');

        return { 
            success: true, 
            voiceUrl, 
            text: processedText 
        };
    }

    // --- Utility ---

    @UseGuards(JwtAuthGuard)
    @Get('upload-signature')
    async getSignature() {
        return this.cloudinaryService.generateSignature();
    }

    @UseGuards(JwtAuthGuard)
    @Post('history')
    async addHistory(@Body() body: any, @Req() req: any) {
        const userId = req.user.userId;
        return this.studyService.create(userId, body);
    }
}