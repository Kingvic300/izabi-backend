import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
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
  private currentGroqIndex = 0;
  private userRateLimits = new Map<string, { count: number, resetAt: number }>();
  private currentUserId: string | null = null;

  private readonly MAX_OUTPUT_TOKENS = 2500;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 5;
  private readonly MAX_HISTORY_MESSAGES = 10;

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

  private getNextGroqKey(): string | null {
    if (this.groqKeys.length === 0) return null;
    const key = this.groqKeys[this.currentGroqIndex];
    this.currentGroqIndex = (this.currentGroqIndex + 1) % this.groqKeys.length;
    return key;
  }

  private async getUserKey(userId?: string): Promise<string | null> {
    if (!userId || userId === 'default-user') return null;
    try {
      const user = await this.usersService.findOne(userId);
      return (user as any).groqApiKey || null;
    } catch {
      return null;
    }
  }

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

  private checkRateLimit(userId: string) {
    if (!userId || userId === 'default-user') return;
    
    const now = Date.now();
    const limit = this.userRateLimits.get(userId);
    
    if (!limit || now > limit.resetAt) {
      this.userRateLimits.set(userId, { count: 1, resetAt: now + this.RATE_LIMIT_WINDOW_MS });
      return;
    }
    
    if (limit.count >= this.MAX_REQUESTS_PER_WINDOW) {
      throw new InternalServerErrorException(`Rate limit exceeded. Please wait ${Math.ceil((limit.resetAt - now) / 1000)}s before your next request.`);
    }
    
    limit.count++;
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
      
      return await chat.save();
    } catch (error) {
      console.error(`[AiService] Error saving message for ${userId}:`, error);
    }
  }

  async getResponse(message: string, userId?: string): Promise<string> {
    if (userId) {
        this.checkRateLimit(userId);
        await this.usersService.checkActivityLimit(userId, 'dailyMessages');
    }
    this.currentUserId = userId || null;

    const userKey = await this.getUserKey(userId);
    const systemKey = this.getNextGroqKey();
    
    // Attempt with User Key first if available
    if (userKey) {
        const res = await this._getGroqResponseWithKey(message, userKey);
        if (res) {
            if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
            return res;
        }
    }

    // Fallback to system key
    if (systemKey) {
        const res = await this._getGroqResponseWithKey(message, systemKey);
        if (res) {
            if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
            return res;
        }
    }

    throw new InternalServerErrorException('Groq AI service is currently unavailable or exhausted.');
  }

  private async _getGroqResponseWithKey(message: string, key: string): Promise<string | null> {
    try {
      const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model, 
        messages: [
          { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Use Markdown.' },
          { role: 'user', content: message }
        ],
        max_tokens: this.MAX_OUTPUT_TOKENS
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('[AiService] Groq Error with key:', error.message);
      return null;
    }
  }

  async *getResponseStream(message: string, userId?: string) {
    if (userId) {
        try {
            this.checkRateLimit(userId);
            await this.usersService.checkActivityLimit(userId, 'dailyMessages');
        } catch (e: any) {
            yield { data: `[ERROR]: ${e.message}` };
            return;
        }
    }
    this.currentUserId = userId || null;

    const userKey = await this.getUserKey(userId);
    const systemKey = this.getNextGroqKey();
    const finalKey = userKey || systemKey;

    if (!finalKey) {
        yield { data: '[ERROR]: No Groq API keys available.' };
        return;
    }

    try {
        const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model,
            messages: [
              { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Use Markdown.' },
              { role: 'user', content: message }
            ],
            stream: true,
            max_tokens: this.MAX_OUTPUT_TOKENS
        }, {
            headers: { 'Authorization': `Bearer ${finalKey}`, 'Content-Type': 'application/json' },
            responseType: 'stream'
        });

        for await (const chunk of response.data) {
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
                    } catch (e) {
                    }
                }
            }
        }
        if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
        yield { data: '[DONE]' };
    } catch (e: any) {
        console.error('[AiService] Groq Stream Error:', e.message);
        yield { data: `[ERROR]: Groq service failure: ${e.message}` };
    }
  }

  async generateFromFiles(message: string, file: Express.Multer.File, userId?: string): Promise<string> {
    if (userId) {
      this.checkRateLimit(userId);
      await this.usersService.checkActivityLimit(userId, 'dailyDocs');
    }
    this.currentUserId = userId || null;



    try {
      const extractedText = await extractTextFromFile(file);

      // Combine prompt with extracted text
      const fullPrompt = `${message}\n\n[DOCUMENT CONTENT START]\n${extractedText}\n[DOCUMENT CONTENT END]\n\nBased on the above document content, please fulfill my request. Note: The text may appear to start or end abruptly as front/back matter has been stripped.`;

      const response = await this.getResponse(fullPrompt, userId);
      
      if (userId) {
        await this.usersService.incrementActivityCount(userId, 'dailyDocs');
      }
      
      return response;
    } catch (error: any) {
      console.error('[AiService] Error in generateFromFiles:', error.message);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error.message || 'Failed to process document and generate response');
    }
  }
}
