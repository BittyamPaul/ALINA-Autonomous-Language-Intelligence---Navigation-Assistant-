import { z } from 'zod';
import {
  AlinaDatabaseClient,
  MemoryRepository,
  MemoryCategorySchema,
  MemoryLayerSchema,
  MemorySourceSchema,
  type MemoryEntity,
  type MemoryCategory,
  type MemoryLayer,
  type MemorySearchResult,
} from '@alina/database';
import { AlinaServiceError } from './base-service';
import { TextEmbedder } from '../memory/text-embedder';
import { MemoryExtractor, ExtractionEvaluation } from '../memory/memory-extractor';

export const CreateMemoryInputSchema = z.object({
  content: z.string().min(1, 'Memory content cannot be empty'),
  category: MemoryCategorySchema.optional(),
  layer: MemoryLayerSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  embedding: z.array(z.number()).length(384).optional(),
  workspaceId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  source: MemorySourceSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateMemoryInput = z.input<typeof CreateMemoryInputSchema>;

export const UpdateMemoryInputSchema = z.object({
  content: z.string().min(1).optional(),
  category: MemoryCategorySchema.optional(),
  layer: MemoryLayerSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateMemoryInput = z.input<typeof UpdateMemoryInputSchema>;

export const SearchMemoryInputSchema = z.object({
  query: z.string().optional(),
  queryEmbedding: z.array(z.number()).length(384).optional(),
  layer: MemoryLayerSchema.optional(),
  category: MemoryCategorySchema.optional(),
  limit: z.number().int().positive().default(5),
  minScore: z.number().min(0).max(1).default(0.3),
  workspaceId: z.string().optional(),
});
export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export interface RecallResult {
  memory: MemoryEntity;
  relevanceScore: number;
  similarity: number;
}

export interface RecallOptions {
  layer?: MemoryLayer;
  category?: MemoryCategory;
  limit?: number;
  minScore?: number;
  workspaceId?: string;
}

export class MemoryService {
  private memoryRepo: MemoryRepository;

  constructor(client: AlinaDatabaseClient) {
    this.memoryRepo = new MemoryRepository(client);
  }

  public getRepository(): MemoryRepository {
    return this.memoryRepo;
  }

  /**
   * Evaluates and stores a meaningful memory in SurrealDB.
   * Disallows secrets, transient chatter, and ephemeral noise.
   */
  public async remember(input: CreateMemoryInput, userId = 'default_operator'): Promise<MemoryEntity> {
    const validated = CreateMemoryInputSchema.parse(input);

    // Evaluate against memory extraction rules
    const existingList = await this.memoryRepo.list(200);
    const evaluation: ExtractionEvaluation = MemoryExtractor.evaluate(
      validated.content,
      existingList,
      validated.layer
    );

    if (!evaluation.shouldRemember) {
      throw new AlinaServiceError(
        `Memory rejected by extraction policy: ${evaluation.reason}`,
        'MEMORY_EXTRACTION_REJECTED',
        400
      );
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const embedding = validated.embedding || TextEmbedder.generateEmbedding(evaluation.sanitizedContent);

    // Handle superseding older conflicting preferences/locations
    if (evaluation.supersedesId) {
      try {
        await this.memoryRepo.updateMemory(evaluation.supersedesId, {
          supersededBy: id,
        });
      } catch {
        // Continue
      }
    }

    const entity: MemoryEntity = {
      id,
      content: evaluation.sanitizedContent,
      category: validated.category || evaluation.category,
      layer: validated.layer || evaluation.layer,
      importance: validated.importance ?? evaluation.importance,
      tags: validated.tags && validated.tags.length > 0 ? validated.tags : evaluation.tags,
      embedding,
      workspaceId: validated.workspaceId,
      expiresAt: validated.expiresAt !== undefined ? validated.expiresAt : evaluation.expiresAt,
      source: validated.source || 'user_explicit',
      accessCount: 0,
      metadata: validated.metadata || {},
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    return this.memoryRepo.remember(userId, entity);
  }

  /**
   * Recall only relevant memories for a given query or goal.
   * Bumps access count and lastAccessedAt for retrieved memories.
   */
  public async recall(query: string, options: RecallOptions = {}): Promise<RecallResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const queryEmbedding = TextEmbedder.generateEmbedding(query);
    const results: MemorySearchResult[] = await this.memoryRepo.recallVector(queryEmbedding, {
      layer: options.layer,
      category: options.category,
      limit: options.limit ?? 5,
      minScore: options.minScore ?? 0.35,
      workspaceId: options.workspaceId,
    });

    // Bump access counts in background
    for (const res of results) {
      this.memoryRepo.bumpAccess(res.memory.id).catch(() => {});
    }

    return results.map((r) => ({
      memory: r.memory,
      relevanceScore: r.score,
      similarity: r.similarity,
    }));
  }

  /**
   * Search memory using semantic vector similarity or keyword text query.
   */
  public async search_memory(input: SearchMemoryInput): Promise<RecallResult[]> {
    const validated = SearchMemoryInputSchema.parse(input);
    const embedding = validated.queryEmbedding || (validated.query ? TextEmbedder.generateEmbedding(validated.query) : undefined);

    if (!embedding) {
      const active = await this.list(validated.layer, validated.category);
      return active.slice(0, validated.limit).map((m) => ({
        memory: m,
        relevanceScore: m.importance,
        similarity: 1.0,
      }));
    }

    const results = await this.memoryRepo.recallVector(embedding, {
      layer: validated.layer,
      category: validated.category,
      limit: validated.limit,
      minScore: validated.minScore,
      workspaceId: validated.workspaceId,
    });

    return results.map((r) => ({
      memory: r.memory,
      relevanceScore: r.score,
      similarity: r.similarity,
    }));
  }

  public async search(input: SearchMemoryInput): Promise<RecallResult[]> {
    return this.search_memory(input);
  }

  /**
   * Update an existing memory record. Recomputes embedding if content changed.
   */
  public async update_memory(id: string, updates: UpdateMemoryInput): Promise<MemoryEntity> {
    const validated = UpdateMemoryInputSchema.parse(updates);
    const existing = await this.memoryRepo.findById(id);
    if (!existing) {
      throw new AlinaServiceError(`Memory with ID "${id}" was not found`, 'MEMORY_NOT_FOUND', 404);
    }

    const updatePayload: Partial<MemoryEntity> = {
      ...validated,
    };

    if (validated.content && validated.content !== existing.content) {
      const { valid, sanitized, error } = MemoryExtractor.sanitizeAndValidate(validated.content);
      if (!valid) {
        throw new AlinaServiceError(`Invalid updated content: ${error}`, 'INVALID_MEMORY_CONTENT', 400);
      }
      updatePayload.content = sanitized;
      updatePayload.embedding = TextEmbedder.generateEmbedding(sanitized);
    }

    return this.memoryRepo.updateMemory(id, updatePayload);
  }

  /**
   * Deletes a memory and cleans up all related graph edges.
   */
  public async forget_memory(id: string): Promise<boolean> {
    const existing = await this.memoryRepo.findById(id);
    if (!existing) {
      throw new AlinaServiceError(`Memory with ID "${id}" was not found`, 'MEMORY_NOT_FOUND', 404);
    }
    return this.memoryRepo.forgetMemory(id);
  }

  public async delete(id: string): Promise<boolean> {
    return this.forget_memory(id);
  }

  /**
   * List active non-expired memories.
   * Supports layer, category, or both for full backward compatibility.
   */
  public async list(
    layerOrCategory?: MemoryLayer | MemoryCategory,
    category?: MemoryCategory
  ): Promise<MemoryEntity[]> {
    const isLayer =
      layerOrCategory === 'conversation' ||
      layerOrCategory === 'episodic' ||
      layerOrCategory === 'semantic';
    const effectiveLayer = isLayer ? (layerOrCategory as MemoryLayer) : undefined;
    const effectiveCategory = isLayer
      ? category
      : (layerOrCategory as MemoryCategory | undefined) || category;

    return this.memoryRepo.listActive(effectiveLayer, effectiveCategory);
  }

  /**
   * Extracts and stores episodic memory from a finished task outcome.
   */
  public async extractAndRememberFromTaskOutcome(
    task: { id: string; goal: string },
    result: { status: string; resultSummary?: string; stepsCompleted: number; error?: string },
    userId = 'default_operator'
  ): Promise<MemoryEntity | null> {
    const evaluation = MemoryExtractor.fromTaskOutcome(task, result);
    if (!evaluation.shouldRemember) return null;

    return this.remember(
      {
        content: evaluation.sanitizedContent,
        category: evaluation.category,
        layer: evaluation.layer,
        importance: evaluation.importance,
        tags: evaluation.tags,
        expiresAt: evaluation.expiresAt,
        source: 'task_outcome',
        metadata: { taskId: task.id },
      },
      userId
    );
  }
}
