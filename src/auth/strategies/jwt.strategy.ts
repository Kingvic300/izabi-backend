import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                ExtractJwt.fromUrlQueryParameter('token'),
            ]),
            ignoreExpiration: false,
            secretOrKey:
                configService.get<string>('JWT_ACCESS_SECRET') ||
                'accessSecret',
        } as any);
    }

    async validate(payload: any) {
        try {
            const user = await this.usersService.findOne(payload.sub);
            if (!user?.refreshToken) {
                throw new UnauthorizedException('Session expired');
            }
        } catch (error) {
            throw new UnauthorizedException('Session expired');
        }
        return {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
        };
    }
}
