import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserDocument } from './entities/user.entity';
import { ImpersonationAudit, ImpersonationAuditDocument } from './entities/impersonation-audit.entity';
import { UsersService } from './users.service';

@Injectable()
export class ImpersonationService {
    private readonly IMPERSONATION_SECRET: string;
    private readonly TOKEN_EXPIRY = '1h'; // 1 hour

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(ImpersonationAudit.name) private impersonationAuditModel: Model<ImpersonationAuditDocument>,
        private configService: ConfigService,
        private jwtService: JwtService,
        private usersService: UsersService,
    ) {
        this.IMPERSONATION_SECRET = this.configService.get<string>('JWT_IMPERSONATION_SECRET') 
            || this.configService.get<string>('JWT_ACCESS_SECRET')
            || 'impersonationSecret';
    }

    /**
     * Start impersonation - only allowed by admin
     */
    async startImpersonation(
        adminId: string,
        targetUserId: string,
        req: any,
    ): Promise<{
        token: string;
        expiresIn: number;
        targetUser: {
            id: string;
            email?: string;
            firstName?: string;
            lastName?: string;
            role?: string;
            profilePicturePath?: string;
        };
    }> {
        // 1. Verify admin exists and has admin role
        const admin = await this.userModel.findById(adminId).exec();
        if (!admin) {
            throw new NotFoundException('Admin user not found');
        }
        if (!['ADMIN', 'admin'].includes(admin.role || '')) {
            throw new ForbiddenException('Only admin users can impersonate other users');
        }

        // 2. Verify target user exists
        const targetUser = await this.userModel.findById(targetUserId).exec();
        if (!targetUser) {
            throw new NotFoundException('Target user not found');
        }

        // 3. Prevent impersonation of admins (security constraint)
        if (['super_admin', 'admin', 'ADMIN'].includes(targetUser.role || '')) {
            throw new ForbiddenException('Cannot impersonate admin users');
        }

        // 4. Check if admin is already impersonating someone
        const existingSession = await this.impersonationAuditModel.findOne({
            adminId: admin._id,
            endedAt: { $exists: false },
        }).exec();

        if (existingSession) {
            existingSession.action = 'STOPPED';
            existingSession.endedAt = new Date();
            existingSession.wasManual = false;
            await existingSession.save();
        }

        // 5. Create impersonation audit log
        const auditLog = new this.impersonationAuditModel({
            adminId: admin._id,
            targetUserId: targetUser._id,
            action: 'STARTED',
            startedAt: new Date(),
            ipAddress: req?.ip || req?.connection?.remoteAddress,
            userAgent: req?.headers?.['user-agent'],
            wasManual: false,
            actionsPerformed: {},
        });
        await auditLog.save();

        // 6. Generate impersonation token
        const payload = {
            sub: targetUserId,
            impersonatedBy: adminId,
            type: 'impersonation',
            impersonationAuditId: auditLog._id.toString(),
        };

        const token = this.jwtService.sign(payload, {
            secret: this.IMPERSONATION_SECRET,
            expiresIn: this.TOKEN_EXPIRY,
        });

        return {
            token,
            expiresIn: 3600, // 1 hour in seconds
            targetUser: {
                id: targetUser._id.toString(),
                email: targetUser.email,
                firstName: targetUser.firstName,
                lastName: targetUser.lastName,
                role: targetUser.role,
                profilePicturePath: targetUser.profilePicturePath,
            },
        };
    }

    /**
     * Stop impersonation - manually end the session
     */
    async stopImpersonation(adminId: string, req: any): Promise<{ success: boolean; message: string }> {
        // Find active impersonation session for this admin
        const activeSession = await this.impersonationAuditModel.findOne({
            adminId: adminId,
            endedAt: { $exists: false },
        }).exec();

        if (!activeSession) {
            throw new NotFoundException('No active impersonation session found');
        }

        // Update audit log
        activeSession.action = 'STOPPED';
        activeSession.endedAt = new Date();
        activeSession.wasManual = true;
        await activeSession.save();

        return {
            success: true,
            message: 'Impersonation session terminated successfully',
        };
    }

    /**
     * Validate impersonation token and return user context
     */
    async validateImpersonationToken(token: string): Promise<{
        user: any;
        admin: any;
        impersonationAuditId: string;
    } | null> {
        try {
            const payload = this.jwtService.verify(token, {
                secret: this.IMPERSONATION_SECRET,
            });

            if (payload.type !== 'impersonation') {
                return null;
            }

            // Check if token has expired
            const auditLog = await this.impersonationAuditModel.findById(payload.impersonationAuditId).exec();
            if (!auditLog || auditLog.endedAt) {
                // Session already ended
                return null;
            }

            // Get target user
            const targetUser = await this.usersService.findOne(payload.sub);
            if (!targetUser) {
                return null;
            }

            // Get admin user
            const adminUser = await this.usersService.findOne(payload.impersonatedBy);

            return {
                user: targetUser,
                admin: adminUser,
                impersonationAuditId: payload.impersonationAuditId,
            };
        } catch (error) {
            // Token is invalid or expired
            return null;
        }
    }

    async getImpersonationContext(payload: {
        sub: string;
        impersonatedBy: string;
        impersonationAuditId: string;
        type?: string;
    }): Promise<{
        user: any;
        admin: any;
        impersonationAuditId: string;
    } | null> {
        if (!payload?.impersonationAuditId || !payload?.sub) return null;

        const auditLog = await this.impersonationAuditModel
            .findById(payload.impersonationAuditId)
            .exec();
        if (!auditLog || auditLog.endedAt) {
            return null;
        }

        const targetUser = await this.usersService.findOne(payload.sub);
        if (!targetUser) return null;

        const adminUser = payload.impersonatedBy
            ? await this.usersService.findOne(payload.impersonatedBy)
            : null;

        return {
            user: targetUser,
            admin: adminUser,
            impersonationAuditId: payload.impersonationAuditId,
        };
    }

    /**
     * Log an action during impersonation
     */
    async logAction(auditId: string, action: string, details: any): Promise<void> {
        await this.impersonationAuditModel.findByIdAndUpdate(auditId, {
            $set: {
                [`actionsPerformed.${action}`]: {
                    timestamp: new Date(),
                    details,
                },
            },
        });
    }

    /**
     * Get impersonation history for an admin
     */
    async getImpersonationHistory(adminId: string, limit = 10): Promise<ImpersonationAuditDocument[]> {
        return this.impersonationAuditModel.find({ adminId })
            .sort({ startedAt: -1 })
            .limit(limit)
            .populate('targetUserId', 'email firstName lastName')
            .exec();
    }

    /**
     * Get active impersonation status for an admin
     */
    async getActiveImpersonation(adminId: string): Promise<ImpersonationAuditDocument | null> {
        return this.impersonationAuditModel.findOne({
            adminId: adminId,
            endedAt: { $exists: false },
        })
            .populate('targetUserId', 'email firstName lastName')
            .exec();
    }

    /**
     * Check if admin is currently impersonating
     */
    async isImpersonating(adminId: string): Promise<boolean> {
        const session = await this.impersonationAuditModel.findOne({
            adminId: adminId,
            endedAt: { $exists: false },
        }).exec();
        return !!session;
    }

    /**
     * Clean up expired impersonation sessions (can be called by cron job)
     */
    async cleanupExpiredSessions(): Promise<number> {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const result = await this.impersonationAuditModel.updateMany(
            {
                action: 'STARTED',
                endedAt: { $exists: false },
                startedAt: { $lt: oneHourAgo },
            },
            {
                $set: {
                    action: 'EXPIRED',
                    endedAt: new Date(),
                },
            }
        );

        return result.modifiedCount;
    }
}
