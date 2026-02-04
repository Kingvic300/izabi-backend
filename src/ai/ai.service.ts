import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from './entities/chat.entity';

@Injectable()
export class AiService {
  private apiKeys: string[];
  private currentKeyIndex = 0;

  constructor(
    private configService: ConfigService,
    @InjectModel(Chat.name) private chatModel: Model<ChatDocument>,
  ) {
    const keys = this.configService.get<string>('GEMINI_API_KEYS');
    if (!keys) {
      throw new Error('GEMINI_API_KEYS not found in environment');
    }
    this.apiKeys = keys.split(',').map(key => key.trim()).filter(key => key.length > 0);
    
    if (this.apiKeys.length === 0) {
      throw new Error('No valid Gemini API keys found');
    }
  }

  private getNextApiKey(): { key: string; index: number } {
    const index = this.currentKeyIndex;
    const key = this.apiKeys[index];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return { key, index };
  }

  async getChatHistory(userId: string): Promise<ChatDocument | null> {
    return this.chatModel.findOne({ userId }).exec();
  }

  async saveMessage(userId: string, role: 'user' | 'assistant', content: string) {
    let chat = await this.chatModel.findOne({ userId });
    if (!chat) {
      chat = new this.chatModel({ userId, messages: [] });
    }
    chat.messages.push({ role, content, timestamp: new Date() });
    return chat.save();
  }

  async getResponse(message: string): Promise<string> {
    const { key } = this.getNextApiKey();
    try {
      const genAI = new GoogleGenerativeAI(key);
      const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
      
      const systemInstruction = `
        You are Izabi, a world-class AI Learning Assistant designed specifically for students and lifelong learners. 
        Your goal is to help users understand complex concepts by breaking them down into simple, intuitive explanations.
        
        Guidelines:
        1. Tone: Encouraging, professional, and slightly witty.
        2. Formatting: Use clear headings, bullet points, and Bold text for key concepts.
        3. Structure: 
           - Start with a direct answer or a welcoming sentence.
           - Provide depth with "Why it matters" or "Real-world example" sections.
           - End with a follow-up question to keep the learner engaged.
        4. If the user provides study material, focus your answers only on that material unless asked otherwise.
        5. Use LaTeX formatting for mathematical expressions if needed.
        
        Never say you are just an AI; you are Izabi.
      `;

      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: systemInstruction
      });

      const result = await model.generateContent(message);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new InternalServerErrorException('Failed to get response from AI');
    }
  }

  async *getResponseStream(message: string) {
    const { key, index } = this.getNextApiKey();
    try {
      const genAI = new GoogleGenerativeAI(key);
      const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
      
      const systemInstruction = `
        You are Izabi, a world-class AI Learning Assistant designed specifically for students and lifelong learners. 
        Your goal is to help users understand complex concepts by breaking them down into simple, intuitive explanations.
        
        Guidelines:
        1. Tone: Encouraging, professional, and slightly witty.
        2. Formatting: Use clear headings, bullet points, and Bold text for key concepts.
        4. If the user provides study material, focus your answers only on that material unless asked otherwise.
        5. Use LaTeX formatting for mathematical expressions if needed.
        
        Never say you are just an AI; you are Izabi.
      `;

      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: systemInstruction
      });

      const result = await model.generateContentStream(message);
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        yield { data: chunkText };
      }
      yield { data: '[DONE]' };
    } catch (error) {
      console.error(`Gemini Stream Error with key index ${index}:`, error);
      yield { data: '[ERROR]: Failed to get stream response' };
    }
  }

  async generateFromFiles(message: string, file: Express.Multer.File): Promise<string> {
    const { key } = this.getNextApiKey();
    try {
      const genAI = new GoogleGenerativeAI(key);
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
    } catch (error) {
      console.error('Gemini File Error:', error);
      throw new InternalServerErrorException('Failed to process file with AI');
    }
  }
}
