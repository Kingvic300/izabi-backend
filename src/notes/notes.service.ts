import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Note, NoteDocument } from './entities/note.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
  ) {}

  async findAll(userId: string): Promise<NoteDocument[]> {
    return this.noteModel.find({ userId }).sort({ updatedAt: -1 }).exec();
  }

  async create(userId: string, data: any): Promise<NoteDocument> {
    const note = new this.noteModel({ ...data, userId });
    return note.save();
  }

  async update(id: string, userId: string, data: any): Promise<NoteDocument> {
    const note = await this.noteModel.findOneAndUpdate({ _id: id, userId }, data, { new: true }).exec();
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.noteModel.deleteOne({ _id: id, userId }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Note not found');
  }
  async countAll(): Promise<number> {
    return this.noteModel.countDocuments().exec();
  }
}
