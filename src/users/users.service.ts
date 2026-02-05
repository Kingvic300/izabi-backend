import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';
import { CreateUserDto, UpdateProfileDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });
    return user.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findOne(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async updateProfile(id: string, updateProfileDto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(id, updateProfileDto, { new: true }).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async updateOtp(email: string, otp: string, expires: Date): Promise<void> {
    await this.userModel.updateOne({ email }, { otp, otpExpires: expires }).exec();
  }

  async verifyUser(email: string): Promise<void> {
    await this.userModel.updateOne({ email }, { isVerified: true, otp: null, otpExpires: null }).exec();
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken }).exec();
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { password: hashedPassword }).exec();
  }

  async addPoints(userId: string, pointsToAdd: number, actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards'): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = user.lastStudyDate ? new Date(user.lastStudyDate.getFullYear(), user.lastStudyDate.getMonth(), user.lastStudyDate.getDate()) : null;

    // Daily Reset Logic
    if (!lastDate || today.getTime() > lastDate.getTime()) {
      user.dailyPoints = 0;
      
      // Streak logic
      if (lastDate) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastDate.getTime() === yesterday.getTime()) {
          user.streak += 1;
        } else if (lastDate.getTime() < yesterday.getTime()) {
          user.streak = 1;
        }
      } else {
        user.streak = 1;
      }
    }

    user.points += pointsToAdd;
    user.dailyPoints += pointsToAdd;
    user.lastStudyDate = now;

    // Update Pet State
    if (!user.pet) {
      user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
    }
    user.pet.level = Math.floor(user.streak / 5) + 1; // Level up every 5 days
    user.pet.mood = user.streak > 0 ? 'happy' : 'sad';
    user.markModified('pet');
    
    if (!user.studyStats) {
      user.studyStats = { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 };
    }
    user.studyStats[actionType] = (user.studyStats[actionType] || 0) + 1;
    
    // Mark as modified if it's a nested object
    user.markModified('studyStats');
    
    return user.save();
  }

  async getLeaderboard() {
    // Current logic: Top users by daily points
    return this.userModel.find()
      .sort({ dailyPoints: -1 })
      .limit(10)
      .select('firstName lastName points dailyPoints streak studyStats profilePicturePath')
      .exec();
  }

  async updateGeminiKey(userId: string, apiKey: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, { geminiApiKey: apiKey }).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }
}
