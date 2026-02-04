import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuizResult, QuizResultDocument } from './entities/quiz-result.entity';

@Injectable()
export class QuizService {
  constructor(
    @InjectModel(QuizResult.name) private quizModel: Model<QuizResultDocument>,
  ) {}

  async findAll(userId: string): Promise<QuizResultDocument[]> {
    return this.quizModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async create(userId: string, data: any): Promise<QuizResultDocument> {
    const result = new this.quizModel({ ...data, userId });
    return result.save();
  }
}
