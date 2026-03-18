import {
    Controller,
    Get,
    Post,
    Body,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
    UseGuards,
    Req,
} from '@nestjs/common';
import { StudyService } from './study.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';

@Controller('api/study')
export class StudyController {
    constructor(
        private readonly studyService: StudyService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('history')
    async getHistory(@Req() req: any) {
        const userId = req.user.userId;
        return await this.studyService.findAll(userId);
    }

    // --- Standard Synchronous Generators ---

    @UseGuards(JwtAuthGuard)
    @Post('summarize')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async summarize(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        return this.studyService.generateMaterial(
            req.user.userId,
            file,
            'summary',
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('flashcards')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async generateFlashcards(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        return this.studyService.generateMaterial(
            req.user.userId,
            file,
            'flashcards',
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('generate-questions')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async generateQuestions(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
        @Body('numberOfQuestions') num: string,
        @Body('difficulty') difficulty?: string,
        @Body('questionStyle') questionStyle?: string,
        @Body('shuffle') shuffle?: boolean,
    ) {
        const count = parseInt(num) || 5;
        return this.studyService.generateMaterial(
            req.user.userId,
            file,
            'quiz',
            {
                count,
                difficulty,
                questionStyle,
                shuffle,
            },
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('generate-study-material')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async generateStudyMaterial(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        return this.studyService.generateMaterial(
            req.user.userId,
            file,
            'study-guide',
        );
    }

    // --- Background Ingestion (For Larger Files/Reliable Jobs) ---

    @UseGuards(JwtAuthGuard)
    @Post('ingest-direct')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async ingestDirect(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
        @Body('type') type: string,
        @Body('options') options?: string,
    ) {
        if (!file)
            throw new BadRequestException(
                'File is required for direct ingestion.',
            );

        const userId = req.user.userId;
        const parsedOptions = options ? JSON.parse(options) : {};

        return this.studyService.startDirectUpload(userId, file, {
            type: type as any,
            options: parsedOptions,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('ingest-multi-direct')
    @UseInterceptors(
        FilesInterceptor('files', 5, { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async ingestMultiDirect(
        @UploadedFiles() files: Express.Multer.File[],
        @Req() req: any,
        @Body('type') type: string,
        @Body('options') options?: string,
    ) {
        if (!files || files.length === 0)
            throw new BadRequestException(
                'At least one file is required.',
            );

        const userId = req.user.userId;
        const parsedOptions = options ? JSON.parse(options) : {};

        return this.studyService.startMultiDirectUpload(userId, files, {
            type: type as any,
            options: parsedOptions,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('history')
    async addHistory(@Body() body: any, @Req() req: any) {
        const userId = req.user.userId;
        return this.studyService.create(userId, body);
    }
}
