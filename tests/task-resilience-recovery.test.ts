import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
  FailureClassifier,
  IdempotencyGuard,
  TaskWatchdog,
  TaskRecoveryEngine,
  AlinaSupervisorAgent,
  MockModelAdapter,
  TaskService,
} from '@alina/agent';
import {
  AlinaDatabaseClient,
  TaskRepository,
  TaskCheckpointRepository,
  TaskEntity,
  TaskCheckpointEntity,
} from '@alina/database';
import { ToolRegistry, ToolDefinition } from '@alina/tools';
import { PathJail, CanonicalTaskStateSchema, z } from '@alina/shared';

describe('ALINA High-Reliability Task Execution Engine & Crash Recovery', () => {
  let tempDir: string;
  let dbClient: AlinaDatabaseClient;
  let taskRepo: TaskRepository;
  let checkpointRepo: TaskCheckpointRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alina-resilience-test-'));
    dbClient = new AlinaDatabaseClient({ endpoint: 'memory://', namespace: 'test', database: 'test' });
    taskRepo = new TaskRepository(dbClient);
    checkpointRepo = taskRepo.getCheckpointRepository();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup
    }
  });

  // =========================================================================
  // 1. Canonical Task States
  // =========================================================================
  describe('1. Canonical Task States', () => {
    it('defines exactly the 11 canonical states in uppercase', () => {
      const states = CanonicalTaskStateSchema.options;
      expect(states).toEqual([
        'CREATED',
        'PLANNING',
        'READY',
        'RUNNING',
        'WAITING_FOR_APPROVAL',
        'WAITING_FOR_NETWORK',
        'RETRYING',
        'VERIFYING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
      ]);
    });
  });

  // =========================================================================
  // 2. Failure Classification
  // =========================================================================
  describe('2. 6-Class Failure Classification', () => {
    it('classifies network errors as NETWORK_REQUIRED', () => {
      const offlineResult = FailureClassifier.classify(new Error('getaddrinfo ENOTFOUND api.github.com'));
      expect(offlineResult.kind).toBe('NETWORK_REQUIRED');
      expect(offlineResult.retryable).toBe(true);
      expect(offlineResult.suggestedRecovery).toBe('PAUSE_FOR_NETWORK');

      const explicitOffline = FailureClassifier.classify(new Error('Device is offline'), { isOnline: false });
      expect(explicitOffline.kind).toBe('NETWORK_REQUIRED');
    });

    it('classifies permissions and safety violations as PERMISSION_REQUIRED', () => {
      const jailResult = FailureClassifier.classify(new Error('Path outside jail root'), { isJailViolation: true });
      expect(jailResult.kind).toBe('PERMISSION_REQUIRED');
      expect(jailResult.retryable).toBe(false);
      expect(jailResult.suggestedRecovery).toBe('PAUSE_FOR_APPROVAL');

      const osEacces = FailureClassifier.classify(new Error('EACCES: permission denied, open /etc/shadow'));
      expect(osEacces.kind).toBe('PERMISSION_REQUIRED');
    });

    it('classifies temporary hiccups as TRANSIENT', () => {
      const timeoutErr = FailureClassifier.classify(new Error('Operation timed out after 30000ms'));
      expect(timeoutErr.kind).toBe('TRANSIENT');
      expect(timeoutErr.retryable).toBe(true);
      expect(timeoutErr.suggestedRecovery).toBe('AUTO_RETRY');

      const rateLimitErr = FailureClassifier.classify(new Error('HTTP 429 Too Many Requests'));
      expect(rateLimitErr.kind).toBe('TRANSIENT');
    });

    it('classifies deterministic errors as PERMANENT', () => {
      const invalidTool = FailureClassifier.classify(new Error('Tool "hack_system" is not registered'));
      expect(invalidTool.kind).toBe('PERMANENT');
      expect(invalidTool.retryable).toBe(false);
      expect(invalidTool.suggestedRecovery).toBe('FAIL_FAST');
    });

    it('classifies human requirement as USER_ACTION_REQUIRED', () => {
      const authErr = FailureClassifier.classify(new Error('Missing credentials for service, user confirmation required'));
      expect(authErr.kind).toBe('USER_ACTION_REQUIRED');
      expect(authErr.retryable).toBe(false);
      expect(authErr.suggestedRecovery).toBe('ESCALATE_TO_USER');
    });

    it('classifies unexpected errors as UNKNOWN', () => {
      const unknownErr = FailureClassifier.classify(new Error('Unexpected kernel page fault in subsystem 42'));
      expect(unknownErr.kind).toBe('UNKNOWN');
    });
  });

  // =========================================================================
  // 3. Watchdog & Timeouts (Liveness Guarantee)
  // =========================================================================
  describe('3. Task Watchdog & Liveness Guarantee', () => {
    it('aborts and marks task FAILED if PLANNING exceeds deadline', async () => {
      const watchdog = new TaskWatchdog({ planningTimeoutMs: 50 });
      let timedOutReason = '';

      watchdog.register('task_planning_timeout', 'PLANNING', {
        onTimeout: (_tid, _st, reason) => {
          timedOutReason = reason;
        },
      });

      // Advance clock past 50ms
      await new Promise((resolve) => setTimeout(resolve, 60));
      const violations = await watchdog.checkTimeouts();

      expect(violations.length).toBe(1);
      expect(violations[0]?.taskId).toBe('task_planning_timeout');
      expect(violations[0]?.state).toBe('PLANNING');
      expect(timedOutReason).toContain('exceeded deadline of 50ms');
    });

    it('aborts and marks task FAILED if RUNNING step has no heartbeat', async () => {
      const watchdog = new TaskWatchdog({ stepTimeoutMs: 50 });
      let timedOutState = '';

      watchdog.register('task_step_timeout', 'RUNNING', {
        onTimeout: (_tid, st) => {
          timedOutState = st;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 60));
      const violations = await watchdog.checkTimeouts();

      expect(violations.length).toBe(1);
      expect(timedOutState).toBe('RUNNING');
    });

    it('heartbeat prevents watchdog timeout during active progress', async () => {
      const watchdog = new TaskWatchdog({ stepTimeoutMs: 60 });
      watchdog.register('task_heartbeat', 'RUNNING');

      // 30ms in: send heartbeat
      await new Promise((resolve) => setTimeout(resolve, 30));
      watchdog.heartbeat('task_heartbeat');

      // 30ms more: total 60ms elapsed, but only 30ms since last heartbeat
      await new Promise((resolve) => setTimeout(resolve, 30));
      const violations = await watchdog.checkTimeouts();

      expect(violations.length).toBe(0);
      watchdog.unregister('task_heartbeat');
    });

    it('aborts and marks task FAILED if RETRYING exceeds backoff deadline', async () => {
      const watchdog = new TaskWatchdog({ retryingTimeoutMs: 40 });
      watchdog.register('task_retrying_timeout', 'RETRYING');

      await new Promise((resolve) => setTimeout(resolve, 50));
      const violations = await watchdog.checkTimeouts();

      expect(violations.length).toBe(1);
      expect(violations[0]?.state).toBe('RETRYING');
    });
  });

  // =========================================================================
  // 4. Idempotency Guard
  // =========================================================================
  describe('4. Idempotency Guard & Pre-Execution Verification', () => {
    it('detects when a file copy already completed before retrying', async () => {
      const jail = new PathJail({ allowedRoots: [tempDir] });
      const srcFile = path.join(tempDir, 'source.txt');
      const destFile = path.join(tempDir, 'destination.txt');

      await fs.writeFile(srcFile, 'Hello Resilience', 'utf8');
      await fs.writeFile(destFile, 'Hello Resilience', 'utf8');

      const result = await IdempotencyGuard.verifyPostConditionAlreadyMet({
        toolName: 'fs_copy_file',
        parameters: { source: srcFile, destination: destFile },
        jail,
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('already exists and matches source file size');
    });

    it('detects when a destination file does not exist yet', async () => {
      const jail = new PathJail({ allowedRoots: [tempDir] });
      const srcFile = path.join(tempDir, 'source.txt');
      const destFile = path.join(tempDir, 'non_existent_dest.txt');

      await fs.writeFile(srcFile, 'Hello Source', 'utf8');

      const result = await IdempotencyGuard.verifyPostConditionAlreadyMet({
        toolName: 'fs_copy_file',
        parameters: { source: srcFile, destination: destFile },
        jail,
      });

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('does not exist yet');
    });

    it('detects when a write file operation is already satisfied', async () => {
      const jail = new PathJail({ allowedRoots: [tempDir] });
      const targetFile = path.join(tempDir, 'config.json');
      await fs.writeFile(targetFile, '{"status":"ready"}', 'utf8');

      const result = await IdempotencyGuard.verifyPostConditionAlreadyMet({
        toolName: 'fs_write_file',
        parameters: { path: targetFile, content: '{"status":"ready"}' },
        jail,
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('matches expected content exactly');
    });
  });

  // =========================================================================
  // 5. Crash Recovery Protocol & SurrealDB Checkpointing
  // =========================================================================
  describe('5. Crash Recovery Protocol', () => {
    it('recovers incomplete task after crash and skips re-executing already-succeeded side effect', async () => {
      const taskId = 'task_crash_copy_01';
      const srcFile = path.join(tempDir, 'dataset.csv');
      const destFile = path.join(tempDir, 'dataset_backup.csv');

      // Create files on disk: destination already was written before crash occurred
      await fs.writeFile(srcFile, 'id,name,value\n1,alpha,100', 'utf8');
      await fs.writeFile(destFile, 'id,name,value\n1,alpha,100', 'utf8');

      // Seed task in SurrealDB in RUNNING state
      const task: TaskEntity = {
        id: taskId,
        goal: 'Backup dataset file safely',
        workspaceId: 'ws_test',
        status: 'running',
        canonicalState: 'RUNNING',
        riskLevel: 'LOW',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await taskRepo.create(task);

      // Seed checkpoint simulating in-flight crash on step 1 (fs_copy_file)
      const checkpoint: TaskCheckpointEntity = {
        id: `chk_${taskId}_1_running`,
        taskId,
        stepIndex: 1,
        stepId: 'step_1',
        state: 'RUNNING',
        action: {
          toolName: 'fs_copy_file',
          parameters: { source: srcFile, destination: destFile },
          parametersHash: IdempotencyGuard.computeParametersHash({ source: srcFile, destination: destFile }),
          isSideEffecting: true,
        },
        preConditionsVerified: true,
        createdAt: new Date().toISOString(),
      };
      await checkpointRepo.saveCheckpoint(checkpoint);

      // System restarts! Engine scans for incomplete tasks
      const recoveryEngine = new TaskRecoveryEngine(taskRepo, checkpointRepo);
      const reports = await recoveryEngine.recoverIncompleteTasks({ jailRoot: tempDir });

      expect(reports.length).toBe(1);
      const report = reports[0]!;
      expect(report.taskId).toBe(taskId);
      expect(report.actionDetermined).toBe('ALREADY_SUCCEEDED');
      expect(report.recoveredState).toBe('READY');
      expect(report.explanation).toContain('[Crash Recovery Idempotency Guard]');
      expect(report.explanation).toContain('already succeeded on disk before the crash');

      // Verify task in DB is updated to READY and next step index is advanced
      const updatedTask = await taskRepo.findById(taskId);
      expect(updatedTask?.canonicalState).toBe('READY');
      expect(updatedTask?.currentStepIndex).toBe(2);

      // Verify a new verified checkpoint was written
      const latestChk = await checkpointRepo.getLatestCheckpoint(taskId);
      expect(latestChk?.state).toBe('VERIFYING');
      expect(latestChk?.postConditionsVerified).toBe(true);
    });

    it('requires confirmation if crashed action was incomplete and high-destructive', async () => {
      const taskId = 'task_crash_destructive_02';
      const destFile = path.join(tempDir, 'critical_config.json');

      // Ensure destFile does not exist
      const task: TaskEntity = {
        id: taskId,
        goal: 'Overhaul critical config',
        workspaceId: 'ws_test',
        status: 'running',
        canonicalState: 'RUNNING',
        riskLevel: 'HIGH_DESTRUCTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await taskRepo.create(task);

      const checkpoint: TaskCheckpointEntity = {
        id: `chk_${taskId}_1_running`,
        taskId,
        stepIndex: 1,
        stepId: 'step_1',
        state: 'RUNNING',
        action: {
          toolName: 'fs_write_file',
          parameters: { path: destFile, content: '{"production":true}' },
          parametersHash: IdempotencyGuard.computeParametersHash({ path: destFile }),
          isSideEffecting: true,
        },
        preConditionsVerified: true,
        createdAt: new Date().toISOString(),
      };
      await checkpointRepo.saveCheckpoint(checkpoint);

      const recoveryEngine = new TaskRecoveryEngine(taskRepo, checkpointRepo);
      const reports = await recoveryEngine.recoverIncompleteTasks({ jailRoot: tempDir });

      expect(reports.length).toBe(1);
      const report = reports[0]!;
      expect(report.actionDetermined).toBe('WAITING_FOR_USER');
      expect(report.recoveredState).toBe('WAITING_FOR_APPROVAL');
      expect(report.explanation).toContain('High-destructive operation requires operator confirmation');
    });

    it('resumes task when network is restored from WAITING_FOR_NETWORK state', async () => {
      const taskId = 'task_network_resume_03';
      const task: TaskEntity = {
        id: taskId,
        goal: 'Fetch remote specification',
        workspaceId: 'ws_test',
        status: 'waiting_for_approval',
        canonicalState: 'WAITING_FOR_NETWORK',
        riskLevel: 'LOW',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await taskRepo.create(task);

      const checkpoint: TaskCheckpointEntity = {
        id: `chk_${taskId}_1_net`,
        taskId,
        stepIndex: 1,
        stepId: 'step_1',
        state: 'WAITING_FOR_NETWORK',
        action: {
          toolName: 'browser_navigate',
          parameters: { url: 'https://api.example.com' },
          parametersHash: 'hash123',
          isSideEffecting: false,
        },
        preConditionsVerified: true,
        createdAt: new Date().toISOString(),
      };
      await checkpointRepo.saveCheckpoint(checkpoint);

      // Recovery when network is online
      const recoveryEngine = new TaskRecoveryEngine(taskRepo, checkpointRepo);
      const reports = await recoveryEngine.recoverIncompleteTasks({
        jailRoot: tempDir,
        isOnline: true,
      });

      expect(reports.length).toBe(1);
      expect(reports[0]?.actionDetermined).toBe('NEEDS_RETRY');
      expect(reports[0]?.recoveredState).toBe('READY');
      expect(reports[0]?.explanation).toContain('Network connectivity verified available');
    });
  });

  // =========================================================================
  // 6. Bounded Retries, Exponential Backoff & Honest Failure Reporting
  // =========================================================================
  describe('6. Supervisor Agent Resilient Execution & Honest Failure Reporting', () => {
    it('executes bounded retries with backoff and reports honest failure when retries exhausted', async () => {
      let callAttempts = 0;
      const failingTool: ToolDefinition = {
        name: 'inspect_flaky_service',
        description: 'Simulated flaky tool for retry testing',
        defaultRiskLevel: 'LOW',
        schema: z.record(z.unknown()),
        execute: async () => {
          callAttempts++;
          throw new Error('Simulated 503 Service Unavailable');
        },
      };

      const toolRegistry = new ToolRegistry();
      toolRegistry.register(failingTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        taskService: new TaskService(dbClient),
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Execution plan formulated',
          toolCalls: [
            {
              toolName: 'inspect_flaky_service',
              parameters: {},
            },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Perform resilient flaky step',
        workspaceId: 'ws_test',
        jailRoot: tempDir,
        isApprovalGranted: true,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 10,
          backoffMultiplier: 1.5,
          jitter: false,
        },
      });

      // Bounded retries: should have called exactly 3 times (attempt 1, 2, 3)
      expect(callAttempts).toBe(3);
      expect(result.status).toBe('failed');
      expect(result.canonicalState).toBe('FAILED');
      expect(result.failure?.kind).toBe('TRANSIENT');

      // Never silently claim success:
      expect(result.resultSummary).toContain('failed after 3 attempt(s)');
      expect(result.resultSummary).toContain('Classification: TRANSIENT');
      expect(result.resultSummary).toContain('Recovery is impossible without human intervention');
      expect(result.checkpointCount).toBeGreaterThanOrEqual(3);
    });

    it('honestly reports permanent errors immediately without wasting retries', async () => {
      let callAttempts = 0;
      const invalidParamTool: ToolDefinition = {
        name: 'inspect_invalid_service',
        description: 'Simulated invalid tool',
        defaultRiskLevel: 'LOW',
        schema: z.record(z.unknown()),
        execute: async () => {
          callAttempts++;
          throw new Error('ZodError: missing required property "target_path"');
        },
      };

      const toolRegistry = new ToolRegistry();
      toolRegistry.register(invalidParamTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        taskService: new TaskService(dbClient),
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Execution plan formulated',
          toolCalls: [
            {
              toolName: 'inspect_invalid_service',
              parameters: {},
            },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Perform invalid step',
        workspaceId: 'ws_test',
        jailRoot: tempDir,
        isApprovalGranted: true,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 10,
        },
      });

      // Permanent error: fails fast on attempt 1 without wasting 3 attempts
      expect(callAttempts).toBe(1);
      expect(result.status).toBe('failed');
      expect(result.canonicalState).toBe('FAILED');
      expect(result.failure?.kind).toBe('PERMANENT');
      expect(result.resultSummary).toContain('Classification: PERMANENT');
    });
  });
});
