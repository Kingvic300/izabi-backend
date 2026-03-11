import {
    Injectable,
    InternalServerErrorException,
    BadRequestException,
    ServiceUnavailableException,
    UnauthorizedException,
    PayloadTooLargeException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity.js';
import { UsersService } from '../users/users.service.js';
import { VectorService } from './vector.service.js';
import { AiCacheService } from './ai-cache.service.js';
import { generateHash } from '../common/utils/text-cache.utils.js';
import { chunkTextBySize } from '../common/utils/text-chunk.utils.js';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';
import {
    IZABI_APP_CONTEXT,
    IZABI_APP_CONTEXT_VERSION,
} from './app-context.js';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { extractTextFromFile } from '../common/utils/text-extractor.js';
import { v4 as uuidv4 } from 'uuid';

type AiResponseFormat = 'text' | 'markdown' | 'json';


interface AiResponseOptions {
    language?: string;
    format?: AiResponseFormat;
    disableLanguage?: boolean;
    systemPrompt?: string;
}

interface ChatHistoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

// Configure global retry for all external API calls (Groq, File Fetching)
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 429,
});

@Injectable()
export class AiService {
    private groqKeys: string[] = [];
    private readonly keyHealth = new Map<
        string,
        { failures: number; successes: number; cooldownUntil: number }
    >();
    private readonly keyMetrics = new Map<string, { success: number; failure: number }>();
    private rrIndex = 0;
    private userRateLimits = new Map<
        string,
        { count: number; resetAt: number }
    >();
    private currentUserId: string | null = null;
    private readonly logger = new Logger(AiService.name);

    // --- Constants for Limits and Safety ---
    private readonly MAX_OUTPUT_TOKENS = 4096;
    // Increased limit for larger context processing
    private readonly MAX_INPUT_TOKENS = 8000;
    private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
    // Internal rate limit trigger (requests per minute per user)
    private readonly MAX_REQUESTS_PER_WINDOW = 30;
    private readonly MAX_HISTORY_MESSAGES = 10;
    private readonly MAX_PROMPTS_PER_SESSION = 100;
    private readonly MAX_MESSAGES_PER_SESSION = 200;
    private readonly MAX_DOCUMENT_CHUNKS = 300; // Increased to 300 for textbooks
    private readonly backoffBaseMs = 500;
    private readonly backoffCapMs = 12_000;
    private readonly APP_CONTEXT_DOCUMENT_ID = 'izabi-app-context';
    private readonly appContextHash = generateHash(IZABI_APP_CONTEXT);
    private readonly appContextEnsured = new Set<string>();

    constructor(
        private configService: ConfigService,
        @InjectModel(Chat.name) private chatModel: Model<ChatDocument>,
        private usersService: UsersService,
        private vectorService: VectorService,
        private aiCacheService: AiCacheService,
    ) {
        const keys = this.configService.get<string>('GROQ_API_KEYS');
        if (keys) {
            this.groqKeys = keys
                .split(',')
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
        }
    }

    private async ensureAppContextIndexed(userId: string) {
        const resolvedUserId = (userId || '').trim();
        if (!resolvedUserId) return;
        if (this.appContextEnsured.has(resolvedUserId)) return;

        try {
            await this.vectorService.ensureDocument(
                resolvedUserId,
                this.APP_CONTEXT_DOCUMENT_ID,
                IZABI_APP_CONTEXT,
                {
                    source: 'izabi-app-context',
                    version: IZABI_APP_CONTEXT_VERSION,
                    contentHash: this.appContextHash,
                    indexedAt: new Date().toISOString(),
                },
            );
            this.appContextEnsured.add(resolvedUserId);
        } catch (error: any) {
            this.logger.warn(
                `[AiService] App context indexing skipped: ${this.summarizeError(error)}`,
            );
        }
    }

    // --- Rate Limiting (Technical) ---

    /**
     * Checks strict technical rate limits.
     * Decrements quota ONLY once per user action attempt.
     */
    private checkRateLimit(userId: string) {
        if (!userId || userId === 'default-user') return;

        const now = Date.now();
        const limit = this.userRateLimits.get(userId);

        if (!limit || now > limit.resetAt) {
            this.userRateLimits.set(userId, {
                count: 1,
                resetAt: now + this.RATE_LIMIT_WINDOW_MS,
            });
            return;
        }

        if (limit.count >= this.MAX_REQUESTS_PER_WINDOW) {
            const waitTime = Math.ceil((limit.resetAt - now) / 1000);
            throw new InternalServerErrorException(
                `System busy. Please try again in ${waitTime}s.`,
            );
        }

        limit.count++;
    }

    // --- Token Estimation ---

    // Keep logs compact and never leak request headers/body in error dumps.
    private summarizeError(error: any): string {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status ?? 'NA';
            const code = error.code ?? 'NA';
            const message = error.message ?? 'Axios error';
            return `AxiosError(status=${status}, code=${code}, message=${message})`;
        }

        if (error instanceof Error) {
            return `${error.name}: ${error.message}`;
        }

