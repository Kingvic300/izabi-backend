import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuizResult, QuizResultDocument } from './entities/quiz-result.entity';
import { Note, NoteDocument } from '../notes/entities/note.entity';
import { StudyHistory, StudyHistoryDocument } from '../study/entities/study-history.entity';
import { AiService } from '../ai/ai.service';
import { STUDY_PROMPTS } from '../study/study.prompts';

@Injectable()
export class QuizService {
  // HOW: Cooldown period between Quick Tests
  // WHY: Prevent spam, encourage actual studying between attempts
  private readonly QUICK_TEST_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
  
  // HOW: Minimum content length to generate valid test
  // WHY: Ensures there's enough material to create meaningful questions
  private readonly MIN_CONTENT_LENGTH = 200;

  constructor(
    @InjectModel(QuizResult.name) private quizModel: Model<QuizResultDocument>,
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
    @InjectModel(StudyHistory.name) private studyModel: Model<StudyHistoryDocument>,
    private aiService: AiService,
  ) {}

  async findAll(userId: string): Promise<QuizResultDocument[]> {
    return this.quizModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async create(userId: string, data: any): Promise<QuizResultDocument> {
    const result = new this.quizModel({ ...data, userId });
    return result.save();
  }

  async findLatest(limit: number = 10): Promise<QuizResultDocument[]> {
    return this.quizModel.find().sort({ createdAt: -1 }).limit(limit).populate('userId', 'firstName lastName email').exec();
  }

  // HOW: Enforce cooldown by checking last attempt timestamp
  // WHY: Prevents abuse, encourages quality over quantity
  private async checkQuickTestCooldown(userId: string) {
    const lastTest = await this.quizModel
      .findOne({ userId, quizTitle: { $regex: /^Quick Test/i } })
      .sort({ createdAt: -1 })
      .exec();

    if (lastTest && lastTest.createdAt) {
      const timeSince = Date.now() - lastTest.createdAt.getTime();
      if (timeSince < this.QUICK_TEST_COOLDOWN_MS) {
        const waitMinutes = Math.ceil((this.QUICK_TEST_COOLDOWN_MS - timeSince) / 60000);
        throw new BadRequestException(
          `Please wait ${waitMinutes} minutes before starting another Quick Test.`
        );
      }
    }
  }

  // HOW: Aggregate user's notes and study materials into one context
  // WHY: Quick Test must be generated from user's actual content, not generic knowledge
  private async gatherUserContent(userId: string): Promise<string> {
    // Fetch recent notes (limit to prevent token overflow)
    const notes = await this.noteModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .exec();

    // Fetch recent summaries/study materials
    const summaries = await this.studyModel
      .find({ userId, type: 'summary' })
      .sort({ createdAt: -1 })
      .limit(3)
      .exec();

    // HOW: Concatenate all content with clear separators
    // WHY: AI needs structured context to generate coherent questions
    const contentParts: string[] = [];

    if (notes.length > 0) {
      notes.forEach(note => {
        contentParts.push(`[NOTE: ${note.title}]\n${note.content}`);
      });
    }

    if (summaries.length > 0) {
      summaries.forEach(summary => {
        if (summary.summary) {
          contentParts.push(`[SUMMARY: ${summary.fileName || 'Study Material'}]\n${summary.summary}`);
        }
      });
    }

    return contentParts.join('\n\n---\n\n');
  }

  // HOW: Generate Quick Test using AI from user's materials
  // WHY: Main entry point for Quick Test feature
  async generateQuickTest(userId: string) {
    // STEP 1: Check cooldown
    await this.checkQuickTestCooldown(userId);

    // STEP 2: Gather user content
    const userContent = await this.gatherUserContent(userId);

    // SANITY CHECK: Ensure user has sufficient content
    if (!userContent || userContent.trim().length < this.MIN_CONTENT_LENGTH) {
      throw new BadRequestException(
        'You need to upload study materials or create notes before taking a Quick Test. ' +
        'Try uploading a PDF or creating some notes first!'
      );
    }

    // HOW: Construct full prompt with user content
    // WHY: AI needs both instructions and source material
    const fullPrompt = `${STUDY_PROMPTS.QUICK_TEST}\n\n=== USER STUDY MATERIALS ===\n${userContent}`;

    // STEP 3: Call AI service to generate questions
    // HOW: Use getResponse instead of generateFromFiles since we have text, not a file
    // WHY: Reuses existing robust AI infrastructure with retry and token limits
    let aiResponse: string;
    try {
      aiResponse = await this.aiService.getResponse(fullPrompt, userId);
    } catch (error: any) {
      console.error('[QuizService] AI generation failed:', error.message);
      throw new BadRequestException('Unable to generate test. Please try again later.');
    }

    // STEP 4: Parse and validate AI response
    // HOW: Clean JSON markers and parse
    // WHY: AI sometimes wraps JSON in markdown code blocks
    let testData: any;
    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      testData = JSON.parse(cleaned);
    } catch (e) {
      console.error('[QuizService] JSON parse error. Raw:', aiResponse);
      throw new BadRequestException('Test generation failed. Please try again.');
    }

    // STEP 5: Validate structure
    if (!testData.questions || !Array.isArray(testData.questions) || testData.questions.length === 0) {
      throw new BadRequestException('Generated test is invalid. Please try again.');
    }

    // HOW: Check each question has required fields
    // WHY: Prevents runtime errors in frontend and grading logic
    for (const q of testData.questions) {
      if (!q.id || !q.type || !q.text || !q.correctAnswer) {
        throw new BadRequestException('Generated questions are incomplete. Please retry.');
      }
    }

    // STEP 6: Save test to database with STARTED status
    // HOW: Store complete question set for server-side validation
    // WHY: Prevents client manipulation, enables time enforcement
    const quizResult = await this.create(userId, {
      quizTitle: testData.title || 'Quick Test',
      score: 0, // Not graded yet
      totalQuestions: testData.questions.length,
      status: 'STARTED',
      questions: testData.questions, // Full question set
      durationLimit: testData.durationSeconds || 300,
      details: { startedAt: new Date() }
    });

    // HOW: Return questions to frontend (without correctAnswer for integrity)
    // WHY: Client needs questions to display, but not answers to prevent cheating
    const questionsForClient = testData.questions.map((q: any) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options || []
    }));

    return {
      success: true,
      data: {
        quizId: quizResult._id,
        title: testData.title || 'Quick Test',
        durationSeconds: testData.durationSeconds || 300,
        questions: questionsForClient
      }
    };
  }

  // HOW: Submit answers and calculate score
  // WHY: Server-side grading prevents cheating
  async submitQuickTest(quizId: string, userId: string, answers: Record<string, string>) {
    // STEP 1: Retrieve quiz
    const quiz = await this.quizModel.findOne({ _id: quizId, userId }).exec();
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // STEP 2: Validate status
    if (quiz.status !== 'STARTED') {
      throw new BadRequestException('This test has already been submitted or expired');
    }

    // STEP 3: Check time limit
    // HOW: Compare current time vs start time + duration
    // WHY: Enforce timed challenge rule
    const startTime = quiz.details?.startedAt || quiz.createdAt;
    const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    if (elapsed > quiz.durationLimit + 10) { // 10s grace for network delay
      quiz.status = 'EXPIRED';
      await quiz.save();
      throw new BadRequestException('Time limit exceeded');
    }

    // STEP 4: Grade answers
    // HOW: Compare submitted answers against stored correct answers
    // WHY: Deterministic grading without AI inconsistency
    let correctCount = 0;
    const results: any[] = [];

    for (const question of quiz.questions) {
      const userAnswer = answers[question.id];
      const isCorrect = this.compareAnswers(question.type, userAnswer, question.correctAnswer);
      
      if (isCorrect) correctCount++;

      results.push({
        id: question.id,
        text: question.text,
        userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation
      });
    }

    const score = Math.round((correctCount / quiz.questions.length) * 100);

    // STEP 5: Update quiz with results
    quiz.score = score;
    quiz.status = 'COMPLETED';
    quiz.timeTaken = elapsed;
    quiz.details = {
      ...quiz.details,
      completedAt: new Date(),
      results
    };
    await quiz.save();

    return {
      success: true,
      data: {
        score,
        correctCount,
        totalQuestions: quiz.questions.length,
        timeTaken: elapsed,
        results
      }
    };
  }

  // HOW: Compare answers accounting for different question types
  // WHY: MCQ needs exact match, short answer needs flexible matching
  private compareAnswers(type: string, userAnswer: string, correctAnswer: string): boolean {
    if (!userAnswer) return false;

    const normalize = (s: string) => s.trim().toLowerCase();

    if (type === 'multiple_choice' || type === 'true_false') {
      return normalize(userAnswer) === normalize(correctAnswer);
    }

    if (type === 'short_answer') {
      // HOW: Flexible matching for short answers
      // WHY: Accept minor variations in phrasing
      const user = normalize(userAnswer);
      const correct = normalize(correctAnswer);
      return user === correct || user.includes(correct) || correct.includes(user);
    }

    return false;
  }

  // Legacy methods kept for backward compatibility
  async getDailyChallenge(userId: string) {
    const userNotes = await this.noteModel.find({ userId }).sort({ updatedAt: -1 }).limit(5).exec();
    
    if (!userNotes || userNotes.length === 0) {
      return {
        success: false,
        message: 'Upload study materials to get personalized daily challenges',
        data: null
      };
    }

    const randomNote = userNotes[Math.floor(Math.random() * userNotes.length)];
    const contentSnippet = randomNote.content.substring(0, 200);
    
    const question = {
      id: `daily-${new Date().toDateString()}`,
      question: `Based on your notes on "${randomNote.title}", which statement is most accurate?`,
      options: [
        `${contentSnippet.split('.')[0] || contentSnippet.substring(0, 50)}`,
        "This is an incorrect option",
        "This is also incorrect",
        "Another incorrect option"
      ].sort(() => Math.random() - 0.5),
      answer: contentSnippet.split('.')[0] || contentSnippet.substring(0, 50),
      explanation: `This comes from your notes: ${randomNote.title}. Review your materials to reinforce your understanding.`,
      points: 50,
      subject: randomNote.category || randomNote.title,
      noteId: randomNote._id,
      noteTitle: randomNote.title
    };

    return {
      success: true,
      data: question
    };
  }

  async getGenericPracticeQuestions(count: number = 5) {
    const questionBank = [
      {
        id: 'gen-1',
        question: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops definitely Lazzies?",
        options: ["Yes", "No", "Maybe", "Not enough information"],
        answer: "Yes",
        explanation: "This is a logic question. If A=B and B=C, then A=C. Since all Bloops are Razzies, and all Razzies are Lazzies, all Bloops must be Lazzies.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Critical Thinking"
      },
      {
        id: 'gen-2',
        question: "A student studies 2 hours and scores 60%. Another studies 4 hours and scores 70%. What can we DEFINITELY conclude?",
        options: [
          "More study time always means better grades",
          "The test was too hard",
          "The second student is smarter",
          "We need more information to conclude anything definite"
        ],
        answer: "We need more information to conclude anything definite",
        explanation: "Correlation doesn't equal causation. Many factors affect test performance beyond study time: prior knowledge, study methods, test difficulty, natural aptitude, etc.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Critical Thinking"
      },
      {
        id: 'gen-3',
        question: "Which of these is most likely to be a high-impact study habit?",
        options: [
          "Rereading the textbook 10 times",
          "Active recall and spaced repetition",
          "Highlighting every sentence in a chapter",
          "Listening to lo-fi hip hop while sleeping"
        ],
        answer: "Active recall and spaced repetition",
        explanation: "Scientific research consistently shows that active recall (testing yourself) and spaced repetition (reviewing over increasing intervals) are significantly more effective than passive review.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Learning Science"
      },
      {
        id: 'gen-4',
        question: "Which pattern comes next: 2, 4, 8, 16, ...?",
        options: ["20", "24", "32", "64"],
        answer: "32",
        explanation: "This is a geometric sequence where each term is multiplied by 2. 16 * 2 = 32.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Logic"
      },
      {
        id: 'gen-5',
        question: "What is the primary purpose of a 'Minimum Viable Product' (MVP)?",
        options: [
          "To release a perfect, finished product",
          "To test a business hypothesis with minimum resources",
          "To charge the maximum price to early adopters",
          "To replace the final product entirely"
        ],
        answer: "To test a business hypothesis with minimum resources",
        explanation: "The MVP is a version of a new product that allows a team to collect the maximum amount of validated learning about customers with the least effort.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Business & Strategy"
      },
      {
        id: 'gen-6',
        question: "In a 'Problem-Solution Fit', what is the most important focus?",
        options: [
          "The beauty of the UI",
          "The efficiency of the code",
          "Understanding if people actually have the problem you're solving",
          "The marketing budget"
        ],
        answer: "Understanding if people actually have the problem you're solving",
        explanation: "Before building a complex solution, you must validate that the problem actually exists and is painful enough for people to want a solution.",
        questionType: "multiple_choice",
        points: 20,
        subject: "Critical Thinking"
      }
    ];

    const shuffled = [...questionBank].sort(() => 0.5 - Math.random());
    return {
      success: true,
      data: shuffled.slice(0, count)
    };
  }
}
