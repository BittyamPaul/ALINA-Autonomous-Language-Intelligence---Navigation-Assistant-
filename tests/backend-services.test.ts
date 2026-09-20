import { describe, it, expect, beforeAll } from 'vitest';
import { AlinaDatabaseClient } from '../packages/database/src';
import {
  ConversationService,
  MessageService,
  TaskService,
  ApprovalService,
  MemoryService,
  ToolService,
  AgentRunService,
  AuditService,
  sanitizeSecrets,
  createSuccessResponse,
  createErrorResponse,
  AlinaServiceError,
} from '../packages/agent/src';

describe('ALINA Application & Backend Service Architecture', () => {
  let client: AlinaDatabaseClient;
  let convService: ConversationService;
  let msgService: MessageService;
  let taskService: TaskService;
  let approvalService: ApprovalService;
  let memoryService: MemoryService;
  let toolService: ToolService;
  let runService: AgentRunService;
  let auditService: AuditService;

  beforeAll(async () => {
    client = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:8000/rpc',
      timeoutMs: 2000,
    });
    await client.connect();

    convService = new ConversationService(client);
    msgService = new MessageService(client);
    taskService = new TaskService(client);
    approvalService = new ApprovalService(client);
    memoryService = new MemoryService(client);
    toolService = new ToolService(client);
    runService = new AgentRunService(client);
    auditService = new AuditService(client);
  });

  describe('1. Security & Response Hygiene (Base Service)', () => {
    it('sanitizes and redacts all secret keys recursively', () => {
      const sensitivePayload = {
        name: 'test_config',
        apiKey: 'sk-secret-12345',
        nested: {
          password: 'super_secret_password',
          safeField: 'hello world',
          token: 'jwt-bearer-token',
        },
        list: [{ secret: 'nested-in-array' }, { public: 'ok' }],
      };

      const sanitized = sanitizeSecrets(sensitivePayload);
      expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.password).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.token).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.safeField).toBe('hello world');
      expect(sanitized.list[0]?.secret).toBe('[REDACTED_SECRET]');
      expect(sanitized.list[1]?.public).toBe('ok');
    });

    it('wraps payloads into standardized ApiResponse format', () => {
      const res = createSuccessResponse({ foo: 'bar', token: 'hide-me' });
      expect(res.success).toBe(true);
      expect(res.data?.foo).toBe('bar');
      expect(res.data?.token).toBe('[REDACTED_SECRET]');
      expect(res.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.metadata.timestamp).toBeDefined();
    });

    it('handles AlinaServiceError with custom status codes and details', () => {
      const err = new AlinaServiceError('Resource not found', 'NOT_FOUND', 404, { id: 'item_1' });
      const { response, statusCode } = createErrorResponse(err);
      expect(statusCode).toBe(404);
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NOT_FOUND');
      expect(response.error?.message).toBe('Resource not found');
      expect(response.error?.details).toEqual({ id: 'item_1' });
    });
  });

  describe('2. Conversation & Message Services', () => {
    let convId: string;

    it('creates a validated conversation and associates it with the user', async () => {
      const conv = await convService.create({
        workspaceId: 'ws_backend_test',
        title: 'Backend Architecture Design',
        summary: 'Discussion about modular service layers',
      });

      expect(conv.id).toMatch(/^conv_/);
      expect(conv.title).toBe('Backend Architecture Design');
      expect(conv.status).toBe('active');
      convId = conv.id;
    });

    it('sends user and assistant messages linked to the conversation', async () => {
      const userMsg = await msgService.send({
        conversationId: convId,
        role: 'user',
        content: 'Plan a zero-downtime database migration strategy.',
        metadata: {},
      });

      expect(userMsg.id).toMatch(/^msg_/);
      expect(userMsg.role).toBe('user');
      expect(userMsg.conversationId).toBe(convId);

      const assistantMsg = await msgService.send({
        conversationId: convId,
        role: 'assistant',
        content: 'I recommend backward-compatible schema changes with expand and contract pattern.',
        reasoning: 'Reduces risk of query failures during rollout.',
        metadata: {},
      });

      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.reasoning).toBeDefined();

      const messages = await msgService.listForConversation(convId);
      expect(messages.length).toBe(2);
      expect(messages[0]?.content).toBe('Plan a zero-downtime database migration strategy.');
      expect(messages[1]?.content).toContain('backward-compatible');
    });

    it('archives a conversation cleanly', async () => {
      const archived = await convService.archive(convId);
      expect(archived.status).toBe('archived');

      const fetched = await convService.getById(convId);
      expect(fetched.status).toBe('archived');
    });
  });

  describe('3. Task & Step Service', () => {
    let taskId: string;

    it('creates task with steps, validating schemas and setting statuses', async () => {
      const result = await taskService.create({
        workspaceId: 'ws_backend_test',
        goal: 'Verify zero-trust filesystem jail and security boundaries',
        riskLevel: 'MEDIUM',
        steps: [
          {
            title: 'Verify root path containment',
            toolName: 'fs_validate_jail',
            riskLevel: 'LOW',
          },
          {
            title: 'Update security configuration',
            toolName: 'fs_write_file',
            riskLevel: 'HIGH_DESTRUCTIVE',
          },
        ],
      });

      expect(result.task.id).toMatch(/^task_/);
      expect(result.task.status).toBe('draft');
      expect(result.steps.length).toBe(2);
      expect(result.steps[0]?.status).toBe('pending');
      expect(result.steps[1]?.riskLevel).toBe('HIGH_DESTRUCTIVE');

      taskId = result.task.id;
    });

    it('retrieves task by ID with child steps', async () => {
      const details = await taskService.getById(taskId);
      expect(details.task.id).toBe(taskId);
      expect(details.steps.length).toBe(2);
    });

    it('updates task execution status and summary', async () => {
      const updated = await taskService.updateStatus(taskId, {
        status: 'executing',
        resultSummary: 'Currently executing step 1',
      });
      expect(updated.status).toBe('executing');
      expect(updated.resultSummary).toBe('Currently executing step 1');
    });
  });

  describe('4. Approval Service (Human-In-The-Loop Safety Gate)', () => {
    let approvalId: string;
    const testTaskId = 'task_gate_test';
    const testStepId = 'step_gate_test';

    it('creates a pending approval gate for high-risk operation', async () => {
      const gate = await approvalService.createGate({
        taskId: testTaskId,
        taskStepId: testStepId,
        riskLevel: 'HIGH_DESTRUCTIVE',
        parameters: { file: 'package.json' },
        description: 'Authorize package.json version increment',
        diffPreview: '+ "version": "0.2.0"',
      });

      expect(gate.id).toMatch(/^app_/);
      expect(gate.status).toBe('pending');
      expect(gate.riskLevel).toBe('HIGH_DESTRUCTIVE');
      approvalId = gate.id;
    });

    it('lists pending approvals for a task', async () => {
      const pending = await approvalService.listPending(testTaskId);
      expect(pending.some((a) => a.id === approvalId)).toBe(true);
    });

    it('resolves approval with operator decision', async () => {
      const resolved = await approvalService.resolve(approvalId, {
        decision: 'approved',
        decisionBy: 'lead_operator',
      });

      expect(resolved.status).toBe('approved');
      expect(resolved.decisionBy).toBe('lead_operator');

      const pendingAfter = await approvalService.listPending(testTaskId);
      expect(pendingAfter.some((a) => a.id === approvalId)).toBe(false);
    });
  });

  describe('5. Memory Service (Vector Semantic & Fact Storage)', () => {
    let memoryId: string;

    it('remembers a categorized knowledge entry', async () => {
      const mem = await memoryService.remember({
        category: 'rule',
        content: 'Zero destructive operations without explicit human authorization.',
        importance: 1.0,
        tags: ['security', 'rule_1'],
      });

      expect(mem.id).toMatch(/^mem_/);
      expect(mem.category).toBe('rule');
      expect(mem.tags).toContain('rule_1');
      memoryId = mem.id;
    });

    it('lists memories filtered by category', async () => {
      const rules = await memoryService.list('rule');
      expect(rules.length).toBeGreaterThanOrEqual(1);
      expect(rules.every((r) => r.category === 'rule')).toBe(true);
    });

    it('deletes a memory by ID', async () => {
      const deleted = await memoryService.delete(memoryId);
      expect(deleted).toBe(true);

      await expect(memoryService.delete(memoryId)).rejects.toThrow(/not found/);
    });
  });

  describe('6. Tool Service & Execution Logging', () => {
    it('lists registered system tools with risk levels', () => {
      const tools = toolService.listAvailableTools();
      expect(tools.length).toBeGreaterThanOrEqual(5);
      expect(tools.some((t) => t.name === 'fs_read_file')).toBe(true);
      expect(tools.some((t) => t.name === 'fs_write_file')).toBe(true);
    });

    it('retrieves tool details and validates unknown tools throw 404', () => {
      const tool = toolService.getToolByName('fs_read_file');
      expect(tool.name).toBe('fs_read_file');

      expect(() => toolService.getToolByName('non_existent_tool')).toThrow(/not registered/);
    });

    it('logs tool execution calls with durations and statuses', async () => {
      const log = await toolService.logToolCall({
        agentRunId: 'run_test_01',
        toolId: 'fs_read_file',
        inputParameters: { path: 'README.md' },
        outputPayload: { size: 1024 },
        durationMs: 45,
        status: 'success',
      });

      expect(log.id).toMatch(/^call_/);
      expect(log.durationMs).toBe(45);
      expect(log.status).toBe('success');

      const recent = await toolService.listRecentCalls(10);
      expect(recent.some((c) => c.id === log.id)).toBe(true);
    });
  });

  describe('7. Agent Run & Audit Services', () => {
    it('tracks the lifecycle of an agent run', async () => {
      const run = await runService.startRun('task_backend_01', 'orchestrator_agent');
      expect(run.id).toMatch(/^run_/);
      expect(run.status).toBe('running');

      const updated = await runService.updateRun(run.id, {
        status: 'succeeded',
        stepCount: 3,
        tokenUsage: { prompt: 500, completion: 200 },
        endedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('succeeded');
      expect(updated.stepCount).toBe(3);
    });

    it('records and queries security audit events', async () => {
      const event = await auditService.logEvent(
        'sandbox_violation',
        'subagent_worker',
        'C:/Windows/System32',
        'critical',
        { blocked: true }
      );

      expect(event.id).toBeDefined();
      expect(event.severity).toBe('critical');

      const criticalEvents = await auditService.listCritical();
      expect(criticalEvents.some((e) => e.target === 'C:/Windows/System32')).toBe(true);
    });
  });
});