        if (typeof error === 'string') {
            return error;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    private normalizeLanguage(language?: string): string | null {
        const cleaned = (language || '').trim();
        if (!cleaned) return null;
        const normalized = cleaned.toLowerCase();
        if (
            normalized === 'en' ||
            normalized === 'english' ||
            normalized.startsWith('en-')
        ) {
            return 'en';
        }
        return normalized;
    }

    private async resolveLanguage(
        userId?: string,
        options?: AiResponseOptions,
    ): Promise<string | null> {
        if (options?.disableLanguage) return null;
        if (options?.language) return this.normalizeLanguage(options.language);
        if (!userId) return null;
        try {
            const user = await this.usersService.findOne(userId);
            return this.normalizeLanguage((user as any).preferredLanguage);
        } catch {
            return null;
        }
    }

    private applyLanguageInstruction(
        prompt: string,
        language: string | null,
        format?: AiResponseFormat,
    ): string {
        if (!language) return prompt;
        const lowered = language.toLowerCase();
        if (
            lowered === 'en' ||
            lowered === 'english' ||
            lowered.startsWith('en-')
        ) {
            return prompt;
        }

        const isJson = format === 'json' || /\bjson\b/i.test(prompt);
        const rules = [
            'LANGUAGE RULES:',
            `- Respond in ${language}.`,
            '- Preserve technical terms, names, and formulas.',
        ];
        if (isJson) {
            rules.push(
                '- Keep all JSON keys and structure exactly as specified in English; translate only the text values.',
            );
        }

        return `${prompt}\n\n${rules.join('\n')}`;
    }

    /**
     * Estimates token usage for LLaMA-style models.
     * Simple heuristic: ~3.5 characters per token + protocol overhead.
     */
    private estimateTokens(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / 3.5);
    }

    private estimateTotalTokens(
        messages: { role: string; content: string }[],
    ): number {
        let total = 0;
        for (const msg of messages) {
            // Per-message overhead (role, brackets, etc.) ~= 4 tokens
            total += 4;
            total += this.estimateTokens(msg.content);
        }
        // Reply overhead
        total += 3;
        return total;
    }

    private buildMessagesWithHistory(params: {
        history: ChatHistoryMessage[];
        prompt: string;
        systemPrompt: string;
        maxHistoryMessages: number;
        maxInputTokens?: number;
    }): { role: string; content: string }[] {
        const maxInputTokens = params.maxInputTokens ?? this.MAX_INPUT_TOKENS;
        const boundedHistory = (params.history || []).slice(
            -params.maxHistoryMessages,
        );

        const build = (history: ChatHistoryMessage[]) => [
            { role: 'system', content: params.systemPrompt },
            ...history,
            { role: 'user', content: params.prompt },
        ];

        let historyToUse = boundedHistory;
        let messages = build(historyToUse);

        while (
            historyToUse.length > 0 &&
            this.estimateTotalTokens(messages) > maxInputTokens
        ) {
            historyToUse = historyToUse.slice(1);
            messages = build(historyToUse);
        }

        if (this.estimateTotalTokens(messages) > maxInputTokens) {
            throw new PayloadTooLargeException(
                'Request exceeds token limit after trimming history. Please shorten your input.',
            );
        }

        return messages;
    }

