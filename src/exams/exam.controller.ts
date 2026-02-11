import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Req,
    BadRequestException,
    Delete,
    Param,
} from '@nestjs/common';
import { ExamsService } from './exam.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
    constructor(private readonly examsService: ExamsService) {}

    /**
     * Start a Full CBT Simulation
     * GET /api/exams/simulation?category=JAMB&subject=English
     */
    @Get('simulation')
    async getSimulation(
        @Req() req: any,
        @Query('category') category: 'JAMB' | 'WAEC' | 'JUPEB' | 'UNIVERSITY',
        @Query('subject') subject?: string,
        @Query('universityName') universityName?: string,
        @Query('department') department?: string,
        @Query('courseTitle') courseTitle?: string,
        @Query('count') count?: number,
    ) {
        if (!category) {
            throw new BadRequestException(
                'Category is required for a simulation',
            );
        }

        const userId = req.user?.userId;
        const config = {
            category,
            subject,
            universityName,
            department,
            courseTitle,
            count: count ? Number(count) : 25,
        };

        return this.examsService.getSimulation(userId, config);
    }

    /**
     * Generate Custom AI Practice Tests
     */
    @Post('generate')
    async generate(
        @Req() req: any,
        @Body()
        body: {
            category: 'JAMB' | 'WAEC' | 'JUPEB' | 'UNIVERSITY';
            subject?: string;
            universityName?: string;
            department?: string;
            courseTitle?: string;
            count?: number;
        },
    ) {
        return this.examsService.generatePracticeExam(req.user.userId, body);
    }

    /**
     * Get archived past questions (filters)
     */
    @Get('past-questions')
    async getPastQuestions(
        @Query('category') category: string,
        @Query('subject') subject?: string,
        @Query('institution') institution?: string,
    ) {
        return this.examsService.findPastQuestions(
            category,
            subject,
            institution,
        );
    }

    /**
     * User's personal history
     */
    @Get('my-history')
    async getHistory(@Req() req: any) {
        return this.examsService.getUserExams(req.user.userId);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.examsService.deleteExam(id);
    }
}
