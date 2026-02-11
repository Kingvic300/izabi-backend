import {
    Injectable,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException,
    forwardRef,
    Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuizResult, QuizResultDocument } from './entities/quiz-result.entity';
import { Note, NoteDocument } from '../notes/entities/note.entity';
import {
    StudyHistory,
    StudyHistoryDocument,
} from '../study/entities/study-history.entity';
import { AiService } from '../ai/ai.service';
import { UsersService } from '../users/users.service';
import { STUDY_PROMPTS } from '../study/study.prompts';

@Injectable()
export class QuizService {
    private readonly QUICK_TEST_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
    private readonly MIN_CONTENT_LENGTH = 200;

    constructor(
        @InjectModel(QuizResult.name)
        private quizModel: Model<QuizResultDocument>,
        @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
        @InjectModel(StudyHistory.name)
        private studyModel: Model<StudyHistoryDocument>,
        private aiService: AiService,
        @Inject(forwardRef(() => UsersService)) // Add this specific Inject line
        private usersService: UsersService,
    ) {}

    async findAll(userId: string): Promise<QuizResultDocument[]> {
        return this.quizModel.find({ userId }).sort({ createdAt: -1 }).exec();
    }

    async findLatest(limit: number = 10): Promise<QuizResultDocument[]> {
        return this.quizModel
            .find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('userId', 'firstName lastName email profilePicturePath')
            .exec();
    }

