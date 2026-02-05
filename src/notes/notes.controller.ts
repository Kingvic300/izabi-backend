import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async findAll(@Query('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      return await this.notesService.findAll(userId);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to fetch notes');
    }
  }

  @Post()
  async create(@Body() body: any) {
    try {
      const { userId, ...data } = body;
      if (!userId) throw new BadRequestException('userId is required');
      return await this.notesService.create(userId, data);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to create note');
    }
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    try {
      const { userId, ...data } = body;
      if (!userId) throw new BadRequestException('userId is required');
      return await this.notesService.update(id, userId, data);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to update note');
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      await this.notesService.remove(id, userId);
      return { success: true, message: 'Note deleted successfully' };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to delete note');
    }
  }
}
