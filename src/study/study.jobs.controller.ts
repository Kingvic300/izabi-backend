import {
    Body,
    BadRequestException,
    Controller,
    Get,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudyService } from './study.service';
import { StudyJobService } from './study-job.service';
import { StudyQueueService } from './queue/study-queue.service';
import { IngestTextDto } from './dto/ingest-text.dto';

@Controller('api/study')
export class StudyJobsController {
    constructor(
        private readonly studyService: StudyService,
        private readonly studyJobService: StudyJobService,
        private readonly studyQueueService: StudyQueueService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Post('ingest-text')
    async ingestText(@Body() data: IngestTextDto, @Req() req: any) {
        const userId = req.user.userId;
        return this.studyService.startTextIngestion(userId, data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('job-status/:jobId')
    async getJobStatus(@Param('jobId') jobId: string) {
        const job = await this.studyService.getJobStatus(jobId);
        if (!job) {
            throw new BadRequestException('Job not found');
        }
        return {
            success: true,
            data: {
                status: job.status,
                type: job.type,
                fileName: job.fileName,
                result:
                    job.status === 'COMPLETED'
                        ? {
                              summary: this.parseSummaryPayload(
                                  (job as any).summary,
                                  (job.metadata as any)?.summaryFormat,
                              ),
                              flashcards: job.flashcards,
                              questions: job.questions,
                          }
                        : null,
                error:
                    job.status === 'FAILED'
                        ? (job.metadata as any)?.error
                        : null,
                progress: (job.metadata as any)?.progress || null,
            },
        };
    }

    @UseGuards(JwtAuthGuard)
    @Get('job-status-v2/:jobId')
    async getJobStatusV2(@Param('jobId') jobId: string) {
        const jobRecord = await this.studyJobService.findById(jobId);
        if (!jobRecord) {
            throw new BadRequestException('Job not found');
        }

        const history = jobRecord.historyId
            ? await this.studyService.getJobStatus(jobRecord.historyId)
            : null;

        const queueState = await this.studyQueueService.getQueueState(jobId);

        return {
            success: true,
            data: {
                jobId: jobRecord._id.toString(),
                status: jobRecord.status,
                queueState,
                attempts: jobRecord.attempts,
                lastError: jobRecord.lastError || null,
                fileNames: jobRecord.fileNames || [],
                history: history
                    ? {
                          id: history._id,
                          status: history.status,
                          type: history.type,
                          fileName: history.fileName,
                          result:
                              history.status === 'COMPLETED'
                                  ? {
                                        summary: this.parseSummaryPayload(
                                            (history as any).summary,
                                            (history.metadata as any)
                                                ?.summaryFormat,
                                        ),
                                        flashcards: history.flashcards,
                                        questions: history.questions,
                                    }
                                  : null,
                          error:
                              history.status === 'FAILED'
                                  ? (history.metadata as any)?.error
                                  : null,
                          progress: (history.metadata as any)?.progress || null,
                      }
                    : null,
            },
        };
    }

    private parseSummaryPayload(
        raw: any,
        format?: string,
    ): Record<string, any> | string {
        if (!raw) return '';
        if (typeof raw === 'object') return raw;
        if (
            typeof raw === 'string' &&
            (format === 'json' || raw.trim().startsWith('{'))
        ) {
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        }
        return raw;
    }
}
