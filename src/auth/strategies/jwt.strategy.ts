import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { ImpersonationService } from '../../users/impersonation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private usersService: UsersService,
        private impersonationService: ImpersonationService,
    ) {
        const accessSecret =
            configService.get<string>('JWT_ACCESS_SECRET') || 'accessSecret';
        const impersonationSecret =
            configService.get<string>('JWT_IMPERSONATION_SECRET') ||
            accessSecret;

        const resolveSecret = (rawJwtToken: string) => {
            try {
                const payloadSegment = rawJwtToken.split('.')[1];
                if (!payloadSegment) return accessSecret;
                const decoded = JSON.parse(
                    Buffer.from(payloadSegment, 'base64').toString('utf-8'),
                );
                if (decoded?.type === 'impersonation') {
                    return impersonationSecret;
                }
                return accessSecret;
            } catch {
                return accessSecret;
            }
        };

        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                ExtractJwt.fromUrlQueryParameter('token'),
            ]),
            ignoreExpiration: false,
            secretOrKeyProvider: (
                req: any,
                rawJwtToken: string,
                done: (err: any, secret?: string | Buffer) => void,
            ) => {
                done(null, resolveSecret(rawJwtToken));
            },
        } as any);
    }

    async validate(payload: any) {
        if (payload?.type === 'impersonation') {
            const context =
                await this.impersonationService.getImpersonationContext(
                    payload,
                );
            if (!context?.user) {
                throw new UnauthorizedException('Impersonation session expired');
            }

            return {
                userId: String(context.user._id || context.user.id),
                email: context.user.email,
                role: context.user.role,
                impersonatedBy: context.admin?._id || payload.impersonatedBy,
                impersonationAuditId: context.impersonationAuditId,
                isImpersonating: true,
            };
        }
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
