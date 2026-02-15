import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
    NoteGroup,
    NoteGroupDocument,
} from './entities/note-group.entity';
import { Note, NoteDocument } from './entities/note.entity';

@Injectable()
export class NoteGroupsService {
    constructor(
        @InjectModel(NoteGroup.name)
        private noteGroupModel: Model<NoteGroupDocument>,
        @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
    ) {}

    async create(userId: string, name: string): Promise<NoteGroupDocument> {
        const trimmed = (name || '').trim();
        if (!trimmed) {
            throw new BadRequestException('Group name is required');
        }
        const group = new this.noteGroupModel({ name: trimmed, userId });
        return group.save();
    }

    async findAll(userId: string): Promise<NoteGroupDocument[]> {
        return this.noteGroupModel
            .find({ userId })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(
        id: string,
        userId: string,
        name: string,
    ): Promise<NoteGroupDocument> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid group id');
        }
        const trimmed = (name || '').trim();
        if (!trimmed) {
            throw new BadRequestException('Group name is required');
        }
        const group = await this.noteGroupModel
            .findOneAndUpdate(
                { _id: id, userId },
                { name: trimmed },
                { new: true },
            )
            .exec();
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
    }

    async remove(id: string, userId: string): Promise<void> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid group id');
        }
        const group = await this.noteGroupModel
            .findOneAndDelete({ _id: id, userId })
            .exec();
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        await this.noteModel
            .updateMany(
                { userId, groupId: id },
                { $unset: { groupId: '' } },
            )
            .exec();
    }
}
