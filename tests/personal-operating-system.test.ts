import { describe, it, expect, beforeEach } from 'vitest';
import {
  PersonalContextRepository,
  AlinaDatabaseClient,
} from '@alina/database';
import {
  PersonalOsEngine,
  AlinaSupervisorAgent,
  MockModelAdapter,
} from '@alina/agent';
import {
  PathJail,
  PersonalContextNodeEntity,
} from '@alina/shared';

describe('ALINA Personal Operating System & Unified Context Graph', () => {
  let dbClient: AlinaDatabaseClient;
  let repo: PersonalContextRepository;
  let engine: PersonalOsEngine;

  beforeEach(() => {
    // Offline / in-memory resilient client
    dbClient = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:59999/rpc',
      namespace: 'alina',
      database: 'main',
    });
    repo = new PersonalContextRepository(dbClient);
    engine = new PersonalOsEngine(repo);
  });

  describe('1. Unified Personal Context Graph Traversal & Relations', () => {
    it('creates nodes and connects them with semantic graph edges', async () => {
      const userNode: PersonalContextNodeEntity = {
        id: 'user_default',
        type: 'USER',
        name: 'Default Operator',
        properties: { role: 'Lead Architect' },
        confidence: 1.0,
        source: 'SYSTEM',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const projectNode: PersonalContextNodeEntity = {
        id: 'proj_alina',
        type: 'PROJECT',
        name: 'ALINA OS',
        description: 'Autonomous Language Intelligence & Navigation Assistant',
        properties: { rootPath: 'C:\\Users\\bitty\\Desktop\\ALINA' },
        confidence: 1.0,
        source: 'USER_STATED',
        provenance: {
          learnedAt: new Date().toISOString(),
          originalStatement: 'This is the ALINA personal operating system project.',
          reasonRemembered: 'User designated as primary project',
        },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const techNode: PersonalContextNodeEntity = {
        id: 'tech_typescript',
        type: 'TECHNOLOGY',
        name: 'TypeScript',
        description: 'Strict mode TypeScript across monorepo',
        properties: { version: '5.x', strict: true },
        confidence: 0.95,
        source: 'OBSERVED_PATTERN',
        provenance: { learnedAt: new Date().toISOString(), reasonRemembered: 'Detected in tsconfig.json' },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await repo.upsertNode(userNode);
      await repo.upsertNode(projectNode);
      await repo.upsertNode(techNode);

      // Connect User -> works_on -> Project
      const edge1 = await repo.relate('user_default', 'USER', 'works_on', 'proj_alina', 'PROJECT');
      expect(edge1).toBeDefined();
      expect(edge1.relation).toBe('works_on');

      // Connect Project -> uses -> Technology
      const edge2 = await repo.relate('proj_alina', 'PROJECT', 'uses', 'tech_typescript', 'TECHNOLOGY');
      expect(edge2).toBeDefined();
      expect(edge2.relation).toBe('uses');

      // Verify Project subgraph
      const projectGraph = await repo.getProjectGraph('proj_alina');
      expect(projectGraph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(projectGraph.edges.some((e) => e.relation === 'uses')).toBe(true);

      // Verify Unified Graph
      const unified = await repo.getUnifiedGraph('user_default');
      expect(unified.nodes.length).toBeGreaterThanOrEqual(3);
      expect(unified.edges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Relevance Filtering & Bounded Retrieval Budget', () => {
    it('retrieves only relevant nodes within budget and ignores unrelated items', async () => {
      // Seed disparate nodes
      await repo.upsertNode({
        id: 'pref_ts',
        type: 'PREFERENCE',
        name: 'TypeScript Strict Mode',
        description: 'Always use strict TypeScript with zero any',
        properties: { language: 'typescript' },
        confidence: 0.95,
        source: 'USER_STATED',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await repo.upsertNode({
        id: 'wf_test',
        type: 'WORKFLOW',
        name: 'Vitest Unit Testing',
        description: 'Run vitest suite to verify regressions',
        properties: { tool: 'vitest' },
        confidence: 0.9,
        source: 'TASK_EXECUTION',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await repo.upsertNode({
        id: 'pref_food',
        type: 'PREFERENCE',
        name: 'Italian Pasta Recipe',
        description: 'Favorite olive oil and garlic spaghetti recipe',
        properties: {},
        confidence: 0.8,
        source: 'USER_STATED',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Query for technical task
      const relevant = await repo.getRelevantContext('compile typescript code and run unit tests', {
        limit: 5,
        threshold: 0.15,
      });

      // Must find TypeScript and Vitest, must NOT include Italian Pasta
      const names = relevant.map((n) => n.name);
      expect(names).toContain('TypeScript Strict Mode');
      expect(names).toContain('Vitest Unit Testing');
      expect(names).not.toContain('Italian Pasta Recipe');
      expect(relevant.length).toBeLessThanOrEqual(5);
    });
  });

  describe('3. Prompt Precedence & Conflict Overriding', () => {
    it('strictly overrides saved preference when user prompt gives conflicting instructions', async () => {
      await repo.upsertNode({
        id: 'pref_lang_ts',
        type: 'PREFERENCE',
        name: 'TypeScript Preference',
        description: 'Always write TypeScript for scripts',
        properties: { language: 'typescript' },
        confidence: 0.95,
        source: 'USER_STATED',
        provenance: {
          learnedAt: new Date().toISOString(),
          originalStatement: 'I prefer TypeScript for everything.',
          reasonRemembered: 'User preference',
        },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // User prompt explicitly contradicts saved preference
      const brief = await engine.preparePlanningContext({
        goal: 'Write a quick helper script in plain JavaScript without TypeScript',
      });

      // The TypeScript preference must be detected as overridden
      const overridden = brief.overriddenItems.find((item) => item.nodeId === 'pref_lang_ts');
      expect(overridden).toBeDefined();
      expect(overridden?.isOverridden).toBe(true);

      // Active context items must NOT include the conflicting preference
      const activeIds = brief.activeContextItems.map((item) => item.nodeId);
      expect(activeIds).not.toContain('pref_lang_ts');

      // Prompt section must explicitly inform the model of the operator override
      expect(brief.promptSection).toContain('OPERATOR OVERRIDE');
    });
  });

  describe('4. Safety & PathJail Inviolability', () => {
    it('asserts that memory can never bypass system safety or PathJail boundaries', () => {
      const jail = new PathJail({ allowedRoots: ['C:\\Users\\bitty\\Desktop\\ALINA'] });

      // An unconstrained memory suggestion claiming root access
      const maliciousPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
      expect(() => jail.assertPathAllowed(maliciousPath)).toThrow();

      // Memory cannot modify PathJail allowed roots
      expect(jail.getAllowedRoots()).toEqual(['C:\\Users\\bitty\\Desktop\\ALINA']);
    });
  });

  describe('5. Per-Conversation Memory Toggle (Killswitch)', () => {
    it('returns zero personal context when memory is disabled for a session', async () => {
      await repo.upsertNode({
        id: 'pref_secret',
        type: 'PREFERENCE',
        name: 'Private Preference',
        description: 'Sensitive work preference',
        properties: {},
        confidence: 1.0,
        source: 'USER_STATED',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Execute with memoryDisabled: true
      const brief = await engine.preparePlanningContext({
        goal: 'Private preference task',
        isMemoryDisabled: true,
      });

      expect(brief.isMemoryDisabled).toBe(true);
      expect(brief.activeContextItems.length).toBe(0);
      expect(brief.usageRecords.length).toBe(0);
      expect(brief.promptSection).toBe('');
    });
  });

  describe('6. Provenance & "Why do you remember this?" Explanations', () => {
    it('provides clear human explanation with source, timestamp, confidence, and original statement', async () => {
      const node: PersonalContextNodeEntity = {
        id: 'node_explain_test',
        type: 'PREFERENCE',
        name: 'Concise Editorial Responses',
        description: 'Prefer concise Linear-style brevity',
        properties: { style: 'concise' },
        confidence: 0.92,
        source: 'USER_STATED',
        provenance: {
          learnedAt: '2026-09-20T10:00:00.000Z',
          reasonRemembered: 'User stated preference for concise answers',
          originalStatement: 'Please keep your answers concise and punchy.',
          sourceConversationId: 'conv_123',
        },
        isProtected: false,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      };

      await repo.upsertNode(node);

      const explanation = await engine.explainMemory('node_explain_test');
      expect(explanation).toBeDefined();
      expect(explanation?.nodeId).toBe('node_explain_test');
      expect(explanation?.whyRemembered).toContain('concise');
      expect(explanation?.source).toBe('USER_STATED');
      expect(explanation?.confidence).toBe(0.92);
      expect(explanation?.originalStatement).toBe('Please keep your answers concise and punchy.');
      expect(explanation?.canForget).toBe(true);
    });
  });

  describe('7. "Forget this" Cascade Deletion', () => {
    it('completely deletes the node, all graph edges, and associated records', async () => {
      // Create node and 2 edges
      await repo.upsertNode({
        id: 'node_to_forget',
        type: 'PREFERENCE',
        name: 'Temporary Preference',
        description: 'Will be forgotten',
        properties: {},
        confidence: 0.7,
        source: 'USER_STATED',
        provenance: { learnedAt: new Date().toISOString() },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await repo.relate('user_default', 'USER', 'prefers', 'node_to_forget', 'PREFERENCE');
      await repo.relate('node_to_forget', 'PREFERENCE', 'related_to', 'proj_alina', 'PROJECT');

      // Verify presence
      const before = await repo.getNode('node_to_forget');
      expect(before).toBeDefined();
      const edgesBefore = await repo.getEdges('node_to_forget');
      expect(edgesBefore.length).toBe(2);

      // Perform Forget
      const forgetResult = await engine.forget('node_to_forget');
      expect(forgetResult.success).toBe(true);
      expect(forgetResult.edgesDeleted).toBe(2);

      // Verify node and edges are purged
      const after = await repo.getNode('node_to_forget');
      expect(after).toBeNull();
      const edgesAfter = await repo.getEdges('node_to_forget');
      expect(edgesAfter.length).toBe(0);
    });
  });

  describe('8. Supervisor Agent Integration & Context Telemetry', () => {
    it('integrates personal OS context into supervisor execution and logs usages', async () => {
      // Seed a workflow node
      await repo.upsertNode({
        id: 'wf_audit',
        type: 'WORKFLOW',
        name: 'Repository Quality Audit',
        description: 'Run linter and typecheck across monorepo',
        properties: {},
        confidence: 0.9,
        source: 'TASK_EXECUTION',
        provenance: { learnedAt: new Date().toISOString(), reasonRemembered: 'Verified task outcome' },
        isProtected: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const modelAdapter = new MockModelAdapter(async () => ({
        text: 'Verified repository audit workflow.',
        toolCalls: [],
      }));

      const supervisor = new AlinaSupervisorAgent({
        modelAdapter,
        personalOsEngine: engine,
      });

      // Execute supervisor with memory enabled
      const result = await supervisor.execute({
        goal: 'Repository Quality Audit',
        forceDirect: true,
      });

      expect(result.status).toBe('completed');
      expect(result.isMemoryDisabled).toBe(false);
      expect(result.contextUsages).toBeDefined();
      expect(result.contextUsages?.some((u) => u.nodeId === 'wf_audit')).toBe(true);

      // Execute supervisor with memory disabled
      const disabledResult = await supervisor.execute({
        goal: 'Repository Quality Audit',
        isMemoryDisabled: true,
        forceDirect: true,
      });

      expect(disabledResult.status).toBe('completed');
      expect(disabledResult.isMemoryDisabled).toBe(true);
      expect(disabledResult.contextUsages?.length).toBe(0);
    });
  });
});
