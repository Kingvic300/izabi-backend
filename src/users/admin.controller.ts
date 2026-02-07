import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotesService } from '../notes/notes.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notesService: NotesService,
  ) {}

  /**
   * Get admin dashboard statistics
   */
  @Get('stats')
  async getStats() {
    try {
      const users = await this.usersService.findAll();
      const notes = await this.notesService.countAll();
      const contributedKeys = await this.usersService.getContributedKeysCount();

      // Calculate active users (users who logged in within last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      const activeUsers = users.filter((u: any) => u.lastStudyDate && new Date(u.lastStudyDate) > oneDayAgo);

      // Calculate growth (new users in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newUsers = users.filter((u: any) => new Date(u.createdAt) > thirtyDaysAgo);
      const growth = users.length > 0 ? ((newUsers.length / users.length) * 100).toFixed(1) : 0;

      // Generate chart data - User growth over last 7 days
      const userGrowthChart = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const usersOnDay = users.filter((u: any) => {
          const created = new Date(u.createdAt);
          return created >= dayStart && created < dayEnd;
        }).length;

        userGrowthChart.push({
          date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          users: usersOnDay,
        });
      }

      // Activity trend - Active users per day for last 7 days
      const activityChart = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const activeOnDay = users.filter((u: any) => {
          if (!u.lastStudyDate) return false;
          const lastStudy = new Date(u.lastStudyDate);
          return lastStudy >= dayStart && lastStudy < dayEnd;
        }).length;

        activityChart.push({
          date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          active: activeOnDay,
        });
      }

      return {
        success: true,
        data: {
          totalUsers: users.length,
          activeNow: activeUsers.length,
          totalNotes: notes,
          contributedKeys: contributedKeys,
          growth: parseFloat(growth as string),
          userGrowthChart,
          activityChart,
        },
      };
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      return {
        success: false,
        message: 'Failed to fetch admin statistics',
        data: {
          totalUsers: 0,
          activeNow: 0,
          totalNotes: 0,
          contributedKeys: 0,
          growth: 0,
          userGrowthChart: [],
          activityChart: [],
        },
      };
    }
  }

  /**
   * Get all users
   */
  @Get('users')
  async getAllUsers() {
    try {
      const users = await this.usersService.findAll();
      return {
        success: true,
        data: users.map(user => ({
          id: user._id,
          email: user.email,
          firstName: user.firstName || 'N/A',
          lastName: user.lastName || 'N/A',
          role: user.role || 'USER',
          isVerified: user.isVerified,
          studyStreak: user.streak || 0,
          points: user.points || 0,
          createdAt: user.createdAt,
        })),
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      return {
        success: false,
        message: 'Failed to fetch users',
        data: [],
      };
    }
  }

  /**
   * Get all contributed Groq API keys
   */
  @Get('contributed-keys')
  async getContributedKeys() {
    try {
      const usersWithKeys = await this.usersService.getUsersWithKeys();
      return {
        success: true,
        data: usersWithKeys.map(user => ({
          id: user._id,
          userId: user._id,
          apiKey: user.groqApiKey,
          createdAt: user.createdAt,
        })),
      };
    } catch (error) {
      console.error('Error fetching contributed keys:', error);
      return {
        success: false,
        message: 'Failed to fetch contributed keys',
        data: [],
      };
    }
  }

  /**
   * Delete a user
   */
  @Delete('users/:id')
  async deleteUser(@Param('id') userId: string) {
    try {
      await this.usersService.delete(userId);
      return {
        success: true,
        message: 'User deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting user:', error);
      return {
        success: false,
        message: 'Failed to delete user',
      };
    }
  }
}
