import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';
import { CreateUserDto, UpdateProfileDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private mailService: MailService,
  ) {}

  // --- Core User Management ---

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      level: 1,
      streakFreezes: 0,
    });
    return user.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async findOrCreateFromGoogle(profile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  }): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({
        $or: [
          { googleId: profile.googleId },
          { email: profile.email.toLowerCase() },
        ],
      })
      .exec();

    if (user) {
      let needsSave = false;

      // Mark as verified since Google verifies emails
      if (!user.isVerified) {
        user.isVerified = true;
        needsSave = true;
      }

      // Update existing user if they didn't have googleId but email matches
      if (!user.googleId) {
        user.googleId = profile.googleId;
        user.authProvider = 'google';
        if (!user.firstName) user.firstName = profile.firstName;
        if (!user.lastName) user.lastName = profile.lastName;
        if (!user.profilePicturePath)
          user.profilePicturePath = profile.profilePicture || '';
        needsSave = true;
      }

      if (needsSave) {
        await user.save();
      }
      return user;
    }

    // Create new user
    const newUser = new this.userModel({
      email: profile.email.toLowerCase(),
      googleId: profile.googleId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profilePicturePath: profile.profilePicture,
      authProvider: 'google',
      isVerified: true,
      level: 1,
      points: 0,
      streak: 0,
      streakFreezes: 0,
      pet: { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' },
    });

    return newUser.save();
  }

  async findOne(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async updateProfile(
    id: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, updateProfileDto, { new: true })
      .exec();
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  // --- Auth Helpers ---

  async updateOtp(email: string, otp: string, expires: Date): Promise<void> {
    await this.userModel
      .updateOne({ email }, { otp, otpExpires: expires })
      .exec();
  }

  async verifyUser(email: string): Promise<void> {
    await this.userModel
      .updateOne({ email }, { isVerified: true, otp: null, otpExpires: null })
      .exec();
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken }).exec();
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, { password: hashedPassword })
      .exec();
  }

  // --- Professional Streak Engine (UTC Midnight) ---

  private getMidnightUTC(date: Date): number {
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
  }

  private calculateStreakStatus(
    user: UserDocument,
    lastActivityDate: Date | null,
    now: Date,
  ) {
    if (!lastActivityDate) {
      return { streak: 1, isNewDay: true, freezeUsed: false };
    }

    const todayUTC = this.getMidnightUTC(now);
    const lastUTC = this.getMidnightUTC(lastActivityDate);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((todayUTC - lastUTC) / msPerDay);

    if (diffDays === 0) {
      return { streak: user.streak || 1, isNewDay: false, freezeUsed: false };
    }

    if (diffDays === 1) {
      return {
        streak: (user.streak || 0) + 1,
        isNewDay: true,
        freezeUsed: false,
      };
    }

    // STREAK FREEZE PROTECTION
    if (diffDays === 2 && user.streakFreezes > 0) {
      user.streakFreezes -= 1;
      user.markModified('streakFreezes');

      // Notify user about the freeze usage
      this.mailService
        .sendStreakFreezeNotification(
          user.email,
          user.firstName || 'Scholar',
          user.streakFreezes,
        )
        .catch((err) => console.error('Failed to notifiy freeze usage', err));

      return {
        streak: (user.streak || 0) + 1,
        isNewDay: true,
        freezeUsed: true,
      };
    }

    return { streak: 1, isNewDay: true, freezeUsed: false };
  }

  private updateStreak(user: UserDocument, activityType: string) {
    const now = new Date();

    // 1. Process Global Streak
    const status = this.calculateStreakStatus(user, user.lastStreakDate, now);

    if (status.isNewDay) {
      const oldStreak = user.streak || 0;
      user.streak = status.streak;
      user.longestStreak = Math.max(user.longestStreak || 0, user.streak);
      user.lastStreakDate = now;

      // Milestone: Level up every 7 days + 500 XP reward
      if (
        user.streak > 0 &&
        user.streak % 7 === 0 &&
        user.streak !== oldStreak
      ) {
        user.level = (user.level || 1) + 1;
        user.points += 500;
      }
    }

    // 2. Process Activity Streaks
    if (!user.activityStreaks) user.activityStreaks = {};
    const activity = user.activityStreaks[activityType] || {
      current: 0,
      longest: 0,
      lastDate: null,
    };
    const actStatus = this.calculateStreakStatus(user, activity.lastDate, now);

    if (actStatus.isNewDay) {
      activity.current = actStatus.streak;
      activity.longest = Math.max(activity.longest || 0, activity.current);
      activity.lastDate = now;
      user.activityStreaks[activityType] = activity;
      user.markModified('activityStreaks');
    }
  }

  // --- Core Gamification Methods ---

  async addPoints(
    userId: string,
    pointsToAdd: number,
    actionType: 'summaries' | 'quizzes' | 'guides' | 'flashcards',
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = this.getMidnightUTC(now);
    const lastUTC = user.lastStudyDate
      ? this.getMidnightUTC(user.lastStudyDate)
      : null;

    if (lastUTC === null || todayUTC > lastUTC) {
      user.dailyPoints = 0;
      user.dailyDocs = 0;
      user.dailyMessages = 0;
    }

    this.updateStreak(user, actionType);

    user.points += pointsToAdd;
    user.dailyPoints += pointsToAdd;
    user.dailyDocs += 1; // Tracks successful ingestion
    user.lastStudyDate = now;

    if (!user.pet)
      user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
    user.pet.level = Math.floor(user.streak / 5) + 1;
    user.pet.mood = user.streak > 1 ? 'happy' : 'neutral';
    user.markModified('pet');

    if (!user.studyStats)
      user.studyStats = { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 };
    user.studyStats[actionType] = (user.studyStats[actionType] || 0) + 1;
    user.markModified('studyStats');

    user.totalStudyMinutes = (user.totalStudyMinutes || 0) + 5;
    return user.save();
  }

  async checkIn(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = this.getMidnightUTC(now);
    const lastUTC = user.lastStudyDate
      ? this.getMidnightUTC(user.lastStudyDate)
      : null;

    if (lastUTC === null || todayUTC > lastUTC) {
      user.dailyPoints = 0;
      user.dailyDocs = 0;
      user.dailyMessages = 0;
    }

    this.updateStreak(user, 'login');
    user.lastStudyDate = now;

    if (!user.pet)
      user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
    user.pet.level = Math.floor(user.streak / 5) + 1;
    user.pet.mood = user.streak > 1 ? 'happy' : 'neutral';
    user.markModified('pet');

    return user.save();
  }

  async buyStreakFreeze(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const COST = 50;
    if (user.points < COST)
      throw new BadRequestException(`Need ${COST} XP to buy a freeze.`);
    if ((user.streakFreezes || 0) >= 3)
      throw new BadRequestException('Inventory full (Max 3).');

    user.points -= COST;
    user.streakFreezes = (user.streakFreezes || 0) + 1;
    return user.save();
  }

  async addStreakFreezes(userId: string, count: number): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.streakFreezes = (user.streakFreezes || 0) + count;
    return user.save();
  }

  async updateSubscription(
    userId: string,
    data: { status: 'free' | 'premium'; expiry: Date; customerCode?: string },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.subscriptionStatus = data.status;
    user.subscriptionExpiry = data.expiry;
    if (data.customerCode) user.paystackCustomerCode = data.customerCode;

    return user.save();
  }

  async checkUsageLimit(
    userId: string,
    type: 'dailyDocs' | 'dailyMessages',
  ): Promise<{ allowed: boolean; reason?: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = this.getMidnightUTC(now);
    const lastUTC = user.lastStudyDate
      ? this.getMidnightUTC(user.lastStudyDate)
      : null;

    // Reset daily counters if it's a new day
    if (lastUTC === null || todayUTC > lastUTC) {
      user.dailyDocs = 0;
      user.dailyMessages = 0;
      user.lastStudyDate = now;
      await user.save();
    }

    // Check if user has a paid subscription (Pro or Premium)
    if (user.subscriptionStatus === 'pro' || user.subscriptionStatus === 'premium') {
      // Check if subscription expired
      if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
        user.subscriptionStatus = 'free';
        await user.save();
        // Fall through to free tier limits below
      } else {
        // Pro and Premium have higher limits
        const isPremium = user.subscriptionStatus === 'premium';
        const PAID_LIMITS = {
          dailyDocs: isPremium ? 30 : 15, // Premium: 30, Pro: 15
          dailyMessages: isPremium ? 45 : 30, // Premium: 45, Pro: 30
        };
        
        const currentUsage = user[type] || 0;
        if (currentUsage >= PAID_LIMITS[type]) {
          return {
            allowed: false,
            reason: `Daily ${type === 'dailyDocs' ? 'upload' : 'AI chat'} limit reached for ${isPremium ? 'Premium' : 'Pro'}. Upgrade to unlock more!`,
          };
        }
        return { allowed: true };
      }
    }

    // Freemium Limits
    const LIMITS = {
      dailyDocs: 5, // 5 PDF uploads/processing per day
      dailyMessages: 20, // 20 AI chat messages per day
    };

    const currentUsage = user[type] || 0;
    if (currentUsage >= LIMITS[type]) {
      return {
        allowed: false,
        reason: `Daily ${type === 'dailyDocs' ? 'upload' : 'AI chat'} limit reached. Upgrade to Pro or Premium for more access!`,
      };
    }

    return { allowed: true };
  }

  async getStreakNumber(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const todayUTC = this.getMidnightUTC(now);
    const lastUTC = user.lastStreakDate
      ? this.getMidnightUTC(user.lastStreakDate)
      : 0;
    const diffDays = Math.floor((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));

    let liveStreak = user.streak;
    let status = 'active';

    if (diffDays > 1) {
      if (diffDays === 2 && (user.streakFreezes || 0) > 0) status = 'frozen';
      else {
        liveStreak = 0;
        status = 'expired';
      }
    }

    return {
      academicStreak: liveStreak,
      loginStreak: this.calculateLiveStreak(
        user.activityStreaks?.login?.current || 0,
        user.activityStreaks?.login?.lastDate,
      ),
      streakFreezes: user.streakFreezes || 0,
      status: status,
      longestStreak: user.longestStreak || 0,
    };
  }

  private calculateLiveStreak(streak: number, lastDate: Date | null): number {
    if (!lastDate) return 0;
    const diff = Math.floor(
      (this.getMidnightUTC(new Date()) - this.getMidnightUTC(lastDate)) /
        (1000 * 60 * 60 * 24),
    );
    return diff <= 1 ? streak : 0;
  }

  async getLeaderboard(userId?: string) {
    const filter = { role: { $nin: ['ADMIN', 'admin'] } };
    const projection =
      'firstName lastName email points dailyPoints streak level institution studyStats profilePicturePath previousXpRank previousStreakRank';

    const topStudents = await this.userModel
      .find(filter)
      .sort({ points: -1, _id: 1 })
      .limit(100)
      .select(projection)
      .exec();
    const topStreaks = await this.userModel
      .find(filter)
      .sort({ streak: -1, _id: 1 })
      .limit(100)
      .select(projection)
      .exec();

    const topStudentsWithChange = topStudents.map((user, index) => {
      const currentRank = index + 1;
      const prev = user.previousXpRank || currentRank;
      return {
        ...user.toObject(),
        rank: currentRank,
        rankChange: prev - currentRank, // Positive = Up, Negative = Down
      };
    });

    const topStreaksWithChange = topStreaks.map((user, index) => {
      const currentRank = index + 1;
      const prev = user.previousStreakRank || currentRank;
      return {
        ...user.toObject(),
        rank: currentRank,
        rankChange: prev - currentRank,
      };
    });

    let userRank = {
      xp: 'Not Ranked',
      streak: 'Not Ranked',
      xpChange: 0,
      streakChange: 0,
    };
    const cleanUserId = userId?.trim();

    if (cleanUserId && /^[0-9a-fA-F]{24}$/.test(cleanUserId)) {
      const user = await this.userModel.findById(cleanUserId).exec();
      if (user) {
        if (['ADMIN', 'admin'].includes(user.role)) {
          userRank = {
            xp: 'Admin',
            streak: 'Admin',
            xpChange: 0,
            streakChange: 0,
          };
        } else {
          const userPoints = user.points ?? 0;
          const userStreak = user.streak ?? 0;

          const xpRank =
            (await this.userModel.countDocuments({
              ...filter,
              $or: [
                { points: { $gt: userPoints } },
                { points: userPoints, _id: { $lt: user._id } },
              ],
            })) + 1;

          const streakRank =
            (await this.userModel.countDocuments({
              ...filter,
              $or: [
                { streak: { $gt: userStreak } },
                { streak: userStreak, _id: { $lt: user._id } },
              ],
            })) + 1;

          userRank = {
            xp: xpRank.toString(),
            streak: streakRank.toString(),
            xpChange: (user.previousXpRank || xpRank) - xpRank,
            streakChange: (user.previousStreakRank || streakRank) - streakRank,
          };
        }
      }
    }
    return {
      topStudents: topStudentsWithChange,
      topStreaks: topStreaksWithChange,
      userRank,
    };
  }

  /**
   * Snapshots the current ranks of all users and saves them to previousRank fields.
   * WHY: To provide the "rank change" visuals in the Hall of Fame.
   */
  async updatePreviousRanks() {
    const filter = { role: { $nin: ['ADMIN', 'admin'] } };

    // 1. Snapshot XP Ranks
    const sortedByXP = await this.userModel
      .find(filter)
      .sort({ points: -1, _id: 1 })
      .select('_id')
      .exec();
    const xpUpdates = sortedByXP.map((user, index) => ({
      updateOne: {
        filter: { _id: user._id },
        update: { previousXpRank: index + 1 },
      },
    }));

    // 2. Snapshot Streak Ranks
    const sortedByStreak = await this.userModel
      .find(filter)
      .sort({ streak: -1, _id: 1 })
      .select('_id')
      .exec();
    const streakUpdates = sortedByStreak.map((user, index) => ({
      updateOne: {
        filter: { _id: user._id },
        update: { previousStreakRank: index + 1 },
      },
    }));

    if (xpUpdates.length > 0) await this.userModel.bulkWrite(xpUpdates);
    if (streakUpdates.length > 0) await this.userModel.bulkWrite(streakUpdates);

    return { totalProcessed: sortedByXP.length };
  }

  // --- Admin & Utils ---

  async updateGroqKey(userId: string, apiKey: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, { groqApiKey: apiKey })
      .exec();
  }

  async getContributedKeysCount(): Promise<number> {
    return this.userModel
      .countDocuments({ groqApiKey: { $exists: true, $ne: null } })
      .exec();
  }

  async getUsersWithKeys(): Promise<UserDocument[]> {
    return this.userModel
      .find({ groqApiKey: { $exists: true, $ne: null } })
      .select('groqApiKey createdAt')
      .exec();
  }

  async checkActivityLimit(
    userId: string,
    type: 'dailyDocs' | 'dailyMessages',
  ): Promise<void> {
    const check = await this.checkUsageLimit(userId, type);
    if (!check.allowed) {
      throw new BadRequestException(check.reason);
    }
  }

  async incrementActivityCount(
    userId: string,
    type: 'dailyDocs' | 'dailyMessages',
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        $inc: { [type]: 1 },
        lastStudyDate: new Date(),
      })
      .exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password -refreshToken').exec();
  }

  async delete(userId: string): Promise<void> {
    await this.userModel.findByIdAndDelete(userId).exec();
  }

  async feedPet(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user || user.points < 50)
      throw new BadRequestException('Cannot feed pet.');
    user.points -= 50;
    if (!user.pet)
      user.pet = { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' };
    user.pet.mood = 'super-happy';
    user.markModified('pet');
    return user.save();
  }
}
