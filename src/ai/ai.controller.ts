import { Controller, Post, Body, Sse, MessageEvent, Query, Get } from '@nestjs/common';
import { AiService } from './ai.service';
import { Observable, from } from 'rxjs';

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('history')
  async getHistory(@Query('userId') userId: string) {
    return this.aiService.getChatHistory(userId || 'default-user');
  }

  @Post('chat')
  async chat(@Body('message') message: string, @Body('userId') userId: string) {
    await this.aiService.saveMessage(userId || 'default-user', 'user', message);
    const response = await this.aiService.getResponse(message);
    await this.aiService.saveMessage(userId || 'default-user', 'assistant', response);
    return { response };
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
