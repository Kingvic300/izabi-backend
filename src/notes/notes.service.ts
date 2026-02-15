import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Note, NoteDocument } from './entities/note.entity';
import { NoteGroup, NoteGroupDocument } from './entities/note-group.entity';

@Injectable()
export class NotesService {
    constructor(
        @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
        @InjectModel(NoteGroup.name)
        private noteGroupModel: Model<NoteGroupDocument>,
    ) {}

    private normalizeGroupId(groupId?: string | null): string | null {
        if (groupId === null || groupId === undefined) return null;
        const normalized = String(groupId).trim();
        if (!normalized || normalized === 'none') return null;
        return normalized;
    }

    private async assertGroupOwnership(
        userId: string,
        groupId?: string | null,
    ): Promise<string | null> {
        const normalized = this.normalizeGroupId(groupId);
        if (!normalized) return null;
        if (!isValidObjectId(normalized)) {
            throw new BadRequestException('Invalid group id');
        }
        const exists = await this.noteGroupModel
            .exists({ _id: normalized, userId })
            .exec();
        if (!exists) {
            throw new BadRequestException('Group not found');
        }
        return normalized;
    }

    async findAll(
        userId: string,
        groupId?: string | null,
    ): Promise<NoteDocument[]> {
        const filter: Record<string, any> = { userId };
        const rawGroupId = String(groupId || '').trim().toLowerCase();
        const normalizedGroupId = this.normalizeGroupId(groupId);

        if (rawGroupId === 'none') {
            filter.$or = [{ groupId: { $exists: false } }, { groupId: null }];
        } else if (normalizedGroupId) {
            if (!isValidObjectId(normalizedGroupId)) {
                throw new BadRequestException('Invalid group id');
            }
            filter.groupId = normalizedGroupId;
        }

        return this.noteModel.find(filter).sort({ updatedAt: -1 }).exec();
    }

    async create(userId: string, data: any): Promise<NoteDocument> {
        const groupId = await this.assertGroupOwnership(
            userId,
            data?.groupId,
        );
        const note = new this.noteModel({
            ...data,
            userId,
            groupId: groupId ?? null,
        });
        return note.save();
    }

    async update(id: string, userId: string, data: any): Promise<NoteDocument> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid note id');
        }
        let updatePayload = { ...data };
        if (Object.prototype.hasOwnProperty.call(data, 'groupId')) {
            const groupId = await this.assertGroupOwnership(
                userId,
                data.groupId,
            );
            updatePayload = { ...updatePayload, groupId: groupId ?? null };
        }
        const note = await this.noteModel
            .findOneAndUpdate({ _id: id, userId }, updatePayload, { new: true })
            .exec();
        if (!note) throw new NotFoundException('Note not found');
        return note;
    }

    async remove(id: string, userId: string): Promise<void> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid note id');
        }
        const result = await this.noteModel
            .deleteOne({ _id: id, userId })
            .exec();
        if (result.deletedCount === 0)
            throw new NotFoundException('Note not found');
    }
    async countAll(): Promise<number> {
        return this.noteModel.countDocuments().exec();
    }

    async findLatestGlobal(limit: number = 10): Promise<NoteDocument[]> {
        return this.noteModel
            .find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('userId', 'firstName lastName email')
            .exec();
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private textToHtml(text: string): string {
        const paragraphs = text.split(/\n{2,}/);
        return paragraphs
            .map((paragraph) => {
                const escaped = this.escapeHtml(paragraph.trim());
                const withBreaks = escaped.replace(/\n/g, '<br />');
                return `<p>${withBreaks}</p>`;
            })
            .join('');
    }

    private buildAutoTitle(text: string): string {
        const firstLine =
            text
                .split('\n')
                .map((line) => line.trim())
                .find((line) => line.length > 0) || '';
        const base = firstLine || text.slice(0, 50).trim();
        const trimmedBase = base.length > 50 ? base.slice(0, 50).trim() : base;
        return trimmedBase || 'Imported Note';
    }

    prepareImportedNote(
        text: string,
        options?: { title?: string; subject?: string },
    ): {
        title: string;
        content: string;
        category?: string;
        rawText: string;
    } {
        const normalizedText = text.replace(/\r\n/g, '\n').trim();
        if (!normalizedText) {
            throw new BadRequestException(
                'No readable text found in this file.',
            );
        }

        const providedTitle = (options?.title || '').trim();
        const finalTitle = providedTitle || this.buildAutoTitle(normalizedText);
        const category =
            options?.subject && options.subject.trim()
                ? options.subject.trim()
                : undefined;

        return {
            title: finalTitle,
            content: this.textToHtml(normalizedText),
            category,
            rawText: normalizedText,
        };
    }

    async createImportedNote(
        userId: string,
        payload: { title: string; content: string; category?: string },
    ): Promise<NoteDocument> {
        return this.create(userId, payload);
    }
}
