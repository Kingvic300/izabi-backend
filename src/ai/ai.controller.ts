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
    UploadedFiles,
    Param,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { UsersService } from '../users/users.service';
import { Observable, from } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';
import { AiQueueService } from './ai.queue.service';

@Controller('api/ai')
export class AiController {
    constructor(
        private readonly aiService: AiService,
        private readonly usersService: UsersService,
        private readonly aiQueueService: AiQueueService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('history')
    async getHistory(
        @Req() req: any,
        @Query('sessionId') sessionId?: string,
    ) {
        try {
            const userId = req.user.userId;
            const history = sessionId
                ? await this.aiService.getChatHistoryForSession(
                      userId,
                      sessionId,
                  )
                : await this.aiService.getChatHistory(userId);
            return { success: true, data: history };
        } catch (error: any) {
            throw new BadRequestException(
                error.message || 'Failed to fetch chat history',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('history/session')
    async getHistoryForSession(
        @Req() req: any,
        @Query('sessionId') sessionId?: string,
    ) {
        try {
            const userId = req.user.userId;
            const history = await this.aiService.getChatHistoryForSession(
                userId,
                sessionId,
            );
            return { success: true, data: history };
        } catch (error: any) {
            throw new BadRequestException(
                error.message || 'Failed to fetch chat history',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('sessions')
    async getSessions(@Req() req: any) {
        const userId = req.user.userId;
        const sessions = await this.aiService.getChatSessions(userId);
        return { success: true, data: sessions };
    }

    @UseGuards(JwtAuthGuard)
    @Post('sessions')
    async createSession(@Req() req: any) {
        const userId = req.user.userId;
        const session = await this.aiService.createChatSession(userId);
        return {
            success: true,
            data: {
                sessionId: session.sessionId,
                title: session.title,
                promptCount: session.promptCount || 0,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            },
        };
    }

    @UseGuards(JwtAuthGuard)
    @Post('clear-history')
    async clearHistory(
        @Req() req: any,
        @Body('sessionId') sessionId?: string,
    ) {
        try {
            const userId = req.user.userId;
            await this.aiService.clearChatHistory(userId, sessionId);
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
        @Body('sessionId') sessionId: string | undefined,
        @Req() req: any,
    ) {
        try {
            const userId = req.user.userId;
            if (!message) throw new BadRequestException('message is required');

            await this.usersService.checkActivityLimit(userId, 'dailyMessages');
            const activeSessionId = await this.aiService.saveMessage(
                userId,
                'user',
                message,
                sessionId,
            );
            const response = await this.aiService.getResponse(
                message,
                userId,
                documentId,
                { format: 'markdown' },
            );
            await this.aiService.saveMessage(
                userId,
                'assistant',
                response,
                activeSessionId,
            );
            await this.usersService.incrementActivityCount(
                userId,
                'dailyMessages',
            );

            return { success: true, response, sessionId: activeSessionId };
        } catch (error: any) {
            console.error('[AiController] Chat error:', error);
            throw new InternalServerErrorException(
                error.message || 'AI failed to respond',
            );
        }
    }

    @UseGuards(JwtAuthGuard)
    @UseGuards(JwtAuthGuard)
    @Post('ask-context')
    async askContext(
        @Body('question') question: string,
        @Body('context') context: string,
        @Body('sourceTitle') sourceTitle: string | undefined,
        @Body('sourceUrl') sourceUrl: string | undefined,
        @Req() req: any,
    ) {
        const userId = req.user.userId;
        if (!question || !context) {
            throw new BadRequestException(
                'question and context are required',
            );
        }

        const answer = await this.aiService.answerFromExternalContext(
            userId,
            question,
            context,
        );
        await this.usersService.incrementActivityCount(
            userId,
            'dailyMessages',
        );

        return {
            success: true,
            answer,
            source: { title: sourceTitle, url: sourceUrl },
        };
    }

    @Post('summarize')
    async enqueueSummary(@Body('text') text: string, @Req() req: any) {
        const userId = req.user.userId;
        const job = await this.aiQueueService.enqueueSummarization(userId, text, {
            priority: 0,
        });

        return {
            success: true,
            jobId: job._id?.toString?.() ?? job._id,
            status: job.status,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Get('jobs/:id')
    async getJob(@Param('id') id: string, @Req() req: any) {
        const job = await this.aiQueueService.getJob(id);
        if (!job || job.userId !== req.user.userId) {
            throw new BadRequestException('Job not found');
        }
        return {
            success: true,
            status: job.status,
            result: job.status === 'completed' ? job.result : undefined,
            error: job.status === 'failed' ? job.error : undefined,
            attempts: job.attempts,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Sse('stream')
    stream(
        @Query('message') message: string,
        @Query('documentId') documentId: string | undefined,
        @Query('sessionId') sessionId: string | undefined,
        @Req() req: any,
    ): Observable<MessageEvent> {
        const userId = req.user.userId;
        const userIdToUse = userId || 'default-user';

        // We'll wrap the stream to save messages on completion
        return new Observable((observer) => {
            let fullResponse = '';
            let subscription: any = null;
            let cancelled = false;

            // Save user message immediately
            this.aiService
                .saveMessage(userIdToUse, 'user', message, sessionId)
                .then((activeSessionId) => {
                    if (cancelled) return;
                    const stream = from(
                        this.aiService.getResponseStream(
                            message,
                            userIdToUse,
                            documentId,
                            { format: 'markdown' },
                        ),
                    );
                    subscription = stream.subscribe({
                        next: (event: any) => {
                            if (event.data === '[DONE]') {
                                this.aiService.saveMessage(
                                    userIdToUse,
                                    'assistant',
                                    fullResponse,
                                    activeSessionId,
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
                })
                .catch((err) => observer.error(err));

            return () => {
                cancelled = true;
                if (subscription) subscription.unsubscribe();
            };
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('upload-files')
    @UseInterceptors(
        FilesInterceptor('files', 5, {
            limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
        }),
    )
    async uploadFiles(
        @UploadedFiles() files: Express.Multer.File[],
        @Req() req: any,
    ) {
        try {
            if (!files || files.length === 0) {
                throw new BadRequestException('At least one file is required');
            }

            if (files.length > 5) {
                throw new BadRequestException('Maximum 5 files allowed');
            }

            const userId = req.user.userId;
            const results = await Promise.all(
                files.map((file) => this.aiService.uploadFileForChat(userId, file)),
            );

            return {
                success: true,
                data: results,
                message: `${files.length} file(s) uploaded and indexed for chat`,
            };
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException(
                error.message || 'Failed to upload files',
            );
        }
    }

    // Maintain backward compatibility for a while
    @UseGuards(JwtAuthGuard)
    @Post('upload-pdf')
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
    )
    async uploadPdf(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
        try {
            if (!file) {
                throw new BadRequestException('File is required');
            }

            const userId = req.user.userId;
            const data = await this.aiService.uploadFileForChat(userId, file);

            return {
                success: true,
                data,
                message: 'File uploaded and indexed for chat',
            };
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException(
                error.message || 'Failed to upload file',
            );
        }
    }
}
