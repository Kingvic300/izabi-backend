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
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    if (await bcrypt.compare(pass, user.password)) {
      // Mongoose document to object
      const userObj = user.toObject();
      const { password, ...result } = userObj;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const tokens = await this.getTokens(user.id || user._id, user.email, user.role);
    await this.updateRefreshToken(user.id || user._id, tokens.refreshToken);
    return {
      ...tokens,
      userId: user.id || user._id,
      email: user.email,
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

  async sendOtp(email: string, pass: string, role: string) {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser && existingUser.isVerified) {
      throw new ConflictException('User already exists');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    if (!existingUser) {
      await this.usersService.create({ email, password: pass, role });
    } else {
      // Update password for unverified user in case they want to change it
      const hashedPassword = await bcrypt.hash(pass, 10);
      await this.usersService.updatePassword(existingUser._id.toString(), hashedPassword);
    }
    
    await this.usersService.updateOtp(email, otp, expires);
    await this.mailService.sendOtp(email, otp);
    console.log(`[OTP] Sent to ${email}: ${otp} (Expires: ${expires.toISOString()})`); 
    return { message: 'OTP sent' };
  }

  async register(email: string, otp: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');

    if (user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpires && new Date() > user.otpExpires) {
      throw new UnauthorizedException('OTP has expired');
    }

    await this.usersService.verifyUser(email);
    
    // Auto-login after verification
    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      message: 'User verified',
      ...tokens,
      userId: user._id.toString(),
      email: user.email,
    };
  }
}
