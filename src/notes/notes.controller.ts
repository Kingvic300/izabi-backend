import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async findAll(@Query('userId') userId: string) {
    // If userId not provided, we'd normally get it from JWT
    // But for the frontend as it is, we might need a fallback
    return this.notesService.findAll(userId || 'default-user');
  }

  @Post()
  async create(@Body() body: any) {
    const { userId, ...data } = body;
    return this.notesService.create(userId || 'default-user', data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const { userId, ...data } = body;
    return this.notesService.update(id, userId || 'default-user', data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('userId') userId: string) {
    return this.notesService.remove(id, userId || 'default-user');
  }
}
