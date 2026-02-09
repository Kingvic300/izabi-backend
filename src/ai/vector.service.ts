
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeBase, KnowledgeBaseDocument } from './entities/knowledge-base.entity.js';

// Dynamically import since transformers.js is ESM-only sometimes or needs specific handling
let pipeline: any; // transformers.js pipeline

@Injectable()
export class VectorService implements OnModuleInit {
  private embedder: any;

  constructor(
    @InjectModel(KnowledgeBase.name) private knowledgeModel: Model<KnowledgeBaseDocument>,
  ) {}

  async onModuleInit() {
    // Lazy load transformers pipeline
    const { pipeline: transformerPipeline, env } = await import('@xenova/transformers');
    
    // Configure cache directory for models to be within the project or temp
    env.cacheDir = './.cache'; 
    env.allowLocalModels = false;
    
    console.log('[VectorService] Loading embedding model...');
    this.embedder = await transformerPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // efficient 
    });
    console.log('[VectorService] Embedding model loaded.');
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      await this.onModuleInit();
    }
    const result = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Splits text into smaller chunks for RAG.
   * Target size: ~500-1000 chars with overlap.
   */
  chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + chunkSize;
      
      // Try to break at a sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        if (lastPeriod > start + (chunkSize / 2)) {
          end = lastPeriod + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - overlap; // Move start back for overlap
    }
    
    return chunks.filter(c => c.length > 50); // Filter tiny chunks
  }

  async addDocument(userId: string, documentId: string, text: string, metadata: any = {}): Promise<void> {
    // 1. Chunk the text
    const chunks = this.chunkText(text);
    console.log(`[VectorService] Vectorizing ${chunks.length} chunks for doc ${documentId}...`);

    // 2. Clear old vectors for this document (re-upload/re-process)
    await this.knowledgeModel.deleteMany({ userId, documentId });

    // 3. Process batches to avoid blocking event loop
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const docs = await Promise.all(batch.map(async (chunk) => {
        const vector = await this.getEmbedding(chunk);
        return {
          userId,
          documentId,
          content: chunk,
          vector,
          metadata
        };
      }));
      
      await this.knowledgeModel.insertMany(docs);
    }
    console.log(`[VectorService] Finished storing vectors for ${documentId}.`);
  }

  async search(userId: string, query: string, documentId?: string, limit = 5): Promise<KnowledgeBaseDocument[]> {
    const queryVector = await this.getEmbedding(query);
    
    // Fetch candidates (either all user's docs or specific one)
    // CRITICAL SCALABILITY FIX: We limit the candidate pool to the most recent 500 chunks 
    // to prevent blocking the event loop or OOM on extremely large user libraries.
    // In production, this should ideally be moved to MongoDB Atlas Vector Search ($vectorSearch).
    const filter: any = { userId };
    if (documentId) filter.documentId = documentId;
    
    const candidates = await this.knowledgeModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(500) 
      .lean();

    if (candidates.length === 0) return [];

    // Calculate similarity for each candidate
    const scored = candidates.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryVector, doc.vector)
    }));

    // Sort by score descending and take top K
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit) as unknown as KnowledgeBaseDocument[];
  }
}
