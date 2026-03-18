import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { VoiceService } from './voice.service';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { STUDY_PROMPTS } from './study.prompts';

@Controller('api/study')
export class StudyVoiceController {
    constructor(
        private readonly aiService: AiService,
        private readonly voiceService: VoiceService,
        private readonly usersService: UsersService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    // --- Neural Voice System ---
    @UseGuards(JwtAuthGuard)
    @Post('generate-voice')
    async generateVoice(
        @Body('text') text: string,
        @Body('lang') lang: string,
        @Body('isPidgin') isPidgin: boolean,
        @Body('voice') voice: string,
        @Body('speed') speed: number,
        @Req() req: any,
    ) {
        const userId = req.user.userId;
        if (!text) throw new BadRequestException('Text is required');

        let processedText = text;
        let resolvedLang = lang;
        if (!resolvedLang) {
            const user = await this.usersService.findOne(userId);
            resolvedLang = (
                (user as any).preferredLanguage || 'en'
            ).toString().trim().toLowerCase();
        }
        const normalizedLang = (resolvedLang || 'en')
            .toString()
            .trim()
            .toLowerCase();
        if (
            normalizedLang === 'english' ||
            normalizedLang === 'en' ||
            normalizedLang.startsWith('en-')
        ) {
            resolvedLang = 'en';
        } else {
            resolvedLang = normalizedLang;
        }

        const requestedVoice = (voice || '').toString().trim().toLowerCase();
        if (requestedVoice) {
            resolvedLang = requestedVoice;
        }

        // Handle Pidgin Translation if requested
        if (isPidgin) {
            processedText = await this.aiService.getResponse(
                STUDY_PROMPTS.PIDGIN_TRANSLATION(text),
                userId,
                undefined,
                { disableLanguage: true },
            );
        }

        // Clean Markdown artifacts (#, *, `) before sending to TTS
        const cleanText = processedText.replace(/[#*`]/g, '').trim();
        const speedValue =
            typeof speed === 'number' && Number.isFinite(speed)
                ? speed
                : 1;
        const slow = speedValue < 0.95;
        const voiceUrl = await this.voiceService.generateVoice(
            cleanText,
            resolvedLang || 'en',
            { slow },
        );

        return {
            success: true,
            voiceUrl,
            text: processedText,
        };
    }

    // --- Utility ---
    @UseGuards(JwtAuthGuard)
    @Get('upload-signature')
    async getSignature() {
        return this.cloudinaryService.generateSignature();
    }
}
