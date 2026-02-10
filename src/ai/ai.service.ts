import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity.js';
import { UsersService } from '../users/users.service.js';
import { VectorService } from './vector.service.js';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import * as crypto from 'crypto';
import { extractTextFromFile } from '../common/utils/text-extractor.js';

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
  private userRateLimits = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private currentUserId: string | null = null;

  // --- Constants for Limits and Safety ---
  private readonly MAX_OUTPUT_TOKENS = 4096;
  // Increased limit for larger context processing
  private readonly MAX_INPUT_TOKENS = 8000;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  // Internal rate limit trigger (requests per minute per user)
  private readonly MAX_REQUESTS_PER_WINDOW = 30;
  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_DOCUMENT_CHUNKS = 300; // Increased to 300 for textbooks

  constructor(
    private configService: ConfigService,
    @InjectModel(Chat.name) private chatModel: Model<ChatDocument>,
    private usersService: UsersService,
    private vectorService: VectorService,
  ) {
    const keys = this.configService.get<string>('GROQ_API_KEYS');
    if (keys) {
      this.groqKeys = keys
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
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

    const finalKeys = [...new Set(keys)];
    console.log(
      `[AiService] getAvailableKeys: Found ${finalKeys.length} keys.`,
    );
    return finalKeys;
  }

  // --- Execution Core with Retry & Rotation ---

  private async executeWithRetry<T>(
    operation: (key: string) => Promise<T>,
    userId?: string,
  ): Promise<T> {
    const keys = await this.getAvailableKeys(userId);

    if (keys.length === 0) {
      throw new ServiceUnavailableException('No AI processing keys available.');
    }

    let lastError: any;

    // Try keys sequentially
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        console.log(`[AiService] Attempting AI call with key index ${i}...`);
        return await operation(key);
      } catch (error: any) {
        lastError = error;

        // --- Fatal Errors: DO NOT RETRY ---
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
            throw new BadRequestException(error.response.data || 'Bad Request');
        }

        // --- Retryable Errors ---
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        const isRetryable =
          error instanceof UnauthorizedException ||
          error instanceof ServiceUnavailableException ||
          (typeof status === 'number' &&
            (status === 429 || status === 401 || status >= 500));

        if (!isRetryable) {
          throw error;
        }

        const keySuffix = key.length > 4 ? '...' + key.slice(-4) : '***';
        console.warn(
          `[AiService] Key ${keySuffix} failed (${error.message}). Rotating...`,
        );
        // Continue to next key
      }
    }

    console.error('[AiService] All keys exhausted.', lastError);
    throw new ServiceUnavailableException(
      'AI service temporarily unavailable. Please try again later.',
    );
  }

  private async callGroqApi(
    messages: { role: string; content: string }[],
    key: string,
    stream: boolean,
  ) {
    const model =
      this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';

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
      return await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          messages,
          max_tokens: this.MAX_OUTPUT_TOKENS,
          stream,
          temperature: 0.2, // Lower temperature for more consistent JSON
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          responseType: stream ? 'stream' : 'json',
          timeout: 60000, // 60s timeout for large generations
        },
      );
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const msg = JSON.stringify(error.response.data) || error.message;
        if (status === 413)
          throw new PayloadTooLargeException('Groq: Payload Too Large');
        if (status === 400)
          throw new BadRequestException(`Groq: Bad Request - ${msg}`);
        if (status === 401)
          throw new UnauthorizedException('Groq: Unauthorized Key');
        if (status === 429)
          throw new ServiceUnavailableException('Groq: Rate Limit Exceeded');
        if (status >= 500)
          throw new ServiceUnavailableException('Groq: Server Error');
      }
      throw error;
    }
  }

  // --- Public Methods ---

  async getChatHistory(userId: string): Promise<ChatDocument | null> {
    try {
      if (!userId) throw new Error('UserId is required');
      const chat = await this.chatModel.findOne({ userId }).exec();
      if (chat && chat.messages.length > this.MAX_HISTORY_MESSAGES) {
        chat.messages = chat.messages.slice(-this.MAX_HISTORY_MESSAGES);
      }
      return chat;
    } catch (error) {
      console.error(
        `[AiService] Error fetching chat history for ${userId}:`,
        error,
      );
      throw new InternalServerErrorException('Failed to retrieve chat history');
    }
  }

  async saveMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ) {
    try {
      if (!userId || !content) return;
      let chat = await this.chatModel.findOne({ userId });
      if (!chat) {
        chat = new this.chatModel({ userId, messages: [] });
      }
      chat.messages.push({ role, content, timestamp: new Date() });
      if (chat.messages.length > 100) {
        chat.messages = chat.messages.slice(-100);
      }
      await chat.save();
    } catch (error) {
      console.error(`[AiService] Error saving message for ${userId}:`, error);
    }
  }

  async clearChatHistory(userId: string): Promise<void> {
    try {
      await this.chatModel.deleteOne({ userId }).exec();
    } catch (error) {
      throw new InternalServerErrorException('Failed to clear chat history');
    }
  }

  async getResponse(message: string, userId?: string): Promise<string> {
    return this.performContextAwareChat(userId || '', message);
  }

  async *getResponseStream(message: string, userId?: string) {
    if (userId) {
      try {
        await this.usersService.checkActivityLimit(userId, 'dailyMessages');
        this.checkRateLimit(userId);
      } catch (e: any) {
        yield { data: `[ERROR]: Limit Reached: ${e.message}` };
        return;
      }
    }
    this.currentUserId = userId || null;

    let streamResponse: any;

    try {
      // Only connection phase is retried
      streamResponse = await this.executeWithRetry(async (key) => {
        const res = await this.callGroqApi(
          [
            {
              role: 'system',
              content:
                'You are Izabi, a world-class AI Learning Assistant. Use Markdown.',
            },
            { role: 'user', content: message },
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
        await this.usersService.incrementActivityCount(userId, 'dailyMessages');
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
      await this.vectorService.addDocument(userId, documentId, text, metadata);
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
  ): Promise<string> {
    if (userId) {
      await this.usersService.checkActivityLimit(userId, 'dailyMessages');
      this.checkRateLimit(userId);
    }
    this.currentUserId = userId || null;

    // 1. Retrieve relevant chunks
    console.log(`[AiService] Searching knowledge base for: "${message}"...`);
    const relevantChunks = await this.vectorService.search(
      userId,
      message,
      documentId,
      5,
    );

    let context = '';
    if (relevantChunks.length > 0) {
      context = relevantChunks.map((c) => c.content).join('\n\n---\n\n');
      console.log(
        `[AiService] Found ${relevantChunks.length} relevant chunks.`,
      );
    } else {
      console.log(`[AiService] No relevant context found.`);
    }

    // 2. Synthesize Answer
    const prompt = context
      ? `Use the following context to answer the user's question. If the answer is not in the context, say so, but try to be helpful based on the context provided.\n\n[CONTEXT]\n${context}\n\n[USER QUESTION]\n${message}`
      : message;

    console.log(
      `[AiService] Prompt prepared. length: ${prompt.length}. Entering executeWithRetry...`,
    );
    return this.executeWithRetry(async (key) => {
      const res = await this.callGroqApi(
        [
          {
            role: 'system',
            content:
              'You are Izabi. Answer efficiently and accurately using the provided context.',
          },
          { role: 'user', content: prompt },
        ],
        key,
        false,
      );
      return res.data.choices[0].message.content;
    }, userId);
  }

  // --- Document Logic with Token Safety ---

  private getChunkSize(textLength: number): number {
    if (textLength < 50000) return 18000;
    if (textLength < 300000) return 16000;
    return 14000; // textbooks, PDFs, monsters
  }

  private chunkText(text: string): string[] {
    const CHUNK_CHAR_SIZE = this.getChunkSize(text.length);
    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      let endIndex = Math.min(currentIndex + CHUNK_CHAR_SIZE, text.length);

      if (endIndex < text.length) {
        const lastPeriod = text.lastIndexOf('.', endIndex);
        const lastNewline = text.lastIndexOf('\n', endIndex);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > currentIndex + CHUNK_CHAR_SIZE * 0.8) {
          endIndex = breakPoint + 1;
        }
      }

      chunks.push(text.slice(currentIndex, endIndex));
      currentIndex = endIndex;
    }
    return chunks;
  }

  public generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  async generateFromFiles(
    message: string,
    file: Express.Multer.File,
    userId?: string,
    contextId?: string,
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
        await this.usersService.incrementActivityCount(userId, 'dailyDocs');
      }
      return response;
    } catch (error: any) {
      console.error('[AiService] generateFromFiles failed:', error.message);
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
  ): Promise<string> {
    if (userId) {
      await this.usersService.checkActivityLimit(userId, 'dailyDocs');
      this.checkRateLimit(userId);
    }
    this.currentUserId = userId || null;

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      const buffer = Buffer.from(response.data);
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
        await this.usersService.incrementActivityCount(userId, 'dailyDocs');
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
  ): Promise<string> {
    if (!extractedText) {
      throw new BadRequestException('No text extracted from file');
    }

    if (extractedText.trim().length < 3) {
      throw new BadRequestException(
        'Content too short. Please provide at least 3 characters.',
      );
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
      } catch (e) {
        console.warn('[AiService] Wisdom lookup failed:', e.message);
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

        const chunks = this.chunkText(extractedText);
        console.log(`[AiService] Chunked into ${chunks.length} parts`);

        if (chunks.length > this.MAX_DOCUMENT_CHUNKS) {
          throw new PayloadTooLargeException(
            `This document is too massive for real-time processing (${chunks.length}/${this.MAX_DOCUMENT_CHUNKS} sections). ` +
              `Please upload a smaller file or a specific chapter to get a response.`,
          );
        }

        const summaries: string[] = [];
        // OPTIMIZATION: Increased batch size from 5 to 10 for faster processing
        const BATCH_SIZE = 10;

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
                `[AiService] Batch chunk ${idx} failed:`,
                result.reason,
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
              console.error('[AiService] Wisdom caching failed:', err),
            );
        }
      }
    }

    // Final Token Check
    // We estimate formatting + message overhead + new context
    const finalEstTokens =
      this.estimateTokens(contextToUse) + this.estimateTokens(message) + 100;

    if (finalEstTokens > this.MAX_INPUT_TOKENS) {
      // Truncate safely
      const safeChars = this.MAX_INPUT_TOKENS * 3.5 - message.length - 500;
      if (safeChars > 0) {
        contextToUse = contextToUse.substring(0, safeChars) + '... [Truncated]';
      }
    }

    const fullPrompt = `${message}\n\n[CONTEXT]\n${contextToUse}`;

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

    return responseText;
  }
}
