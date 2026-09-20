import { BaseRepository } from './base-repository';
import {
  KnowledgeItemEntity,
  KnowledgeItemSchema,
  KnowledgeSourceEntity,
  KnowledgeSourceSchema,
  KnowledgeTopicEntity,
  KnowledgeTopicSchema,
  KnowledgeUpdateEntity,
  KnowledgeUpdateSchema,
  KnowledgeEmbeddingEntity,
  KnowledgeEmbeddingSchema,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export interface KnowledgeSearchResult {
  item: KnowledgeItemEntity;
  similarity: number;
  score: number;
}

export interface KnowledgeSearchOptions {
  limit?: number;
  minSimilarity?: number;
  topic?: string;
  projectId?: string;
  includeStale?: boolean;
}

export interface KnowledgeProvenance {
  item: KnowledgeItemEntity;
  source?: KnowledgeSourceEntity;
  topic?: KnowledgeTopicEntity;
  updates: KnowledgeUpdateEntity[];
  isFresh: boolean;
  daysUntilReview?: number;
}

export class KnowledgeRepository extends BaseRepository<KnowledgeItemEntity> {
  // In-memory secondary stores for offline / unit-test operation
  private get sourceStore(): Map<string, KnowledgeSourceEntity> {
    return this.client.getInMemoryTable<KnowledgeSourceEntity>('knowledge_sources');
  }

  private get topicStore(): Map<string, KnowledgeTopicEntity> {
    return this.client.getInMemoryTable<KnowledgeTopicEntity>('knowledge_topics');
  }

  private get updateStore(): Map<string, KnowledgeUpdateEntity> {
    return this.client.getInMemoryTable<KnowledgeUpdateEntity>('knowledge_updates');
  }

  private get embeddingStore(): Map<string, KnowledgeEmbeddingEntity> {
    return this.client.getInMemoryTable<KnowledgeEmbeddingEntity>('knowledge_embeddings');
  }

  // Graph relations mock store: fromThing -> relation -> Set<toThing>
  private graphEdges = new Map<string, Set<string>>();

  constructor(client: AlinaDatabaseClient) {
    super(client, 'knowledge_items', KnowledgeItemSchema);
  }

  private addEdge(from: string, relation: string, to: string): void {
    const key = `${from}->${relation}`;
    let set = this.graphEdges.get(key);
    if (!set) {
      set = new Set<string>();
      this.graphEdges.set(key, set);
    }
    set.add(to);
  }

  private getEdges(from: string, relation: string): string[] {
    const key = `${from}->${relation}`;
    return Array.from(this.graphEdges.get(key) || []);
  }

  // Cosine Similarity between two numeric vectors
  public cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
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

  /**
   * Persists a Knowledge Item and relates it to source, topic, project, and task.
   */
  public async createItem(
    item: KnowledgeItemEntity,
    options?: {
      source?: KnowledgeSourceEntity;
      topic?: KnowledgeTopicEntity;
      projectId?: string;
      taskId?: string;
    }
  ): Promise<KnowledgeItemEntity> {
    const created = await this.create(item);

    // If source provided, persist source and link
    if (options?.source) {
      await this.createSource(options.source);
      this.addEdge(`knowledge_sources:${options.source.id}`, 'produced_item', `knowledge_items:${created.id}`);
      this.addEdge(`knowledge_items:${created.id}`, 'has_source', `knowledge_sources:${options.source.id}`);

      if (this.client.isConnected()) {
        try {
          await this.client.query(
            `RELATE (type::record("knowledge_sources", $srcId))->produced_item->(type::record("knowledge_items", $itemId));`,
            { srcId: options.source.id, itemId: created.id }
          );
        } catch {
          // Fallback to in-memory edges
        }
      }
    }

    // If topic provided, persist topic and link
    if (options?.topic) {
      await this.createTopic(options.topic);
      if (options.source) {
        this.addEdge(`knowledge_topics:${options.topic.id}`, 'has_source', `knowledge_sources:${options.source.id}`);
        if (this.client.isConnected()) {
          try {
            await this.client.query(
              `RELATE (type::record("knowledge_topics", $topicId))->has_source->(type::record("knowledge_sources", $srcId));`,
              { topicId: options.topic.id, srcId: options.source.id }
            );
          } catch {
            // Fallback
          }
        }
      }
    }

    // If projectId provided, link knowledge item to workspace / project
    if (options?.projectId) {
      this.addEdge(`knowledge_items:${created.id}`, 'relates_to_project', `workspace:${options.projectId}`);
      this.addEdge(`workspace:${options.projectId}`, 'has_knowledge', `knowledge_items:${created.id}`);

      if (this.client.isConnected()) {
        try {
          await this.client.query(
            `RELATE (type::record("knowledge_items", $itemId))->relates_to_project->(type::record("workspace", $wsId));`,
            { itemId: created.id, wsId: options.projectId }
          );
        } catch {
          // Fallback
        }
      }
    }

    // If taskId provided, link knowledge item to task
    if (options?.taskId) {
      this.addEdge(`knowledge_items:${created.id}`, 'referenced_by_task', `task:${options.taskId}`);
      this.addEdge(`task:${options.taskId}`, 'used_knowledge', `knowledge_items:${created.id}`);

      if (this.client.isConnected()) {
        try {
          await this.client.query(
            `RELATE (type::record("knowledge_items", $itemId))->referenced_by_task->(type::record("task", $taskId));`,
            { itemId: created.id, taskId: options.taskId }
          );
          await this.client.query(
            `RELATE (type::record("task", $taskId))->used_knowledge->(type::record("knowledge_items", $itemId));`,
            { taskId: options.taskId, itemId: created.id }
          );
        } catch {
          // Fallback
        }
      }
    }

    // Record creation log in knowledge_updates
    await this.recordUpdate({
      id: `upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      itemId: created.id,
      updateType: 'created',
      newValues: {
        title: created.title,
        confidence: created.confidence,
        status: created.status,
      },
      reason: 'Initial knowledge ingestion and normalization',
      updatedBy: 'alina_knowledge_service',
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  public async findItemById(id: string): Promise<KnowledgeItemEntity | null> {
    return this.findById(id);
  }

  public async findItemBySourceUrl(sourceUrl: string): Promise<KnowledgeItemEntity | null> {
    for (const item of this.inMemoryStore.values()) {
      if (item.sourceUrl === sourceUrl) return item;
    }
    return null;
  }

  public async listItems(): Promise<KnowledgeItemEntity[]> {
    return Array.from(this.inMemoryStore.values());
  }


  public async updateItem(
    id: string,
    updates: Partial<KnowledgeItemEntity>,
    reason?: string
  ): Promise<KnowledgeItemEntity> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Knowledge item "${id}" not found`);
    }

    const merged: KnowledgeItemEntity = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    const validated = KnowledgeItemSchema.parse(merged);
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPDATE type::record("knowledge_items", $id) MERGE $patch;`,
          { id: idKey, patch: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.inMemoryStore.set(idKey, validated);

    // Record audit update
    await this.recordUpdate({
      id: `upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      itemId: idKey,
      updateType: updates.confidence !== undefined ? 'confidence_adjusted' : 'refreshed',
      previousValues: {
        summary: existing.summary,
        confidence: existing.confidence,
        status: existing.status,
      },
      newValues: {
        summary: validated.summary,
        confidence: validated.confidence,
        status: validated.status,
      },
      reason: reason || 'Knowledge item properties updated',
      updatedBy: 'alina_knowledge_service',
      timestamp: new Date().toISOString(),
    });

    return validated;
  }

  // =========================================================================
  // Sources Management
  // =========================================================================

  public async createSource(source: KnowledgeSourceEntity): Promise<KnowledgeSourceEntity> {
    const validated = KnowledgeSourceSchema.parse(source);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record("knowledge_sources", $id) CONTENT $content;`,
          { id: idKey, content: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.sourceStore.set(idKey, validated);
    return validated;
  }

  public async findSourceById(id: string): Promise<KnowledgeSourceEntity | null> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<KnowledgeSourceEntity[]>(
          `SELECT * FROM type::record("knowledge_sources", $id);`,
          { id: idKey }
        );
        const item = Array.isArray(results[0]) ? results[0][0] : results[0];
        if (item) return KnowledgeSourceSchema.parse(item);
      } catch {
        // Fallback
      }
    }
    const mem = this.sourceStore.get(idKey);
    return mem ? KnowledgeSourceSchema.parse(mem) : null;
  }

  public async findSourceByUrl(url: string): Promise<KnowledgeSourceEntity | null> {
    for (const src of this.sourceStore.values()) {
      if (src.url === url) return src;
    }
    return null;
  }

  public async listSources(): Promise<KnowledgeSourceEntity[]> {
    return Array.from(this.sourceStore.values());
  }

  // =========================================================================
  // Topics Management
  // =========================================================================

  public async createTopic(topic: KnowledgeTopicEntity): Promise<KnowledgeTopicEntity> {
    const validated = KnowledgeTopicSchema.parse(topic);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record("knowledge_topics", $id) CONTENT $content;`,
          { id: idKey, content: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.topicStore.set(idKey, validated);
    return validated;
  }

  public async findTopicById(id: string): Promise<KnowledgeTopicEntity | null> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    const mem = this.topicStore.get(idKey);
    return mem ? KnowledgeTopicSchema.parse(mem) : null;
  }

  public async findTopicBySlug(slug: string): Promise<KnowledgeTopicEntity | null> {
    for (const t of this.topicStore.values()) {
      if (t.slug.toLowerCase() === slug.toLowerCase()) return t;
    }
    return null;
  }

  public async listTopics(): Promise<KnowledgeTopicEntity[]> {
    return Array.from(this.topicStore.values());
  }

  // =========================================================================
  // Updates & Embedding Management
  // =========================================================================

  public async recordUpdate(update: KnowledgeUpdateEntity): Promise<KnowledgeUpdateEntity> {
    const validated = KnowledgeUpdateSchema.parse(update);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `CREATE type::record("knowledge_updates", $id) CONTENT $content;`,
          { id: idKey, content: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.updateStore.set(idKey, validated);
    return validated;
  }

  public async getUpdatesForItem(itemId: string): Promise<KnowledgeUpdateEntity[]> {
    const idKey = (itemId.includes(':') ? itemId.split(':')[1] : itemId) || itemId;
    const list: KnowledgeUpdateEntity[] = [];
    for (const u of this.updateStore.values()) {
      if (u.itemId === idKey || u.itemId === itemId) {
        list.push(u);
      }
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async recordEmbedding(embedding: KnowledgeEmbeddingEntity): Promise<KnowledgeEmbeddingEntity> {
    const validated = KnowledgeEmbeddingSchema.parse(embedding);
    this.embeddingStore.set(validated.id, validated);
    return validated;
  }

  // =========================================================================
  // Semantic Vector Search & Hybrid Retrieval
  // =========================================================================

  public async vectorSearch(
    queryEmbedding: number[],
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult[]> {
    const limit = options?.limit ?? 5;
    const minSim = options?.minSimilarity ?? 0.0;
    const topicFilter = options?.topic?.toLowerCase();
    const projectIdFilter = options?.projectId;
    const includeStale = options?.includeStale ?? true;

    const allItems = Array.from(this.inMemoryStore.values());
    const scored: KnowledgeSearchResult[] = [];

    for (const item of allItems) {
      if (!includeStale && (item.status === 'expired' || item.status === 'stale')) {
        continue;
      }

      if (topicFilter && item.topic.toLowerCase() !== topicFilter) {
        continue;
      }

      if (projectIdFilter && item.projectId && item.projectId !== projectIdFilter) {
        continue;
      }

      let sim = 0;
      if (item.embedding && item.embedding.length > 0) {
        sim = this.cosineSimilarity(queryEmbedding, item.embedding);
      }

      if (sim < minSim) continue;

      // Composite score: 65% semantic similarity + 25% confidence + 10% freshness
      const ageHours = (Date.now() - new Date(item.lastRefreshedAt).getTime()) / (1000 * 60 * 60);
      const recency = Math.max(0.2, Math.exp(-ageHours / (24 * 30)));
      const score = sim * 0.65 + item.confidence * 0.25 + recency * 0.1;

      scored.push({ item, similarity: Number(sim.toFixed(4)), score: Number(score.toFixed(4)) });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // =========================================================================
  // Project, Task & Graph Traversal Queries
  // =========================================================================

  public async findItemsByProject(projectId: string): Promise<KnowledgeItemEntity[]> {
    const linkedIds = this.getEdges(`workspace:${projectId}`, 'has_knowledge');
    const directMatches = Array.from(this.inMemoryStore.values()).filter(
      (item) => item.projectId === projectId || linkedIds.includes(`knowledge_items:${item.id}`)
    );
    return directMatches;
  }

  public async findItemsByTask(taskId: string): Promise<KnowledgeItemEntity[]> {
    const linkedIds = this.getEdges(`task:${taskId}`, 'used_knowledge');
    const directMatches = Array.from(this.inMemoryStore.values()).filter(
      (item) => item.taskId === taskId || linkedIds.includes(`knowledge_items:${item.id}`)
    );
    return directMatches;
  }

  public async findItemsByTopic(topicNameOrSlug: string): Promise<KnowledgeItemEntity[]> {
    const query = topicNameOrSlug.toLowerCase();
    return Array.from(this.inMemoryStore.values()).filter(
      (item) => item.topic.toLowerCase() === query || item.topicId === topicNameOrSlug
    );
  }

  /**
   * Explains the full provenance of a knowledge item:
   * Traces back to source, topic, update history, and freshness.
   */
  public async findProvenance(itemId: string): Promise<KnowledgeProvenance | null> {
    const item = await this.findById(itemId);
    if (!item) return null;

    // Find linked source: check edges or URL match
    let source: KnowledgeSourceEntity | undefined;
    const sourceEdges = this.getEdges(`knowledge_items:${item.id}`, 'has_source');
    if (sourceEdges.length > 0) {
      const srcId = sourceEdges[0]!.replace('knowledge_sources:', '');
      source = await this.findSourceById(srcId) || undefined;
    }
    if (!source) {
      source = (await this.findSourceByUrl(item.sourceUrl)) || undefined;
    }
    if (!source) {
      // Create synthesized source from item retention fields if not separately stored
      source = {
        id: `src_${item.id}`,
        url: item.sourceUrl,
        domain: item.sourceDomain,
        title: item.title,
        reliabilityScore: item.confidence,
        lastFetchedAt: item.retrievedAt,
        httpStatus: 200,
        category: 'official_docs',
        createdAt: item.createdAt,
      };
    }

    // Find topic
    let topic: KnowledgeTopicEntity | undefined;
    if (item.topicId) {
      topic = (await this.findTopicById(item.topicId)) || undefined;
    }
    if (!topic) {
      topic = (await this.findTopicBySlug(item.topic)) || {
        id: `topic_${item.topic.toLowerCase().replace(/\s+/g, '_')}`,
        name: item.topic,
        slug: item.topic.toLowerCase().replace(/\s+/g, '-'),
        itemCount: 1,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }

    const updates = await this.getUpdatesForItem(item.id);

    // Compute review / freshness status
    const isExpired = item.expiresAt ? new Date(item.expiresAt).getTime() < Date.now() : false;
    const intervalMs = (item.refreshPolicy.intervalDays || 60) * 86400000;
    const isOverdue = Date.now() - new Date(item.lastRefreshedAt).getTime() > intervalMs;
    const isFresh = !isExpired && !isOverdue && item.status === 'active';

    let daysUntilReview: number | undefined;
    if (item.reviewDate) {
      daysUntilReview = Math.round((new Date(item.reviewDate).getTime() - Date.now()) / 86400000);
    } else {
      const nextRefreshMs = new Date(item.lastRefreshedAt).getTime() + intervalMs;
      daysUntilReview = Math.round((nextRefreshMs - Date.now()) / 86400000);
    }

    return {
      item,
      source,
      topic,
      updates,
      isFresh,
      daysUntilReview,
    };
  }

  /**
   * Finds items that require refresh according to their refresh policy or expiration.
   */
  public async findStaleItems(): Promise<KnowledgeItemEntity[]> {
    const now = Date.now();
    const stale: KnowledgeItemEntity[] = [];

    for (const item of this.inMemoryStore.values()) {
      if (item.status === 'expired' || item.status === 'stale') {
        stale.push(item);
        continue;
      }

      if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
        stale.push(item);
        continue;
      }

      const intervalMs = (item.refreshPolicy.intervalDays || 60) * 86400000;
      if (now - new Date(item.lastRefreshedAt).getTime() > intervalMs) {
        stale.push(item);
      }
    }

    return stale;
  }

  /**
   * Executes a knowledge refresh on an item.
   */
  public async refreshItem(
    itemId: string,
    updates?: {
      summary?: string;
      content?: string;
      confidence?: number;
      reviewDate?: string;
    }
  ): Promise<KnowledgeItemEntity> {
    const existing = await this.findById(itemId);
    if (!existing) {
      throw new Error(`Knowledge item "${itemId}" not found for refresh`);
    }

    const refreshed: Partial<KnowledgeItemEntity> = {
      summary: updates?.summary ?? existing.summary,
      content: updates?.content ?? existing.content,
      confidence: updates?.confidence ?? existing.confidence,
      reviewDate: updates?.reviewDate ?? existing.reviewDate,
      lastRefreshedAt: new Date().toISOString(),
      refreshCount: existing.refreshCount + 1,
      status: 'active',
    };

    return this.updateItem(itemId, refreshed, 'Automated periodic knowledge refresh from source');
  }
}