    private cleanAiJsonResponse(raw: string): any {
        try {
            const cleaned = raw.replace(/```json|```/g, '').trim();

            // Try to find the first '{' for an object
            const startObj = cleaned.indexOf('{');
            const startArr = cleaned.indexOf('[');

            if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
                // Object pattern
                const end = cleaned.lastIndexOf('}');
                return JSON.parse(cleaned.substring(startObj, end + 1));
            } else if (startArr !== -1) {
                // Array pattern
                const end = cleaned.lastIndexOf(']');
                const parsed = JSON.parse(cleaned.substring(startArr, end + 1));
                return Array.isArray(parsed) ? parsed[0] : parsed;
            }

            throw new Error('No JSON structure found');
        } catch (e) {
            console.error('AI JSON Parse Error:', e, raw);
            throw new InternalServerErrorException(
                'AI returned malformed data. Please try again.',
            );
        }
    }

    private async checkQuickTestCooldown(userId: string) {
        const lastTest = await this.quizModel
            .findOne({ userId, quizTitle: { $regex: /^Quick Test/i } })
            .sort({ createdAt: -1 })
            .exec();

        if (lastTest && (lastTest as any).createdAt) {
            const timeSince =
                Date.now() - new Date((lastTest as any).createdAt).getTime();
            if (timeSince < this.QUICK_TEST_COOLDOWN_MS) {
                const waitMinutes = Math.ceil(
                    (this.QUICK_TEST_COOLDOWN_MS - timeSince) / 60000,
                );
                throw new BadRequestException(
                    `Please wait ${waitMinutes} minutes before starting another Quick Test.`,
                );
            }
        }
    }

    private async gatherUserContent(userId: string): Promise<string> {
        const [notes, summaries] = await Promise.all([
            this.noteModel
                .find({ userId })
                .sort({ updatedAt: -1 })
                .limit(5)
                .exec(),
            this.studyModel
                .find({ userId, type: 'summary' })
                .sort({ createdAt: -1 })
                .limit(3)
                .exec(),
        ]);

        const contentParts: string[] = [];
        notes.forEach((n) =>
            contentParts.push(`[NOTE: ${n.title}]\n${n.content}`),
        );
        summaries.forEach(
            (s) =>
                s.summary &&
                contentParts.push(`[SUMMARY: ${s.fileName}]\n${s.summary}`),
        );

        return contentParts.join('\n\n---\n\n');
    }

    async generateQuickTest(userId: string) {
        await this.checkQuickTestCooldown(userId);
        const userContent = await this.gatherUserContent(userId);

        if (
            !userContent ||
            userContent.trim().length < this.MIN_CONTENT_LENGTH
        ) {
            throw new BadRequestException(
                'Upload study materials or create notes first to generate a personalized Quick Test!',
            );
        }

        const fullPrompt = `${STUDY_PROMPTS.QUICK_TEST}\n\n=== SOURCE MATERIALS ===\n${userContent}`;
        const aiResponse = await this.aiService.getResponse(fullPrompt, userId);
        const testData = this.cleanAiJsonResponse(aiResponse);

        const quizResult = await this.quizModel.create({
            userId,
            quizTitle: testData.title || 'Quick Test',
            score: 0,
            totalQuestions: testData.questions.length,
            status: 'STARTED',
            questions: testData.questions,
            durationLimit: testData.durationSeconds || 300,
            details: { startedAt: new Date() },
        });

        const safeQuestions = testData.questions.map((q: any) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            options: q.options || [],
        }));

        return {
            success: true,
            data: {
                quizId: quizResult._id,
                title: testData.title,
                durationSeconds: quizResult.durationLimit,
                questions: safeQuestions,
            },
        };
    }

    async submitQuickTest(
        quizId: string,
        userId: string,
        answers: Record<string, string>,
    ) {
        const quiz = await this.quizModel
            .findOne({ _id: quizId, userId })
            .exec();
        if (!quiz) throw new NotFoundException('Quiz session not found.');
        if (quiz.status !== 'STARTED')
            throw new BadRequestException('Test already submitted or expired.');

        const startTime = quiz.details?.startedAt || (quiz as any).createdAt;
        const elapsed = Math.floor(
            (Date.now() - new Date(startTime).getTime()) / 1000,
        );

        if (elapsed > quiz.durationLimit + 30) {
            quiz.status = 'EXPIRED';
            await quiz.save();
            throw new BadRequestException('Time limit exceeded.');
        }

        let correctCount = 0;
        const results = quiz.questions.map((q: any) => {
            const userAnswer = answers[q.id];
            const isCorrect = this.compareAnswers(
                q.type,
                userAnswer,
                q.correctAnswer,
            );
            if (isCorrect) correctCount++;

            return {
                id: q.id,
                text: q.text,
                userAnswer,
                correctAnswer: q.correctAnswer,
                isCorrect,
                explanation: q.explanation,
            };
        });

        const score = Math.round((correctCount / quiz.questions.length) * 100);

        let pointsEarned = 0;
        if (score >= 50) {
            pointsEarned = score === 100 ? 100 : 50;
            await this.usersService.addPoints(userId, pointsEarned, 'quizzes');
        }

        quiz.score = score;
        quiz.status = 'COMPLETED';
        quiz.timeTaken = elapsed;
        quiz.details = { ...quiz.details, completedAt: new Date(), results };
        await quiz.save();

        const user = await this.usersService.findOne(userId);
        const streaks = await this.usersService.getStreakNumber(userId);

        return {
            success: true,
            data: {
                score,
                correctCount,
                totalQuestions: quiz.questions.length,
                results,
            },
            meta: {
                pointsEarned,
                totalPoints: user.points,
                streak: streaks.academicStreak,
                pet: user.pet,
            },
        };
    }

    private compareAnswers(
        type: string,
        user: string,
        correct: string,
    ): boolean {
        if (!user) return false;
        const norm = (s: string) => s.trim().toLowerCase();
        if (type === 'multiple_choice' || type === 'true_false')
            return norm(user) === norm(correct);
        if (type === 'short_answer') {
            const u = norm(user);
            const c = norm(correct);
            return u === c || u.includes(c) || c.includes(u);
        }
        return false;
    }

    /**
     * AI-Powered Daily Challenge: Generates one high-quality question based on recent notes.
     */
    async getDailyChallenge(userId: string) {
        const latestNote = await this.noteModel
            .findOne({ userId })
            .sort({ updatedAt: -1 })
            .exec();
        if (!latestNote) {
            return {
                success: false,
                message: 'Create a note to unlock daily challenges!',
            };
        }

        const prompt = `Based on this note: "${latestNote.content.substring(0, 1000)}", generate ONE high-quality multiple choice question. 
        Return ONLY JSON: {"id": "daily", "question": "", "options": ["", "", "", ""], "answer": "", "explanation": ""}`;

        const aiResponse = await this.aiService.getResponse(prompt, userId);
        const question = this.cleanAiJsonResponse(aiResponse);

        return {
            success: true,
            data: {
                ...question,
                points: 20,
                subject: latestNote.title,
            },
        };
    }

    async getGenericPracticeQuestions(count: number = 5) {
        const bank = [
            {
                id: 'gen-1',
                question: 'Which pattern comes next: 2, 4, 8, 16, ...?',
                options: ['20', '24', '32', '64'],
                answer: '32',
                explanation: 'Multiplied by 2.',
                questionType: 'multiple_choice',
            },
            {
                id: 'gen-2',
                question: 'What is active recall?',
                options: [
                    'Reading',
                    'Testing yourself',
                    'Highlighting',
                    'Listening',
                ],
                answer: 'Testing yourself',
                explanation: 'Retrieval practice is key.',
                questionType: 'multiple_choice',
            },
        ];
        const shuffled = [...bank].sort(() => 0.5 - Math.random());
        return { success: true, data: shuffled.slice(0, count) };
    }

    async create(userId: string, data: any) {
        const res = new this.quizModel({ ...data, userId });
        const saved = await res.save();

        // Award points and update streaks automatically on any quiz submission
        let pointsToAdd = 0;
        if (data.score >= 50) {
            pointsToAdd = data.subject === 'Brain Drop' ? 20 : 50;
            if (data.score === 100 && data.subject !== 'Brain Drop')
                pointsToAdd = 100;

            await this.usersService.addPoints(userId, pointsToAdd, 'quizzes');
        } else {
            // Still update streak even if they didn't pass, as they "studied"
            try {
                await this.usersService.addPoints(userId, 0, 'quizzes');
            } catch (e) {
                console.error('Streak update failed in quiz create', e);
            }
        }

        return saved;
    }
}
