import {
    Controller,
    Post,
    Body,
    Sse,
    MessageEvent,
    Query,
    Get,
    BadRequestException,
    InternalServerErrorException,
    UseGuards,
    Req,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { UsersService } from '../users/users.service';
import { Observable, from } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('api/ai')
export class AiController {
    constructor(
        private readonly aiService: AiService,
        private readonly usersService: UsersService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('history')
    async getHistory(@Req() req: any) {
        try {
            const userId = req.user.userId;
            const history = await this.aiService.getChatHistory(userId);
            return { success: true, data: history };
        } catch (error: any) {
            throw new BadRequestException(
                error.message || 'Failed to fetch chat history',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('clear-history')
    async clearHistory(@Req() req: any) {
        try {
            const userId = req.user.userId;
            await this.aiService.clearChatHistory(userId);
            return { success: true, message: 'Chat history cleared' };
        } catch (error: any) {
            throw new BadRequestException(
                error.message || 'Failed to clear chat history',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('chat')
    async chat(
        @Body('message') message: string,
        @Body('documentId') documentId: string | undefined,
        @Req() req: any,
    ) {
        try {
            const userId = req.user.userId;
            if (!message) throw new BadRequestException('message is required');

            await this.usersService.checkActivityLimit(userId, 'dailyMessages');
            await this.aiService.saveMessage(userId, 'user', message);
            const response = await this.aiService.getResponse(
                message,
                userId,
                documentId,
            );
            await this.aiService.saveMessage(userId, 'assistant', response);
            await this.usersService.incrementActivityCount(
                userId,
                'dailyMessages',
            );

            return { success: true, response };
        } catch (error: any) {
            console.error('[AiController] Chat error:', error);
            throw new InternalServerErrorException(
                error.message || 'AI failed to respond',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Sse('stream')
    stream(
        @Query('message') message: string,
        @Query('documentId') documentId: string | undefined,
        @Req() req: any,
    ): Observable<MessageEvent> {
        const userId = req.user.userId;
        const userIdToUse = userId || 'default-user';

        // We'll wrap the stream to save messages on completion
        return new Observable((observer) => {
            let fullResponse = '';

            // Save user message immediately
            this.aiService.saveMessage(userIdToUse, 'user', message);

            const stream = from(
                this.aiService.getResponseStream(
                    message,
                    userIdToUse,
                    documentId,
                ),
            );
            const subscription = stream.subscribe({
                next: (event: any) => {
                    if (event.data === '[DONE]') {
                        this.aiService.saveMessage(
                            userIdToUse,
                            'assistant',
                            fullResponse,
                        );
                        observer.next({ data: '[DONE]' } as MessageEvent);
                        observer.complete();
                    } else if (event.data.startsWith('[ERROR]')) {
                        observer.next(event);
                        observer.complete();
                    } else {
                        fullResponse += event.data;
                        observer.next(event);
                    }
                },
                error: (err) => observer.error(err),
                complete: () => observer.complete(),
            });

            return () => subscription.unsubscribe();
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('upload-pdf')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
    )
    async uploadPdf(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        try {
            if (!file) {
                throw new BadRequestException('PDF file is required');
            }

            if (!file.mimetype.includes('pdf')) {
                throw new BadRequestException('Only PDF files are supported');
            }

            const userId = req.user.userId;
            const data = await this.aiService.uploadPdfForChat(userId, file);

            return {
                success: true,
                data,
                message: 'PDF uploaded and indexed for chat',
            };
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException(
                error.message || 'Failed to upload PDF',
            );
        }
    }
}
