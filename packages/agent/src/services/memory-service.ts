import { z } from 'zod';
import {
  AlinaDatabaseClient,
  MemoryRepository,
  MemoryCategorySchema,
  MemoryLayerSchema,
  MemorySourceSchema,
  EpistemicTierSchema,
  LearningSettingsSchema,
  type MemoryEntity,
  type MemoryCategory,
  type MemoryLayer,
  type EpistemicTier,
  type LearningSettings,
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
  confidence: z.number().min(0).max(1).optional(),
  epistemicTier: EpistemicTierSchema.optional(),
  tags: z.array(z.string()).optional(),
  embedding: z.array(z.number()).length(384).optional(),
  workspaceId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  expiration: z.string().datetime().nullable().optional(),
  source: MemorySourceSchema.optional(),
  userEditable: z.boolean().optional(),
  user_editable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateMemoryInput = z.input<typeof CreateMemoryInputSchema>;

export const UpdateMemoryInputSchema = z.object({
  content: z.string().min(1).optional(),
  category: MemoryCategorySchema.optional(),
  layer: MemoryLayerSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  epistemicTier: EpistemicTierSchema.optional(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  expiration: z.string().datetime().nullable().optional(),
  userEditable: z.boolean().optional(),
  user_editable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateMemoryInput = z.input<typeof UpdateMemoryInputSchema>;

export const SearchMemoryInputSchema = z.object({
  query: z.string().optional(),
  queryEmbedding: z.array(z.number()).length(384).optional(),
  layer: MemoryLayerSchema.optional(),
  category: MemoryCategorySchema.optional(),
  epistemicTier: EpistemicTierSchema.optional(),
  limit: z.number().int().positive().default(5),
  minScore: z.number().min(0).max(1).default(0.3),
  workspaceId: z.string().optional(),
});
export type SearchMemoryInput = z.input<typeof SearchMemoryInputSchema>;

export interface RecallResult {
  memory: MemoryEntity;
  relevanceScore: number;
  similarity: number;
}

export interface RecallOptions {
  layer?: MemoryLayer;
  category?: MemoryCategory;
  epistemicTier?: EpistemicTier;
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
   * Retrieves current learning configuration (global enable/disable & category controls).
   */
  public async getSettings(): Promise<LearningSettings> {
    return this.memoryRepo.getLearningSettings();
  }

  /**
   * Updates learning configuration.
   */
  public async updateSettings(updates: Partial<LearningSettings>): Promise<LearningSettings> {
    const validated = LearningSettingsSchema.partial().parse(updates);
    return this.memoryRepo.updateLearningSettings(validated);
  }

  /**
   * Evaluates, sanitizes, and stores a memory in SurrealDB.
   * Enforces privacy guardrails, epistemic provenance, and learning preferences.
   */
  public async remember(input: CreateMemoryInput, userId = 'default_operator'): Promise<MemoryEntity> {
    const settings = await this.getSettings();

    // 1. Check Global Learning Switch
    if (!settings.learningEnabled) {
      throw new AlinaServiceError(
        'ALINA Personal Learning is currently disabled by user setting.',
        'LEARNING_DISABLED',
        403
      );
    }

    const validated = CreateMemoryInputSchema.parse(input);

    // 2. Check Per-Category Learning Opt-Out
    if (validated.category && settings.disabledCategories.includes(validated.category)) {
      throw new AlinaServiceError(
        `Learning for category "${validated.category}" is currently disabled in user preferences.`,
        'CATEGORY_LEARNING_DISABLED',
        403
      );
    }

    // 3. Evaluate against memory extraction & privacy rules
    const existingList = await this.memoryRepo.list(200);
    const sourceString = typeof validated.source === 'string' ? validated.source : 'user_explicit';

    const evaluation: ExtractionEvaluation = MemoryExtractor.evaluate(
      validated.content,
      existingList,
      validated.layer,
      validated.category,
      sourceString,
      validated.epistemicTier
    );

    if (!evaluation.shouldRemember) {
      throw new AlinaServiceError(
        `Memory rejected by extraction policy: ${evaluation.reason}`,
        'MEMORY_EXTRACTION_REJECTED',
        400
      );
    }

    // 4. Verify category if detected category is disabled
    if (settings.disabledCategories.includes(evaluation.category)) {
      throw new AlinaServiceError(
        `Classified category "${evaluation.category}" is disabled in user preferences.`,
        'CATEGORY_LEARNING_DISABLED',
        403
      );
    }

    // 5. Check Inferential Learning Toggle
    if (evaluation.epistemicTier === 'INFERRED' && !settings.inferentialLearningEnabled) {
      throw new AlinaServiceError(
        'Inferential learning is disabled by user setting.',
        'INFERENTIAL_LEARNING_DISABLED',
        403
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

    const now = new Date().toISOString();
    const effectiveExpiresAt =
      validated.expiresAt !== undefined
        ? validated.expiresAt
        : validated.expiration !== undefined
        ? validated.expiration
        : evaluation.expiresAt;

    const isUserEditable =
      validated.userEditable !== undefined
        ? validated.userEditable
        : validated.user_editable !== undefined
        ? validated.user_editable
        : true;

    const entity: MemoryEntity = {
      id,
      content: evaluation.sanitizedContent,
      category: validated.category || evaluation.category,
      layer: validated.layer || evaluation.layer,
      importance: validated.importance ?? evaluation.importance,
      confidence: validated.confidence ?? evaluation.confidence,
      epistemicTier: validated.epistemicTier || evaluation.epistemicTier,
      source: evaluation.source,
      userEditable: isUserEditable,
      user_editable: isUserEditable,
      tags: validated.tags && validated.tags.length > 0 ? validated.tags : evaluation.tags,
      embedding,
      workspaceId: validated.workspaceId,
      expiresAt: effectiveExpiresAt,
      expiration: effectiveExpiresAt,
      accessCount: 0,
      metadata: validated.metadata || {},
      lastAccessedAt: now,
      last_used_at: now,
      updatedAt: now,
      updated_at: now,
      createdAt: now,
      created_at: now,
    };

    return this.memoryRepo.remember(userId, entity);
  }

  /**
   * Retrieves a single memory by ID and touches its last_used_at timestamp.
   */
  public async retrieve(id: string): Promise<MemoryEntity> {
    const memory = await this.memoryRepo.retrieve(id);
    if (!memory) {
      throw new AlinaServiceError(`Memory with ID "${id}" was not found`, 'MEMORY_NOT_FOUND', 404);
    }
    return memory;
  }

  /**
   * Reinforces confidence of an existing memory upon repeated observation or user confirmation.
   */
  public async reinforce(id: string, boost = 0.1): Promise<MemoryEntity> {
    const existing = await this.memoryRepo.findById(id);
    if (!existing) {
      throw new AlinaServiceError(`Memory with ID "${id}" was not found`, 'MEMORY_NOT_FOUND', 404);
    }
    return this.memoryRepo.reinforce(id, boost);
  }

  /**
   * Decays unreinforced, inferred, or temporary memories, and purges expired records.
   */
  public async decay(options: {
    decayFactor?: number;
    minConfidence?: number;
    purgeExpired?: boolean;
  } = {}): Promise<{ decayedCount: number; purgedCount: number }> {
    return this.memoryRepo.decay(options);
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

    let filtered = results;
    if (options.epistemicTier) {
      filtered = filtered.filter((r) => r.memory.epistemicTier === options.epistemicTier);
    }

    for (const res of filtered) {
      this.memoryRepo.bumpAccess(res.memory.id).catch(() => {});
    }

    return filtered.map((r) => ({
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
      let list = active;
      if (validated.epistemicTier) {
        list = list.filter((m) => m.epistemicTier === validated.epistemicTier);
      }
      return list.slice(0, validated.limit).map((m) => ({
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

    let filtered = results;
    if (validated.epistemicTier) {
      filtered = filtered.filter((r) => r.memory.epistemicTier === validated.epistemicTier);
    }

    return filtered.map((r) => ({
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

    const now = new Date().toISOString();
    const updatePayload: Partial<MemoryEntity> = {
      ...validated,
      updatedAt: now,
      updated_at: now,
      lastAccessedAt: now,
      last_used_at: now,
    };

    if (validated.userEditable !== undefined) {
      updatePayload.userEditable = validated.userEditable;
      updatePayload.user_editable = validated.userEditable;
    } else if (validated.user_editable !== undefined) {
      updatePayload.userEditable = validated.user_editable;
      updatePayload.user_editable = validated.user_editable;
    }

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

  public async update(id: string, updates: UpdateMemoryInput): Promise<MemoryEntity> {
    return this.update_memory(id, updates);
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

  public async forget(id: string): Promise<boolean> {
    return this.forget_memory(id);
  }

  public async delete(id: string): Promise<boolean> {
    return this.forget_memory(id);
  }

  /**
   * List active non-expired memories.
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
    const settings = await this.getSettings();
    if (!settings.learningEnabled) {
      return null;
    }

    const evaluation = MemoryExtractor.fromTaskOutcome(task, result);
    if (!evaluation.shouldRemember) return null;

    if (settings.disabledCategories.includes(evaluation.category)) {
      return null;
    }

    return this.remember(
      {
        content: evaluation.sanitizedContent,
        category: evaluation.category,
        layer: evaluation.layer,
        importance: evaluation.importance,
        confidence: evaluation.confidence,
        epistemicTier: evaluation.epistemicTier,
        tags: evaluation.tags,
        expiresAt: evaluation.expiresAt,
        source: evaluation.source,
        metadata: { taskId: task.id },
      },
      userId
    );
  }
}
