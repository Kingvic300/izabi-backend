import { Controller, Post, Body, Sse, MessageEvent, Query, Get, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AiService } from './ai.service';
import { Observable, from } from 'rxjs';

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('history')
  async getHistory(@Query('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      const history = await this.aiService.getChatHistory(userId);
      return { success: true, data: history };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to fetch chat history');
    }
  }

  @Post('chat')
  async chat(@Body('message') message: string, @Body('userId') userId: string) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      if (!message) throw new BadRequestException('message is required');

      await this.aiService.saveMessage(userId, 'user', message);
      const response = await this.aiService.getResponse(message);
      await this.aiService.saveMessage(userId, 'assistant', response);
      
      return { success: true, response };
    } catch (error: any) {
      console.error('[AiController] Chat error:', error);
      throw new InternalServerErrorException(error.message || 'AI failed to respond');
    }
  }

  @Sse('stream')
  stream(@Query('message') message: string, @Query('userId') userId: string): Observable<MessageEvent> {
    const userIdToUse = userId || 'default-user';
    
    // We'll wrap the stream to save messages on completion
    return new Observable(observer => {
      let fullResponse = '';
      
      // Save user message immediately
      this.aiService.saveMessage(userIdToUse, 'user', message);
      
      const stream = from(this.aiService.getResponseStream(message));
      const subscription = stream.subscribe({
        next: (event: any) => {
          if (event.data === '[DONE]') {
            this.aiService.saveMessage(userIdToUse, 'assistant', fullResponse);
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
