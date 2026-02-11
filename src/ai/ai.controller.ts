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
} from '@nestjs/common';
import { AiService } from './ai.service';
import { UsersService } from '../users/users.service';
import { Observable, from } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
    async chat(@Body('message') message: string, @Req() req: any) {
        try {
            const userId = req.user.userId;
            if (!message) throw new BadRequestException('message is required');

            await this.usersService.checkActivityLimit(userId, 'dailyMessages');
            await this.aiService.saveMessage(userId, 'user', message);
            const response = await this.aiService.getResponse(message, userId);
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
                this.aiService.getResponseStream(message, userIdToUse),
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
}
