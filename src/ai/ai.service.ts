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
  private hf: HfInference;

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
          const errorMsg = error.message?.toLowerCase() || '';
          
          // Retry on: 
          // 429 (Quota)
          // 403 (Suspended)
          // 400 (Expired/Invalid Key)
          if (status === 429 || status === 403 || (status === 400 && (errorMsg.includes('key') || errorMsg.includes('invalid')))) {
            console.warn(`[AiService] Key ${i+1}/${maxAttempts} failed (Status: ${status}), rotating...`);
            continue; 
          }
          break; 
        }
    }

    if (lastError?.status === 429 || lastError?.status === 403 || lastError?.status === 400) {
        console.log('[AiService] Gemini failed, attempting fallbacks...');
        
        // 1. Try Groq (Usually fastest/best)
        const groqResponse = await this.getGroqResponse(message);
        if (groqResponse) return groqResponse;

        // 2. Try Hugging Face
        const hfResponse = await this.getHuggingFaceResponse(message);
        if (hfResponse) return hfResponse;

        throw new InternalServerErrorException('All AI services (Gemini, Groq, HF) are currently unavailable. Please provide a working key in the Support section.');
    }
    throw new InternalServerErrorException(`AI failed to respond: ${lastError?.message || 'Internal AI error'}`);
  }

  private async getGroqResponse(message: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) return null;

    try {
      const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [
          { role: 'system', content: 'You are Izabi, a world-class AI Learning Assistant. Use Markdown.' },
          { role: 'user', content: message }
        ]
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('[AiService] Groq Error:', error.message);
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
      return response.choices[0].message.content || null;
    } catch (error: any) {
      console.error('[AiService] Hugging Face Error:', error.message);
      return null;
    }
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
         
         // Try Groq Stream first
         const groqKey = this.configService.get<string>('GROQ_API_KEY');
         if (groqKey) {
            try {
                const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model,
                    messages: [{ role: 'user', content: message }],
                    stream: true
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
                yield { data: '[DONE]' };
                return;
            } catch (e: any) {
                console.error('[AiService] Groq Stream Error:', e.message);
            }
         }

         // Try HF Stream second
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
