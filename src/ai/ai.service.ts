import { 
  Injectable, 
  InternalServerErrorException, 
  BadRequestException, 
  ServiceUnavailableException, 
  UnauthorizedException,
  PayloadTooLargeException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity';
import { UsersService } from '../users/users.service';
import axios from 'axios';
import { extractTextFromFile } from '../common/utils/text-extractor';

@Injectable()
export class AiService {
  private groqKeys: string[] = [];
  private userRateLimits = new Map<string, { count: number, resetAt: number }>();
  private currentUserId: string | null = null;

  // --- Constants for Limits and Safety ---
  private readonly MAX_OUTPUT_TOKENS = 2500;
  // Hard cap on INPUT tokens to prevent 413 or cost spikes. 
  // LLaMA contexts are often 8k or 32k, but we stick to a safe 6k limit for stability.
  private readonly MAX_INPUT_TOKENS = 6000; 
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  // Internal rate limit trigger (requests per minute per user)
  private readonly MAX_REQUESTS_PER_WINDOW = 20; 
  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_DOCUMENT_CHUNKS = 15; // Hard limit on chunks to prevent abuse

  constructor(
    private configService: ConfigService,
    @InjectModel(Chat.name) private chatModel: Model<ChatDocument>,
    private usersService: UsersService,
  ) {
    const keys = this.configService.get<string>('GROQ_API_KEYS');
    if (keys) {
      this.groqKeys = keys.split(',').map(k => k.trim()).filter(k => k.length > 0);
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
      this.userRateLimits.set(userId, { count: 1, resetAt: now + this.RATE_LIMIT_WINDOW_MS });
      return;
    }
    
    if (limit.count >= this.MAX_REQUESTS_PER_WINDOW) {
      const waitTime = Math.ceil((limit.resetAt - now) / 1000);
      throw new InternalServerErrorException(
        `System busy. Please try again in ${waitTime}s.`
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

  private estimateTotalTokens(messages: { role: string; content: string }[]): number {
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

    return [...new Set(keys)];
  }

  // --- Execution Core with Retry & Rotation ---

  private async executeWithRetry<T>(
    operation: (key: string) => Promise<T>,
    userId?: string
  ): Promise<T> {
    const keys = await this.getAvailableKeys(userId);
    
    if (keys.length === 0) {
      throw new ServiceUnavailableException('No AI processing keys available.');
    }

    let lastError: any;
    
    // Try keys sequentially
    for (const key of keys) {
      try {
        // NOTE: Rate limit check was removed from loop to avoid penalizing retries.
        // It is now the responsibility of the caller to check limits once per action.
        return await operation(key);
      } catch (error: any) {
        lastError = error;

        // --- Fatal Errors: DO NOT RETRY ---
        if (error instanceof PayloadTooLargeException || error instanceof BadRequestException) {
          throw error;
        }

        if (axios.isAxiosError(error)) {
             if (error.response?.status === 413) throw new PayloadTooLargeException('Provider rejected payload: Too Large');
             if (error.response?.status === 400) throw new BadRequestException(error.response.data || 'Bad Request');
        }

        // --- Retryable Errors ---
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        
        const isRetryable = 
          error instanceof UnauthorizedException ||
          error instanceof ServiceUnavailableException ||
          (typeof status === 'number' && (
             status === 429 ||
             status === 401 ||
             status >= 500
          ));

        if (!isRetryable) {
          throw error; 
        }

        const keySuffix = key.length > 4 ? '...' + key.slice(-4) : '***';
        console.warn(`[AiService] Key ${keySuffix} failed (${error.message}). Rotating...`);
        // Continue to next key
      }
    }

    console.error('[AiService] All keys exhausted.', lastError);
    throw new ServiceUnavailableException('AI service temporarily unavailable. Please try again later.');
  }

  private async callGroqApi(
    messages: { role: string; content: string }[], 
    key: string, 
    stream: boolean
  ) {
    const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    
    // STRICT TOKEN CHECK
    const estimatedTokens = this.estimateTotalTokens(messages);
    if (estimatedTokens > this.MAX_INPUT_TOKENS) {
        throw new PayloadTooLargeException(
            `Request exceeds token limit (${estimatedTokens}/${this.MAX_INPUT_TOKENS}). Please shorten your input or use a smaller document.`
        );
    }

    try {
      return await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model, 
        messages,
        max_tokens: this.MAX_OUTPUT_TOKENS,
        stream
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        responseType: stream ? 'stream' : 'json'
      });
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            const msg = JSON.stringify(error.response.data) || error.message;
            if (status === 413) throw new PayloadTooLargeException('Groq: Payload Too Large');
            if (status === 400) throw new BadRequestException(`Groq: Bad Request - ${msg}`);
            if (status === 401) throw new UnauthorizedException('Groq: Unauthorized Key');
            if (status === 429) throw new ServiceUnavailableException('Groq: Rate Limit Exceeded');
            if (status >= 500) throw new ServiceUnavailableException('Groq: Server Error');
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
      console.error(`[AiService] Error fetching chat history for ${userId}:`, error);
      throw new InternalServerErrorException('Failed to retrieve chat history');
    }
  }

  async saveMessage(userId: string, role: 'user' | 'assistant', content: string) {
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
    // 1. Business Logic Limit
    if (userId) {
        await this.usersService.checkActivityLimit(userId, 'dailyMessages');
        // 2. Technical Rate Limit (Count attempt once)
        this.checkRateLimit(userId);
    }
    this.currentUserId = userId || null;

    const responseContent = await this.executeWithRetry(async (key) => {
      const res = await this.callGroqApi([
          { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Use Markdown.' },
          { role: 'user', content: message }
        ], 
        key, 
        false
      );
      return res.data.choices[0].message.content;
    }, userId);

    if (userId) {
        await this.usersService.incrementActivityCount(userId, 'dailyMessages');
    }
    return responseContent;
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
          const res = await this.callGroqApi([
              { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Use Markdown.' },
              { role: 'user', content: message }
            ], 
            key, 
            true
          );
          return res.data;
       }, userId);
    } catch (e: any) {
       yield { data: `[ERROR]: Service unable to process request at this time.` };
       return;
    }

    try {
        for await (const chunk of streamResponse) {
            const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
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
                     } catch (e) { }
                }
            }
        }
        if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
        yield { data: '[DONE]' };
    } catch (e: any) {
        console.error('[AiService] Groq Stream Error:', e.message);
        // Inform user clearly that stream died in flight
        yield { data: `\n\n[SYSTEM ERROR]: Stream connection lost. Please regenerate response.` };
    }
  }

  // --- Document Logic with Token Safety ---

  private chunkText(text: string): string[] {
    // ~12k chars is approx 3-3.5k tokens, leaving room for system prompts within 6k limit
    const CHUNK_CHAR_SIZE = 12000; 
    const chunks: string[] = [];
    let currentIndex = 0;
    
    while (currentIndex < text.length) {
      let endIndex = Math.min(currentIndex + CHUNK_CHAR_SIZE, text.length);
      
      if (endIndex < text.length) {
         const lastPeriod = text.lastIndexOf('.', endIndex);
         const lastNewline = text.lastIndexOf('\n', endIndex);
         const breakPoint = Math.max(lastPeriod, lastNewline);

         if (breakPoint > currentIndex + (CHUNK_CHAR_SIZE * 0.8)) { 
             endIndex = breakPoint + 1; 
         }
      }
      
      chunks.push(text.slice(currentIndex, endIndex));
      currentIndex = endIndex;
    }
    return chunks;
  }

  async generateFromFiles(message: string, file: Express.Multer.File, userId?: string): Promise<string> {
    if (userId) {
      await this.usersService.checkActivityLimit(userId, 'dailyDocs');
      this.checkRateLimit(userId);
    }
    this.currentUserId = userId || null;

    try {
      const extractedText = await extractTextFromFile(file);
      if (!extractedText) throw new BadRequestException('No text extracted from file');

      // Reject empty or tiny nonsense
      if (extractedText.trim().length < 10) throw new BadRequestException('Document content too short.');

      let contextToUse = extractedText;
      const initialTokenEst = this.estimateTokens(extractedText);

      // Check against hard token limit
      if (initialTokenEst > (this.MAX_INPUT_TOKENS - 100)) { 
         // Sanity check: if it's absurdly large (e.g. >100k tokens), fail fast
         if (initialTokenEst > 100000) {
             throw new PayloadTooLargeException('Document is too large to process (exceeds token budget significantly).');
         }

         console.log(`[AiService] Large Doc (${initialTokenEst} tokens). Chunking...`);
         const chunks = this.chunkText(extractedText);

         // Cost/Abuse Protection: Limit chunks
         if (chunks.length > this.MAX_DOCUMENT_CHUNKS) {
             throw new PayloadTooLargeException(`Document requires too many processing steps (${chunks.length}/${this.MAX_DOCUMENT_CHUNKS}). Please use a smaller file.`);
         }

         const summaries: string[] = [];

         for (const chunk of chunks) {
            const chunkSummary = await this.executeWithRetry(async (key) => {
               const res = await this.callGroqApi([
                 { role: 'system', content: 'Summarize this section concisely.' },
                 { role: 'user', content: chunk }
               ], key, false);
               return res.data.choices[0].message.content;
            }, userId);
            summaries.push(chunkSummary);
         }
         
         contextToUse = summaries.join('\n\n');
      }

      // Final Token Check
      // We estimate formatting + message overhead + new context
      const finalEstTokens = this.estimateTokens(contextToUse) + this.estimateTokens(message) + 100;
      
      if (finalEstTokens > this.MAX_INPUT_TOKENS) {
          // Truncate safely
          const safeChars = (this.MAX_INPUT_TOKENS * 3.5) - (message.length) - 500;
          if (safeChars > 0) {
              contextToUse = contextToUse.substring(0, safeChars) + '... [Truncated]';
          }
      }

      const fullPrompt = `${message}\n\n[CONTEXT]\n${contextToUse}`;
      
      const response = await this.executeWithRetry(async (key) => {
          const res = await this.callGroqApi([
             { role: 'system', content: 'You are Izabi. Answer the user request based on the context provided.' },
             { role: 'user', content: fullPrompt }
          ], key, false);
          return res.data.choices[0].message.content;
      }, userId);

      if (userId) {
        await this.usersService.incrementActivityCount(userId, 'dailyDocs');
      }

      return response;

    } catch (error: any) {
      console.error('[AiService] generateFromFiles failed:', error.message);
      if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) throw error;
      throw new InternalServerErrorException(error.message || 'Failed to process document');
    }
  }
}
