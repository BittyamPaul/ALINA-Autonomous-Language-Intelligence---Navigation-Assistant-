import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PathJail, CommandInspector, AuditLogger, AlinaError } from '@alina/shared';
import { ToolRegistry, FsWriteFileTool, OsGetSystemInfoTool } from '@alina/tools';
import { HitlCoordinator, VerificationEngine, PlanTopologicalSorter } from '@alina/agent';
import { AlinaDatabase } from '@alina/database';
import { McpServerConfigSchema } from '@alina/mcp';
import { cn } from '@alina/ui';

describe('ALINA Foundation Architecture Tests', () => {
  const testWorkspaceRoot = path.resolve(__dirname, '../.test-sandbox');

  beforeEach(async () => {
    await fs.mkdir(testWorkspaceRoot, { recursive: true });
  });

  describe('@alina/shared — Security, Sandbox & Error Hierarchy', () => {
    it('PathJail allows files inside registered root and strictly blocks external or system paths', () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceRoot] });

      const insidePath = path.join(testWorkspaceRoot, 'safe.txt');
      expect(jail.isPathAllowed(insidePath).allowed).toBe(true);

      const externalPath = path.resolve('C:/some-unrelated-path/data.json');
      expect(jail.isPathAllowed(externalPath).allowed).toBe(false);

      expect(jail.isPathAllowed('C:\\Windows\\System32\\calc.exe').allowed).toBe(false);

      const sshPath = path.join(testWorkspaceRoot, '.ssh', 'id_rsa');
      expect(jail.isPathAllowed(sshPath).allowed).toBe(false);
    });

    it('CommandInspector accurately classifies benign, package manager, and destructive commands', () => {
      expect(CommandInspector.inspect('git status').riskLevel).toBe('READ_ONLY');
      expect(CommandInspector.inspect('node -v').riskLevel).toBe('READ_ONLY');
      expect(CommandInspector.inspect('pnpm install').riskLevel).toBe('MEDIUM');
      expect(CommandInspector.inspect('git push --force origin main').riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(CommandInspector.inspect('rm -rf /').isPermitted).toBe(false);

      // Security tests: shell chaining and metacharacters must NEVER evaluate to READ_ONLY
      expect(CommandInspector.inspect('dir && whoami').riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(CommandInspector.inspect('node -v & powershell -enc test').riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(CommandInspector.inspect('git status | cat').riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(CommandInspector.inspect('whoami; id').riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(CommandInspector.inspect('ls; rm -rf /').isPermitted).toBe(false);
    });

    it('AuditLogger captures entries and manages buffer size', () => {
      const logger = new AuditLogger();
      const entry = logger.log({
        actionType: 'tool_execution',
        toolName: 'fs_read_file',
        riskLevel: 'READ_ONLY',
        outcome: 'success',
        details: 'Read safe.txt',
      });

      expect(entry.id).toBeDefined();
      expect(logger.getRecent().length).toBe(1);
    });

    it('AlinaError preserves error code and context', () => {
      const err = new AlinaError('Failed', 'CUSTOM_ERR', { foo: 'bar' });
      expect(err.code).toBe('CUSTOM_ERR');
      expect(err.context?.foo).toBe('bar');
    });
  });

  describe('@alina/tools — Controlled Tool Execution', () => {
    it('ToolRegistry enforces dynamic risk checks and blocks unapproved destructive operations', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceRoot] });
      const audit = new AuditLogger();
      const registry = new ToolRegistry();
      registry.register(FsWriteFileTool);

      const targetPath = path.join(testWorkspaceRoot, 'package.json');

      const resultBlocked = await registry.execute(
        'fs_write_file',
        { filePath: targetPath, content: '{"name": "test"}' },
        { jail, auditLogger: audit, isApprovalGranted: false }
      );

      expect(resultBlocked.success).toBe(false);
      expect(resultBlocked.riskLevel).toBe('HIGH_DESTRUCTIVE');
      expect(resultBlocked.error).toContain('requires human-in-the-loop approval');

      const resultApproved = await registry.execute(
        'fs_write_file',
        { filePath: targetPath, content: '{"name": "test"}' },
        { jail, auditLogger: audit, isApprovalGranted: true }
      );

      expect(resultApproved.success).toBe(true);
      const readBack = await fs.readFile(targetPath, 'utf8');
      expect(readBack).toBe('{"name": "test"}');
    });

    it('OsGetSystemInfoTool executes read-only diagnostic inspection', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceRoot] });
      const audit = new AuditLogger();
      const registry = new ToolRegistry();
      registry.register(OsGetSystemInfoTool);

      const result = await registry.execute(
        'os_get_system_info',
        {},
        { jail, auditLogger: audit }
      );

      expect(result.success).toBe(true);
      expect((result.data as any)?.platform).toBeDefined();
    });
  });

  describe('@alina/agent — HITL Gating & Verification Contracts', () => {
    it('HitlCoordinator manages approval lifecycle asynchronously', async () => {
      const hitl = new HitlCoordinator();

      let requestedId = '';
      hitl.setOnApprovalRequested((req) => {
        requestedId = req.id;
      });

      const approvalPromise = hitl.requestApproval({
        taskId: 't-1',
        stepId: 's-1',
        toolName: 'fs_delete_file',
        title: 'Delete old logs',
        description: 'Remove stale log files',
        riskLevel: 'HIGH_DESTRUCTIVE',
        parameters: { targetPath: 'logs.txt' },
        impactSummary: 'Deletes file from disk',
      });

      expect(requestedId).toBeDefined();
      expect(hitl.getPendingList().length).toBe(1);

      hitl.resolveApproval({
        requestId: requestedId,
        approved: true,
        reviewerNote: 'Proceed safely',
        timestamp: new Date().toISOString(),
      });

      const decision = await approvalPromise;
      expect(decision.approved).toBe(true);
      expect(hitl.getPendingList().length).toBe(0);
    });

    it('PlanTopologicalSorter orders DAG steps correctly', () => {
      const dag = {
        id: 'dag-1',
        taskId: 'task-1',
        createdAt: new Date().toISOString(),
        steps: [
          {
            id: 'step-2',
            index: 1,
            title: 'Second step',
            description: 'Depends on first',
            agentRole: 'workspace' as const,
            tool: 'fs_write_file',
            parameters: {},
            riskLevel: 'MEDIUM' as const,
            status: 'pending' as const,
            retryCount: 0,
          },
          {
            id: 'step-1',
            index: 0,
            title: 'First step',
            description: 'Root',
            agentRole: 'workspace' as const,
            tool: 'fs_list_dir',
            parameters: {},
            riskLevel: 'READ_ONLY' as const,
            status: 'pending' as const,
            retryCount: 0,
          },
        ],
        edges: [{ fromStepId: 'step-1', toStepId: 'step-2' }],
      };

      const sorted = PlanTopologicalSorter.getTopologicalOrder(dag);
      expect(sorted[0]?.id).toBe('step-1');
      expect(sorted[1]?.id).toBe('step-2');
    });

    it('VerificationEngine validates post-conditions and formulates recovery', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceRoot] });
      const testFile = path.join(testWorkspaceRoot, 'check.txt');
      await fs.writeFile(testFile, 'ALINA is ready');

      const verifySuccess = await VerificationEngine.verifyPostCondition(
        {
          type: 'file_contains',
          target: testFile,
          expected: 'ALINA is ready',
          description: 'Check content',
        },
        null,
        jail
      );
      expect(verifySuccess.passed).toBe(true);

      const recovery = VerificationEngine.formulateRecoveryStrategy(
        {
          id: 'step-fail',
          index: 0,
          title: 'Test Step',
          description: 'Test',
          agentRole: 'workspace',
          tool: 'fs_read_file',
          parameters: {},
          riskLevel: 'READ_ONLY',
          status: 'running',
          retryCount: 0,
        },
        'File check.txt does not contain expected substring'
      );
      expect(recovery.canRecover).toBe(true);
    });
  });

  describe('@alina/database — SurrealDB Multi-Model Client', () => {
    it('AlinaDatabase persists and retrieves tasks in local fallback mode', async () => {
      const db = new AlinaDatabase();
      const task = {
        id: 'task-test-1',
        goal: 'Verify database fallback',
        sessionId: 'session-1',
        status: 'ready' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.saveTask(task);
      const retrieved = (await db.getTask('task-test-1')) as { goal?: string } | null;
      expect(retrieved?.goal).toBe('Verify database fallback');
    });
  });

  describe('@alina/mcp & @alina/ui — Protocol Schemas & UI Primitives', () => {
    it('McpServerConfigSchema validates server configurations', () => {
      const validConfig = {
        id: 'srv-1',
        name: 'Filesystem MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      };

      const parsed = McpServerConfigSchema.safeParse(validConfig);
      expect(parsed.success).toBe(true);
    });

    it('cn helper joins class names cleanly', () => {
      const result = cn('bg-stone-900', false && 'hidden', 'text-white');
      expect(result).toBe('bg-stone-900 text-white');
    });
  });
});
