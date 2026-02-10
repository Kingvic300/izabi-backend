import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private mailService: MailService,
    ) {}

    async validateUser(email: string, pass: string): Promise<any> {
        const normalizedEmail = email.toLowerCase();
        const user = await this.usersService.findByEmail(normalizedEmail);
        if (!user) return null;

        if (!user.isVerified) {
            throw new UnauthorizedException('Please verify your email first');
        }

        if (await bcrypt.compare(pass, user.password)) {
            const userObj = user.toObject();
            const { password, ...result } = userObj;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const userId = user._id?.toString() || user.id;

        // Trigger a check-in on login to update streaks and pet status
        const updatedUser = await this.usersService.checkIn(userId);

        const tokens = await this.getTokens(userId, user.email, user.role);
        await this.updateRefreshToken(userId, tokens.refreshToken);

        const mongoUser = updatedUser.toObject();

        delete mongoUser.password;
        delete mongoUser.refreshToken;
        delete mongoUser.otp;
        delete mongoUser.otpExpires;

        return {
            user: mongoUser,
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        };
    }

    async getTokens(userId: string, email: string, role: string) {
        const payload = { sub: userId, email, role };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET') || 'accessSecret',
                expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m') as any,
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refreshSecret',
                expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d') as any,
            }),
        ]);

        return {
            accessToken,
            refreshToken,
        };
    }

    async updateRefreshToken(userId: string, refreshToken: string | null) {
        const hashedHandle = refreshToken ? await bcrypt.hash(refreshToken, 10) : null;
        await this.usersService.updateRefreshToken(userId, hashedHandle);
    }

    async refreshTokens(userId: string, refreshToken: string) {
        const user = await this.usersService.findOne(userId);
        if (!user || !user.refreshToken) throw new UnauthorizedException('Access Denied');

        const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!refreshTokenMatches) throw new UnauthorizedException('Access Denied');

        const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
        await this.updateRefreshToken(user._id.toString(), tokens.refreshToken);
        return tokens;
    }

    async sendOtp(email: string, pass: string, role: string, firstName?: string, lastName?: string) {
        const normalizedEmail = email.toLowerCase();
        
        const existingUser = await this.usersService.findByEmail(normalizedEmail);
        if (existingUser && existingUser.isVerified) {
            throw new ConflictException('User already exists');
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        if (!existingUser) {
            await this.usersService.create({ 
                email: normalizedEmail, 
                password: pass, 
                role,
                firstName, 
                lastName 
            });
        } else {
            const hashedPassword = await bcrypt.hash(pass, 10);
            await this.usersService.updatePassword(existingUser._id.toString(), hashedPassword);
            
            if (firstName || lastName) {
                await this.usersService.updateProfile(existingUser._id.toString(), { firstName, lastName });
            }
        }
        
        await this.usersService.updateOtp(normalizedEmail, otp, expires);
        
        try {
            await this.mailService.sendOtp(normalizedEmail, otp);
        } catch (error) {
            console.error(`[OTP] Failed to send email to ${normalizedEmail}:`, error);
            throw new Error('Failed to send verification email. Please try again later.');
        }

        return { message: 'OTP sent' };
    }

    async register(email: string, otp: string) {
        const normalizedEmail = email.toLowerCase();

        const user = await this.usersService.findByEmail(normalizedEmail);
        if (!user) throw new UnauthorizedException('User not found');

        if (user.otp !== otp) throw new UnauthorizedException('Invalid OTP');
        if (user.otpExpires && new Date() > user.otpExpires) {
            throw new UnauthorizedException('OTP has expired');
        }

        await this.usersService.verifyUser(normalizedEmail);
        
        // Trigger initial check-in to start the streak upon registration/verification
        const updatedUser = await this.usersService.checkIn(user._id.toString());

        const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
        await this.updateRefreshToken(user._id.toString(), tokens.refreshToken);

        const mongoUser = updatedUser.toObject();

        delete mongoUser.password;
        delete mongoUser.refreshToken;
        delete mongoUser.otp;
        delete mongoUser.otpExpires;

        return {
            message: 'User verified',
            user: mongoUser,
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        };
    }
}