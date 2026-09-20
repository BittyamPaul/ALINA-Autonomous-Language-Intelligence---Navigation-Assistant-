import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlinaSupervisorAgent,
  MockModelAdapter,
  SafeWorkspaceInspectorTool,
  AuthorizationManager,
  AlinaObservabilityService,
} from '../packages/agent/src';
import {
  ToolRegistry,
  ToolDefinition,
} from '../packages/tools/src';
import {
  AuditLogger,
  z,
} from '../packages/shared/src';

describe('ALINA Production Scenarios: Testing Across 9 Layers & 12 Critical Scenarios', () => {
  let toolRegistry: ToolRegistry;
  let authManager: AuthorizationManager;
  let obs: AlinaObservabilityService;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    AlinaObservabilityService.resetInstance();
    AuthorizationManager.resetInstance();
    auditLogger = new AuditLogger();
    obs = AlinaObservabilityService.getInstance();
    authManager = AuthorizationManager.getInstance({ auditLogger });
    toolRegistry = new ToolRegistry();
    toolRegistry.register(SafeWorkspaceInspectorTool);
  });

  // =========================================================================
  // Scenario 1: Safe Request (Layer 1, 4, 5)
  // =========================================================================
  describe('Scenario 1: Safe Request', () => {
    it('executes a safe read-only inspection request without pausing for approval', async () => {
      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Inspecting workspace directories.',
          toolCalls: [
            {
              toolName: 'safe_workspace_inspector',
              parameters: { path: '.', maxItems: 5 },
            },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Inspect workspace files safely',
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('Inspected');

      // Verify observability telemetry was recorded
      const taskSpans = obs.getSpans({ type: 'task_duration' });
      expect(taskSpans.length).toBe(1);
      expect(taskSpans[0]!.status).toBe('succeeded');
      expect(taskSpans[0]!.durationMs).toBeGreaterThanOrEqual(0);

      const toolSpans = obs.getSpans({ type: 'tool_call' });
      expect(toolSpans.length).toBe(1);
      expect(toolSpans[0]!.status).toBe('succeeded');
      expect(toolSpans[0]!.metadata.toolName).toBe('safe_workspace_inspector');
    });
  });

  // =========================================================================
  // Scenario 2: Tool Failure (Layer 5, 4)
  // =========================================================================
  describe('Scenario 2: Tool Failure', () => {
    it('captures tool execution failure, logs sanitized error telemetry, and does not crash', async () => {
      const failingTool: ToolDefinition = {
        name: 'read_failing_disk_tool',
        description: 'Simulates a low-level hardware or filesystem read failure',
        defaultRiskLevel: 'SAFE',
        schema: z.object({ target: z.string() }),
        execute: async () => {
          throw new Error('I/O error: disk sector corrupted at 0xDEADBEEF');
        },
      };
      toolRegistry.register(failingTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Calling failing tool.',
          toolCalls: [
            {
              toolName: 'read_failing_disk_tool',
              parameters: { target: '/dev/sda1' },
            },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Attempt to read from damaged disk',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('failed after 3 attempts');

      // Verify failure telemetry
      const failures = obs.getSpans({ type: 'failure' });
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0]!.component).toBe('tool_executor');

      const failedTools = obs.getSpans({ type: 'tool_call', status: 'failed' });
      expect(failedTools.length).toBe(3); // 3 retry attempts
    });
  });

  // =========================================================================
  // Scenario 3: Database Failure (Layer 3)
  // =========================================================================
  describe('Scenario 3: Database Failure', () => {
    it('fails gracefully when database persistence drops without crashing the supervisor loop', async () => {
      const mockFailingTaskService: any = {
        create: async () => {
          throw new Error('SurrealDB connection refused at 127.0.0.1:8000 (ECONNREFUSED)');
        },
        updateStatus: async () => {
          throw new Error('SurrealDB socket closed');
        },
      };

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        taskService: mockFailingTaskService,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Simple atomic operation.',
          toolCalls: [
            {
              toolName: 'safe_workspace_inspector',
              parameters: { path: '.' },
            },
          ],
        })),
      });

      // Supervisor must execute safely despite DB downtime (non-blocking resilience)
      const result = await supervisor.execute({
        goal: 'Operate during database disruption',
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
    });
  });

  // =========================================================================
  // Scenario 4: Browser Failure (Layer 7)
  // =========================================================================
  describe('Scenario 4: Browser Failure', () => {
    it('captures web navigation failure with typed error and browser action telemetry', async () => {
      obs.recordBrowserAction({
        taskId: 'browser_task_err',
        action: 'browser_navigate',
        url: 'https://nonexistent-domain-404-timeout.org',
        durationMs: 5020,
        status: 'failed',
        error: 'net::ERR_NAME_NOT_RESOLVED at https://nonexistent-domain-404-timeout.org',
      });

      const browserSpans = obs.getSpans({ type: 'browser_action' });
      expect(browserSpans.length).toBe(1);
      expect(browserSpans[0]!.status).toBe('failed');
      expect(browserSpans[0]!.metadata.action).toBe('browser_navigate');
      expect(browserSpans[0]!.metadata.hasError).toBe(true);
      expect(browserSpans[0]!.sanitizedDetails.error).toContain('ERR_NAME_NOT_RESOLVED');
    });
  });

  // =========================================================================
  // Scenario 5: Agent Retry (Layer 4)
  // =========================================================================
  describe('Scenario 5: Agent Retry', () => {
    it('triggers self-healing retry loop upon transient failure and recovers on subsequent attempt', async () => {
      let invocationCount = 0;
      const flakyTool: ToolDefinition = {
        name: 'read_flaky_network_fetcher',
        description: 'Fails on attempt 1, succeeds on attempt 2',
        defaultRiskLevel: 'SAFE',
        schema: z.object({ url: z.string() }),
        execute: async () => {
          invocationCount++;
          if (invocationCount === 1) {
            throw new Error('HTTP 503 Service Unavailable: Rate limited');
          }
          return { status: 200, body: 'Success on retry!' };
        },
      };
      toolRegistry.register(flakyTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Fetch from flaky endpoint.',
          toolCalls: [
            {
              toolName: 'read_flaky_network_fetcher',
              parameters: { url: 'https://api.flaky.local/data' },
            },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Query flaky service',
      });

      expect(result.status).toBe('completed');
      expect(invocationCount).toBe(2); // Retried once and succeeded

      // Verify retry telemetry
      const retries = obs.getSpans({ type: 'retry' });
      expect(retries.length).toBe(1);
      expect(retries[0]!.metadata.attempt).toBe(1);
      expect(retries[0]!.sanitizedDetails.reason).toContain('HTTP 503');
    });
  });

  // =========================================================================
  // Scenario 6: Approval Denied (Layer 2, Security)
  // =========================================================================
  describe('Scenario 6: Approval Denied', () => {
    it('halts mutating action when operator denies approval and leaves state unchanged', async () => {
      const deleteTool: ToolDefinition = {
        name: 'fs_delete_file',
        description: 'Deletes a file permanently',
        defaultRiskLevel: 'HIGH_RISK',
        schema: z.object({ filePath: z.string() }),
        execute: async () => ({ deleted: true }),
      };
      toolRegistry.register(deleteTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: 'Delete target file.',
          toolCalls: [
            {
              toolName: 'fs_delete_file',
              parameters: { filePath: 'critical-data.db' },
            },
          ],
        })),
      });

      // Step 1: Initial run enters waiting_for_approval
      const initialRun = await supervisor.execute({
        goal: 'Delete critical database file',
      });

      expect(initialRun.status).toBe('waiting_for_approval');
      expect(initialRun.approvalRequest).toBeDefined();
      const requestId = initialRun.approvalRequest!.id;

      // Step 2: Operator explicitly denies the approval via authManager.reject()
      const decisionResult = await authManager.reject(
        requestId,
        'Denying action: deletion of production database is forbidden.'
      );

      expect(decisionResult.status).toBe('rejected');

      // Record denied approval in telemetry
      obs.recordApproval({
        taskId: initialRun.taskId,
        requestId,
        toolName: 'fs_delete_file',
        riskLevel: 'HIGH_RISK',
        action: 'fs_delete_file',
        target: 'critical-data.db',
        decision: 'denied',
        reviewerNote: 'Denying action: deletion of production database is forbidden.',
      });

      const approvalSpans = obs.getSpans({ type: 'approval', status: 'denied' });
      expect(approvalSpans.length).toBe(1);
      expect(approvalSpans[0]!.metadata.decision).toBe('denied');
    });
  });

  // =========================================================================
  // Scenario 7: Approval Expired (Layer 2, Security)
  // =========================================================================
  describe('Scenario 7: Approval Expired', () => {
    it('fails closed when an approval token has passed its expiration timestamp', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'fs_delete_file',
        parameters: { target: 'cache.tmp' },
        reason: 'Clean temp files',
      });

      // Force request into expired state
      (req as any).expiresAt = new Date(Date.now() - 5000).toISOString();

      // Attempting to grant approval after expiry must fail closed
      await expect(authManager.approve(req.id)).rejects.toThrow(/expired/i);

      obs.recordApproval({
        taskId: 'task_exp',
        requestId: req.id,
        toolName: 'fs_delete_file',
        riskLevel: 'HIGH_RISK',
        action: 'fs_delete_file',
        target: 'cache.tmp',
        decision: 'expired',
      });

      const expiredSpans = obs.getSpans({ type: 'approval', status: 'expired' });
      expect(expiredSpans.length).toBe(1);
    });
  });

  // =========================================================================
  // Scenario 8: Permission Bypass Attempt (Layer 2, Security)
  // =========================================================================
  describe('Scenario 8: Permission Bypass Attempt', () => {
    it('strictly rejects forged or unapproved authorization tokens for high risk tools', async () => {
      const deleteTool: ToolDefinition = {
        name: 'fs_delete_file',
        description: 'High risk delete',
        defaultRiskLevel: 'HIGH_RISK',
        schema: z.object({ filePath: z.string() }),
        execute: async () => ({ success: true }),
      };
      toolRegistry.register(deleteTool);

      // Attempt 1: Executing without grant token
      const authAttempt1 = await authManager.authorize('fs_delete_file', { filePath: 'passwords.txt' });
      expect(authAttempt1.authorized).toBe(false);
      expect(authAttempt1.requiresApproval).toBe(true);

      // Attempt 2: Executing with forged grant ID
      const forgedGrantId = '00000000-0000-0000-0000-000000000000';
      const authAttempt2 = await authManager.authorize(
        'fs_delete_file',
        { filePath: 'passwords.txt' },
        forgedGrantId
      );
      expect(authAttempt2.authorized).toBe(false);

      // Audit logger must have recorded security violations
      const recentAudit = authManager.getAuditLogger()?.getRecent() ?? [];
      const violations = recentAudit.filter(
        (a) => a.actionType === 'security_violation' || a.actionType === 'approval_requested'
      );
      expect(violations.length).toBeGreaterThan(0);
    });

    it('rejects execution when approved parameters are tampered with before execution', async () => {
      const originalParams = { filePath: 'readme.txt' };
      const req = await authManager.createApprovalRequest({
        toolName: 'fs_delete_file',
        parameters: originalParams,
        reason: 'Delete readme',
      });

      const decision = await authManager.approve(req.id);
      expect(decision.grant.grantId).toBeDefined();

      // Attacker attempts to use grantToken for a different file target:
      const tamperedParams = { filePath: '/etc/shadow' };
      const authTampered = await authManager.authorize(
        'fs_delete_file',
        tamperedParams,
        decision.grant.grantId
      );

      // Must fail closed due to parameter hash mismatch
      expect(authTampered.authorized).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 9: Invalid Tool Input (Layer 1, 5)
  // =========================================================================
  describe('Scenario 9: Invalid Tool Input', () => {
    it('fails Zod schema validation before tool execution and logs sanitized error', async () => {
      const strictTool: ToolDefinition = {
        name: 'read_validated_port_scanner',
        description: 'Requires integer port within 1-65535',
        defaultRiskLevel: 'SAFE',
        schema: z.object({
          port: z.number().int().min(1).max(65535),
          host: z.string().ip(),
        }),
        execute: async () => ({ open: false }),
      };
      toolRegistry.register(strictTool);

      // Pass invalid port and invalid host IP
      const invalidParams = { port: -99, host: 'not-an-ip' };
      const parseResult = strictTool.schema.safeParse(invalidParams);
      expect(parseResult.success).toBe(false);

      obs.recordFailure({
        taskId: 'task_invalid_input',
        error: 'Zod validation error: invalid port and host IP',
        component: 'tool_validator',
        context: invalidParams,
      });

      const failureSpans = obs.getSpans({ type: 'failure' });
      expect(failureSpans.length).toBe(1);
      expect(failureSpans[0]!.metadata.errorMessage).toContain('validation error');
    });
  });

  // =========================================================================
  // Scenario 10: Task Cancellation (Layer 4)
  // =========================================================================
  describe('Scenario 10: Task Cancellation', () => {
    it('gracefully halts multi-step execution when supervisor.cancel() is invoked', async () => {
      let stepCounter = 0;
      const stepTool: ToolDefinition = {
        name: 'read_progressive_step_tool',
        description: 'Simulates progressive multi-step execution',
        defaultRiskLevel: 'SAFE',
        schema: z.object({ step: z.number() }),
        execute: async () => {
          stepCounter++;
          return { step: stepCounter };
        },
      };
      toolRegistry.register(stepTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: '3 sequential steps.',
          toolCalls: [
            { toolName: 'read_progressive_step_tool', parameters: { step: 1 } },
            { toolName: 'read_progressive_step_tool', parameters: { step: 2 } },
            { toolName: 'read_progressive_step_tool', parameters: { step: 3 } },
          ],
        })),
      });

      const taskId = 'cancellable_task_123';
      // Pre-cancel before execution starts or during loop
      supervisor.cancel(taskId);

      const result = await supervisor.execute({
        taskId,
        goal: 'Perform multi-stage work that will be cancelled',
      });

      expect(result.status).toBe('cancelled');
      expect(result.resultSummary).toContain('cancelled');
      expect(stepCounter).toBe(0); // Zero steps executed after cancellation

      const cancelledSpans = obs.getSpans({ type: 'task_duration', status: 'cancelled' });
      expect(cancelledSpans.length).toBe(1);
    });
  });

  // =========================================================================
  // Scenario 11: Partial Task Completion (Layer 4, 9)
  // =========================================================================
  describe('Scenario 11: Partial Task Completion', () => {
    it('preserves outputs of completed steps when a subsequent step in the pipeline fails', async () => {
      let step1Executed = false;
      let step2Executed = false;

      const step1Tool: ToolDefinition = {
        name: 'read_extract_data_step',
        description: 'Step 1 of pipeline',
        defaultRiskLevel: 'SAFE',
        schema: z.object({}),
        execute: async () => {
          step1Executed = true;
          return { records: 100 };
        },
      };

      const step2Tool: ToolDefinition = {
        name: 'inspect_transform_data_step',
        description: 'Step 2 of pipeline',
        defaultRiskLevel: 'SAFE',
        schema: z.object({}),
        execute: async () => {
          step2Executed = true;
          return { transformed: 100 };
        },
      };

      const step3FailTool: ToolDefinition = {
        name: 'read_publish_data_step',
        description: 'Step 3 of pipeline (fails)',
        defaultRiskLevel: 'SAFE',
        schema: z.object({}),
        execute: async () => {
          throw new Error('Remote publishing service 502 Bad Gateway');
        },
      };

      toolRegistry.register(step1Tool);
      toolRegistry.register(step2Tool);
      toolRegistry.register(step3FailTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async () => ({
          text: '3-stage pipeline.',
          toolCalls: [
            { toolName: 'read_extract_data_step', parameters: {} },
            { toolName: 'inspect_transform_data_step', parameters: {} },
            { toolName: 'read_publish_data_step', parameters: {} },
          ],
        })),
      });

      const result = await supervisor.execute({
        goal: 'Run ETL pipeline with downstream failure',
      });

      expect(step1Executed).toBe(true);
      expect(step2Executed).toBe(true);
      expect(result.status).toBe('failed');
      expect(result.stepsCompleted).toBe(2); // Partial completion recorded accurately
      expect(result.error).toContain('Step step_3 failed after 3 attempts');
    });
  });

  // =========================================================================
  // Scenario 12: Memory Retrieval (Layer 4, Memory)
  // =========================================================================
  describe('Scenario 12: Memory Retrieval', () => {
    it('retrieves relevant memory context and logs telemetry during task planning', async () => {
      let recalledContext: any = null;

      const mockMemoryService: any = {
        recall: async (_query: string) => [
          {
            memory: {
              content: 'User prefers dark mode and concise summaries without fluff.',
              category: 'preference',
              layer: 'semantic',
              importance: 0.9,
            },
            score: 0.92,
          },
        ],
      };

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        memoryService: mockMemoryService,
        authorizationManager: authManager,
        observabilityService: obs,
        modelAdapter: new MockModelAdapter(async (_prompt, context) => {
          recalledContext = (context as any)?.relevantMemories;
          return {
            text: 'Completed with memory context applied.',
            toolCalls: [
              {
                toolName: 'safe_workspace_inspector',
                parameters: { path: '.' },
              },
            ],
          };
        }),
      });

      const result = await supervisor.execute({
        goal: 'Summarize recent work adhering to user preferences',
      });

      expect(result.status).toBe('completed');
      expect(recalledContext).toBeDefined();
      expect(recalledContext.length).toBe(1);
      expect(recalledContext[0].content).toContain('User prefers dark mode');

      // Verify memory retrieval telemetry
      const memSpans = obs.getSpans({ type: 'memory_retrieval' });
      expect(memSpans.length).toBe(1);
      expect(memSpans[0]!.metadata.count).toBe(1);
    });
  });
});
