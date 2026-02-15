import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isValidObjectId } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';
import { extractTextFromFile } from '../common/utils/text-extractor';

@Controller('api/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
    constructor(private readonly notesService: NotesService) {}

    @Get()
    async findAll(@Request() req: any, @Query('groupId') groupId?: string) {
        try {
            const userId = req.user.userId;
            return await this.notesService.findAll(userId, groupId);
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to fetch notes');
        }
    }

    @Post()
    async create(@Request() req: any, @Body() data: any) {
        try {
            const userId = req.user.userId;
            return await this.notesService.create(userId, data);
        } catch {
            throw new BadRequestException('Failed to create note');
        }
    }

    @Post('import')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async importNote(
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File,
        @Body('title') title?: string,
        @Body('subject') subject?: string,
        @Query('preview') preview?: string,
    ) {
        try {
            if (!file) {
                throw new BadRequestException('File upload is required');
            }

            const extractedText = await extractTextFromFile(file);
            const prepared = this.notesService.prepareImportedNote(
                extractedText,
                { title, subject },
            );
            const isPreview =
                preview === 'true' || preview === '1' || preview === 'yes';

            if (isPreview) {
                return {
                    preview: true,
                    title: prepared.title,
                    subject: prepared.category || '',
                    text: prepared.rawText,
                    html: prepared.content,
                };
            }

            const userId = req.user.userId;
            return await this.notesService.createImportedNote(userId, {
                title: prepared.title,
                content: prepared.content,
                category: prepared.category,
            });
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new BadRequestException(
                error.message || 'Failed to import note',
            );
        }
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Request() req: any,
        @Body() data: any,
    ) {
        try {
            if (!isValidObjectId(id)) {
                throw new BadRequestException('Invalid note id');
            }
            const userId = req.user.userId;
            return await this.notesService.update(id, userId, data);
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new BadRequestException('Failed to update note');
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Request() req: any) {
        try {
            if (!isValidObjectId(id)) {
                throw new BadRequestException('Invalid note id');
            }
            const userId = req.user.userId;
            await this.notesService.remove(id, userId);
            return { success: true, message: 'Note deleted successfully' };
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new BadRequestException('Failed to delete note');
        }
    }
}