    private async exponentialSleep(attempt: number) {
        const delay = Math.min(
            this.backoffBaseMs * Math.pow(2, attempt),
            this.backoffCapMs,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // --- Key Management ---

    private async getAvailableKeys(userId?: string): Promise<string[]> {
        const keys: string[] = [];

        // 1. User Key (Priority)
        if (userId && userId !== 'default-user') {
            try {
                const user = await this.usersService.findOne(userId);
                if ((user as any).groqApiKey) {
                    keys.push((user as any).groqApiKey);
                }
            } catch (e) {
                // Ignore user lookup fail
            }
        }

        // 2. System Keys
        if (this.groqKeys.length > 0) {
            keys.push(...this.groqKeys);
        }

        // Round-robin start offset for fairness
        if (keys.length > 1) {
            const offset = this.rrIndex % keys.length;
            const rotated = keys.slice(offset).concat(keys.slice(0, offset));
            return rotated.filter((k) => this.isKeyHealthy(k));
        }

        return keys.filter((k) => this.isKeyHealthy(k));
    }

    private isKeyHealthy(key: string): boolean {
        const health = this.keyHealth.get(key);
        if (!health) return true;
        return Date.now() >= health.cooldownUntil;
    }

    // --- Execution Core with Retry & Rotation ---

    private async executeWithRetry<T>(
        operation: (key: string) => Promise<T>,
        userId?: string,
    ): Promise<T> {
        const keys = await this.getAvailableKeys(userId);

        if (keys.length === 0) {
            throw new ServiceUnavailableException(
                'No AI processing keys available.',
            );
        }

        let lastError: any;
        this.rrIndex = (this.rrIndex + 1) % keys.length;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keySuffix = key.length > 4 ? '...' + key.slice(-4) : '***';
            try {
                this.logger.log(`[AiService] Using key ${i + 1}/${keys.length} (${keySuffix})`);
                const result = await operation(key);
                this.markKeySuccess(key);
                return result;
            } catch (error: any) {
                lastError = error;
                this.markKeyFailure(key, error);

                if (
                    error instanceof PayloadTooLargeException ||
                    error instanceof BadRequestException
                ) {
                    throw error;
                }

                if (axios.isAxiosError(error)) {
                    if (error.response?.status === 413)
                        throw new PayloadTooLargeException(
                            'Provider rejected payload: Too Large',
                        );
                    if (error.response?.status === 400)
                        throw new BadRequestException(
                            error.response.data || 'Bad Request',
                        );
                }

                const status = axios.isAxiosError(error)
                    ? error.response?.status
                    : undefined;
                const axiosCode = axios.isAxiosError(error)
                    ? (error.code || '').toUpperCase()
                    : '';
                const axiosMessage = axios.isAxiosError(error)
                    ? (error.message || '').toLowerCase()
                    : '';
                const isTimeoutError =
                    axiosCode === 'ECONNABORTED' ||
                    axiosCode === 'ETIMEDOUT' ||
                    axiosMessage.includes('timeout');
                const isNetworkError = [
                    'ERR_NETWORK',
                    'ECONNRESET',
                    'ECONNREFUSED',
                    'EAI_AGAIN',
                    'ENOTFOUND',
                ].includes(axiosCode);

                const isRetryable =
                    error instanceof UnauthorizedException ||
                    error instanceof ServiceUnavailableException ||
                    isTimeoutError ||
                    isNetworkError ||
                    (typeof status === 'number' &&
                        (status === 429 || status === 401 || status >= 500));

                if (!isRetryable) {
                    throw error;
                }

                this.logger.warn(
                    `[AiService] Key ${keySuffix} failed (${error.message}). Rotating...`,
                );

                // Exponential backoff before next key to avoid herd on provider
                await this.exponentialSleep(i);
            }
        }

        this.logger.error('[AiService] All keys exhausted.', lastError);
        throw new ServiceUnavailableException(
            'AI service temporarily unavailable. Please try again later.',
        );
    }

    private markKeySuccess(key: string) {
        const health = this.keyHealth.get(key) ?? {
            failures: 0,
            successes: 0,
            cooldownUntil: 0,
        };
        health.successes += 1;
        health.failures = 0;
        health.cooldownUntil = 0;
        this.keyHealth.set(key, health);

        const metrics = this.keyMetrics.get(key) ?? { success: 0, failure: 0 };
        metrics.success += 1;
        this.keyMetrics.set(key, metrics);
    }

    private markKeyFailure(key: string, error: any) {
        const health = this.keyHealth.get(key) ?? {
            failures: 0,
            successes: 0,
            cooldownUntil: 0,
        };
        health.failures += 1;

        // cool down on repeated failures or explicit rate limits
        const isRateLimit = axios.isAxiosError(error) && error.response?.status === 429;
        const isAuth = axios.isAxiosError(error) && error.response?.status === 401;
        const backoffMs = isRateLimit ? 60_000 : isAuth ? 5 * 60_000 : 10_000 * health.failures;
        health.cooldownUntil = Date.now() + Math.min(backoffMs, 10 * 60_000);
        this.keyHealth.set(key, health);

        const metrics = this.keyMetrics.get(key) ?? { success: 0, failure: 0 };
        metrics.failure += 1;
        this.keyMetrics.set(key, metrics);
    }

    // Exposed for monitoring dashboards / future endpoints
    getKeyMetrics() {
        return Array.from(this.keyMetrics.entries()).map(
            ([key, counts]) => ({
                keySuffix: key.length > 4 ? '...' + key.slice(-4) : '***',
                success: counts.success,
                failure: counts.failure,
                cooldownUntil: this.keyHealth.get(key)?.cooldownUntil ?? 0,
            }),
        );
    }

    private async callGroqApi(
        messages: { role: string; content: string }[],
        key: string,
        stream: boolean,
    ) {
        const model =
            this.configService.get<string>('GROQ_MODEL') ||
            'llama-3.3-70b-versatile';

        // STRICT TOKEN CHECK
        const estimatedTokens = this.estimateTotalTokens(messages);
        if (estimatedTokens > this.MAX_INPUT_TOKENS) {
            throw new PayloadTooLargeException(
                `Request exceeds token limit (${estimatedTokens}/${this.MAX_INPUT_TOKENS}). Please shorten your input or use a smaller document.`,
            );
        }

        try {
            console.log(
                `[AiService] Calling Groq API (Model: ${model}, Tokens: ${estimatedTokens})...`,
            );
            const requestConfig: any = {
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                responseType: stream ? 'stream' : 'json',
                timeout: 60000, // 60s timeout for large generations
                // Do not retry the same key internally; let executeWithRetry rotate keys.
                'axios-retry': { retries: 0 },
            };
            return await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model,
                    messages,
                    max_tokens: this.MAX_OUTPUT_TOKENS,
                    stream,
                    temperature: 0.2, // Lower temperature for more consistent JSON
                },
                requestConfig,
            );
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const msg =
                    JSON.stringify(error.response.data) || error.message;
                if (status === 413)
                    throw new PayloadTooLargeException(
                        'Groq: Payload Too Large',
                    );
                if (status === 400)
                    throw new BadRequestException(`Groq: Bad Request - ${msg}`);
                if (status === 401)
                    throw new UnauthorizedException('Groq: Unauthorized Key');
                if (status === 429)
                    throw new ServiceUnavailableException(
                        'Groq: Rate Limit Exceeded',
                    );
                if (status >= 500)
                    throw new ServiceUnavailableException('Groq: Server Error');
            }

            if (axios.isAxiosError(error)) {
                const code = (error.code || '').toUpperCase();
                const isNetworkOrTimeout =
                    !error.response ||
                    code === 'ECONNABORTED' ||
                    code === 'ETIMEDOUT' ||
                    code === 'ERR_NETWORK' ||
                    code === 'ECONNRESET' ||
                    code === 'ECONNREFUSED' ||
                    code === 'EAI_AGAIN' ||
                    code === 'ENOTFOUND';

                if (isNetworkOrTimeout) {
                    throw new ServiceUnavailableException(
                        'Groq: Timeout/Network Error',
                    );
                }
            }

