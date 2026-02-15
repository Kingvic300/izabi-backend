import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    Request,
    UseGuards,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NoteGroupsService } from './note-groups.service';

@Controller('api/groups')
@UseGuards(JwtAuthGuard)
export class NoteGroupsController {
    constructor(private readonly noteGroupsService: NoteGroupsService) {}

    @Post()
    async create(@Request() req: any, @Body('name') name: string) {
        try {
            const userId = req.user.userId;
            return await this.noteGroupsService.create(userId, name);
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException('Failed to create group');
        }
    }

    @Get()
    async findAll(@Request() req: any) {
        try {
            const userId = req.user.userId;
            return await this.noteGroupsService.findAll(userId);
        } catch {
            throw new BadRequestException('Failed to fetch groups');
        }
    }

    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Request() req: any,
        @Body('name') name: string,
    ) {
        try {
            const userId = req.user.userId;
            return await this.noteGroupsService.update(id, userId, name);
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new BadRequestException('Failed to update group');
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Request() req: any) {
        try {
            const userId = req.user.userId;
            await this.noteGroupsService.remove(id, userId);
            return { success: true };
        } catch (error: any) {
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }
            throw new BadRequestException('Failed to delete group');
        }
    }
}
