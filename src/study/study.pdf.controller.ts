import {
    BadRequestException,
    Body,
    Controller,
    Post,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudyService } from './study.service';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AiService } from '../ai/ai.service';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';

@Controller('api/study')
export class StudyPdfController {
    constructor(
        private readonly studyService: StudyService,
        private readonly usersService: UsersService,
        private readonly cloudinaryService: CloudinaryService,
        private readonly aiService: AiService,
    ) {}

    /**
     * PDF Analysis Endpoint - Detects if PDF needs splitting
     * Returns split suggestions instead of processing immediately
     * OPTIMIZED: Now uses faster parallel processing
     */
    @UseGuards(JwtAuthGuard)
    @Post('analyze-pdf')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async analyzePDF(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        if (file.mimetype !== 'application/pdf') {
            throw new BadRequestException(
                'Only PDF files can be analyzed for splitting',
            );
        }

        const { analyzePDFForSplitting } =
            await import('../common/utils/pdf-splitter.js');
        const analysis = await analyzePDFForSplitting(file);

        if (!analysis.needsSplitting) {
            return {
                success: true,
                needsSplitting: false,
                pageCount: analysis.pageCount,
                estimatedChars: analysis.estimatedChars,
                message:
                    'Document size is optimal. You can proceed with processing.',
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
            message: analysis.reason,
        };
    }

    /**
     * Process specific page range from a PDF
     * OPTIMIZED: Now returns immediately with jobId for background processing
     */
    @UseGuards(JwtAuthGuard)
    @Post('process-pdf-section')
    async processPDFSection(
        @Body()
        body: {
            fileUrl: string;
            pageStart: number;
            pageEnd: number;
            sectionTitle?: string;
            type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
            options?: any;
        },
        @Req() req: any,
    ) {
        const { fileUrl, pageStart, pageEnd, sectionTitle, type, options } =
            body;

        if (!fileUrl || !pageStart || !pageEnd) {
            throw new BadRequestException(
                'File URL and page range are required',
            );
        }

        const userId = req.user.userId;
        const user = await this.usersService.findOne(userId);
        let language = (
            (user as any).preferredLanguage || 'en'
        ).toString().trim().toLowerCase();
        if (
            language === 'english' ||
            language === 'en' ||
            language.startsWith('en-')
        ) {
            language = 'en';
        }

        // Create job record immediately
        const job = await this.studyService.create(userId, {
            fileName: sectionTitle || `Pages ${pageStart}-${pageEnd}`,
            type,
            status: 'PROCESSING',
            language,
            metadata: {
                protocol: 'PDF_SECTION_ASYNC_v1',
                pageStart,
                pageEnd,
                fileUrl,
                progress: 0,
            },
        });

        // Process in background (non-blocking)
        this.processPDFSectionBackground(
            job._id.toString(),
            fileUrl,
            pageStart,
            pageEnd,
            sectionTitle,
            type,
            options,
            userId,
        ).catch((err) => {
            console.error(
                `[StudyPdfController] Background PDF section processing failed:`,
                err,
            );
        });

        return {
            success: true,
            jobId: job._id,
            status: 'PROCESSING',
            message:
                'PDF section is being processed in the background. You can check the status using the jobId or navigate to other pages.',
        };
    }

    private async processPDFSectionBackground(
        jobId: string,
        fileUrl: string,
        pageStart: number,
        pageEnd: number,
        sectionTitle: string | undefined,
        type: string,
        options: any,
        userId: string,
    ) {
        try {
            const job = await this.studyService.getJobStatus(jobId);
            if (!job) return;
            const language = job.language || 'en';

            // Update progress: downloading
            (job.metadata as any).progress = 10;
            await job.save();

            // Download file from Cloudinary
            const axios = (await import('axios')).default;
            const response = await axios.get(fileUrl, {
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

            const file: Express.Multer.File = {
                buffer,
                originalname:
                    sectionTitle || `pages-${pageStart}-${pageEnd}.pdf`,
                mimetype: 'application/pdf',
                size: buffer.length,
            } as any;

            // Update progress: extracting
            (job.metadata as any).progress = 30;
            await job.save();

            // Extract specific page range
            const { extractTextFromPageRange } =
                await import('../common/utils/pdf-splitter.js');
            const extractedText = await extractTextFromPageRange(
                file,
                pageStart,
                pageEnd,
            );

            // Update progress: processing
            (job.metadata as any).progress = 50;
            await job.save();

            // Process as text ingestion
            const config = this.studyService['getMaterialConfig'](
                type,
                options,
            );
            const responseText = await this.aiService.processExtractedText(
                config.prompt,
                extractedText,
                userId,
                undefined,
                { language, format: config.format },
            );

            // Update progress: finalizing
            (job.metadata as any).progress = 90;
            await job.save();

            // Finalize
            await this.studyService['finalizeMaterial'](
                job,
                responseText,
                type,
                config,
            );

            (job.metadata as any).progress = 100;
            await job.save();
        } catch (error: any) {
            console.error(
                `[StudyPdfController] PDF section background processing failed:`,
                error,
            );
            const job = await this.studyService.getJobStatus(jobId);
            if (job) {
                job.status = 'FAILED';
                (job.metadata as any).error = error.message;
                await job.save();
            }
        }
    }
}