            throw error;
        }
    }

    // --- Public Methods ---

    async getChatHistory(userId: string): Promise<ChatDocument | null> {
        try {
            if (!userId) throw new Error('UserId is required');
            const chat = await this.getOrCreateChatSession(userId);
            return chat;
        } catch (error: any) {
            console.error(
                `[AiService] Error fetching chat history for ${userId}:`,
                error,
            );
            throw new InternalServerErrorException(
                'Failed to retrieve chat history',
            );
        }
    }

    async getChatSessions(userId: string) {
        await this.ensureLegacySession(userId);
        const sessions = await this.chatModel
            .find({ userId })
            .sort({ updatedAt: -1, createdAt: -1 })
            .select('sessionId title promptCount createdAt updatedAt messages')
            .slice('messages', -2)
            .lean()
            .exec();

        return sessions.map((session) => {
            const messages = session.messages || [];
            const lastAssistant = [...messages]
                .reverse()
                .find((m: any) => m?.role === 'assistant');
            const lastUser = [...messages]
                .reverse()
                .find((m: any) => m?.role === 'user');

            return {
                sessionId: session.sessionId,
                title: session.title,
                promptCount: session.promptCount || 0,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                lastUserMessage: lastUser
                    ? {
                          role: lastUser.role,
                          content: lastUser.content,
                          timestamp: lastUser.timestamp,
                      }
                    : null,
                lastAssistantMessage: lastAssistant
                    ? {
                          role: lastAssistant.role,
                          content: lastAssistant.content,
                          timestamp: lastAssistant.timestamp,
                      }
                    : null,
                lastMessage: session.messages?.[0]
                    ? {
                          role: session.messages[0].role,
                          content: session.messages[0].content,
                          timestamp: session.messages[0].timestamp,
                      }
                    : null,
            };
        });
    }

    async createChatSession(userId: string, title?: string) {
        const sessionId = uuidv4();
        const chat = new this.chatModel({
            userId,
            sessionId,
            title,
            promptCount: 0,
            messages: [],
        });
        await chat.save();
        return chat;
    }

    async getChatHistoryForSession(
        userId: string,
        sessionId?: string,
    ): Promise<ChatDocument | null> {
        try {
            if (!userId) throw new Error('UserId is required');
            const chat = await this.getOrCreateChatSession(userId, sessionId);
            return chat;
        } catch (error: any) {
            console.error(
                `[AiService] Error fetching chat history for ${userId}:`,
                error,
            );
            throw new InternalServerErrorException(
                'Failed to retrieve chat history',
            );
        }
    }

    async saveMessage(
        userId: string,
        role: 'user' | 'assistant',
        content: string,
        sessionId?: string,
    ) {
        try {
            if (!userId || !content) return;
            const chat = await this.getOrCreateChatSession(userId, sessionId);

            if (role === 'user') {
                if (chat.promptCount >= this.MAX_PROMPTS_PER_SESSION) {
                    throw new BadRequestException(
                        `This chat has reached ${this.MAX_PROMPTS_PER_SESSION} prompts. Start a new chat.`,
                    );
                }
                chat.promptCount = (chat.promptCount || 0) + 1;
                if (!chat.title) {
                    chat.title = content.trim().slice(0, 60);
                }
            }

            chat.messages.push({ role, content, timestamp: new Date() });
            if (chat.messages.length > this.MAX_MESSAGES_PER_SESSION) {
                chat.messages = chat.messages.slice(-this.MAX_MESSAGES_PER_SESSION);
            }
            await chat.save();
            return chat.sessionId;
        } catch (error: any) {
            console.error(
                `[AiService] Error saving message for ${userId}:`,
                error,
            );
            if (error instanceof BadRequestException) throw error;
        }
    }

    async clearChatHistory(userId: string, sessionId?: string): Promise<void> {
        try {
            if (sessionId) {
                await this.chatModel
                    .deleteOne({ userId, sessionId })
                    .exec();
                return;
            }
            await this.chatModel.deleteMany({ userId }).exec();
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to clear chat history',
            );
        }
    }

    private async ensureLegacySession(userId: string) {
        const legacy = await this.chatModel
            .findOne({ userId, sessionId: { $exists: false } })
            .exec();
        if (!legacy) return;
        legacy.sessionId = `legacy-${legacy._id.toString()}`;
        if (!legacy.title) legacy.title = 'Previous chat';
        this.ensurePromptCount(legacy);
        await legacy.save();
    }

    private async getOrCreateChatSession(
        userId: string,
        sessionId?: string,
    ): Promise<ChatDocument> {
        await this.ensureLegacySession(userId);

        if (sessionId) {
            const existing = await this.chatModel
                .findOne({ userId, sessionId })
                .exec();
            if (existing) {
                this.ensurePromptCount(existing);
                return existing;
            }
            throw new NotFoundException('Chat session not found');
        }

        const latest = await this.chatModel
            .findOne({ userId })
            .sort({ updatedAt: -1, createdAt: -1 })
            .exec();
        if (latest) {
            this.ensurePromptCount(latest);
            return latest;
        }

        return this.createChatSession(userId);
    }

    private ensurePromptCount(chat: ChatDocument) {
        if (typeof chat.promptCount === 'number') return;
        chat.promptCount = chat.messages?.filter(
            (m: any) => m.role === 'user',
        ).length;
    }

    async getResponse(
        message: string,
        userId?: string,
        documentId?: string,
        options?: AiResponseOptions,
    ): Promise<string> {
        return this.performContextAwareChat(
            userId || '',
            message,
            documentId,
            options,
        );
    }

    async performContextAwareChatWithHistory(params: {
        userId: string;
        message: string;
        history?: ChatHistoryMessage[];
        documentId?: string;
        options?: AiResponseOptions;
        systemPrompt?: string;
        maxHistoryMessages?: number;
        maxInputTokens?: number;
        skipUserLimits?: boolean;
    }): Promise<string> {
        const {
            userId,
            message,
            history = [],
            documentId,
            options,
            systemPrompt,
            maxHistoryMessages = this.MAX_HISTORY_MESSAGES,
            maxInputTokens,
            skipUserLimits,
        } = params;

        if (userId && !skipUserLimits) {
            await this.usersService.checkActivityLimit(
                userId,
                'dailyMessages',
            );
            this.checkRateLimit(userId);
        }

        const prompt = await this.buildContextAwarePrompt(
            userId,
            message,
            documentId,
        );
        const language = await this.resolveLanguage(userId, options);
        const finalPrompt = this.applyLanguageInstruction(
            prompt,
            language,
            options?.format,
        );

        const messages = this.buildMessagesWithHistory({
            history,
            prompt: finalPrompt,
            systemPrompt:
                systemPrompt ||
                `You are an Academic AI assistant designed to answer questions strictly using provided study materials.
RULES:
1. Use ONLY the information contained in the provided Context.
2. Synthesize multiple context sections logically.
3. If the answer is not supported, respond exactly: "The uploaded materials do not contain enough information to answer this."
4. No outside knowledge or facts.
5. Cite sources using their document label in parentheses (e.g., (Document Name)) after relevant statements.
6. Prioritize accuracy over creativity.`,
            maxHistoryMessages,
            maxInputTokens,
        });

        return this.executeWithRetry(async (key) => {
            const res = await this.callGroqApi(messages, key, false);
            return res.data.choices[0].message.content;
        }, userId);
    }

    async *getResponseStream(
        message: string,
        userId?: string,
        documentId?: string,
        options?: AiResponseOptions,
    ) {
        if (userId) {
            try {
                await this.usersService.checkActivityLimit(
                    userId,
                    'dailyMessages',
                );
                this.checkRateLimit(userId);
            } catch (e: any) {
                yield { data: `[ERROR]: Limit Reached: ${e.message}` };
                return;
            }
        }
        this.currentUserId = userId || null;

        let streamResponse: any;

        try {
            const prompt = await this.buildContextAwarePrompt(
                userId || '',
                message,
                documentId,
            );
            const language = await this.resolveLanguage(userId, options);
            const finalPrompt = this.applyLanguageInstruction(
                prompt,
                language,
                options?.format,
            );

            // Only connection phase is retried
            streamResponse = await this.executeWithRetry(async (key) => {
                const res = await this.callGroqApi(
                    [
                        {
                            role: 'system',
                            content:
                                'You are Izabi, a world-class Academic AI Assistant. You answer questions strictly based on the provided context. If information is missing, you state: "The uploaded materials do not contain enough information to answer this." Do not use outside knowledge. Cite sources per chunk label.',
                        },
                        { role: 'user', content: finalPrompt },
                    ],
                    key,
                    true,
                );
                return res.data;
            }, userId);
        } catch (e: any) {
            yield {
                data: `[ERROR]: Service unable to process request at this time.`,
            };
            return;
        }

        try {
            for await (const chunk of streamResponse) {
                const lines = chunk
                    .toString()
                    .split('\n')
                    .filter((line: string) => line.trim() !== '');
                for (const line of lines) {
                    if (line.includes('[DONE]')) break;
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') break;
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.choices[0].delta.content) {
                                yield { data: data.choices[0].delta.content };
                            }
                        } catch (e) {}
                    }
                }
            }
            if (userId)
                await this.usersService.incrementActivityCount(
                    userId,
                    'dailyMessages',
                );
            yield { data: '[DONE]' };
        } catch (e: any) {
            console.error('[AiService] Groq Stream Error:', e.message);
            // Inform user clearly that stream died in flight
            yield {
                data: `\n\n[SYSTEM ERROR]: Stream connection lost. Please regenerate response.`,
            };
        }
    }

    // --- Document Logic with Token Safety ---

    // --- RAG & Knowledge Base Integration ---

    /**
     * Ingests text into the vector store for future retrieval.
     * This enables "Chat with Document" and semantic search features.
     */
    async ingestText(
        userId: string,
        documentId: string,
        text: string,
        metadata: any = {},
    ) {
        try {
            console.log(
                `[AiService] Ingesting document ${documentId} for user ${userId}...`,
            );
            await this.vectorService.addDocument(
                userId,
                documentId,
                text,
                metadata,
            );
        } catch (e) {
            console.error(`[AiService] Ingestion failed for ${documentId}:`, e);
            // Non-blocking: don't fail the main request if ingestion fails
        }
    }

    /**
     * RAG-enhanced chat: Retrieves relevant context before answering.
     */
    async performContextAwareChat(
        userId: string,
        message: string,
        documentId?: string,
        options?: AiResponseOptions,
    ): Promise<string> {
        if (userId) {
            await this.usersService.checkActivityLimit(userId, 'dailyMessages');
            this.checkRateLimit(userId);
        }
        this.currentUserId = userId || null;

        const prompt = await this.buildContextAwarePrompt(
            userId,
            message,
            documentId,
        );
        const language = await this.resolveLanguage(userId, options);
        const finalPrompt = this.applyLanguageInstruction(
            prompt,
            language,
            options?.format,
        );

        console.log(
            `[AiService] Prompt prepared. length: ${prompt.length}. Entering executeWithRetry...`,
        );
        return this.executeWithRetry(async (key) => {
            const systemPrompt = options?.systemPrompt ||
                'You are an Academic AI assistant. Answer strictly based on the provided context sections. If the answer is not in the context, say "The uploaded materials do not contain enough information to answer this." Cite your sources (Document Label).';
            const res = await this.callGroqApi(
                [
                    {
                        role: 'system',
                        content: systemPrompt,
                    },
                    { role: 'user', content: finalPrompt },
                ],
                key,
                false,
            );
            return res.data.choices[0].message.content;
        }, userId);
    }

    private async buildContextAwarePrompt(
        userId: string,
        message: string,
        documentId?: string,
    ): Promise<string> {
        const trimmedMessage = (message || '').trim();
        if (trimmedMessage.length < 5) {
            return trimmedMessage || message;
        }

        await this.ensureAppContextIndexed(userId);

        // 1. Retrieve relevant chunks
        console.log(
            `[AiService] Searching knowledge base for: "${message}"...`,
        );
        let relevantChunks: any[] = [];
        try {
            const queryVector = await this.vectorService.getEmbedding(message);
            const searchFilter = documentId && documentId.includes(',')
                ? { $in: documentId.split(',').map(id => id.trim()).filter(id => id.length > 0) }
                : documentId;

            const primaryChunks = await this.vectorService.searchWithVector(
                userId,
                queryVector,
                searchFilter as any,
                5,
            );
            const appChunks =
                documentId === this.APP_CONTEXT_DOCUMENT_ID
                    ? []
                    : await this.vectorService.searchWithVector(
                          userId,
                          queryVector,
                          this.APP_CONTEXT_DOCUMENT_ID,
                          4,
                      );

            const seen = new Set<string>();
            const combined = [...primaryChunks, ...appChunks];
            const deduped: any[] = [];
            for (const chunk of combined) {
                const key = String(chunk?._id ?? chunk?.content ?? '');
                if (!key || seen.has(key)) continue;
                seen.add(key);
                deduped.push(chunk);
            }

            deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            relevantChunks = deduped.slice(0, 6);
        } catch (error: any) {
            this.logger.warn(
                `[AiService] Vector search fallback: ${this.summarizeError(error)}`,
            );
            relevantChunks = [];
            try {
                relevantChunks = await this.vectorService.search(
                    userId,
                    message,
                    documentId,
                    5,
                );
            } catch (innerError: any) {
                this.logger.warn(
                    `[AiService] Vector search failed: ${this.summarizeError(innerError)}`,
                );
            }
        }

        let context = '';
        if (relevantChunks.length > 0) {
            context = relevantChunks
                .map(
                    (c) =>
                        `[[${c.documentId || 'context'}]]\n${c.content || ''}`,
                )
                .join('\n\n---\n\n');
            console.log(
                `[AiService] Found ${relevantChunks.length} relevant chunks.`,
            );
        } else {
            console.log(`[AiService] No relevant context found.`);
        }

        return context
            ? `Evaluate the provided context and answer the user's question.
RULES:
- Use ONLY the provided context.
- Cite sources using their document labels in parentheses.
- If the context doesn't answer the question, return: "The uploaded materials do not contain enough information to answer this."
- If the question is about using the Izabi app, use the [izabi-app-context] sections to give step-by-step instructions.

Context:
${context}

User Question:
${message}`
            : message;
    }

    async uploadFileForChat(userId: string, file: Express.Multer.File) {
        const extractedText = await extractTextFromFile(file);
        const contentHash = this.generateHash(extractedText);
        const fileExt = file.originalname.split('.').pop() || 'tmp';
        const documentId = `doc-${contentHash.slice(0, 20)}-${fileExt}`;

        await this.vectorService.addDocument(userId, documentId, extractedText, {
            source: 'pdf-upload',
            filename: file.originalname,
            mime: file.mimetype,
            contentHash,
            uploadedAt: new Date().toISOString(),
        });

        return {
            documentId,
            fileName: file.originalname,
            contentHash,
            charactersIndexed: extractedText.length,
        };
    }

    public generateHash(text: string): string {
        return generateHash(text);
    }

    async generateFromFiles(
        message: string,
        file: Express.Multer.File,
        userId?: string,
        contextId?: string,
        options?: AiResponseOptions,
    ): Promise<string> {
        if (userId) {
            await this.usersService.checkActivityLimit(userId, 'dailyDocs');
            this.checkRateLimit(userId);
        }
        this.currentUserId = userId || null;

        try {
            const extractedText = await extractTextFromFile(file);
            const contentHash = this.generateHash(extractedText);

            const response = await this.processExtractedText(
                message,
                extractedText,
                userId,
                contentHash,
                options,
            );

            // Auto-ingest for future RAG queries if contextId is provided (Post-processing)
            if (userId && contextId) {
                this.ingestText(userId, contextId, extractedText, {
                    source: 'upload',
                    filename: file.originalname,
                    mime: file.mimetype,
                    contentHash,
                }).catch((err) =>
                    console.error(
                        '[AiService] Background ingestion silenced error:',
                        err,
                    ),
                );
            }

            if (userId) {
                await this.usersService.incrementActivityCount(
                    userId,
                    'dailyDocs',
                );
            }
            return response;
        } catch (error: any) {
            console.error(
                '[AiService] generateFromFiles failed:',
                error.message,
            );
            if (
                error instanceof BadRequestException ||
                error instanceof PayloadTooLargeException
            )
                throw error;
            throw new InternalServerErrorException(
                error.message || 'Failed to process document',
            );
        }
    }

    // HOW: Fetches file from remote storage (Cloudinary) and processes it
    // WHY: Essential for background processing of large 300MB+ files to avoid Render timeouts
    async generateFromUrl(
        message: string,
        url: string,
        userId?: string,
        contextId?: string,
        options?: AiResponseOptions,
    ): Promise<string> {
        if (userId) {
            await this.usersService.checkActivityLimit(userId, 'dailyDocs');
            this.checkRateLimit(userId);
        }
        this.currentUserId = userId || null;

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: MAX_UPLOAD_SIZE_BYTES,
                maxBodyLength: MAX_UPLOAD_SIZE_BYTES,
                validateStatus: (status) => status >= 200 && status < 300,
            });
            const buffer = Buffer.from(response.data);
            if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
                throw new PayloadTooLargeException('File exceeds allowed size.');
            }
            const mime = response.headers['content-type'] || 'application/pdf';

            const mockFile: any = {
                buffer,
                mimetype: mime,
                originalname: url.split('/').pop() || 'document',
            };

            const extractedText = await extractTextFromFile(mockFile);
            const contentHash = this.generateHash(extractedText);

            const responseText = await this.processExtractedText(
                message,
                extractedText,
                userId,
                contentHash,
                options,
            );

            // Auto-ingest for future RAG queries (Post-processing)
            if (userId && contextId) {
                this.ingestText(userId, contextId, extractedText, {
                    source: 'url',
                    url: url,
                    contentHash,
                }).catch((err) =>
                    console.error(
                        '[AiService] Background ingestion silenced error:',
                        err,
                    ),
                );
            }

            if (userId) {
                await this.usersService.incrementActivityCount(
                    userId,
                    'dailyDocs',
                );
            }
            return responseText;
        } catch (error: any) {
            console.error('[AiService] generateFromUrl failed:', error.message);
            if (
                error instanceof BadRequestException ||
                error instanceof PayloadTooLargeException
            )
                throw error;
            throw new InternalServerErrorException(
                error.message || 'Failed to process document from URL',
            );
        }
    }

    async processExtractedText(
        message: string,
        extractedText: string,
        userId?: string,
        docHash?: string,
        options?: AiResponseOptions,
    ): Promise<string> {
        if (!extractedText) {
            throw new BadRequestException('No text extracted from file');
        }

        if (extractedText.trim().length < 3) {
            throw new BadRequestException(
                'Content too short. Please provide at least 3 characters.',
            );
        }

        const language = await this.resolveLanguage(userId, options);
        const messageWithLanguage = this.applyLanguageInstruction(
            message,
            language,
            options?.format,
        );

        const userScope = userId || 'system';
        const { normalizedText, textHash, promptHash } =
            this.aiCacheService.buildCacheKey(
                extractedText,
                messageWithLanguage,
            );

        // 0. Exact cache hit (hash)
        const exactCached = await this.aiCacheService.findExact(
            userScope,
            textHash,
            promptHash,
        );
        if (exactCached) {
            this.logger.log(
                `[AiService] Cache hit (exact) for ${textHash.slice(0, 8)}...`,
            );
            return exactCached.aiOutput;
        }

        // 0b. Similarity cache hit (optional)
        const similarity = await this.aiCacheService.findSimilar(
            userScope,
            promptHash,
            normalizedText,
        );
        if (similarity.match) {
            this.logger.log(
                `[AiService] Cache hit (similarity=${similarity.match.score.toFixed(
                    3,
                )}) for ${textHash.slice(0, 8)}...`,
            );
            return similarity.match.doc.aiOutput;
        }

        let contextToUse = extractedText;
        let cacheHit = false;

        // 1. Check Neural Wisdom Cache (Persistent Memory)
        if (docHash) {
            try {
                // Find stored master wisdom for this specific content hash
                const existingCache = await this.chatModel.db
                    .model('KnowledgeBase')
                    .findOne({
                        documentId: docHash,
                        'metadata.isMaster': true,
                    })
                    .exec();

                if (existingCache) {
                    console.log(
                        `[AiService] Neural Cache Hit! Reusing wisdom for content ${docHash.substring(0, 8)}...`,
                    );
                    contextToUse = existingCache.content;
                    cacheHit = true;
                }
            } catch (error: any) {
                console.warn(
                    '[AiService] Wisdom lookup failed:',
                    error.message,
                );
            }
        }

        if (!cacheHit) {
            const initialTokenEst = this.estimateTokens(extractedText);

            // Treat this as a HARD per-request ceiling, not a dream
            const SAFE_INPUT_TOKENS = 8000;

            if (initialTokenEst > SAFE_INPUT_TOKENS) {
                console.log(
                    `[AiService] Large Doc (${initialTokenEst} tokens). Performing Initial Intelligence Mapping...`,
                );

                const chunks = chunkTextBySize(extractedText);
                console.log(`[AiService] Chunked into ${chunks.length} parts`);

                if (chunks.length > this.MAX_DOCUMENT_CHUNKS) {
                    throw new PayloadTooLargeException(
                        `This document is too massive for real-time processing (${chunks.length}/${this.MAX_DOCUMENT_CHUNKS} sections). ` +
                            `Please upload a smaller file or a specific chapter to get a response.`,
                    );
                }

                const summaries: string[] = [];
                // Keep concurrency moderate so AI batch jobs don't degrade overall API responsiveness.
                const BATCH_SIZE = 4;

                for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                    const batch = chunks.slice(i, i + BATCH_SIZE);
                    console.log(
                        `[AiService] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
                            chunks.length / BATCH_SIZE,
                        )} (${batch.length} chunks)`,
                    );

                    const batchPromises = batch.map((chunk, index) =>
                        this.executeWithRetry(async (key) => {
                            const res = await this.callGroqApi(
                                [
                                    {
                                        role: 'system',
                                        content:
                                            'Act as a curriculum mapper. Summarize this section by extracting: 1. Core definitions 2. Key formulas/data 3. Essential logical flow. Do not use generic filler words.',
                                    },
                                    { role: 'user', content: chunk },
                                ],
                                key,
                                false,
                            );
                            return res.data.choices[0].message.content;
                        }, userId),
                    );

                    // Wait for current batch to complete
                    const results = await Promise.allSettled(batchPromises);

                    results.forEach((result, idx) => {
                        if (result.status === 'fulfilled') {
                            summaries.push(result.value);
                        } else {
                            console.warn(
                                `[AiService] Batch chunk ${idx} failed: ${this.summarizeError(
                                    result.reason,
                                )}`,
                            );
                        }
                    });
                }

                if (summaries.length === 0) {
                    throw new InternalServerErrorException(
                        'Neural mapping failed: All processing attempts exhausted.',
                    );
                }

                contextToUse = summaries
                    .map((s, i) => `[Segment ${i + 1} Wisdom]:\n${s}`)
                    .join('\n\n');

                // 2. Store in Neural Cache for future reuse
                if (docHash) {
                    this.chatModel.db
                        .model('KnowledgeBase')
                        .create({
                            userId: userId || 'system',
                            documentId: docHash,
                            content: contextToUse,
                            vector: new Array(384).fill(0), // Dummy vector
                            metadata: {
                                isMaster: true,
                                originalSize: extractedText.length,
                                createdAt: new Date(),
                            },
                        })
                        .catch((err) =>
                            console.error(
                                '[AiService] Wisdom caching failed:',
                                err,
                            ),
                        );
                }
            }
        }

        // Final Token Check
        // We estimate formatting + message overhead + new context
        const finalEstTokens =
            this.estimateTokens(contextToUse) +
            this.estimateTokens(message) +
            100;

        if (finalEstTokens > this.MAX_INPUT_TOKENS) {
            // Truncate safely
            const safeChars =
                this.MAX_INPUT_TOKENS * 3.5 - message.length - 500;
            if (safeChars > 0) {
                contextToUse =
                    contextToUse.substring(0, safeChars) + '... [Truncated]';
            }
        }

        const fullPrompt = `${messageWithLanguage}\n\n[CONTEXT]\n${contextToUse}`;

        const responseText = await this.executeWithRetry(async (key) => {
            const res = await this.callGroqApi(
                [
                    {
                        role: 'system',
                        content:
                            'You are Izabi. Answer the user request based on the context provided.',
                    },
                    { role: 'user', content: fullPrompt },
                ],
                key,
                false,
            );
            return res.data.choices[0].message.content;
        }, userId);

        this.aiCacheService.store(
            userScope,
            textHash,
            promptHash,
            normalizedText,
            responseText,
            {
                docHash,
                source: 'processExtractedText',
            },
        ).catch((error) =>
            this.logger.warn(
                `[AiService] Cache write failed: ${this.summarizeError(error)}`,
            ),
        );

        return responseText;
    }

    // Lightweight summarization entry used by queue workers
    async summarizeText(
        text: string,
        userId?: string,
        meta: Record<string, any> = {},
        options?: AiResponseOptions,
    ): Promise<string> {
        const prompt = `Summarize the following content for quick review. Keep it concise, bullet if helpful.
Return Markdown with these sections:
## Summary
## Key Points
## Knowledge Diagram (use a mermaid flowchart TB with <= 10 nodes, short labels, fenced with \`\`\`mermaid)
## Sources (3-5 bullets; each bullet includes a short quote <= 18 words plus a brief context label)
Do not invent external sources or links. Use only the provided content.
\n\n${text}`;
        const language = await this.resolveLanguage(userId, options);
        const promptWithLanguage = this.applyLanguageInstruction(
            prompt,
            language,
            options?.format,
        );
        return this.executeWithRetry(async (key) => {
            const res = await this.callGroqApi(
                [
                    {
                        role: 'system',
                        content:
                            'You are a concise academic summarizer. Keep key points, keep under 200 words unless asked otherwise.',
                    },
                    { role: 'user', content: promptWithLanguage },
                ],
                key,
                false,
            );
            return res.data.choices[0].message.content;
        }, userId);
    }
}
