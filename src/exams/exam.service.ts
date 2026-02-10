import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Exam, ExamDocument } from './entities/exam.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ExamsService {
    constructor(
        @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
        private aiService: AiService,
    ) {}

    /**
     * CBT Simulation Engine
     * Logic: Check for pre-built simulation -> If missing, generate high-quality AI Mock.
     */
    async getSimulation(userId: string, category: string, subject: string) {
        // 1. Try to find a curated/official simulation in the DB first
        const existingSimulation = await this.examModel.findOne({ 
            category, 
            subject, 
            type: 'SIMULATION' 
        }).exec();

        if (existingSimulation) {
            return existingSimulation;
        }

        // 2. Fallback: Generate a high-stakes AI Simulation (CBT Style)
        // Simulations usually have more questions (40 for JAMB) and a strict timer.
        return this.generatePracticeExam(userId, {
            category: category as any,
            subject,
            count: 40, // Standard CBT length
        });
    }

    /**
     * AI Exam Generator (JAMB, WAEC, JUPEB, UNIVERSITY)
     */
    async generatePracticeExam(userId: string, config: {
        category: 'JAMB' | 'WAEC' | 'JUPEB' | 'UNIVERSITY',
        subject?: string,
        universityName?: string,
        department?: string,
        courseTitle?: string,
        count?: number
    }) {
        const questionCount = config.count || 15;
        let prompt = '';

        switch (config.category) {
            case 'JAMB':
                prompt = `Act as a JAMB examiner. Generate ${questionCount} standard JAMB CBT questions for ${config.subject}. 
                Ensure questions cover the official JAMB syllabus. Provide 4 options, the correct answer, and an academic explanation.`;
                break;
            case 'WAEC':
                prompt = `Act as a WAEC examiner. Generate ${questionCount} WAEC objective-style questions for ${config.subject}. 
                Ensure they follow the WASSCE curriculum. Provide options, answers, and explanations.`;
                break;
            case 'JUPEB':
                prompt = `Generate ${questionCount} JUPEB A-Level questions for ${config.subject}. Provide deep academic explanations.`;
                break;
            case 'UNIVERSITY':
                prompt = `Generate ${questionCount} exam questions for ${config.courseTitle} at ${config.universityName}, ${config.department} department. 
                Focus on high-level academic theory. Provide answers and explanations.`;
                break;
            default:
                throw new BadRequestException('Invalid exam category');
        }

        const jsonInstruction = `
        Return ONLY a JSON array: [{"question": "string", "options": ["A) ", "B) ", "C) ", "D) "], "answer": "string", "explanation": "string"}]`;

        try {
            const aiRawResponse = await this.aiService.getResponse(`${prompt}\n${jsonInstruction}`, userId);
            const jsonStartIndex = aiRawResponse.indexOf('[');
            const jsonEndIndex = aiRawResponse.lastIndexOf(']') + 1;
            
            if (jsonStartIndex === -1) throw new Error('AI failed to return valid JSON');
            
            const questions = JSON.parse(aiRawResponse.substring(jsonStartIndex, jsonEndIndex));

            const exam = new this.examModel({
                userId,
                category: config.category,
                subject: config.subject || config.courseTitle,
                institution: config.universityName || 'National Body',
                type: config.count && config.count >= 40 ? 'SIMULATION' : 'AI_GENERATED',
                questions,
                duration: config.category === 'JAMB' ? 120 : 60, // Minutes
            });

            return await exam.save();
        } catch (error) {
            console.error('[ExamsService] Error:', error.message);
            throw new InternalServerErrorException('Exam generation failed');
        }
    }

    // --- Admin/Past Questions Logic ---

    async findPastQuestions(category: string, subject?: string, institution?: string) {
        const query: any = { category };
        if (subject) query.subject = subject;
        if (institution) query.institution = institution;
        return this.examModel.find(query).sort({ createdAt: -1 }).exec();
    }

    async createExam(data: any) {
        return new this.examModel(data).save();
    }

    async getUserExams(userId: string) {
        return this.examModel.find({ userId }).sort({ createdAt: -1 }).exec();
    }

    async deleteExam(id: string) {
        return this.examModel.findByIdAndDelete(id).exec();
    }
}