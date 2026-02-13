import {
    Injectable,
    InternalServerErrorException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
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

    private shuffleArray(array: any[]) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private async findExistingExam(config: any) {
        const { category, subject, universityName, courseTitle } = config;
        const query: any = { category };

        if (category === 'UNIVERSITY') {
            if (universityName) query.institution = universityName;
            if (courseTitle) query.subject = courseTitle;
        } else {
            if (subject) query.subject = subject;
        }

        const match = await this.examModel
            .findOne(query)
            .sort({ createdAt: -1 })
            .exec();
        if (match) {
            return {
                ...match.toObject(),
                questions: this.shuffleArray(match.questions),
            };
        }
        return null;
    }

    /**
     * CBT Simulation Engine
     * Logic: Check for pre-built simulation -> If missing, generate high-quality AI Mock.
     */
    async getSimulation(
        userId: string,
        config: {
            category: 'JAMB' | 'WAEC' | 'JUPEB' | 'UNIVERSITY';
            subject?: string;
            universityName?: string;
            department?: string;
            courseTitle?: string;
            count?: number;
        },
    ) {
        // Try to find ANY existing exam (AI or Manual) for this subject to save API costs
        const existing = await this.findExistingExam(config);
        if (existing) return existing;

        return this.generatePracticeExam(userId, {
            ...config,
            count: config.count || 25,
        });
    }

    /**
     * AI Exam Generator (JAMB, WAEC, JUPEB, UNIVERSITY)
     */
    async generatePracticeExam(userId: string, config: any) {
        // API SAVER: Check if we already have questions for this. No need to generate twice.
        const existing = await this.findExistingExam(config);
        if (existing) return existing;

        const questionCount = config.count || 15;
        let prompt = '';

        switch (config.category) {
            case 'JAMB':
                prompt = `Act as a JAMB examiner. Generate ${questionCount} standard JAMB CBT questions for ${config.subject}. 
                Ensure questions cover the official JAMB syllabus. Provide 4 options, the correct answer, and a CONCISE academic explanation.`;
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
        Return ONLY a JSON object: {"questions": [{"question": "string", "options": ["A) ", "B) ", "C) ", "D) "], "answer": "string", "explanation": "string"}]}`;

        try {
            const aiRawResponse = await this.aiService.getResponse(
                `${prompt}\n${jsonInstruction}`,
                userId,
            );

            let questions = [];
            try {
                const parsed = JSON.parse(aiRawResponse);
                questions = parsed.questions || parsed;
            } catch (e) {
                // Fallback to extraction if parsing raw fails (e.g. if AI adds filler text)
                const jsonStartIndex = aiRawResponse.indexOf('{');
                const jsonEndIndex = aiRawResponse.lastIndexOf('}') + 1;
                if (jsonStartIndex !== -1) {
                    const parsed = JSON.parse(
                        aiRawResponse.substring(jsonStartIndex, jsonEndIndex),
                    );
                    questions = parsed.questions || parsed;
                }
            }

            if (!Array.isArray(questions) || questions.length === 0) {
                throw new Error('AI failed to return a valid question array');
            }

            const exam = new this.examModel({
                userId,
                title: `${config.category} ${config.subject || config.courseTitle || 'Practice'} ${config.count && config.count >= 25 ? 'Simulation' : 'Practice'}`,
                category: config.category,
                subject: config.subject || config.courseTitle,
                institution: config.universityName || 'National Body',
                type:
                    config.count && config.count >= 25
                        ? 'SIMULATION'
                        : 'AI_GENERATED',
                questions,
                duration: config.category === 'JAMB' ? 120 : 60, // Minutes
            });

            return await exam.save();
        } catch (error: any) {
            throw new InternalServerErrorException('Exam generation failed');
        }
    }

    // --- Admin/Past Questions Logic ---

    async findPastQuestions(
        category: string,
        subject?: string,
        institution?: string,
    ) {
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
