import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StudyHistory, StudyHistoryDocument } from './entities/study-history.entity';

@Injectable()
export class StudyService {
  constructor(
    @InjectModel(StudyHistory.name) private studyModel: Model<StudyHistoryDocument>,
  ) {}

  async findAll(userId: string): Promise<StudyHistoryDocument[]> {
    return this.studyModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async create(userId: string, data: any): Promise<StudyHistoryDocument> {
    const history = new this.studyModel({ ...data, userId });
    return history.save();
  }
}
