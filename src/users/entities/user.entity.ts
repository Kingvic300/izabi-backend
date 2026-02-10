import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ unique: true, sparse: true })
  googleId?: string;

  @Prop({ default: 'local' })
  authProvider: 'local' | 'google';

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

  // --- Gamification & Progression ---

  @Prop({ default: 0 })
  points: number;

  @Prop({ default: 1 }) // Added for the weekly level-up logic
  level: number;

  @Prop({ default: 0 })
  dailyPoints: number;

  @Prop({ default: 0 })
  dailyDocs: number;

  @Prop({ default: 0 })
  dailyMessages: number;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop({ default: 0 }) // Added for the 1-day protection logic
  streakFreezes: number;

  @Prop()
  lastStreakDate: Date;

  @Prop({ default: 0 })
  previousXpRank: number;

  @Prop({ default: 0 })
  previousStreakRank: number;

  @Prop({ type: Object, default: {} })
  activityStreaks: Record<
    string,
    { current: number; longest: number; lastDate: Date }
  >;

  @Prop({ default: 0 })
  totalStudyMinutes: number;

  @Prop()
  lastStudyDate: Date;

  @Prop({
    type: Object,
    default: { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 },
  })
  studyStats: any;

  @Prop({
    type: Object,
    default: { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' },
  })
  pet: any;

  // --- Subscription & Payments ---
  @Prop({ default: 'free' })
  subscriptionStatus: 'free' | 'pro' | 'premium';

  @Prop()
  subscriptionExpiry: Date;

  @Prop()
  paystackCustomerCode: string;

  @Prop()
  paystackSubscriptionCode: string;

  // --- System & Integration ---

  @Prop()
  refreshToken: string;

  @Prop()
  groqApiKey: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
