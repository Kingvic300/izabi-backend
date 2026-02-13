import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AiCache, AiCacheDocument } from './entities/ai-cache.entity.js';
import { VectorService } from './vector.service.js';
import {
    averageEmbeddings,
    cosineSimilarity,
} from '../common/utils/embedding.utils.js';
import { generateHash, normalizeText } from '../common/utils/text-cache.utils.js';

type SimilarityResult = {
    embedding: number[] | null;
    match: { doc: AiCacheDocument; score: number } | null;
};

@Injectable()
export class AiCacheService {
    private readonly logger = new Logger(AiCacheService.name);
    private readonly similarityEnabled: boolean;
    private readonly similarityThreshold: number;
    private readonly similarityCandidateLimit: number;

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(AiCache.name)
        private readonly aiCacheModel: Model<AiCacheDocument>,
        private readonly vectorService: VectorService,
    ) {
        this.similarityEnabled =
            this.configService.get<string>('AI_CACHE_SIMILARITY') !== 'false';
        this.similarityThreshold = Number(
            this.configService.get<string>('AI_CACHE_SIM_THRESHOLD') ?? 0.9,
        );
        this.similarityCandidateLimit = Number(
            this.configService.get<string>('AI_CACHE_SIM_CANDIDATES') ?? 200,
        );
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
            .lean()
            .exec();
    }

    async findSimilar(
        userId: string,
        promptHash: string,
        normalizedText: string,
    ): Promise<SimilarityResult> {
        if (!this.similarityEnabled) {
            return { embedding: null, match: null };
        }

        const embedding = await this.getEmbeddingForText(normalizedText);
        if (!embedding) {
            return { embedding: null, match: null };
        }

        const candidates = await this.aiCacheModel
            .find({
                userId,
                promptHash,
                embedding: { $exists: true, $ne: [] },
            })
            .sort({ createdAt: -1 })
            .limit(this.similarityCandidateLimit)
            .lean();

        if (!candidates.length) {
            return { embedding, match: null };
        }

        let best: AiCacheDocument | null = null;
        let bestScore = 0;

        for (const candidate of candidates) {
            if (!candidate.embedding || candidate.embedding.length === 0) continue;
            const score = cosineSimilarity(embedding, candidate.embedding);
            if (score > bestScore) {
                bestScore = score;
                best = candidate as AiCacheDocument;
            }
        }

        if (best && bestScore >= this.similarityThreshold) {
            return { embedding, match: { doc: best, score: bestScore } };
        }

        return { embedding, match: null };
    }

    async store(
        userId: string,
        textHash: string,
        promptHash: string,
        normalizedText: string,
        aiOutput: string,
        embedding?: number[] | null,
        metadata: Record<string, any> = {},
    ) {
        await this.aiCacheModel.findOneAndUpdate(
            { userId, textHash, promptHash },
            {
                $set: {
                    normalizedText,
                    aiOutput,
                    embedding: embedding ?? undefined,
                    metadata,
                },
                $setOnInsert: { userId, textHash, promptHash },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    }

    private async getEmbeddingForText(text: string): Promise<number[] | null> {
        const normalized = normalizeText(text);
        if (!normalized || normalized.length < 5) return null;

        try {
            if (normalized.length <= 10_000) {
                return await this.vectorService.getEmbedding(normalized);
            }

            const chunks = this.vectorService
                .chunkText(normalized, 4000, 200)
                .slice(0, 5);
            const embeddings: number[][] = [];

            for (const chunk of chunks) {
                try {
                    embeddings.push(await this.vectorService.getEmbedding(chunk));
                } catch (error) {
                    this.logger.warn(
                        `[AiCache] Embedding chunk failed: ${String(error)}`,
                    );
                }
            }

            return embeddings.length ? averageEmbeddings(embeddings) : null;
        } catch (error) {
            this.logger.warn(
                `[AiCache] Embedding generation skipped: ${String(error)}`,
            );
            return null;
        }
    }
}
