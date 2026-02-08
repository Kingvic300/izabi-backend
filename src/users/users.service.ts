import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
      user.dailyDocs = 0;
      user.dailyMessages = 0;
      
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

    // Increment study time
    const timeMap = { summaries: 5, quizzes: 15, guides: 10, flashcards: 5 };
    user.totalStudyMinutes = (user.totalStudyMinutes || 0) + (timeMap[actionType] || 5);
    
    // Mark as modified if it's a nested object
    user.markModified('studyStats');
    
    return user.save();
  }

  async checkIn(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = user.lastStudyDate ? new Date(user.lastStudyDate.getFullYear(), user.lastStudyDate.getMonth(), user.lastStudyDate.getDate()) : null;

    let updated = false;

    if (!lastDate || today.getTime() > lastDate.getTime()) {
      user.dailyPoints = 0;
      user.dailyDocs = 0;
      user.dailyMessages = 0;
      
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
      
      user.lastStudyDate = now;
      updated = true;
    }

    if (updated) {
      if (!user.pet) {
        user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
      }
      user.pet.level = Math.floor(user.streak / 5) + 1;
      user.pet.mood = user.streak > 0 ? 'happy' : 'sad';
      user.markModified('pet');
      return user.save();
    }

    return user;
  }

  async getLeaderboard(userId?: string) {
    const topStudents = await this.userModel.find({ role: { $nin: ['ADMIN', 'admin'] } })
      .sort({ points: -1, _id: 1 })
      .limit(100)
      .select('firstName lastName email points dailyPoints streak institution studyStats profilePicturePath')
      .exec();

    const topStreaks = await this.userModel.find({ role: { $nin: ['ADMIN', 'admin'] } })
      .sort({ streak: -1, _id: 1 })
      .limit(100)
      .select('firstName lastName email points dailyPoints streak institution studyStats profilePicturePath')
      .exec();

    let userRank = { xp: 'Not Ranked', streak: 'Not Ranked' };
    const isValidId = userId && /^[0-9a-fA-F]{24}$/.test(userId);

    if (isValidId) {
      try {
        const user = await this.userModel.findById(userId).exec();
        if (user) {
          // Calculate rank among non-admin users even for admins
          const xpRank = await this.userModel.countDocuments({ 
            role: { $nin: ['ADMIN', 'admin'] },
            points: { $gt: user.points || 0 } 
          }) + 1;
          const streakRank = await this.userModel.countDocuments({ 
            role: { $nin: ['ADMIN', 'admin'] },
            streak: { $gt: user.streak || 0 } 
          }) + 1;
          userRank = { xp: xpRank.toString(), streak: streakRank.toString() };
        }
      } catch (err) {
        console.error('Error calculating user rank:', err);
      }
    }

    return { topStudents, topStreaks, userRank };
  }

  async updateGroqKey(userId: string, apiKey: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, { groqApiKey: apiKey }).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  async checkActivityLimit(userId: string, type: 'dailyDocs' | 'dailyMessages'): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return; // Should not happen with auth

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = user.lastStudyDate ? new Date(user.lastStudyDate.getFullYear(), user.lastStudyDate.getMonth(), user.lastStudyDate.getDate()) : null;

    // Reset if it's a new day
    if (!lastDate || today.getTime() > lastDate.getTime()) {
      user.dailyPoints = 0;
      user.dailyDocs = 0;
      user.dailyMessages = 0;
      user.lastStudyDate = now;
      await user.save();
    }

    const limit = type === 'dailyDocs' 
      ? parseInt(process.env.DAILY_DOC_LIMIT || '20') 
      : parseInt(process.env.DAILY_MESSAGE_LIMIT || '50');

    if (user[type] >= limit) {
      throw new BadRequestException(`You have reached your daily limit of ${limit} ${type === 'dailyDocs' ? 'documents' : 'messages'}. Upgrade or wait until tomorrow!`);
    }
  }

  async incrementActivityCount(userId: string, type: 'dailyDocs' | 'dailyMessages'): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;
    
    user[type] = (user[type] || 0) + 1;
    user.lastStudyDate = new Date();
    await user.save();
  }

  // Admin methods
  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password -refreshToken').exec();
  }

  async getTotalNotes(): Promise<number> {
    // This would need to be implemented based on your notes model
    // For now, returning a placeholder
    return 0;
  }

  async getContributedKeysCount(): Promise<number> {
    const count = await this.userModel.countDocuments({ groqApiKey: { $exists: true, $ne: null } }).exec();
    return count;
  }

  async getUsersWithKeys(): Promise<UserDocument[]> {
    return this.userModel.find({ groqApiKey: { $exists: true, $ne: null } })
      .select('groqApiKey createdAt')
      .exec();
  }

  async delete(userId: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(userId).exec();
    if (!result) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  async feedPet(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.points < 50) {
      throw new BadRequestException('Not enough points to feed pet (50 required)');
    }

    user.points -= 50;
    
    if (!user.pet) {
      user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
    }

    // Feeding increases XP (hidden stat for now) and ensures Happiness
    // We can simulate leveling up simply by streak for now as per existing logic, 
    // or add a small boost here. Let's just boost mood and maybe add a 'lastFed' if we were using it.
    // For this iteration, let's say feeding grants a small "happiness" boost which we track via mood.
    user.pet.mood = 'super-happy'; 
    
    // Optional: chance to level up if we wanted more complex logic, 
    // but right now level is tied to streak in addPoints. 
    // Let's just keep it simple: Feeding = Happiness + Points deduction.
    
    user.markModified('pet');
    return user.save();
  }
}
