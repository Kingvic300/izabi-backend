import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as path from 'path';
import { cosineSimilarity } from '../common/utils/embedding.utils.js';
import {
    KnowledgeBase,
    KnowledgeBaseDocument,
} from './entities/knowledge-base.entity.js';

type SearchResult = {
    _id: any;
    userId: string;
    documentId: string;
    content: string;
    vector: number[];
    metadata: Record<string, any>;
    score: number;
};

@Injectable()
export class VectorService implements OnModuleInit {
    private readonly logger = new Logger(VectorService.name);

    private embedder: any;
    private embedderLoading?: Promise<void>;

    constructor(
        @InjectModel(KnowledgeBase.name)
        private readonly knowledgeModel: Model<KnowledgeBaseDocument>,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.loadEmbedder();
    }

    private async loadEmbedder(): Promise<void> {
        if (this.embedder) return;

        if (!this.embedderLoading) {
            this.embedderLoading = (async () => {
                const { pipeline, env } = await import('@xenova/transformers');

                env.cacheDir = path.resolve(process.cwd(), '.cache');
                env.allowLocalModels = false;

                this.logger.log('Loading embedding model...');
                this.embedder = await pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2',
                    { quantized: true },
                );
                this.logger.log('Embedding model loaded.');
            })();
        }

        await this.embedderLoading;
    }

    async getEmbedding(text: string): Promise<number[]> {
        const cleaned = text?.trim();
        if (!cleaned || cleaned.length < 5) {
            throw new Error('Text too short for embedding');
        }

        if (cleaned.length > 10_000) {
            throw new Error('Text too long for embedding');
        }

        await this.loadEmbedder();

        const tensor = await this.embedder(cleaned, {
            pooling: 'mean',
            normalize: true,
        });

        // Tensor.data can be Int8Array | Float32Array | etc
        return Array.from(tensor.data as Iterable<number>);
    }

    chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + chunkSize;

            if (end < text.length) {
                const boundary = Math.max(
                    text.lastIndexOf('\n', end),
                    text.lastIndexOf('.', end),
                    text.lastIndexOf('?', end),
                    text.lastIndexOf('!', end),
                );

                if (boundary > start + chunkSize / 2) {
                    end = boundary + 1;
                }
            }

            const chunk = text.slice(start, end).trim();
            if (chunk.length > 50) chunks.push(chunk);

            start = Math.max(end - overlap, 0);
        }

        return chunks;
    }

    async addDocument(
        userId: string,
        documentId: string,
        text: string,
        metadata: Record<string, any> = {},
    ): Promise<void> {
        const chunks = this.chunkText(text);

        this.logger.log(
            `Vectorizing ${chunks.length} chunks for document ${documentId}`,
        );

        await this.knowledgeModel.deleteMany({ userId, documentId });

        const BATCH_SIZE = 5;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const docs = [];

            for (const chunk of batch) {
                const vector = await this.getEmbedding(chunk);
                docs.push({
                    userId,
                    documentId,
                    content: chunk,
                    vector,
                    metadata,
                });
            }

            if (docs.length) {
                await this.knowledgeModel.insertMany(docs);
            }
        }

        this.logger.log(`Finished storing vectors for ${documentId}`);
    }

    async search(
        userId: string,
        query: string,
        documentId?: string,
        limit = 5,
    ): Promise<SearchResult[]> {
        const queryVector = await this.getEmbedding(query);

        const filter: Record<string, any> = { userId };
        if (documentId) filter.documentId = documentId;

        const candidates = await this.knowledgeModel
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();

        if (!candidates.length) return [];

        const scored = candidates.map((doc) => ({
            _id: doc._id,
            userId: doc.userId,
            documentId: doc.documentId,
            content: doc.content,
            vector: doc.vector,
            metadata: doc.metadata,
            score: cosineSimilarity(queryVector, doc.vector),
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, limit);
    }
}
