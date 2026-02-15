import {
    BadRequestException,
    Injectable,
    TooManyRequestsException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    ChatSession,
    ChatSessionDocument,
} from './entities/chat-session.entity';
import {
    ChatRateLimit,
    ChatRateLimitDocument,
} from './entities/chat-rate-limit.entity';
import { AiService } from '../ai/ai.service';

type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class ChatService {
    private readonly MAX_CONTEXT_MESSAGES = 30;
    private readonly MAX_STORED_MESSAGES = 120;
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly MAX_REQUESTS_PER_WINDOW = 30;

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(ChatSession.name)
        private readonly chatSessionModel: Model<ChatSessionDocument>,
        @InjectModel(ChatRateLimit.name)
        private readonly chatRateLimitModel: Model<ChatRateLimitDocument>,
        private readonly aiService: AiService,
    ) {}

    async chat(
        userIdInput: string,
        messageInput: string,
        documentId?: string,
    ): Promise<string> {
        const userId = (userIdInput || '').trim();
        const message = (messageInput || '').trim();

        if (!userId) {
            throw new BadRequestException('userId is required');
        }
        if (!message) {
            throw new BadRequestException('message is required');
        }

        await this.enforceRateLimit(userId);

        const history = await this.getRecentHistory(userId);
        const systemPrompt = this.buildSystemPrompt();
        const response = await this.aiService.performContextAwareChatWithHistory(
            {
                userId,
                message,
                documentId,
                history,
                systemPrompt,
                maxHistoryMessages: this.MAX_CONTEXT_MESSAGES,
                skipUserLimits: true,
            },
        );

        await this.saveConversation(userId, message, response);
        return response;
    }

    private async enforceRateLimit(userId: string): Promise<void> {
        const now = Date.now();
        const existing = await this.chatRateLimitModel
            .findOne({ userId })
            .exec();

        if (!existing || existing.resetAt.getTime() <= now) {
            const resetAt = new Date(now + this.RATE_LIMIT_WINDOW_MS);
            await this.chatRateLimitModel.updateOne(
                { userId },
                {
                    $set: {
                        count: 1,
                        resetAt,
                        expiresAt: resetAt,
                    },
                },
                { upsert: true },
            );
            return;
        }

        if (existing.count >= this.MAX_REQUESTS_PER_WINDOW) {
            const waitSeconds = Math.ceil(
                (existing.resetAt.getTime() - now) / 1000,
            );
            throw new TooManyRequestsException(
                `Rate limit exceeded. Try again in ${waitSeconds}s.`,
            );
        }

        existing.count += 1;
        await existing.save();
    }

    private async getRecentHistory(
        userId: string,
    ): Promise<ChatHistoryMessage[]> {
        const session = await this.chatSessionModel
            .findOne({ userId })
            .lean()
            .exec();

        if (!session?.messages?.length) return [];

        const recent = session.messages.slice(-this.MAX_CONTEXT_MESSAGES);
        return recent.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
    }

    private buildSystemPrompt(): string {
        const base =
            this.configService.get<string>('CHAT_SYSTEM_PROMPT') ||
            [
                'You are a helpful, direct assistant. No fluff.',
                'You are not a brain. You only respond to the input provided in this request.',
                'You do not remember anything outside the messages you are given.',
            ].join(' ');
        const memory = this.configService.get<string>('CHAT_SYSTEM_MEMORY');
        if (!memory) return base;
        return `${base}\n\nSYSTEM MEMORY:\n${memory}`;
    }

    private async saveConversation(
        userId: string,
        userMessage: string,
        assistantMessage: string,
    ): Promise<void> {
        let session = await this.chatSessionModel.findOne({ userId }).exec();

        if (!session) {
            session = new this.chatSessionModel({ userId, messages: [] });
        }

        const now = new Date();
        session.messages.push(
            { role: 'user', content: userMessage, timestamp: now },
            { role: 'assistant', content: assistantMessage, timestamp: now },
        );

        if (session.messages.length > this.MAX_STORED_MESSAGES) {
            session.messages = session.messages.slice(
                -this.MAX_STORED_MESSAGES,
            );
        }

        await session.save();
    }
}
