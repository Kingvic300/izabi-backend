import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatSession, ChatSessionSchema } from './entities/chat-session.entity';
import {
    ChatRateLimit,
    ChatRateLimitSchema,
} from './entities/chat-rate-limit.entity';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [
        AiModule,
        MongooseModule.forFeature([
            { name: ChatSession.name, schema: ChatSessionSchema },
            { name: ChatRateLimit.name, schema: ChatRateLimitSchema },
        ]),
    ],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule {}
