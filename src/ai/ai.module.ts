import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Chat, ChatSchema } from './entities/chat.entity';
import { UsersModule } from '../users/users.module';
import { VectorService } from './vector.service';
import {
    KnowledgeBase,
    KnowledgeBaseSchema,
} from './entities/knowledge-base.entity';
import { AiJob, AiJobSchema } from './entities/ai-job.entity';
import { AiCache, AiCacheSchema } from './entities/ai-cache.entity';
import {
    AiCacheChunk,
    AiCacheChunkSchema,
} from './entities/ai-cache-chunk.entity';
import {
    EmbeddingCache,
    EmbeddingCacheSchema,
} from './entities/embedding-cache.entity';
import { AiQueueService } from './ai.queue.service';
import { AiCacheService } from './ai-cache.service';
import { EmbeddingQueueService } from './embedding-queue.service';
import { EmbeddingJob, EmbeddingJobSchema } from './entities/embedding-job.entity';
import { EmbeddingWorkerService } from './embedding-worker.service';
import { GeminiService } from './gemini.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Chat.name, schema: ChatSchema },
            { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
            { name: AiJob.name, schema: AiJobSchema },
            { name: AiCache.name, schema: AiCacheSchema },
            { name: AiCacheChunk.name, schema: AiCacheChunkSchema },
            { name: EmbeddingCache.name, schema: EmbeddingCacheSchema },
            { name: EmbeddingJob.name, schema: EmbeddingJobSchema },
        ]),
        forwardRef(() => UsersModule),
    ],
    controllers: [AiController],
    providers: [
        AiService,
        VectorService,
        AiQueueService,
        AiCacheService,
        EmbeddingQueueService,
        EmbeddingWorkerService,
        GeminiService,
    ],
    exports: [
        AiService,
        VectorService,
        AiQueueService,
        AiCacheService,
        EmbeddingQueueService,
        GeminiService,
    ],
})
export class AiModule {}
