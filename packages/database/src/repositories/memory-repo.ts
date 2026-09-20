import { BaseRepository } from './base-repository';
import {
  MemoryEntity,
  MemorySchema,
  MemoryCategory,
  MemoryLayer,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export interface MemorySearchResult {
  memory: MemoryEntity;
  score: number;
  similarity: number;
}

export interface RecallOptions {
  layer?: MemoryLayer;
  category?: MemoryCategory;
  limit?: number;
  minScore?: number;
  workspaceId?: string;
}

export class MemoryRepository extends BaseRepository<MemoryEntity> {
  constructor(client: AlinaDatabaseClient) {
    super(client, 'memory', MemorySchema);
  }

  // Calculate cosine similarity for vector comparison
  public cosineSimilarity(a: number[], b: number[]): number {
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

  private isExpired(memory: MemoryEntity): boolean {
    if (!memory.expiresAt) return false;
    return new Date(memory.expiresAt).getTime() < Date.now();
  }

  private calculateRecencyScore(createdAtStr: string): number {
    const ageHours = (Date.now() - new Date(createdAtStr).getTime()) / (1000 * 60 * 60);
    // Exponential decay: 1.0 for now, ~0.5 after 7 days (168h)
    return Math.max(0.1, Math.exp(-ageHours / (24 * 7)));
  }

  public async remember(userId: string, memory: MemoryEntity): Promise<MemoryEntity> {
    const created = await this.create(memory);

    if (this.client.isConnected()) {
      try {
        // user -> remembers -> memory
        await this.client.query(
          `RELATE (type::record("user", $userId))->remembers->(type::record("memory", $memId));`,
          { userId, memId: created.id }
        );

        // If category is preference: user -> prefers -> memory
        if (created.category === 'preference') {
          await this.client.query(
            `RELATE (type::record("user", $userId))->prefers->(type::record("memory", $memId)) SET strength = 1.0;`,
            { userId, memId: created.id }
          );
        }

        // If episodic from a task: task -> produced -> memory
        if (created.metadata && typeof created.metadata.taskId === 'string') {
          const taskId = created.metadata.taskId;
          await this.client.query(
            `RELATE (type::record("task", $taskId))->produced->(type::record("memory", $memId)) SET outcome = "learning";`,
            { taskId, memId: created.id }
          );
        }

        // If related to a workspace or entity: memory -> relates_to -> entity
        if (created.workspaceId) {
          await this.client.query(
            `RELATE (type::record("memory", $memId))->relates_to->(type::record("workspace", $wsId));`,
            { memId: created.id, wsId: created.workspaceId }
          );
        }
      } catch {
        // Fallback for in-memory / unit-tests
      }
    }

    return created;
  }

  public async updateMemory(id: string, updates: Partial<MemoryEntity>): Promise<MemoryEntity> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Memory with ID "${id}" not found`);
    }

    const merged: MemoryEntity = {
      ...existing,
      ...updates,
      id: existing.id,
      lastAccessedAt: new Date().toISOString(),
    };

    const validated = this.schema.parse(merged);

    if (this.client.isConnected()) {
      try {
        const idKey = id.startsWith('memory:') ? id : `memory:${id}`;
        await this.client.query(
          `UPDATE ${idKey} MERGE $updates;`,
          { updates: validated }
        );
      } catch {
        // Fallback to in-memory store
      }
    }

    this.inMemoryStore.set(id, validated);
    this.inMemoryStore.set(`memory:${id}`, validated);
    return validated;
  }

  public async forgetMemory(id: string): Promise<boolean> {
    if (this.client.isConnected()) {
      try {
        const idKey = id.startsWith('memory:') ? id : `memory:${id}`;
        // Clean up relations
        await this.client.query(
          `DELETE FROM remembers WHERE out = ${idKey};
           DELETE FROM prefers WHERE out = ${idKey};
           DELETE FROM produced WHERE out = ${idKey};
           DELETE FROM relates_to WHERE in = ${idKey};`
        );
      } catch {
        // Fallback
      }
    }
    return this.delete(id);
  }

  public async bumpAccess(id: string): Promise<void> {
    const mem = await this.findById(id);
    if (mem) {
      await this.updateMemory(id, {
        accessCount: (mem.accessCount ?? 0) + 1,
        lastAccessedAt: new Date().toISOString(),
      });
    }
  }

  public async searchVector(
    queryEmbedding: number[],
    limit = 5,
    minScore = 0.5
  ): Promise<MemorySearchResult[]> {
    return this.recallVector(queryEmbedding, { limit, minScore });
  }

  /**
   * Recall relevant memories based on semantic vector similarity, importance, and recency.
   */
  public async recallVector(
    queryEmbedding: number[],
    options: RecallOptions = {}
  ): Promise<MemorySearchResult[]> {
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.3;

    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<Array<MemoryEntity & { similarity?: number }>>(
          `SELECT *, vector::similarity::cosine(embedding, $vec) AS similarity
           FROM memory
           WHERE embedding != NONE
           ORDER BY similarity DESC
           LIMIT 50;`,
          { vec: queryEmbedding }
        );

        const rows = Array.isArray(results[0]) ? (results[0] as Array<MemoryEntity & { similarity?: number }>) : [];
        const candidates: MemorySearchResult[] = [];

        for (const row of rows) {
          const { similarity = 1, ...mem } = row;
          const normalized = this.normalizeId(mem as Record<string, unknown>);
          const entity = this.schema.parse(normalized);

          // Discard expired or superseded
          if (this.isExpired(entity) || entity.supersededBy) continue;
          if (options.layer && entity.layer !== options.layer) continue;
          if (options.category && entity.category !== options.category) continue;
          if (options.workspaceId && entity.workspaceId && entity.workspaceId !== options.workspaceId) continue;

          const recency = this.calculateRecencyScore(entity.createdAt);
          // Combined relevance score: similarity * 0.5 + importance * 0.3 + recency * 0.2
          const score = (similarity * 0.5) + (entity.importance * 0.3) + (recency * 0.2);

          if (score >= minScore) {
            candidates.push({ memory: entity, score, similarity });
          }
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, limit);
      } catch {
        // Fallback to in-memory ranking
      }
    }

    // In-memory fallback
    const all = await this.list(1000);
    const scored: MemorySearchResult[] = [];

    for (const mem of all) {
      if (this.isExpired(mem) || mem.supersededBy) continue;
      if (options.layer && mem.layer !== options.layer) continue;
      if (options.category && mem.category !== options.category) continue;
      if (options.workspaceId && mem.workspaceId && mem.workspaceId !== options.workspaceId) continue;

      if (mem.embedding && mem.embedding.length > 0) {
        const similarity = this.cosineSimilarity(queryEmbedding, mem.embedding);
        const recency = this.calculateRecencyScore(mem.createdAt);
        const score = (similarity * 0.5) + (mem.importance * 0.3) + (recency * 0.2);

        if (score >= minScore) {
          scored.push({ memory: mem, score, similarity });
        }
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  public async listActive(layer?: MemoryLayer, category?: MemoryCategory): Promise<MemoryEntity[]> {
    const all = await this.list(500);
    return all.filter((m) => {
      if (this.isExpired(m) || m.supersededBy) return false;
      if (layer && m.layer !== layer) return false;
      if (category && m.category !== category) return false;
      return true;
    });
  }

  public async listByCategory(category: MemoryCategory): Promise<MemoryEntity[]> {
    return this.listActive(undefined, category);
  }
}
