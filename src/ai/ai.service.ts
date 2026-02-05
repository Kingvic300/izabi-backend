import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AiService {
  private apiKeys: string[];
  private currentKeyIndex = 0;

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
  }

  private getNextSystemKey(): { key: string; index: number } {
    if (this.apiKeys.length === 0) return { key: '', index: -1 };
    const index = this.currentKeyIndex;
    const key = this.apiKeys[index];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return { key, index };
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
      return await this.chatModel.findOne({ userId }).exec();
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
    const userKey = await this.getUserKey(userId);
    const systemKeysCount = this.apiKeys.length;
    const maxAttempts = (userKey ? 1 : 0) + systemKeysCount;
    
    if (maxAttempts === 0) {
      throw new InternalServerErrorException('No Gemini API keys available. Please contribute one in the "Support Us" center!');
    }

    let lastError: any;
    
    for (let i = 0; i < maxAttempts; i++) {
        // Try user key on first attempt if it exists
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
            systemInstruction: `You are Izabi, a world-class AI Learning Assistant. Transform complex information into high-retention study materials. Concise, professional, and encouraging. Use Markdown.`
          });

          const result = await model.generateContent(message);
          const response = await result.response;
          return response.text();
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          if (status === 429) {
            console.warn(`[AiService] Key ${i+1}/${maxAttempts} hit quota limit, rotating...`);
            continue; 
          }
          break; 
        }
    }

    if (lastError?.status === 429) {
        throw new InternalServerErrorException('All available API quotas are currently full. To bypass this, adding your own free API key in the Support section usually works instantly!');
    }
    throw new InternalServerErrorException(`AI failed to respond: ${lastError?.message || 'Internal AI error'}`);
  }

  async *getResponseStream(message: string, userId?: string) {
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

          const result = await model.generateContentStream(message);
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            yield { data: chunkText };
          }
          yield { data: '[DONE]' };
          return; // Success!
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          if (status === 429) {
            console.warn(`[AiService] Stream Key ${i+1}/${maxAttempts} hit quota limit, rotating...`);
            continue;
          }
          break;
        }
    }

    if (lastError?.status === 429 || lastError?.message?.includes('429')) {
         yield { data: `[ERROR]: All AI quotas are full. Support us by adding your own key in the Support section!` };
    } else {
         yield { data: `[ERROR]: ${lastError?.message || 'Failed to get stream response'}` };
    }
  }

  async generateFromFiles(message: string, file: Express.Multer.File, userId?: string): Promise<string> {
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
          if (!file) throw new Error('File buffer is missing');
          
          const genAI = new GoogleGenerativeAI(currentKey);
          const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
          const model = genAI.getGenerativeModel({ model: modelName });

          const part = {
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: file.mimetype,
            },
          };

          const result = await model.generateContent([message, part]);
          const response = await result.response;
          return response.text();
        } catch (error: any) {
          lastError = error;
          const status = error.status || error.response?.status;
          if (status === 429) {
            console.warn(`[AiService] File Key ${i+1}/${maxAttempts} hit quota limit, rotating...`);
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
