import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HfInference } from '@huggingface/inference';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity';
import { UsersService } from '../users/users.service';
import axios from 'axios';

@Injectable()
export class AiService {
  private apiKeys: string[];
  private currentKeyIndex = 0;
  private grokKeys: string[] = [];
  private currentGrokIndex = 0;
  private groqKeys: string[] = [];
  private currentGroqIndex = 0;
  private hf: HfInference;
  private userRateLimits = new Map<string, { count: number, resetAt: number }>();

  private readonly MAX_OUTPUT_TOKENS = 1500;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 5;
  private readonly MAX_HISTORY_MESSAGES = 10; // "Retrieve less"

  constructor(
    private configService: ConfigService,
    @InjectModel(Chat.name) private chatModel: Model<ChatDocument>,
    private usersService: UsersService,
  ) {
    const keys = this.configService.get<string>('GEMINI_API_KEYS');
    if (!keys) {
      this.apiKeys = [];
    } else {
      this.apiKeys = keys.split(',').map(key => key.trim()).filter(key => key.length > 0);
    }

    const hfKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    if (hfKey) {
      this.hf = new HfInference(hfKey);
    }

    const gKeys = this.configService.get<string>('GROK_API_KEYS');
    if (gKeys) {
      this.grokKeys = gKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }

    const groqKeysConfig = this.configService.get<string>('GROQ_API_KEYS');
    if (groqKeysConfig) {
      this.groqKeys = groqKeysConfig.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
  }

  private getNextSystemKey(): { key: string; index: number } {
    if (this.apiKeys.length === 0) return { key: '', index: -1 };
    const index = this.currentKeyIndex;
    const key = this.apiKeys[index];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return { key, index };
  }

  private getNextGrokKey(): string | null {
    if (this.grokKeys.length === 0) return null;
    const key = this.grokKeys[this.currentGrokIndex];
    this.currentGrokIndex = (this.currentGrokIndex + 1) % this.grokKeys.length;
    return key;
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
      return user?.geminiApiKey || null;
    } catch {
      return null;
    }
  }

