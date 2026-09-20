import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlinaObservabilityService,
} from '../packages/agent/src';

describe('ALINA Production Observability & Telemetry Engine', () => {
  let obs: AlinaObservabilityService;

  beforeEach(() => {
    AlinaObservabilityService.resetInstance();
    obs = AlinaObservabilityService.getInstance({ maxSpans: 500 });
  });

  describe('1. Dedicated Telemetry Type Recording', () => {
    it('records task duration telemetry with clean metrics', () => {
      const span = obs.recordTaskDuration({
        taskId: 'task_001',
        durationMs: 1450,
        status: 'succeeded',
        goal: 'List workspace documentation',
        stepsCompleted: 3,
        toolCallsCount: 2,
      });

      expect(span.id).toBeDefined();
      expect(span.taskId).toBe('task_001');
      expect(span.type).toBe('task_duration');
      expect(span.status).toBe('succeeded');
      expect(span.durationMs).toBe(1450);
      expect(span.component).toBe('supervisor');
      expect(span.metadata.stepsCompleted).toBe(3);
      expect(span.metadata.toolCallsCount).toBe(2);
    });

    it('records tool call telemetry with execution duration and status', () => {
      const span = obs.recordToolCall({
        taskId: 'task_001',
        toolName: 'read_text_file',
        durationMs: 42,
        input: { filePath: 'notes.txt' },
        output: { sizeBytes: 1024, content: 'Hello ALINA' },
        status: 'succeeded',
      });

      expect(span.type).toBe('tool_call');
      expect(span.metadata.toolName).toBe('read_text_file');
      expect(span.durationMs).toBe(42);
      expect(span.status).toBe('succeeded');
      expect((span.sanitizedDetails.input as any).filePath).toBe('notes.txt');
    });

    it('records failure telemetry with component and error details', () => {
      const span = obs.recordFailure({
        taskId: 'task_002',
        error: new Error('Permission denied: cannot write to C:\\Windows'),
        component: 'filesystem_agent',
        retryable: false,
        context: { path: 'C:\\Windows\\system32' },
      });

      expect(span.type).toBe('failure');
      expect(span.status).toBe('failed');
      expect(span.component).toBe('filesystem_agent');
      expect(span.metadata.errorMessage).toContain('Permission denied');
      expect(span.metadata.retryable).toBe(false);
    });

    it('records retry telemetry with attempt count and recovery strategy', () => {
      const span = obs.recordRetry({
        taskId: 'task_003',
        stepOrTool: 'browser_navigate',
        attempt: 2,
        maxAttempts: 3,
        reason: 'Navigation timeout after 15000ms',
        strategy: 'exponential_backoff',
        backoffMs: 2000,
      });

      expect(span.type).toBe('retry');
      expect(span.metadata.attempt).toBe(2);
      expect(span.metadata.maxAttempts).toBe(3);
      expect(span.metadata.backoffMs).toBe(2000);
      expect(span.sanitizedDetails.strategy).toBe('exponential_backoff');
    });

    it('records approval telemetry with decision and operator latency', () => {
      const span = obs.recordApproval({
        taskId: 'task_004',
        requestId: 'req_123',
        toolName: 'fs_delete_file',
        riskLevel: 'HIGH_RISK',
        action: 'Delete obsolete cache',
        target: 'cache/old.bin',
        decision: 'approved',
        latencyMs: 3400,
        reviewerNote: 'Approved for test environment',
      });

      expect(span.type).toBe('approval');
      expect(span.status).toBe('approved');
      expect(span.durationMs).toBe(3400);
      expect(span.metadata.riskLevel).toBe('HIGH_RISK');
      expect(span.metadata.decision).toBe('approved');
      expect(span.sanitizedDetails.reviewerNote).toBe('Approved for test environment');
    });

    it('records agent run telemetry across specialized roles', () => {
      const span = obs.recordAgentRun({
        taskId: 'task_005',
        agentRole: 'research',
        runId: 'del_research_01',
        status: 'succeeded',
        durationMs: 820,
        stepCount: 2,
        toolCallsCount: 1,
      });

      expect(span.type).toBe('agent_run');
      expect(span.status).toBe('succeeded');
      expect(span.component).toBe('research');
      expect(span.durationMs).toBe(820);
      expect(span.metadata.stepCount).toBe(2);
    });

    it('records browser action telemetry with action, selector, and status', () => {
      const span = obs.recordBrowserAction({
        taskId: 'task_006',
        action: 'browser_navigate',
        url: 'https://alina-companion.local/docs',
        durationMs: 310,
        status: 'succeeded',
      });

      expect(span.type).toBe('browser_action');
      expect(span.metadata.action).toBe('browser_navigate');
      expect(span.metadata.url).toBe('https://alina-companion.local/docs');
      expect(span.durationMs).toBe(310);
    });

    it('records memory retrieval telemetry', () => {
      const span = obs.recordMemoryRetrieval({
        taskId: 'task_007',
        query: 'user preferences for theme',
        count: 3,
        durationMs: 15,
        categories: ['preference', 'interaction'],
      });

      expect(span.type).toBe('memory_retrieval');
      expect(span.metadata.count).toBe(3);
      expect(span.durationMs).toBe(15);
    });
  });

  describe('2. Sensitive Data Redaction in Observability', () => {
    it('strictly redacts API keys from tool inputs and outputs', () => {
      const span = obs.recordToolCall({
        taskId: 'sec_001',
        toolName: 'http_request',
        durationMs: 120,
        input: {
          apiKey: 'sk-proj-1234567890abcdef1234567890abcdef',
          endpoint: 'https://api.openai.com/v1/chat',
        },
        output: {
          authHeader: 'Bearer sk-abcdef1234567890abcdef1234567890',
          data: 'ok',
        },
        status: 'succeeded',
      });

      const details = span.sanitizedDetails;
      const input = details.input as Record<string, unknown>;
      const output = details.output as Record<string, unknown>;

      expect(input.apiKey).toBe('[REDACTED_SECRET]');
      expect(output.authHeader).toBe('[REDACTED_SECRET]');
      expect(input.endpoint).toBe('https://api.openai.com/v1/chat');
    });

    it('strictly redacts passwords and secrets from failure context', () => {
      const span = obs.recordFailure({
        taskId: 'sec_002',
        error: 'Authentication failed for user admin: password secretPassword123 is invalid',
        component: 'database',
        context: {
          password: 'secretPassword123',
          db_token: 'tok_9876543210',
          host: '127.0.0.1',
        },
      });

      const details = span.sanitizedDetails;
      const ctx = details.context as Record<string, unknown>;
      expect(ctx.password).toBe('[REDACTED_SECRET]');
      expect(ctx.db_token).toBe('[REDACTED_SECRET]');
      expect(ctx.host).toBe('127.0.0.1');
      expect(String(details.error)).toContain('[REDACTED_SECRET]');
      expect(String(details.error)).not.toContain('secretPassword123');
    });
  });

  describe('3. Chain-of-Thought Suppression in Developer Views', () => {
    it('suppresses internal chain-of-thought and raw model thinking from spans', () => {
      const span = obs.recordSpan({
        taskId: 'cot_001',
        type: 'tool_call',
        status: 'succeeded',
        component: 'supervisor',
        details: {
          toolName: 'list_files',
          chainOfThought: 'I will now ponder the existential nature of filesystem inodes...',
          rawThinking: 'Let me think step-by-step: Step 1, examine disk. Step 2, decide...',
          operationalSummary: 'Scanned 14 files in workspace root.',
        },
      });

      expect(span.sanitizedDetails.chainOfThought).toBe('[SUPPRESSED_FOR_EDITORIAL_VIEW]');
      expect(span.sanitizedDetails.rawThinking).toBe('[SUPPRESSED_FOR_EDITORIAL_VIEW]');
      expect(span.sanitizedDetails.operationalSummary).toBe('Scanned 14 files in workspace root.');
    });
  });

  describe('4. Metrics Aggregation & Export', () => {
    it('aggregates summary metrics accurately across multiple operations', () => {
      // 2 task durations (1 succeeded, 1 failed)
      obs.recordTaskDuration({ taskId: 't1', durationMs: 1000, status: 'succeeded' });
      obs.recordTaskDuration({ taskId: 't2', durationMs: 2000, status: 'failed' });

      // 3 tool calls (2 succeeded, 1 failed)
      obs.recordToolCall({ taskId: 't1', toolName: 'tool_a', durationMs: 50, status: 'succeeded' });
      obs.recordToolCall({ taskId: 't1', toolName: 'tool_b', durationMs: 70, status: 'succeeded' });
      obs.recordToolCall({ taskId: 't2', toolName: 'tool_c', durationMs: 100, status: 'failed', error: 'I/O' });

      // 1 failure
      obs.recordFailure({ taskId: 't2', error: 'Disk I/O', component: 'filesystem', retryable: true });

      // 1 retry
      obs.recordRetry({ taskId: 't2', stepOrTool: 'tool_c', attempt: 1, maxAttempts: 2, reason: 'I/O' });

      // 2 approvals (1 approved, 1 denied)
      obs.recordApproval({
        taskId: 't1',
        requestId: 'r1',
        toolName: 'tool_x',
        riskLevel: 'HIGH_RISK',
        action: 'write',
        target: 'x.txt',
        decision: 'approved',
        latencyMs: 1500,
      });
      obs.recordApproval({
        taskId: 't2',
        requestId: 'r2',
        toolName: 'tool_y',
        riskLevel: 'HIGH_RISK',
        action: 'delete',
        target: 'y.txt',
        decision: 'denied',
        latencyMs: 2500,
      });

      // 2 agent runs (1 research, 1 browser)
      obs.recordAgentRun({ taskId: 't1', agentRole: 'research', durationMs: 300, status: 'succeeded' });
      obs.recordAgentRun({ taskId: 't1', agentRole: 'browser', durationMs: 450, status: 'succeeded' });

      // 2 browser actions
      obs.recordBrowserAction({ taskId: 't1', action: 'navigate', durationMs: 200, status: 'succeeded' });
      obs.recordBrowserAction({ taskId: 't2', action: 'click', durationMs: 150, status: 'failed', error: 'not found' });

      const metrics = obs.getMetrics();

      // Tasks
      expect(metrics.tasks.total).toBe(2);
      expect(metrics.tasks.completed).toBe(1);
      expect(metrics.tasks.failed).toBe(1);
      expect(metrics.tasks.averageDurationMs).toBe(1500);

      // Tool calls
      expect(metrics.toolCalls.total).toBe(3);
      expect(metrics.toolCalls.succeeded).toBe(2);
      expect(metrics.toolCalls.failed).toBe(1);
      expect(metrics.toolCalls.successRatePercent).toBe(67);

      // Failures
      expect(metrics.failures.total).toBe(1);
      expect(metrics.failures.byComponent.filesystem).toBe(1);
      expect(metrics.failures.retryableCount).toBe(1);

      // Approvals
      expect(metrics.approvals.total).toBe(2);
      expect(metrics.approvals.granted).toBe(1);
      expect(metrics.approvals.denied).toBe(1);
      expect(metrics.approvals.averageLatencyMs).toBe(2000);

      // Agent runs
      expect(metrics.agentRuns.total).toBe(2);
      expect(metrics.agentRuns.byRole.research).toBe(1);
      expect(metrics.agentRuns.byRole.browser).toBe(1);

      // Browser actions
      expect(metrics.browserActions.total).toBe(2);
      expect(metrics.browserActions.succeeded).toBe(1);
      expect(metrics.browserActions.failed).toBe(1);
      expect(metrics.browserActions.byAction.navigate).toBe(1);
      expect(metrics.browserActions.byAction.click).toBe(1);
    });

    it('filters telemetry spans by taskId, component, and query', () => {
      obs.recordToolCall({ taskId: 'alpha', toolName: 'read', durationMs: 10, status: 'succeeded' });
      obs.recordToolCall({ taskId: 'beta', toolName: 'write', durationMs: 20, status: 'succeeded' });
      obs.recordFailure({ taskId: 'alpha', error: 'Fail', component: 'sandbox' });

      const alphaSpans = obs.getSpans({ taskId: 'alpha' });
      expect(alphaSpans.length).toBe(2);

      const failures = obs.getSpans({ type: 'failure' });
      expect(failures.length).toBe(1);
      expect(failures[0]!.taskId).toBe('alpha');

      const searched = obs.getSpans({ search: 'sandbox' });
      expect(searched.length).toBe(1);
    });

    it('exports sanitized telemetry JSON snapshot', () => {
      obs.recordTaskDuration({ taskId: 'export_01', durationMs: 500, status: 'succeeded' });
      const json = obs.exportTelemetry();
      const parsed = JSON.parse(json);

      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.metrics).toBeDefined();
      expect(parsed.spans.length).toBeGreaterThan(0);
      expect(parsed.spans[0]!.taskId).toBe('export_01');
    });
  });
});
