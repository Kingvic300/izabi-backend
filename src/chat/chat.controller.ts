import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat.request';

@Controller()
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @Post('chat')
    async chat(@Body() body: ChatRequestDto) {
        const response = await this.chatService.chat(
            body.userId,
            body.message,
            body.documentId,
        );
        return { success: true, response };
    }
}
