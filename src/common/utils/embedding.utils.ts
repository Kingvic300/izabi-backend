export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

export function averageEmbeddings(embeddings: number[][]): number[] {
    if (!embeddings.length) return [];
    const dimension = embeddings[0].length;
    const avg = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
        for (let i = 0; i < dimension; i++) {
            avg[i] += embedding[i];
        }
    }

    for (let i = 0; i < dimension; i++) {
        avg[i] = avg[i] / embeddings.length;
    }

    return avg;
}
