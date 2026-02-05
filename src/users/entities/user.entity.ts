import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ default: 'USER' })
  role: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  phoneNumber: string;

  @Prop()
  institution: string;

  @Prop()
  major: string;

  @Prop()
  location: string;

  @Prop()
  profilePicturePath: string;

  @Prop()
  otp: string;

  @Prop()
  otpExpires: Date;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: 0 })
  points: number;

  @Prop({ default: 0 })
  dailyPoints: number;

  @Prop({ default: 0 })
  streak: number;

  @Prop()
  lastStudyDate: Date;

  @Prop({ type: Object, default: { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 } })
  studyStats: any;

  @Prop({ type: Object, default: { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' } })
  pet: any;

  @Prop()
  refreshToken: string;

  @Prop()
  geminiApiKey: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
