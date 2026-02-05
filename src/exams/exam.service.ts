import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Exam, ExamDocument } from './entities/exam.entity';

@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
  ) {}

  async findSimulation(type: string, subject: string) {
    return this.examModel.find({ type, subject }).limit(1).exec();
  }

  async findPastQuestions(category: string, type?: string, institution?: string, subject?: string) {
    const query: any = { category };
    if (type) query.type = type;
    if (institution) query.institution = institution;
    if (subject) query.subject = subject;
    return this.examModel.find(query).exec();
  }

  async createExam(data: any) {
    const exam = new this.examModel(data);
    return exam.save();
  }
}
