import { describe, it, expect, beforeEach } from 'vitest';
import { AlinaDatabaseClient } from '@alina/database';
import {
  MemoryService,
  MemoryExtractor,
  PrivacySanitizer,
} from '@alina/agent';

describe('ALINA Adaptive Personal Learning Layer', () => {
  let dbClient: AlinaDatabaseClient;
  let memoryService: MemoryService;

  beforeEach(async () => {
    dbClient = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:59999/rpc',
      namespace: 'alina',
      database: 'main',
    });
    // MemoryRepository uses in-memory mock store when client is not connected to a remote daemon
    memoryService = new MemoryService(dbClient);
  });

  describe('1. Fail-Closed Privacy Sanitizer & Non-Surveillance Boundaries', () => {
    it('blocks credentials, API keys, bearer tokens, and private keys', () => {
      const secretInputs = [
        'My OpenAI API key is sk-abcdef12345678901234567890123456',
        'Authorization: Bearer mySecretToken1234567890abcdef',
        'my password: SuperSecretPassword123!',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...',
      ];

      for (const secret of secretInputs) {
        const result = PrivacySanitizer.sanitize(secret);
        expect(result.valid).toBe(false);
        expect(result.blockedReason).toBe('CREDENTIAL_DETECTED');
        expect(result.error).toContain('Security policy violation');
      }
    });

    it('blocks automated profiling of sensitive personal attributes (health, religion, politics, finance)', () => {
      const sensitiveInputs = [
        'User was diagnosed with a medical condition and takes prescription drugs',
        'User religious beliefs include church of the holy light devoutly',
        'User political party donation to campaign donor fund',
        'User biometric data fingerprint scan recorded',
        'Bank account: 12345678901234 with cvv: 456',
      ];

      for (const sensitive of sensitiveInputs) {
        const result = PrivacySanitizer.sanitize(sensitive);
        expect(result.valid).toBe(false);
        expect(result.blockedReason).toBe('SENSITIVE_PERSONAL_ATTRIBUTE');
        expect(result.error).toContain('Privacy policy violation');
      }
    });

    it('blocks surveillance instructions such as secret recording or ambient screenshotting', () => {
      const surveillanceInputs = [
        'ALINA secretly record microphone audio in background',
        'Continuous arbitrary screenshot loop of the desktop',
        'Global keystroke logger activated',
      ];

      for (const badInput of surveillanceInputs) {
        const result = PrivacySanitizer.sanitize(badInput);
        expect(result.valid).toBe(false);
        expect(result.blockedReason).toBe('UNAUTHORIZED_SURVEILLANCE');
      }
    });

    it('allows benign working style, tool preference, and project context', () => {
      const validInputs = [
        'I prefer strict TypeScript without any types',
        'Our project monorepo uses pnpm as the package manager',
        'When writing code, prefer concise commit messages',
      ];

      for (const text of validInputs) {
        const result = PrivacySanitizer.sanitize(text);
        expect(result.valid).toBe(true);
        expect(result.sanitizedContent).toBe(text);
      }
    });
  });

  describe('2. Conceptual Memory Categories & Epistemic Tiers', () => {
    it('classifies statements into the 10 conceptual categories with correct tiers', () => {
      const testCases = [
        {
          input: 'I prefer using warm light theme for editorial work',
          expectedCategory: 'UI_PREFERENCE',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'Always use VS Code as the default editor',
          expectedCategory: 'TOOL_PREFERENCE',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'Keep communication style concise with brief answers',
          expectedCategory: 'COMMUNICATION_STYLE',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'My working style is pair programming with step-by-step verification',
          expectedCategory: 'WORK_STYLE',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'The architecture uses SurrealDB and Next.js at path C:\\Users\\bitty\\Desktop\\ALINA',
          expectedCategory: 'PROJECT_CONTEXT',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'Set up a recurring workflow every day at 9am to audit dependencies',
          expectedCategory: 'RECURRING_WORKFLOW',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'Temporary note: just testing sprint issue 42 for today',
          expectedCategory: 'TEMPORARY_CONTEXT',
          expectedTier: 'EXPLICIT',
        },
        {
          input: 'Remember that strict Rule: never execute destructive shell commands without human approval',
          expectedCategory: 'EXPLICIT_FACT',
          expectedTier: 'EXPLICIT',
        },
      ];

      for (const tc of testCases) {
        const evalResult = MemoryExtractor.evaluate(tc.input);
        expect(evalResult.shouldRemember).toBe(true);
        expect(evalResult.category).toBe(tc.expectedCategory);
        expect(evalResult.epistemicTier).toBe(tc.expectedTier);
        expect(evalResult.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('enforces tempered phrasing on INFERRED memories and caps confidence to <= 0.65', () => {
      // Inferred assertions must never be stated as confirmed absolute facts
      const assertiveInferred = 'User always prefers VS Code';
      const evalResult = MemoryExtractor.evaluate(
        assertiveInferred,
        [],
        undefined,
        'TOOL_PREFERENCE',
        'task:task_999',
        'INFERRED'
      );

      expect(evalResult.shouldRemember).toBe(true);
      expect(evalResult.epistemicTier).toBe('INFERRED');
      // Must be capped at 0.65
      expect(evalResult.confidence).toBeLessThanOrEqual(0.65);
      // Assertive phrasing "User always prefers" must be tempered into "User appears to prefer"
      expect(evalResult.sanitizedContent).toContain('User appears to prefer VS Code');
      expect(evalResult.sanitizedContent).not.toContain('User always prefers');
    });

    it('creates OBSERVED episodic memory from task outcomes with task provenance', () => {
      const task = { id: 'task_888', goal: 'Run database integration tests' };
      const outcome = {
        status: 'completed',
        resultSummary: 'All 15 database integration tests passed cleanly.',
        stepsCompleted: 3,
      };

      const evalResult = MemoryExtractor.fromTaskOutcome(task, outcome);
      expect(evalResult.shouldRemember).toBe(true);
      expect(evalResult.category).toBe('TASK_PATTERN');
      expect(evalResult.epistemicTier).toBe('OBSERVED');
      expect(evalResult.source).toBe('task:task_888');
      expect(evalResult.confidence).toBe(0.85);
    });
  });

  describe('3. Memory APIs: remember, retrieve, update, forget, reinforce, decay, search', () => {
    it('remember() persists memory with full provenance and metadata', async () => {
      const memory = await memoryService.remember({
        content: 'I prefer strict TypeScript in all packages',
        category: 'TOOL_PREFERENCE',
        source: 'conversation:conv_123',
        epistemicTier: 'EXPLICIT',
        importance: 0.9,
      });

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('I prefer strict TypeScript in all packages');
      expect(memory.category).toBe('TOOL_PREFERENCE');
      expect(memory.source).toBe('conversation:conv_123');
      expect(memory.epistemicTier).toBe('EXPLICIT');
      expect(memory.confidence).toBeGreaterThanOrEqual(0.9);
      expect(memory.userEditable).toBe(true);
      expect(memory.embedding).toBeDefined();
      expect(memory.last_used_at).toBeDefined();
    });

    it('retrieve() returns memory and touches last_used_at timestamp', async () => {
      const created = await memoryService.remember({
        content: 'Our monorepo root path is C:\\Users\\bitty\\Desktop\\ALINA',
        category: 'PROJECT_CONTEXT',
        source: 'explicit_user',
      });

      const retrieved = await memoryService.retrieve(created.id);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.content).toBe(created.content);
      expect(retrieved.accessCount).toBeGreaterThan(0);
      expect(retrieved.last_used_at).toBeDefined();
    });

    it('update() allows user to edit content and correct category or tier', async () => {
      const created = await memoryService.remember({
        content: 'User appears to prefer dark mode',
        category: 'UI_PREFERENCE',
        epistemicTier: 'INFERRED',
        confidence: 0.6,
      });

      // User corrects ALINA and promotes it to a confirmed explicit preference
      const updated = await memoryService.update(created.id, {
        content: 'I exclusively prefer warm light mode for daytime editing',
        epistemicTier: 'EXPLICIT',
        confidence: 1.0,
      });

      expect(updated.id).toBe(created.id);
      expect(updated.content).toBe('I exclusively prefer warm light mode for daytime editing');
      expect(updated.epistemicTier).toBe('EXPLICIT');
      expect(updated.confidence).toBe(1.0);
      expect(updated.updatedAt).toBeDefined();
    });

    it('reinforce() increases confidence upon repeated observation', async () => {
      const created = await memoryService.remember({
        content: 'User appears to frequently use pnpm for package operations',
        category: 'TOOL_PREFERENCE',
        epistemicTier: 'INFERRED',
        confidence: 0.55,
      });

      const reinforced = await memoryService.reinforce(created.id, 0.15);
      expect(reinforced.confidence).toBeCloseTo(0.7, 2);

      // Cannot exceed 1.0
      await memoryService.reinforce(created.id, 0.5);
      const fullyReinforced = await memoryService.retrieve(created.id);
      expect(fullyReinforced.confidence).toBe(1.0);
    });

    it('decay() reduces confidence of inferred/temporary memories and cleans expired', async () => {
      // 1. Inferred memory that will decay
      const inferred = await memoryService.remember({
        content: 'User appears to try Neovim once in a while',
        category: 'TOOL_PREFERENCE',
        epistemicTier: 'INFERRED',
        confidence: 0.4,
      });

      // 2. Expired temporary context
      await memoryService.remember({
        content: 'Old temporary token verification test',
        category: 'TEMPORARY_CONTEXT',
        expiresAt: new Date(Date.now() - 10000).toISOString(),
      });

      const decayResult = await memoryService.decay({ decayFactor: 0.1, minConfidence: 0.2 });
      expect(decayResult.decayedCount + decayResult.purgedCount).toBeGreaterThan(0);

      const updatedInferred = await memoryService.retrieve(inferred.id);
      expect(updatedInferred.confidence).toBeCloseTo(0.3, 2);
    });

    it('search() performs semantic vector search and category filtering', async () => {
      await memoryService.remember({
        content: 'We use Vitest as our test runner across all packages',
        category: 'TOOL_PREFERENCE',
        tags: ['testing', 'vitest'],
      });
      await memoryService.remember({
        content: 'Editorial typography uses serif Newsreader accents with Inter body',
        category: 'UI_PREFERENCE',
        tags: ['design', 'typography'],
      });

      const searchResults = await memoryService.search({
        query: 'What test framework is used?',
        category: 'TOOL_PREFERENCE',
        limit: 3,
      });

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0]?.memory.content).toContain('Vitest');
    });

    it('forget() deletes memory and removes graph references', async () => {
      const created = await memoryService.remember({
        content: 'A temporary preference that I want to forget completely',
        category: 'PERSONAL_PREFERENCE',
      });

      const deleted = await memoryService.forget(created.id);
      expect(deleted).toBe(true);

      await expect(memoryService.retrieve(created.id)).rejects.toThrow();
    });
  });

  describe('4. Global & Per-Category Learning Controls', () => {
    it('blocks memory learning when learningEnabled is false', async () => {
      await memoryService.updateSettings({ learningEnabled: false });

      await expect(
        memoryService.remember({
          content: 'I prefer VS Code',
          category: 'TOOL_PREFERENCE',
        })
      ).rejects.toThrow('ALINA Personal Learning is currently disabled');

      // Re-enable
      await memoryService.updateSettings({ learningEnabled: true });
      const allowed = await memoryService.remember({
        content: 'I prefer VS Code',
        category: 'TOOL_PREFERENCE',
      });
      expect(allowed.id).toBeDefined();
    });

    it('blocks learning for specific categories disabled in user settings', async () => {
      await memoryService.updateSettings({
        disabledCategories: ['COMMUNICATION_STYLE', 'UI_PREFERENCE'],
      });

      // Disabled category should be rejected
      await expect(
        memoryService.remember({
          content: 'Keep communication style brief and concise',
          category: 'COMMUNICATION_STYLE',
        })
      ).rejects.toThrow('disabled in user preferences');

      // Enabled category should succeed
      const allowed = await memoryService.remember({
        content: 'Project root path is C:\\Users\\bitty\\Desktop\\ALINA',
        category: 'PROJECT_CONTEXT',
      });
      expect(allowed.id).toBeDefined();
      expect(allowed.category).toBe('PROJECT_CONTEXT');
    });

    it('blocks inferred learning when inferentialLearningEnabled is false', async () => {
      await memoryService.updateSettings({ inferentialLearningEnabled: false });

      await expect(
        memoryService.remember({
          content: 'User appears to prefer Chrome for web testing',
          category: 'TOOL_PREFERENCE',
          epistemicTier: 'INFERRED',
        })
      ).rejects.toThrow('Inferential learning is disabled');

      // Explicit learning remains active
      const explicitMem = await memoryService.remember({
        content: 'I explicitly prefer Chrome for browser automation',
        category: 'TOOL_PREFERENCE',
        epistemicTier: 'EXPLICIT',
      });
      expect(explicitMem.id).toBeDefined();
    });
  });
});
