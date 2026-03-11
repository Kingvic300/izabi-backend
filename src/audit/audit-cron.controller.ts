/**
 * CRITICAL: This file uses NestJS Legacy Decorators.
 * If you see "Decorators are not valid here", ensure experimentalDecorators is enabled.
 */
import {
    Controller,
    Get,
    Headers,
    Query,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditScheduler } from './audit.scheduler';

@Controller('api/cron')
export class CronController {
    constructor(
        private readonly configService: ConfigService,
        private readonly auditScheduler: AuditScheduler,
    ) {}

    @Get('medium-severity')
    async triggerMediumDigest(
        @Headers('x-cron-secret') headerSecret: string,
        @Query('secret') querySecret: string,
    ) {
        this.validateSecret(headerSecret || querySecret);
        return await this.auditScheduler.handleDailySummary(true);
    }

    @Get('low-severity')
    async triggerLowDigest(
        @Headers('x-cron-secret') headerSecret: string,
        @Query('secret') querySecret: string,
    ) {
        this.validateSecret(headerSecret || querySecret);
        return await this.auditScheduler.handleDailySummary(true);
    }

    @Get('daily-summary')
    async triggerDailySummary(
        @Headers('x-cron-secret') headerSecret: string,
        @Query('secret') querySecret: string,
        @Query('force') force?: string,
    ) {
        this.validateSecret(headerSecret || querySecret);
        const isForce =
            force === '1' || force === 'true' || force === 'yes';
        return await this.auditScheduler.handleDailySummary(true, isForce);
    }

    private validateSecret(secret: string | undefined): void {
        const validSecret = this.configService.get<string>('CRON_SECRET');
        if (!secret || secret !== validSecret) {
            throw new UnauthorizedException('Invalid cron secret');
        }
    }
}
