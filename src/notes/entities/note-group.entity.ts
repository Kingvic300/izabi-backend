import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NoteGroupDocument = NoteGroup & Document;

@Schema({ timestamps: true })
export class NoteGroup {
    @Prop({ required: true })
    name!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId!: string;

    createdAt?: Date;
    updatedAt?: Date;
}

export const NoteGroupSchema = SchemaFactory.createForClass(NoteGroup);
