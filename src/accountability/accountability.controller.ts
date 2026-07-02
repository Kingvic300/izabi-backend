import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpException,
    InternalServerErrorException,
    Param,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { AccountabilityService } from './accountability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isValidObjectId } from 'mongoose';
import {
    CheckInDto,
    InvitePartnerDto,
    RedeemInviteDto,
    RespondToInviteDto,
    SaveGoalDto,
    SendMessageDto,
} from './dto/accountability.dto';

@Controller('api/accountability')
@UseGuards(JwtAuthGuard)
export class AccountabilityController {
    constructor(
        private readonly accountabilityService: AccountabilityService,
    ) {}

    private async run<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (error: any) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Something went wrong. Please try again.',
            );
        }
    }

    @Post('partnerships/invite')
    async invite(@Request() req: any, @Body() dto: InvitePartnerDto) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.createInvite(userId, dto.email),
        );
    }

    @Post('partnerships/redeem')
    async redeem(@Request() req: any, @Body() dto: RedeemInviteDto) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.redeemInvite(userId, dto.code),
        );
    }

    @Post('partnerships/:id/respond')
    async respond(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: RespondToInviteDto,
    ) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.respondToInvite(
                userId,
                id,
                dto.accept,
            ),
        );
    }

    @Post('partnerships/:id/end')
    async end(@Request() req: any, @Param('id') id: string) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.endPartnership(userId, id),
        );
    }

    @Get('partnerships/me')
    async me(@Request() req: any) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.getMyPartnership(userId),
        );
    }

    @Post('goals')
    async saveGoal(@Request() req: any, @Body() dto: SaveGoalDto) {
        const userId = req.user.userId;
        return this.run(() => this.accountabilityService.saveGoal(userId, dto));
    }

    @Get('goals/active')
    async activeGoal(@Request() req: any) {
        const userId = req.user.userId;
        return this.run(() => this.accountabilityService.getActiveGoal(userId));
    }

    @Post('goals/:goalId/check-in')
    async checkIn(
        @Request() req: any,
        @Param('goalId') goalId: string,
        @Body() dto: CheckInDto,
    ) {
        const userId = req.user.userId;
        if (!isValidObjectId(goalId)) {
            throw new BadRequestException('Invalid goal id');
        }
        return this.run(() =>
            this.accountabilityService.checkIn(userId, goalId, dto.note),
        );
    }

    @Get('streak')
    async streak(@Request() req: any) {
        const userId = req.user.userId;
        return this.run(() => this.accountabilityService.getPartnerStreak(userId));
    }

    @Get('study-summary')
    async studySummary(@Request() req: any) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.getPartnerStudySummary(userId),
        );
    }

    @Get('messages')
    async messages(
        @Request() req: any,
        @Query('before') before?: string,
        @Query('limit') limit?: string,
    ) {
        const userId = req.user.userId;
        const parsedLimit = limit ? parseInt(limit, 10) : undefined;
        return this.run(() =>
            this.accountabilityService.getMessages(
                userId,
                before,
                Number.isFinite(parsedLimit) ? parsedLimit : undefined,
            ),
        );
    }

    @Post('messages')
    async sendMessage(@Request() req: any, @Body() dto: SendMessageDto) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.sendMessage(
                userId,
                dto.content,
                dto.type || 'message',
            ),
        );
    }

    @Post('messages/read')
    async markRead(@Request() req: any) {
        const userId = req.user.userId;
        return this.run(() =>
            this.accountabilityService.markMessagesRead(userId),
        );
    }
}
