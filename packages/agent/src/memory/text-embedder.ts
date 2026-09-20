/**
 * Deterministic 384-dimensional Local Semantic Vector Embedder
 * Produces unit-normalized 384-d vectors for SurrealDB HNSW vector index
 * with cosine distance metric.
 * 
 * Operates 100% locally and offline without external API keys or heavy dependencies.
 */
export class TextEmbedder {
  private static readonly DIMENSION = 384;

  /**
   * Generates a 384-dimensional unit vector embedding for input text.
   */
  public static generateEmbedding(text: string): number[] {
    const vector = new Array<number>(TextEmbedder.DIMENSION).fill(0);
    if (!text || text.trim().length === 0) {
      return vector;
    }

    const normalized = text.toLowerCase().trim();
    const tokens = normalized.split(/[^a-z0-9_/-]+/).filter((t) => t.length > 0);

    // 1. Unigram and Bigram Feature Hashing
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      TextEmbedder.hashTokenIntoVector(token, 1.0, vector);

      // Bigram
      if (i < tokens.length - 1) {
        const nextToken = tokens[i + 1];
        if (nextToken) {
          const bigram = `${token}_${nextToken}`;
          TextEmbedder.hashTokenIntoVector(bigram, 1.5, vector);
        }
      }

      // Trigram prefix/suffix for subword matching
      if (token.length > 4) {
        TextEmbedder.hashTokenIntoVector(token.slice(0, 4), 0.5, vector);
        TextEmbedder.hashTokenIntoVector(token.slice(-4), 0.5, vector);
      }
    }

    // 2. L2 Normalization (Euclidean norm = 1.0)
    let norm = 0;
    for (let i = 0; i < TextEmbedder.DIMENSION; i++) {
      const val = vector[i] ?? 0;
      norm += val * val;
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < TextEmbedder.DIMENSION; i++) {
        vector[i] = Number(((vector[i] ?? 0) / norm).toFixed(6));
      }
    }

    return vector;
  }

  private static hashTokenIntoVector(feature: string, weight: number, vector: number[]): void {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;

    for (let i = 0; i < feature.length; i++) {
      const charCode = feature.charCodeAt(i);
      h1 = Math.imul(h1 ^ charCode, 0x01000193);
      h2 = Math.imul(h2 ^ charCode, 0x85ebca6b);
    }

    // Map to primary and secondary dimensions in [0..383]
    const dim1 = Math.abs(h1) % TextEmbedder.DIMENSION;
    const dim2 = Math.abs(h2) % TextEmbedder.DIMENSION;
    const sign1 = (h1 & 1) === 0 ? 1 : -1;
    const sign2 = (h2 & 1) === 0 ? 1 : -1;

    vector[dim1] = (vector[dim1] ?? 0) + sign1 * weight;
    vector[dim2] = (vector[dim2] ?? 0) + sign2 * (weight * 0.7);
  }

  /**
   * Computes cosine similarity between two 384-d vectors.
   */
  public static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dot += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