  async getChatHistory(userId: string): Promise<ChatDocument | null> {
    try {
      if (!userId) throw new Error('UserId is required');
      const chat = await this.chatModel.findOne({ userId }).exec();
      if (chat && chat.messages.length > this.MAX_HISTORY_MESSAGES) {
        // "Retrieve less" - just get the most recent messages
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
      
      // Limit history size to prevent mongo document bloat
      if (chat.messages.length > 100) {
        chat.messages = chat.messages.slice(-100);
      }
      
      return await chat.save();
    } catch (error) {
      console.error(`[AiService] Error saving message for ${userId}:`, error);
      // We don't throw here to avoid disrupting the UI flow just for a save failure
    }
  }

  async getResponse(message: string, userId?: string): Promise<string> {
    if (userId) {
        this.checkRateLimit(userId);
        await this.usersService.checkActivityLimit(userId, 'dailyMessages');
    }
    this.currentUserId = userId || null;
    const userKey = await this.getUserKey(userId);
    const systemKeysCount = this.apiKeys.length;
    const maxAttempts = (userKey ? 1 : 0) + systemKeysCount;
    
    if (maxAttempts === 0 && this.groqKeys.length === 0 && this.grokKeys.length === 0) {
      throw new InternalServerErrorException('No AI API keys available.');
    }

    let lastError: any;
    
    // 1. Try Gemini Keys
    for (let i = 0; i < maxAttempts; i++) {
        const currentKey = (i === 0 && userKey) ? userKey : this.getNextSystemKey().key;
        if (!currentKey) continue;

        try {
          const genAI = new GoogleGenerativeAI(currentKey);
          const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: `You are Izabi, a world-class AI Learning Assistant. Use Markdown.`
          });

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig: { maxOutputTokens: this.MAX_OUTPUT_TOKENS }
          });
          const text = result.response.text();
          if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
          return text;
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          if (status === 429 || status === 403 || status === 400) continue;
          break;
        }
    }

    // 2. Try Groq Keys (Fallback)
    if (this.groqKeys.length > 0) {
      console.log('[AiService] Gemini failed, attempting Groq rotation...');
      for (let i = 0; i < this.groqKeys.length; i++) {
        const key = this.getNextGroqKey();
        if (key) {
          const response = await this.getGroqResponseByKey(message, key);
          if (response) return response;
        }
      }
    }

    // 3. Try Grok (Fallback)
    const grokResponse = await this.getGrokResponse(message);
    if (grokResponse) return grokResponse;

    // 4. Try HF (Last resort)
    const hfResponse = await this.getHuggingFaceResponse(message);
    if (hfResponse) return hfResponse;

    throw new InternalServerErrorException('All AI services are exhausted.');
  }

  private async getGroqResponseByKey(message: string, apiKey: string): Promise<string | null> {
    if (!apiKey) return null;
    try {
      const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: message }],
        max_tokens: this.MAX_OUTPUT_TOKENS
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      const content = response.data.choices[0].message.content;
      if (this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
      return content;
    } catch (error: any) {
      console.error(`[AiService] Groq Key Failure:`, error.message);
      return null;
    }
  }



  private currentUserId: string | null = null;

  private async getGrokResponse(message: string): Promise<string | null> {
    const key = this.getNextGrokKey();
    if (!key) return null;

    try {
      const response = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-beta', 
        messages: [
          { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant.' },
          { role: 'user', content: message }
        ],
        max_tokens: this.MAX_OUTPUT_TOKENS // Cap tokens
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      const content = response.data.choices[0].message.content;
      if (this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
      return content;
    } catch (error: any) {
      console.error('[AiService] Grok (xAI) Error:', error.message);
      return null;
    }
  }

  private async getHuggingFaceResponse(message: string): Promise<string | null> {
    if (!this.hf) return null;
    try {
      const model = this.configService.get<string>('HUGGINGFACE_MODEL') || 'mistralai/Mistral-7B-Instruct-v0.3';
      const response = await this.hf.chatCompletion({
        model: model,
        messages: [
          { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Provide clear, structured study materials in Markdown.' },
          { role: 'user', content: message }
        ],
        max_tokens: 2000,
      });
      const content = response.choices[0].message.content || null;
      if (content && this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
      return content;
    } catch (error: any) {
      console.error('[AiService] Hugging Face Error:', error.message);
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
    const systemKeysCount = this.apiKeys.length;
    const maxAttempts = (userKey ? 1 : 0) + systemKeysCount;
    
    let lastError: any;
    
    for (let i = 0; i < maxAttempts; i++) {
        const currentKey = (i === 0 && userKey) 
            ? userKey 
            : this.getNextSystemKey().key;

        if (!currentKey) continue;

        try {
          if (!message) throw new Error('Message is empty');
          
          const genAI = new GoogleGenerativeAI(currentKey);
          const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
          
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: `You are Izabi, a world-class AI Learning Assistant. Provide clear, structured, and engaging explanations. Use Markdown.`
          });

          const result = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig: { maxOutputTokens: this.MAX_OUTPUT_TOKENS }
          });
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            yield { data: chunkText };
          }
          if (userId) await this.usersService.incrementActivityCount(userId, 'dailyMessages');
          yield { data: '[DONE]' };
          return; // Success!
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          const errorMsg = error.message?.toLowerCase() || '';

          // Retry on 429, 403, or 400 (if key related)
          if (status === 429 || status === 403 || (status === 400 && (errorMsg.includes('key') || errorMsg.includes('invalid')))) {
            console.warn(`[AiService] Stream Key ${i+1}/${maxAttempts} failed (Status: ${status}), rotating...`);
            continue;
          }
          break;
        }
    }

    if (lastError?.status === 429 || lastError?.status === 403 || lastError?.status === 400 || lastError?.message?.includes('429')) {
         console.log('[AiService] Gemini Stream failed, attempting fallbacks...');
         
         // 1. Try Groq Stream Rotation
         if (this.groqKeys.length > 0) {
            for (let i = 0; i < this.groqKeys.length; i++) {
                const groqKey = this.getNextGroqKey();
                if (!groqKey) continue;
                try {
                    const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
                    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                        model,
                        messages: [{ role: 'user', content: message }],
                        stream: true,
                        max_tokens: this.MAX_OUTPUT_TOKENS
                    }, {
                        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
                        responseType: 'stream'
                    });

                    for await (const chunk of response.data) {
                        const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
                        for (const line of lines) {
                            if (line.includes('[DONE]')) break;
                            if (line.startsWith('data: ')) {
                                const data = JSON.parse(line.slice(6));
                                if (data.choices[0].delta.content) {
                                    yield { data: data.choices[0].delta.content };
                                }
                            }
                        }
                    }
                    if (this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
                    yield { data: '[DONE]' };
                    return;
                } catch (e: any) {
                    console.warn(`[AiService] Groq Stream Key ${i+1} failed, trying next...`);
                    continue;
                }
            }
         }

         // 2. Try Grok (xAI) Stream
         const grokKey = this.getNextGrokKey();
         if (grokKey) {
            try {
                const response = await axios.post('https://api.x.ai/v1/chat/completions', {
                    model: 'grok-beta',
                    messages: [{ role: 'user', content: message }],
                    stream: true,
                    max_tokens: this.MAX_OUTPUT_TOKENS // Cap tokens
                }, {
                    headers: { 'Authorization': `Bearer ${grokKey}`, 'Content-Type': 'application/json' },
                    responseType: 'stream'
                });

                for await (const chunk of response.data) {
                    const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
                    for (const line of lines) {
                        if (line.includes('[DONE]')) break;
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.slice(6));
                            if (data.choices[0].delta.content) {
                                yield { data: data.choices[0].delta.content };
                            }
                        }
                    }
                }
                if (this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
                yield { data: '[DONE]' };
                return;
            } catch (e: any) {
                console.error('[AiService] Grok Stream Error:', e.message);
            }
         }

         // 3. Try HF Stream
         try {
           const hfModel = this.configService.get<string>('HUGGINGFACE_MODEL') || 'mistralai/Mistral-7B-Instruct-v0.3';
           if (this.hf) {
             const hfStream = this.hf.chatCompletionStream({
               model: hfModel,
               messages: [{ role: 'user', content: message }],
               max_tokens: 2000,
             });
             for await (const chunk of hfStream) {
               if (chunk.choices[0].delta.content) {
                 yield { data: chunk.choices[0].delta.content };
               }
             }
             if (this.currentUserId) await this.usersService.incrementActivityCount(this.currentUserId, 'dailyMessages');
             yield { data: '[DONE]' };
             return;
           }
         } catch (e: any) {
            console.error('[AiService] Hugging Face Stream Error:', e.message);
         }
         
         yield { data: `[ERROR]: All AI quotas (Gemini, Groq, & HF) are full. Support us by adding your own key in the Support section!` };
    } else {
         yield { data: `[ERROR]: ${lastError?.message || 'Failed to get stream response'}` };
    }
  }

  async generateFromFiles(message: string, file: Express.Multer.File, userId?: string): Promise<string> {
    if (userId) {
        this.checkRateLimit(userId);
        await this.usersService.checkActivityLimit(userId, 'dailyDocs');
    }
    this.currentUserId = userId || null;
    const userKey = await this.getUserKey(userId);
    const systemKeysCount = this.apiKeys.length;
    const maxAttempts = (userKey ? 1 : 0) + systemKeysCount;
    
    // Chunk/Truncate: Only process first 1MB of file data to save bandwidth/tokens
    const MAX_FILE_SIZE = 1024 * 1024;
    const fileBuffer = file.buffer.length > MAX_FILE_SIZE 
        ? file.buffer.slice(0, MAX_FILE_SIZE) 
        : file.buffer;

    // Cap input message
    const msg = message.length > 2000 ? message.slice(0, 2000) + '...' : message;

    let lastError: any;
    
    for (let i = 0; i < maxAttempts; i++) {
        const currentKey = (i === 0 && userKey) 
            ? userKey 
            : this.getNextSystemKey().key;

        if (!currentKey) continue;

        try {
          
          const genAI = new GoogleGenerativeAI(currentKey);
          const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
          const model = genAI.getGenerativeModel({ model: modelName });

          const part = {
            inlineData: {
              data: fileBuffer.toString('base64'),
              mimeType: file.mimetype,
            },
          };

          const result = await model.generateContent({
             contents: [{ role: 'user', parts: [{ text: msg }, part] }],
             generationConfig: { maxOutputTokens: this.MAX_OUTPUT_TOKENS }
          });
          const response = await result.response;
          if (userId) await this.usersService.incrementActivityCount(userId, 'dailyDocs');
          return response.text();
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          const errorMsg = error.message?.toLowerCase() || '';

          // Retry on 429, 403, or 400 (if key related)
          if (status === 429 || status === 403 || (status === 400 && (errorMsg.includes('key') || errorMsg.includes('invalid')))) {
            console.warn(`[AiService] File Key ${i+1}/${maxAttempts} failed (Status: ${status}), rotating...`);
            continue;
          }
          break;
        }
    }

    if (lastError?.status === 429) {
          throw new InternalServerErrorException('All AI quotas exceeded. Add your own key in "Support Us" to continue immediately!');
    }
    throw new InternalServerErrorException(`Failed to process file with AI: ${lastError?.message || 'Processing error'}`);
  }
}
