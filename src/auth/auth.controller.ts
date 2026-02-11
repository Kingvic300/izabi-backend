import { Controller, Post, UseGuards, Req, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshJwtGuard } from './guards/refresh-jwt.guard';

@Controller('api/auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('google')
    async googleLogin(@Body('idToken') idToken: string) {
        return this.authService.googleLogin(idToken);
    }

    @UseGuards(RefreshJwtGuard)
    @Post('refresh')
    async refreshTokens(@Req() req: any) {
        const userId = req.user['sub'];
        const refreshToken = req.user['refreshToken'];
        return this.authService.refreshTokens(userId, refreshToken);
    }
}
