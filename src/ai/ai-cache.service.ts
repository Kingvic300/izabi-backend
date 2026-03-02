import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AiCache, AiCacheDocument } from './entities/ai-cache.entity.js';
import {
    AiCacheChunk,
    AiCacheChunkDocument,
} from './entities/ai-cache-chunk.entity.js';
import {
    EmbeddingCache,
    EmbeddingCacheDocument,
} from './entities/embedding-cache.entity.js';
import { VectorService } from './vector.service.js';
import { generateHash, normalizeText } from '../common/utils/text-cache.utils.js';
import { EmbeddingQueueService } from './embedding-queue.service.js';

type SimilarityResult = {
    match: { doc: AiCacheDocument; score: number } | null;
};

@Injectable()
export class AiCacheService {
    private readonly logger = new Logger(AiCacheService.name);
    private readonly similarityEnabled: boolean;
    private readonly similarityThreshold: number;
    private readonly similarityCandidateLimit: number;
    private readonly similarityLimit: number;
    private readonly cacheTtlDays: number;
    private readonly embeddingModel: string;
    private readonly chunkSize: number;
    private readonly chunkOverlap: number;
    private readonly maxChunkCount: number;
    private readonly vectorIndexName: string;

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(AiCache.name)
        private readonly aiCacheModel: Model<AiCacheDocument>,
        @InjectModel(AiCacheChunk.name)
        private readonly aiCacheChunkModel: Model<AiCacheChunkDocument>,
        @InjectModel(EmbeddingCache.name)
        private readonly embeddingCacheModel: Model<EmbeddingCacheDocument>,
        private readonly vectorService: VectorService,
        private readonly embeddingQueueService: EmbeddingQueueService,
    ) {
        this.similarityEnabled =
            this.configService.get<string>('AI_CACHE_SIMILARITY') !== 'false';
        this.similarityThreshold = Number(
            this.configService.get<string>('AI_CACHE_SIM_THRESHOLD') ?? 0.9,
        );
        this.similarityCandidateLimit = Number(
            this.configService.get<string>('AI_CACHE_SIM_CANDIDATES') ?? 200,
        );
        this.similarityLimit = Number(
            this.configService.get<string>('AI_CACHE_SIM_LIMIT') ?? 4,
        );
        this.cacheTtlDays = Number(
            this.configService.get<string>('AI_CACHE_TTL_DAYS') ?? 30,
        );
        this.embeddingModel =
            this.configService.get<string>('AI_EMBEDDING_MODEL') ?? 'default';
        this.chunkSize = Number(
            this.configService.get<string>('AI_CACHE_CHUNK_SIZE') ?? 1200,
        );
        this.chunkOverlap = Number(
            this.configService.get<string>('AI_CACHE_CHUNK_OVERLAP') ?? 200,
        );
        this.maxChunkCount = Number(
            this.configService.get<string>('AI_CACHE_MAX_CHUNKS') ?? 12,
        );
        this.vectorIndexName =
            this.configService.get<string>('AI_CACHE_VECTOR_INDEX') ??
            'ai_cache_chunks_vector';
    }

    buildCacheKey(text: string, prompt: string) {
        const normalizedText = normalizeText(text);
        const normalizedPrompt = normalizeText(prompt);
        const textHash = generateHash(normalizedText);
        const promptHash = generateHash(normalizedPrompt);
        return { normalizedText, normalizedPrompt, textHash, promptHash };
    }

    async findExact(
        userId: string,
        textHash: string,
        promptHash: string,
    ): Promise<AiCacheDocument | null> {
        return this.aiCacheModel
            .findOne({ userId, textHash, promptHash })
            .select('aiOutput textHash promptHash userId')
            .lean()
            .exec();
    }

    async findSimilar(
        userId: string,
        promptHash: string,
        normalizedText: string,
    ): Promise<SimilarityResult> {
        if (!this.similarityEnabled) {
            return { match: null };
        }

        const chunks = this.chunkText(normalizedText);
        const embeddings = await this.getCachedEmbeddings({
            chunks,
        });
        if (!embeddings.length) {
            return { match: null };
        }

        let bestScore = 0;
        let bestMatch: { textHash: string } | null = null;

        for (const embedding of embeddings) {
            const match = await this.vectorSearchBestMatch(
                userId,
                promptHash,
                embedding,
            );
            if (match && match.score > bestScore) {
                bestScore = match.score;
                bestMatch = { textHash: match.textHash };
            }
        }

        if (!bestMatch || bestScore < this.similarityThreshold) {
            return { match: null };
        }

        const cached = await this.aiCacheModel
            .findOne({
                userId,
                promptHash,
                textHash: bestMatch.textHash,
            })
            .select('aiOutput textHash promptHash userId')
            .lean()
            .exec();

        if (!cached) {
            return { match: null };
        }

        return { match: { doc: cached, score: bestScore } };
    }

    async store(
        userId: string,
        textHash: string,
        promptHash: string,
        normalizedText: string,
        aiOutput: string,
        metadata: Record<string, any> = {},
    ) {
        const expiresAt = this.getExpiryDate();
        await this.aiCacheModel.findOneAndUpdate(
            { userId, textHash, promptHash },
            {
                $set: {
                    normalizedText,
                    aiOutput,
                    metadata,
                    embeddingModel: this.embeddingModel,
                    expiresAt,
                },
                $setOnInsert: { userId, textHash, promptHash },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        this.enqueueEmbeddingJob({
            userId,
            textHash,
            promptHash,
            normalizedText,
        }).catch((error) =>
            this.logger.warn(
                `[AiCache] Failed to enqueue embedding job: ${String(error)}`,
            ),
        );
    }

    async processEmbeddingJob(payload: {
        userId: string;
        textHash: string;
        promptHash: string;
        normalizedText: string;
    }): Promise<void> {
        const { userId, textHash, promptHash, normalizedText } = payload;

        const cacheEntry = await this.aiCacheModel
            .findOne({ userId, textHash, promptHash })
            .select('_id')
            .lean()
            .exec();

        if (!cacheEntry) return;

        const existingCount = await this.aiCacheChunkModel.countDocuments({
            userId,
            textHash,
            promptHash,
        });

        if (existingCount > 0) {
            return;
        }

        const chunks = this.chunkText(normalizedText);
        if (!chunks.length) return;

        const expiresAt = this.getExpiryDate();
        const docs: AiCacheChunk[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            const chunkHash = generateHash(normalizeText(chunkText));
            const embedding = await this.getOrCreateEmbedding(chunkText, chunkHash);
            if (!embedding) continue;

            docs.push({
                userId,
                textHash,
                promptHash,
                chunkIndex: i,
                chunkHash,
                chunkText,
                embedding,
                embeddingModel: this.embeddingModel,
                metadata: {},
                expiresAt,
            } as AiCacheChunk);
        }

        if (docs.length) {
            await this.aiCacheChunkModel.insertMany(docs, { ordered: false });
        }

        await this.aiCacheModel.updateOne(
            { userId, textHash, promptHash },
            { $set: { chunkCount: docs.length, embeddingModel: this.embeddingModel } },
        );
    }

    private chunkText(text: string): string[] {
        return this.vectorService
            .chunkText(text, this.chunkSize, this.chunkOverlap)
            .slice(0, this.maxChunkCount);
    }

    private async getCachedEmbeddings(params: {
        chunks: string[];
    }): Promise<number[][]> {
        const { chunks } = params;
        const embeddings: number[][] = [];
        const chunkPairs = chunks
            .map((chunkText) => {
                const normalized = normalizeText(chunkText);
                if (!normalized || normalized.length < 5) return null;
                return { chunkText, chunkHash: generateHash(normalized) };
            })
            .filter(Boolean) as { chunkText: string; chunkHash: string }[];

        const hashes = chunkPairs.map((pair) => pair.chunkHash);
        const cachedEmbeddings = await this.embeddingCacheModel
            .find({ textHash: { $in: hashes }, embeddingModel: this.embeddingModel })
            .select('textHash embedding')
            .lean()
            .exec();

        const cacheMap = new Map(
            cachedEmbeddings.map((item) => [item.textHash, item.embedding]),
        );

        const missingChunks = chunkPairs.filter(
            (pair) => !cacheMap.has(pair.chunkHash),
        );

        for (const pair of chunkPairs) {
            const embedding = cacheMap.get(pair.chunkHash);
            if (embedding?.length) embeddings.push(embedding);
        }

        if (missingChunks.length) {
            this.logger.debug(
                `[AiCache] Missing ${missingChunks.length} embeddings for similarity search; skipping prewarm.`,
            );
        }

        return embeddings;
    }

    private async vectorSearchBestMatch(
        userId: string,
        promptHash: string,
        queryVector: number[],
    ): Promise<{ textHash: string; score: number } | null> {
        const pipeline: any[] = [
            {
                $vectorSearch: {
                    index: this.vectorIndexName,
                    path: 'embedding',
                    queryVector,
                    numCandidates: this.similarityCandidateLimit,
                    limit: this.similarityLimit,
                    filter: {
                        userId,
                        promptHash,
                        embeddingModel: this.embeddingModel,
                    },
                },
            },
            {
                $project: {
                    textHash: 1,
                    score: { $meta: 'vectorSearchScore' },
                },
            },
            { $sort: { score: -1 } },
            { $limit: 1 },
        ];

        const results = await this.aiCacheChunkModel
            .aggregate(pipeline)
            .allowDiskUse(true)
            .exec()
            .catch((error) => {
                this.logger.warn(
                    `[AiCache] Vector search unavailable: ${String(error)}`,
                );
                return [];
            });

        if (!results.length) return null;
        return { textHash: results[0].textHash, score: results[0].score };
    }

    private async getOrCreateEmbedding(
        text: string,
        textHash: string,
    ): Promise<number[] | null> {
        const cached = await this.embeddingCacheModel
            .findOne({ textHash, embeddingModel: this.embeddingModel })
            .select('embedding')
            .lean()
            .exec();
        if (cached?.embedding?.length) return cached.embedding;

        const embedding = await this.getEmbeddingWithRetry(text);
        if (!embedding) return null;

        await this.embeddingCacheModel.updateOne(
            { textHash, embeddingModel: this.embeddingModel },
            {
                $set: {
                    embedding,
                    expiresAt: this.getExpiryDate(),
                    embeddingModel: this.embeddingModel,
                },
            },
            { upsert: true },
        );

        return embedding;
    }

    private async getEmbeddingWithRetry(
        text: string,
        attempt = 0,
    ): Promise<number[] | null> {
        try {
            return await this.vectorService.getEmbedding(text);
        } catch (error: any) {
            if (attempt >= 3) {
                this.logger.warn(
                    `[AiCache] Embedding generation failed after retries: ${String(
                        error,
                    )}`,
                );
                return null;
            }

            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            return this.getEmbeddingWithRetry(text, attempt + 1);
        }
    }

    private getExpiryDate(): Date {
        const now = new Date();
        now.setDate(now.getDate() + this.cacheTtlDays);
        return now;
    }

    private async enqueueEmbeddingJob(payload: {
        userId: string;
        textHash: string;
        promptHash: string;
        normalizedText: string;
    }): Promise<void> {
        await this.embeddingQueueService.enqueueEmbeddingJob(payload);
    }
}
