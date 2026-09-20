import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlinaDatabaseClient,
  MigrationRunner,
  migration001InitialSchema,
  UserRepository,
  WorkspaceRepository,
  TaskRepository,
  MemoryRepository,
  AuditEventRepository,
  GraphRepository,
  seedDevelopmentDatabase,
  UserSchema,
  ToolCallSchema,
  AuditEventSchema,
  type TaskEntity,
  type TaskStepEntity,
  type ApprovalEntity,
  type MemoryEntity,
} from '../packages/database/src';

describe('ALINA SurrealDB Data Architecture', () => {
  let client: AlinaDatabaseClient;

  beforeEach(() => {
    // Uses offline in-memory fallback if daemon is offline
    client = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:8000/rpc',
      timeoutMs: 1000,
      maxRetries: 0,
    });
  });

  describe('1. Domain Models & Security Validation', () => {
    it('validates standard User entity with default preferences', () => {
      const validUser = UserSchema.parse({
        id: 'usr_101',
        name: 'Elena Rostova',
        email: 'elena@example.com',
      });
      expect(validUser.id).toBe('usr_101');
      expect(validUser.preferences).toEqual({});
      expect(validUser.createdAt).toBeDefined();
    });

    it('STRICT SECURITY RULE: Rejects entities containing secret keys or passwords', () => {
      expect(() => {
        UserSchema.parse({
          id: 'usr_bad',
          name: 'Hacker',
          preferences: {
            apiKey: 'sk-live-secret-123',
          },
        });
      }).toThrow(/Security violation/);

      expect(() => {
        ToolCallSchema.parse({
          id: 'call_bad',
          agentRunId: 'run_1',
          toolId: 'tool_1',
          inputParameters: {
            password: 'super-secret-password',
          },
        });
      }).toThrow(/Security violation/);

      expect(() => {
        AuditEventSchema.parse({
          id: 'audit_bad',
          eventType: 'tool_executed',
          actor: 'agent',
          target: 'system',
          details: {
            token: 'bearer-token-should-never-be-stored',
          },
        });
      }).toThrow(/Security violation/);
    });
  });

  describe('2. Migration System & Versioning', () => {
    it('initializes migration runner and registers baseline migration 001', async () => {
      const runner = new MigrationRunner(client);
      runner.register(migration001InitialSchema);

      const result = await runner.up();
      expect(result.applied.includes('001') || result.skipped.includes('001')).toBe(true);

      // Register unique migration to assert fresh application
      const dynamicVersion = `test_${Date.now()}`;
      runner.register({
        version: dynamicVersion,
        name: 'test_idempotent_migration',
        up: async (c) => {
          await c.query('DEFINE TABLE IF NOT EXISTS _dynamic_test SCHEMAFULL;');
        },
      });

      const dynamicResult = await runner.up();
      expect(dynamicResult.applied).toContain(dynamicVersion);

      // Idempotency check on repeat run
      const secondRun = await runner.up();
      expect(secondRun.skipped).toContain(dynamicVersion);
    });
  });

  describe('3. Repository CRUD Operations', () => {
    it('creates and retrieves user and active workspace', async () => {
      const userRepo = new UserRepository(client);
      const wsRepo = new WorkspaceRepository(client);

      const user = await userRepo.getOrCreateDefaultUser();
      expect(user.id).toBe('default_operator');
      expect(user.name).toBe('System Operator');

      const ws = await wsRepo.create({
        id: 'ws_test_01',
        name: 'Test Project Workspace',
        rootPath: 'C:\\Users\\bitty\\Desktop\\Test',
        allowedPaths: ['C:\\Users\\bitty\\Desktop\\Test'],
        isActive: true,
        settings: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const active = await wsRepo.getActiveWorkspace();
      expect(active?.id).toBe(ws.id);
      expect(active?.rootPath).toBe('C:\\Users\\bitty\\Desktop\\Test');
    });

    it('creates task with steps and handles approval gate lifecycle', async () => {
      const taskRepo = new TaskRepository(client);
      const taskId = `task_demo_${Date.now()}`;
      const appId = `app_step_${Date.now()}`;

      const task: TaskEntity = {
        id: taskId,
        goal: 'Refactor authentication module to zero-trust model',
        workspaceId: 'ws_test_01',
        status: 'awaiting_approval',
        riskLevel: 'HIGH_DESTRUCTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const steps: TaskStepEntity[] = [
        {
          id: `step_1_${Date.now()}`,
          taskId: task.id,
          index: 0,
          title: 'Inspect existing tokens',
          toolName: 'fs_read_file',
          riskLevel: 'READ_ONLY',
          parameters: { file: 'auth.ts' },
          status: 'completed',
        },
        {
          id: `step_2_${Date.now()}`,
          taskId: task.id,
          index: 1,
          title: 'Delete legacy credential store',
          toolName: 'fs_delete_file',
          parameters: { target: 'legacy.json' },
          status: 'awaiting_approval',
          riskLevel: 'HIGH_DESTRUCTIVE',
        },
      ];

      const { task: savedTask, steps: savedSteps } = await taskRepo.createTaskWithSteps(task, steps);
      expect(savedTask.id).toBe(taskId);
      expect(savedSteps.length).toBe(2);

      // Create human approval gate
      const approval: ApprovalEntity = {
        id: appId,
        taskId: task.id,
        taskStepId: steps[1]?.id || 'step_2',
        riskLevel: 'HIGH_DESTRUCTIVE',
        description: 'Requires approval to delete legacy credentials',
        diffPreview: '- legacy.json',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await taskRepo.createApprovalGate(approval);

      const pending = await taskRepo.getPendingApprovals(task.id);
      expect(pending.length).toBe(1);
      expect(pending[0]?.status).toBe('pending');

      // Operator grants approval
      const approved = await taskRepo.resolveApproval(appId, 'approved', 'operator_alice');
      expect(approved?.status).toBe('approved');
      expect(approved?.decisionBy).toBe('operator_alice');

      const remainingPending = await taskRepo.getPendingApprovals(task.id);
      expect(remainingPending.length).toBe(0);
    });

    it('rolls back task and step creation atomically if a step fails', async () => {
      const taskRepo = new TaskRepository(client);
      const failTaskId = `task_fail_${Date.now()}`;

      const task: TaskEntity = {
        id: failTaskId,
        goal: 'Atomic rollback demonstration',
        workspaceId: 'ws_test_01',
        status: 'pending',
        riskLevel: 'READ_ONLY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create valid first step, and invalid second step (missing required fields / invalid type)
      const invalidSteps = [
        {
          id: 'step_valid_1',
          taskId: failTaskId,
          index: 1,
          description: 'Valid step 1',
          toolName: 'fs_read_file',
          toolParams: {},
          riskLevel: 'READ_ONLY' as const,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step_invalid_2',
          // intentionally invalid schema
          taskId: failTaskId,
          index: 'not-a-number' as any,
          description: 'Invalid step 2',
          toolName: 'fs_write_file',
          toolParams: {},
          riskLevel: 'MEDIUM' as const,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await expect(
        taskRepo.createTaskWithSteps(task, invalidSteps as any)
      ).rejects.toThrow();

      // Verify that task does not exist (rolled back)
      const foundTask = await taskRepo.findById(failTaskId);
      expect(foundTask).toBeNull();
    });

    it('logs and queries security audit events', async () => {
      const auditRepo = new AuditEventRepository(client);

      await auditRepo.logEvent('sandbox_violation', 'agent_worker', 'C:\\Windows\\System32', 'critical', {
        attemptedPath: 'C:\\Windows\\System32\\cmd.exe',
      });

      await auditRepo.logEvent('tool_executed', 'agent_worker', 'fs_read_file', 'info', {
        path: 'README.md',
      });

      const recent = await auditRepo.listRecent(10);
      expect(recent.length).toBeGreaterThanOrEqual(2);

      const critical = await auditRepo.listCriticalEvents();
      expect(critical.some((e) => e.eventType === 'sandbox_violation')).toBe(true);
    });
  });

  describe('4. Vector Memory Search (Cosine Similarity)', () => {
    it('stores 384-dimensional embeddings and ranks results by semantic cosine similarity', async () => {
      const memoryRepo = new MemoryRepository(client);

      // Helper to generate normalized vector
      const makeVector = (dominantDim: number): number[] => {
        const v = new Array(384).fill(0.01);
        v[dominantDim] = 1.0;
        const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
        return v.map((val) => val / norm);
      };

      const vecSecurity = makeVector(10);
      const vecDesign = makeVector(50);
      const vecQuery = makeVector(10); // Matches security closely

      const mem1: MemoryEntity = {
        id: 'mem_sec',
        content: 'PathJail must strictly prevent out-of-boundary access.',
        category: 'rule',
        importance: 1.0,
        source: 'user_explicit',
        layer: 'semantic',
        accessCount: 1,
        metadata: {},
        tags: ['security', 'pathjail'],
        embedding: vecSecurity,
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const mem2: MemoryEntity = {
        id: 'mem_des',
        content: 'Editorial typography uses Newsreader and warm stone light mode.',
        category: 'preference',
        importance: 0.8,
        source: 'user_explicit',
        layer: 'semantic',
        accessCount: 1,
        metadata: {},
        tags: ['design'],
        embedding: vecDesign,
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await memoryRepo.create(mem1);
      await memoryRepo.create(mem2);

      const results = await memoryRepo.searchVector(vecQuery, 2, 0.5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.memory.id).toBe('mem_sec');
      expect(results[0]?.score).toBeGreaterThan(0.95);
    });
  });

  describe('5. Graph Relationships & Traversal', () => {
    it('creates graph edges and traverses incoming and outgoing relations', async () => {
      const graphRepo = new GraphRepository(client);

      // user -> owns -> workspace
      await graphRepo.relate('user:alice', 'owns', 'workspace:ws_mobile', { role: 'admin' });
      await graphRepo.relate('user:alice', 'owns', 'workspace:ws_backend', { role: 'admin' });

      const ownedWorkspaces = await graphRepo.findOutgoing('user:alice', 'owns');
      expect(ownedWorkspaces).toContain('workspace:ws_mobile');
      expect(ownedWorkspaces).toContain('workspace:ws_backend');

      const owners = await graphRepo.findIncoming('workspace:ws_mobile', 'owns');
      expect(owners).toContain('user:alice');
    });
  });

  describe('6. Development Seed Data Fixture', () => {
    it('seeds full development topology with user, workspace, tasks, and memories', async () => {
      const result = await seedDevelopmentDatabase(client);

      expect(result.user).toBe('default_operator');
      expect(result.workspace).toBe('ws_alina_main');
      expect(result.task).toBe('task_audit_arch');
      expect(result.memoryCount).toBe(3);
    });
  });
});
