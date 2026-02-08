import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuizResult, QuizResultDocument } from './entities/quiz-result.entity';
import { Note, NoteDocument } from '../notes/entities/note.entity';

@Injectable()
export class QuizService {
  constructor(
    @InjectModel(QuizResult.name) private quizModel: Model<QuizResultDocument>,
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
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

  async getDailyChallenge(userId: string) {
    // Get user's uploaded notes
    const userNotes = await this.noteModel.find({ userId }).sort({ updatedAt: -1 }).limit(5).exec();
    
    // If user has no notes, return null to indicate they should upload content first
    if (!userNotes || userNotes.length === 0) {
      return {
        success: false,
        message: 'Upload study materials to get personalized daily challenges',
        data: null
      };
    }

    // Select a random note
    const randomNote = userNotes[Math.floor(Math.random() * userNotes.length)];
    
    // Generate a simple question from the note content
    // In a real implementation, you'd use AI to generate better questions
    // For now, create a basic comprehension question
    const contentSnippet = randomNote.content.substring(0, 200);
    
    const question = {
      id: `daily-${new Date().toDateString()}`,
      question: `Based on your notes on "${randomNote.title}", which statement is most accurate?`,
      options: [
        `${contentSnippet.split('.')[0] || contentSnippet.substring(0, 50)}`,
        "This is an incorrect option",
        "This is also incorrect",
        "Another incorrect option"
      ].sort(() => Math.random() - 0.5), // Shuffle options
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
    // Subject-agnostic questions focused on critical thinking, logic, and general knowledge
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

    // Shuffle and pick 'count' questions
    const shuffled = [...questionBank].sort(() => 0.5 - Math.random());
    return {
      success: true,
      data: shuffled.slice(0, count)
    };
  }
}
