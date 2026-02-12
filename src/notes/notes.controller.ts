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
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isValidObjectId } from 'mongoose';

@Controller('api/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
    constructor(private readonly notesService: NotesService) {}

    @Get()
    async findAll(@Request() req: any) {
        try {
            const userId = req.user.userId;
            return await this.notesService.findAll(userId);
        } catch {
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
