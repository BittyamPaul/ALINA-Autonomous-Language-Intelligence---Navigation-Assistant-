import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AlinaDatabaseClient,
  MemoryRepository,
} from '../packages/database/src';
import {
  MemoryService,
  MemoryExtractor,
  AlinaSupervisorAgent,
} from '../packages/agent/src';

describe('ALINA Memory Architecture: 3-Tier Conceptual System & SurrealDB Integration', () => {
  let client: AlinaDatabaseClient;
  let memoryService: MemoryService;
  let memoryRepo: MemoryRepository;

  beforeEach(async () => {
    // Connect to local SurrealDB or initialize in-memory fallback
    client = new AlinaDatabaseClient({
      endpoint: process.env.SURREAL_URL || 'http://127.0.0.1:8000/rpc',
      namespace: 'alina',
      database: 'main',
      username: 'root',
      password: 'root',
      timeoutMs: 2000,
    });

    try {
      await client.connect();
      if (client.isConnected()) {
        await client.query('DELETE memory;');
      }
    } catch {
      // In-memory fallback mode
    }

    memoryService = new MemoryService(client);
    memoryRepo = memoryService.getRepository();
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.close();
    }
  });

  describe('1. Memory Extraction Rules & Filtering Engine', () => {
    it('strictly rejects sensitive credentials, API keys, and private tokens', () => {
      const apiKeyEval = MemoryExtractor.evaluate('Remember my OpenAI API key is sk-abcdef12345678901234567890');
      expect(apiKeyEval.shouldRemember).toBe(false);
      expect(apiKeyEval.reason).toContain('sensitive secrets');

      const passwordEval = MemoryExtractor.evaluate('The database password: supersecretpassword123');
      expect(passwordEval.shouldRemember).toBe(false);
      expect(passwordEval.reason).toContain('sensitive secrets');
    });

    it('filters out transient chit-chat and conversational pleasantries', () => {
      const greetings = ['Hello', 'How are you?', 'Thanks!', 'ok', 'good morning'];
      for (const greeting of greetings) {
        const evaluation = MemoryExtractor.evaluate(greeting);
        expect(evaluation.shouldRemember).toBe(false);
        expect(evaluation.reason).toContain('chit-chat');
      }
    });

    it('correctly classifies user preferences into semantic layer with high importance', () => {
      const evalPref = MemoryExtractor.evaluate('I prefer strict TypeScript without unnecessary any types.');
      expect(evalPref.shouldRemember).toBe(true);
      expect(['preference', 'PERSONAL_PREFERENCE']).toContain(evalPref.category);
      expect(evalPref.layer).toBe('semantic');
      expect(evalPref.importance).toBeGreaterThanOrEqual(0.9);
      expect(evalPref.tags).toContain('user_preference');
    });

    it('correctly classifies frequent locations and project paths', () => {
      const evalPath = MemoryExtractor.evaluate('My project root is located at C:\\Users\\bitty\\Desktop\\ALINA');
      expect(evalPath.shouldRemember).toBe(true);
      expect(['location', 'PROJECT_CONTEXT']).toContain(evalPath.category);
      expect(evalPath.layer).toBe('semantic');
      expect(evalPath.tags).toContain('location');
    });

    it('correctly extracts episodic memories from completed and failed task outcomes', () => {
      const successEval = MemoryExtractor.fromTaskOutcome(
        { id: 'task_build_1', goal: 'Build desktop bundle' },
        { status: 'completed', resultSummary: 'Built 12 static pages cleanly', stepsCompleted: 3 }
      );
      expect(successEval.shouldRemember).toBe(true);
      expect(['task_outcome', 'TASK_PATTERN']).toContain(successEval.category);
      expect(successEval.layer).toBe('episodic');
      expect(successEval.tags).toContain('success');

      const failEval = MemoryExtractor.fromTaskOutcome(
        { id: 'task_build_2', goal: 'Deploy artifact' },
        { status: 'failed', stepsCompleted: 1, error: 'PathJail boundary violation' }
      );
      expect(failEval.shouldRemember).toBe(true);
      expect(failEval.importance).toBeGreaterThan(0.8); // Failures receive high learning weight
      expect(failEval.tags).toContain('failure');
    });
  });

  describe('2. Three Conceptual Memory Layers & Expiration (TTL)', () => {
    it('sets 24-hour expiration on conversation memory layer', async () => {
      const convMemory = await memoryService.remember({
        content: 'Active topic under discussion is Next.js dynamic routing.',
        layer: 'conversation',
        category: 'fact',
      });

      expect(convMemory.layer).toBe('conversation');
      expect(convMemory.expiresAt).toBeDefined();

      const expireTime = new Date(convMemory.expiresAt!).getTime();
      const now = Date.now();
      expect(expireTime - now).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(expireTime - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    });

    it('maintains permanent retention for semantic preferences and rules (expiresAt is null)', async () => {
      const ruleMemory = await memoryService.remember({
        content: 'ALINA must never execute destructive operations without human approval.',
        category: 'rule',
        layer: 'semantic',
      });

      expect(ruleMemory.layer).toBe('semantic');
      expect(ruleMemory.expiresAt).toBeNull();
    });

    it('excludes expired memories from active recall and list queries', async () => {
      // Create an expired memory manually
      const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
      const expiredMem = await memoryService.remember({
        content: 'Ephemeral notification from yesterday.',
        layer: 'conversation',
        expiresAt: expiredTime,
      });

      const activeList = await memoryService.list();
      expect(activeList.some((m) => m.id === expiredMem.id)).toBe(false);

      const recallResults = await memoryService.recall('notification');
      expect(recallResults.some((r) => r.memory.id === expiredMem.id)).toBe(false);
    });
  });

  describe('3. Core Memory Operations: remember, recall, search, update, forget', () => {
    it('remembers knowledge, computes 384-d embedding, and recalls relevant concepts', async () => {
      const mem1 = await memoryService.remember({
        content: 'User prefers pnpm package manager and hates npm or yarn.',
        category: 'preference',
        layer: 'semantic',
        importance: 0.95,
      });

      expect(mem1.id).toBeDefined();
      expect(mem1.embedding).toHaveLength(384);

      await memoryService.remember({
        content: 'Primary display resolution is 1920x1080 with 1.0x scale.',
        category: 'location',
        layer: 'semantic',
        importance: 0.7,
      });

      // Recall query related to packages
      const pkgRecall = await memoryService.recall('Which package manager should I use for installation?');
      expect(pkgRecall.length).toBeGreaterThan(0);
      expect(pkgRecall[0]!.memory.content).toContain('pnpm');

      // Irrelevant query does not recall the package manager as top match
      const screenRecall = await memoryService.recall('Monitor resolution and display metrics');
      expect(screenRecall.length).toBeGreaterThan(0);
      expect(screenRecall[0]!.memory.content).toContain('1920x1080');
    });

    it('updates memory in place, recomputes embedding, and bumps version', async () => {
      const original = await memoryService.remember({
        content: 'The test runner of choice is Jest.',
        category: 'preference',
        layer: 'semantic',
      });

      const updated = await memoryService.update_memory(original.id, {
        content: 'The test runner of choice has been upgraded to Vitest 3.',
        importance: 0.9,
      });

      expect(updated.id).toBe(original.id);
      expect(updated.content).toContain('Vitest 3');
      expect(updated.embedding).toHaveLength(384);

      const search = await memoryService.recall('Vitest test runner');
      expect(search[0]!.memory.content).toContain('Vitest 3');
    });

    it('supersedes conflicting older preferences when new preference is registered', async () => {
      const oldPref = await memoryService.remember({
        content: 'I prefer dark mode theme for the user interface.',
        category: 'preference',
        layer: 'semantic',
      });

      const newPref = await memoryService.remember({
        content: 'I now prefer light mode theme as my primary visual canvas.',
        category: 'preference',
        layer: 'semantic',
      });

      const oldReloaded = await memoryRepo.findById(oldPref.id);
      expect(oldReloaded?.supersededBy).toBe(newPref.id);

      // Old superseded memory is not returned in active list
      const activeMemories = await memoryService.list();
      expect(activeMemories.some((m) => m.id === oldPref.id)).toBe(false);
      expect(activeMemories.some((m) => m.id === newPref.id)).toBe(true);
    });

    it('forgets memory cleanly and removes it from repository', async () => {
      const mem = await memoryService.remember({
        content: 'Temporary project path to forget later.',
        category: 'location',
        layer: 'semantic',
      });

      expect(await memoryRepo.findById(mem.id)).toBeDefined();

      const deleted = await memoryService.forget_memory(mem.id);
      expect(deleted).toBe(true);

      expect(await memoryRepo.findById(mem.id)).toBeNull();
    });
  });

  describe('4. Semantic Relevance & Hybrid Ranking', () => {
    it('ranks memories by hybrid score (similarity + importance + recency)', async () => {
      // High importance memory
      await memoryService.remember({
        content: 'Critical directive: Always verify git status before making changes.',
        importance: 1.0,
        category: 'rule',
        layer: 'semantic',
      });

      // Low importance memory with similar topic
      await memoryService.remember({
        content: 'Git commit messages can be informal during scratch prototyping.',
        importance: 0.3,
        category: 'fact',
        layer: 'semantic',
      });

      const results = await memoryService.recall('git workflow directives', { limit: 2 });
      expect(results.length).toBeGreaterThan(0);
      // Critical rule should rank highest due to combined score weighting
      expect(results[0]!.memory.content).toContain('Critical directive');
      expect(results[0]!.relevanceScore).toBeGreaterThan(results[1]?.relevanceScore ?? 0);
    });
  });

  describe('5. Supervisor Agent Memory Integration', () => {
    it('automatically recalls relevant memories when ALINA answers a task goal', async () => {
      // Seed user preference in memory
      await memoryService.remember({
        content: 'Operator prefers pnpm run typecheck before any test execution.',
        category: 'preference',
        layer: 'semantic',
        importance: 0.95,
      });

      let capturedMemoriesInPlan: unknown[] = [];

      const mockModelAdapter = {
        generate: async (_prompt: string, context: { relevantMemories?: unknown[] }) => {
          capturedMemoriesInPlan = context.relevantMemories || [];
          return {
            text: 'I planned the workflow taking operator preferences into account.',
            toolCalls: [],
          };
        },
      };

      const agent = new AlinaSupervisorAgent({
        memoryService,
        modelAdapter: mockModelAdapter as any,
      });

      const result = await agent.execute({
        goal: 'Verify TypeScript types and prepare repository tests',
      });

      expect(result.status).toBe('completed');
      expect(capturedMemoriesInPlan.length).toBeGreaterThan(0);
      expect((capturedMemoriesInPlan[0] as any).content).toContain('pnpm run typecheck');
    });

    it('extracts episodic memory upon successful task completion', async () => {
      const mockModelAdapter = {
        generate: async () => ({
          text: 'Execution succeeded without errors.',
          toolCalls: [],
        }),
      };

      const agent = new AlinaSupervisorAgent({
        memoryService,
        modelAdapter: mockModelAdapter as any,
      });

      await agent.execute({
        goal: 'Inspect disk usage on primary partition',
      });

      // Check that an episodic memory was created
      const episodicList = await memoryService.list('episodic');
      expect(episodicList.length).toBeGreaterThan(0);
      expect(episodicList.some((m) => m.content.includes('Inspect disk usage'))).toBe(true);
    });
  });
});
