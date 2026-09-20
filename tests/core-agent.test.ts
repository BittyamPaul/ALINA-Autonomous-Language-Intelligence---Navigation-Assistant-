import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  AlinaSupervisorAgent,
  AgentConfigSchema,
  DEFAULT_AGENT_CONFIG,
  ALINA_SUPERVISOR_INSTRUCTIONS,
  MockModelAdapter,
  MastraModelAdapter,
  SafeWorkspaceInspectorTool,
  MastraToolRegistrationBridge,
  adaptAlinaToolToMastra,
  TaskService,
  AgentRunService,
} from '@alina/agent';
import {
  ToolRegistry,
  ToolExecutionContext,
  ToolDefinition,
} from '@alina/tools';
import {
  PathJail,
  AuditLogger,
  AgentEventEnvelope,
  z,
} from '@alina/shared';
import { AlinaDatabaseClient } from '@alina/database';

describe('ALINA Core Agent System (Mastra Engine)', () => {
  const testWorkspaceDir = path.resolve(__dirname, '..');
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    toolRegistry.register(SafeWorkspaceInspectorTool);
  });

  // =========================================================================
  // 1. Agent Configuration & System Instructions
  // =========================================================================
  describe('1. Agent Configuration & System Instructions', () => {
    it('validates default agent configuration schema', () => {
      const parsed = AgentConfigSchema.parse(DEFAULT_AGENT_CONFIG);
      expect(parsed.id).toBe('alina-supervisor');
      expect(parsed.name).toBe('ALINA Supervisor');
      expect(parsed.temperature).toBe(0.2);
      expect(parsed.maxSteps).toBe(10);
      expect(parsed.timeoutMs).toBe(60000);
    });

    it('enforces safety rules and suppresses chain-of-thought in system prompt', () => {
      expect(ALINA_SUPERVISOR_INSTRUCTIONS).toContain('SAFE TOOL EXECUTION ONLY');
      expect(ALINA_SUPERVISOR_INSTRUCTIONS).toContain('NEVER execute tools outside the registered tool system');
      expect(ALINA_SUPERVISOR_INSTRUCTIONS).toContain('EIGHT-STAGE SUPERVISOR LOOP');
      expect(ALINA_SUPERVISOR_INSTRUCTIONS).toContain('NEVER expose raw internal chain-of-thought');
      expect(ALINA_SUPERVISOR_INSTRUCTIONS).toContain('waiting_for_approval');
    });
  });

  // =========================================================================
  // 2. Model Abstraction Layer
  // =========================================================================
  describe('2. Model Abstraction Layer', () => {
    it('uses MockModelAdapter for deterministic planning and tool selection', async () => {
      const adapter = new MockModelAdapter();
      const result = await adapter.generate('Inspect files in workspace');

      expect(result.text).toContain('workspace');
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.[0]?.toolName).toBe('safe_workspace_inspector');
      expect(result.toolCalls?.[0]?.parameters).toEqual({ path: '.', maxItems: 10 });
    });

    it('allows custom deterministic response handlers in MockModelAdapter', async () => {
      const adapter = new MockModelAdapter(async (prompt) => ({
        text: `Handled: ${prompt}`,
        toolCalls: [],
      }));

      const result = await adapter.generate('Summarize project');
      expect(result.text).toBe('Handled: Summarize project');
      expect(result.toolCalls).toEqual([]);
    });

    it('instantiates MastraModelAdapter with valid agent configuration', () => {
      const mastraAdapter = new MastraModelAdapter(DEFAULT_AGENT_CONFIG);
      expect(mastraAdapter).toBeDefined();
      expect(typeof mastraAdapter.generate).toBe('function');
    });
  });

  // =========================================================================
  // 3. Tool Registration Architecture & Sandboxing
  // =========================================================================
  describe('3. Tool Registration Architecture & Sandboxing', () => {
    it('converts ALINA tool into native Mastra createTool instance', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceDir] });
      const auditLogger = new AuditLogger();
      const context: ToolExecutionContext = { jail, auditLogger };

      const mastraTool = adaptAlinaToolToMastra(SafeWorkspaceInspectorTool, () => context);
      expect(mastraTool.id).toBe('safe_workspace_inspector');
      expect(mastraTool.description).toContain('Safely inspects files');

      // Execute via Mastra execute API
      const output = (await mastraTool.execute!({ path: '.', maxItems: 5 }, {} as any)) as {
        totalCount: number;
        inspectedPath: string;
      };
      expect(output).toBeDefined();
      expect(output.totalCount).toBeGreaterThan(0);
      expect(output.inspectedPath).toBe('.');
    });

    it('rejects tools outside the registered tool system', async () => {
      const bridge = new MastraToolRegistrationBridge(toolRegistry);
      const jail = new PathJail({ allowedRoots: [testWorkspaceDir] });
      const auditLogger = new AuditLogger();
      const context: ToolExecutionContext = { jail, auditLogger };

      const result = await bridge.executeControlled('unregistered_dangerous_tool', {}, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not part of the registered ALINA tool system');

      const logs = auditLogger.getRecent();
      expect(logs.some((l) => l.actionType === 'sandbox_violation')).toBe(true);
    });

    it('filters out arbitrary unrestricted shell execution tools from Mastra tools', () => {
      const dangerousTool: ToolDefinition = {
        name: 'exec_shell_raw',
        description: 'Dangerous shell access',
        schema: z.object({ command: z.string() }),
        defaultRiskLevel: 'HIGH_DESTRUCTIVE',
        execute: async () => ({ output: 'unsafe' }),
      };
      toolRegistry.register(dangerousTool);

      const bridge = new MastraToolRegistrationBridge(toolRegistry);
      const jail = new PathJail({ allowedRoots: [testWorkspaceDir] });
      const mastraTools = bridge.toMastraTools(() => ({ jail, auditLogger: new AuditLogger() }));

      expect(mastraTools['safe_workspace_inspector']).toBeDefined();
      expect(mastraTools['exec_shell_raw']).toBeUndefined(); // Strictly filtered out
    });
  });

  // =========================================================================
  // 4. Safe Demonstration Tool (safe_workspace_inspector)
  // =========================================================================
  describe('4. Safe Demonstration Tool (safe_workspace_inspector)', () => {
    it('executes safely within allowed workspace and lists items', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceDir] });
      const auditLogger = new AuditLogger();
      const context: ToolExecutionContext = { jail, auditLogger };

      const output = await SafeWorkspaceInspectorTool.execute({ path: '.', maxItems: 10 }, context);
      expect(output.totalCount).toBeGreaterThan(0);
      expect(output.items.length).toBeLessThanOrEqual(10);
      expect(output.items.length).toBeGreaterThan(0);
      expect(output.summary).toContain('Inspected directory');
    });

    it('strictly denies paths outside the PathJail', async () => {
      const jail = new PathJail({ allowedRoots: [testWorkspaceDir] });
      const auditLogger = new AuditLogger();
      const context: ToolExecutionContext = { jail, auditLogger };

      // Attempt path traversal outside project root
      await expect(
        SafeWorkspaceInspectorTool.execute({ path: '../../..' }, context)
      ).rejects.toThrow(/outside.*workspace/i);
    });
  });

  // =========================================================================
  // 5. Task Lifecycle & State Transitions
  // =========================================================================
  describe('5. Task Lifecycle & State Transitions', () => {
    it('transitions through pending -> planning -> running -> completed', async () => {
      const progressEvents: AgentEventEnvelope[] = [];
      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: new MockModelAdapter(),
      });

      const result = await agent.execute({
        goal: 'Inspect workspace files',
        jailRoot: testWorkspaceDir,
        onProgress: (evt) => progressEvents.push(evt),
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('Inspected');

      // Verify event sequence
      const types = progressEvents.map((e) => e.type);
      expect(types).toContain('step:progress');
      expect(types).toContain('task:plan_ready');
      expect(types).toContain('step:started');
      expect(types).toContain('step:completed');
      expect(types).toContain('task:completed');
    });

    it('transitions to waiting_for_approval when high-destructive tool is selected', async () => {
      const destructiveTool: ToolDefinition = {
        name: 'delete_critical_directory',
        description: 'Delete files',
        schema: z.object({ target: z.string() }),
        defaultRiskLevel: 'HIGH_DESTRUCTIVE',
        calculateDynamicRisk: () => 'HIGH_DESTRUCTIVE',
        execute: async () => ({ deleted: true }),
      };
      toolRegistry.register(destructiveTool);

      const mockAdapter = new MockModelAdapter(async () => ({
        text: 'Planning deletion',
        toolCalls: [{ toolName: 'delete_critical_directory', parameters: { target: '/tmp' } }],
      }));

      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: mockAdapter,
      });

      const result = await agent.execute({
        goal: 'Delete critical files',
        jailRoot: testWorkspaceDir,
      });

      expect(result.status).toBe('waiting_for_approval');
      expect(result.resultSummary).toContain('awaiting approval');
    });

    it('transitions to failed when an unregistered tool is requested', async () => {
      const mockAdapter = new MockModelAdapter(async () => ({
        text: 'Requesting rogue tool',
        toolCalls: [{ toolName: 'rogue_system_call', parameters: {} }],
      }));

      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: mockAdapter,
      });

      const result = await agent.execute({
        goal: 'Run rogue tool',
        jailRoot: testWorkspaceDir,
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('is not registered in ALINA\'s tool system');
    });

    it('supports task cancellation by operator', async () => {
      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: new MockModelAdapter(),
      });

      const taskId = 'task_cancel_test_001';
      agent.cancel(taskId);

      const result = await agent.execute({
        taskId,
        goal: 'Inspect workspace files',
        jailRoot: testWorkspaceDir,
      });

      expect(result.status).toBe('cancelled');
      expect(result.resultSummary).toContain('cancelled by operator');
    });
  });

  // =========================================================================
  // 6. Human-Readable Progress & Chain-of-Thought Suppression
  // =========================================================================
  describe('6. Human-Readable Progress & Chain-of-Thought Suppression', () => {
    it('emits concise status updates and suppresses raw chain-of-thought dumps', async () => {
      const progressMessages: string[] = [];

      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: new MockModelAdapter(),
      });

      await agent.execute({
        goal: 'Inspect workspace structure',
        jailRoot: testWorkspaceDir,
        onProgress: (evt) => {
          const payload = evt.payload as { message?: string };
          if (payload.message) progressMessages.push(payload.message);
        },
      });

      expect(progressMessages.length).toBeGreaterThan(3);

      // Verify no raw internal tags leaked
      for (const msg of progressMessages) {
        expect(msg).not.toContain('<thought>');
        expect(msg).not.toContain('</thought>');
        expect(msg).not.toContain('raw_trace');
        expect(msg).not.toContain('system_prompt');
      }

      // Verify clean, high-signal editorial messages
      expect(progressMessages.some((m) => m.includes('Task initialized'))).toBe(true);
      expect(progressMessages.some((m) => m.includes('Generated plan'))).toBe(true);
      expect(progressMessages.some((m) => m.includes('completed successfully'))).toBe(true);
    });
  });

  // =========================================================================
  // 7. End-to-End Task Verification & SurrealDB Persistence
  // =========================================================================
  describe('7. End-to-End Task Verification & SurrealDB Persistence', () => {
    it('executes full pipeline: User Request -> Agent -> Tool -> Result -> Response -> Database Persistence', async () => {
      const dbClient = new AlinaDatabaseClient();
      await dbClient.connect();

      const taskService = new TaskService(dbClient);
      const agentRunService = new AgentRunService(dbClient);

      const agent = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: new MockModelAdapter(),
        taskService,
        agentRunService,
      });

      const taskId = `task_e2e_${Date.now()}`;
      const result = await agent.execute({
        taskId,
        goal: 'Inspect workspace and list project files',
        workspaceId: 'ws_alina_main',
        jailRoot: testWorkspaceDir,
      });

      // 1. Verify agent output
      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('Inspected');

      // 2. Verify persistence in SurrealDB
      const persistedTask = await taskService.getById(taskId);
      expect(persistedTask).toBeDefined();
      expect(persistedTask.task.id).toBe(taskId);
      expect(persistedTask.task.status).toBe('completed');
      expect(persistedTask.task.resultSummary).toContain('Inspected');

      // 3. Verify agent run telemetry recorded in SurrealDB
      const runs = await agentRunService.listForTask(taskId);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs[0]?.status).toBe('succeeded');
      expect(runs[0]?.stepCount).toBe(1);

      await dbClient.close();
    });
  });
});
