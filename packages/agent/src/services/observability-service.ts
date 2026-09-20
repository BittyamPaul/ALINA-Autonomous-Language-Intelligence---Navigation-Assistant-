import crypto from 'node:crypto';
import {
  TelemetrySpan,
  TelemetryType,
  TelemetryStatus,
  TelemetrySummaryMetrics,
  TelemetryQueryFilter,
  SecretRedactor,
} from '@alina/shared';

export class AlinaObservabilityService {
  private static instance: AlinaObservabilityService | null = null;
  private spans: TelemetrySpan[] = [];
  private readonly maxSpans: number;

  constructor(options?: { maxSpans?: number }) {
    this.maxSpans = options?.maxSpans ?? 2000;
  }

  public static getInstance(options?: { maxSpans?: number }): AlinaObservabilityService {
    if (!AlinaObservabilityService.instance) {
      AlinaObservabilityService.instance = new AlinaObservabilityService(options);
    }
    return AlinaObservabilityService.instance;
  }

  public static resetInstance(): void {
    AlinaObservabilityService.instance = null;
  }

  /**
   * Internal span recorder.
   * Enforces zero secret leakage and zero raw chain-of-thought leakage.
   */
  public recordSpan(rawSpan: {
    taskId: string;
    type: TelemetryType;
    status: TelemetryStatus;
    durationMs?: number;
    component: string;
    metadata?: Record<string, unknown>;
    details?: Record<string, unknown>;
  }): TelemetrySpan {
    // 1. Sanitize all details and metadata for secret masking
    const sanitizedMetadata = SecretRedactor.sanitizeObject(rawSpan.metadata ?? {});
    const sanitizedDetails = SecretRedactor.sanitizeObject(
      this.suppressRawChainOfThought(rawSpan.details ?? {})
    );

    const span: TelemetrySpan = {
      id: crypto.randomUUID(),
      taskId: rawSpan.taskId,
      type: rawSpan.type,
      status: rawSpan.status,
      timestamp: new Date().toISOString(),
      durationMs: rawSpan.durationMs !== undefined ? Math.max(0, rawSpan.durationMs) : undefined,
      component: rawSpan.component,
      metadata: sanitizedMetadata,
      sanitizedDetails: sanitizedDetails,
    };

    this.spans.unshift(span);
    if (this.spans.length > this.maxSpans) {
      this.spans.pop();
    }

    return span;
  }

  /**
   * Strips raw chain-of-thought, inner LLM reasoning tokens, or large prompt dumps.
   */
  private suppressRawChainOfThought(details: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    const prohibitedKeys = [
      'chainOfThought',
      'chain_of_thought',
      'thought',
      'rawThinking',
      'raw_thinking',
      'internalCoT',
      'promptDump',
    ];

    for (const [key, value] of Object.entries(details)) {
      if (prohibitedKeys.includes(key)) {
        cleaned[key] = '[SUPPRESSED_FOR_EDITORIAL_VIEW]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = this.suppressRawChainOfThought(value as Record<string, unknown>);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  // =========================================================================
  // Dedicated Category Telemetry Recorders
  // =========================================================================

  public recordTaskDuration(params: {
    taskId: string;
    durationMs: number;
    status: TelemetryStatus;
    goal?: string;
    stepsCompleted?: number;
    toolCallsCount?: number;
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'task_duration',
      status: params.status,
      durationMs: params.durationMs,
      component: 'supervisor',
      metadata: {
        goal: params.goal,
        stepsCompleted: params.stepsCompleted ?? 0,
        toolCallsCount: params.toolCallsCount ?? 0,
      },
      details: {
        outcome: params.status,
        latencyBreakdown: {
          totalDurationMs: params.durationMs,
        },
      },
    });
  }

  public recordToolCall(params: {
    taskId: string;
    toolName: string;
    durationMs: number;
    input?: unknown;
    output?: unknown;
    status: TelemetryStatus;
    error?: string;
    component?: string;
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'tool_call',
      status: params.status,
      durationMs: params.durationMs,
      component: params.component ?? 'tool_executor',
      metadata: {
        toolName: params.toolName,
        hasError: Boolean(params.error),
      },
      details: {
        input: params.input,
        output: params.output,
        error: params.error,
      },
    });
  }

  public recordFailure(params: {
    taskId: string;
    error: Error | string;
    component: string;
    retryable?: boolean;
    context?: Record<string, unknown>;
  }): TelemetrySpan {
    const errorMsg = typeof params.error === 'string' ? params.error : params.error.message;
    return this.recordSpan({
      taskId: params.taskId,
      type: 'failure',
      status: 'failed',
      component: params.component,
      metadata: {
        errorMessage: errorMsg,
        retryable: params.retryable ?? false,
      },
      details: {
        context: params.context,
        error: errorMsg,
      },
    });
  }

  public recordRetry(params: {
    taskId: string;
    stepOrTool: string;
    attempt: number;
    maxAttempts: number;
    reason: string;
    strategy?: string;
    backoffMs?: number;
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'retry',
      status: 'retry',
      component: 'recovery_engine',
      metadata: {
        target: params.stepOrTool,
        attempt: params.attempt,
        maxAttempts: params.maxAttempts,
        backoffMs: params.backoffMs ?? 0,
      },
      details: {
        reason: params.reason,
        strategy: params.strategy ?? 'exponential_backoff',
      },
    });
  }

  public recordApproval(params: {
    taskId: string;
    requestId: string;
    toolName: string;
    riskLevel: string;
    action: string;
    target: string;
    decision: 'approved' | 'denied' | 'expired' | 'awaiting_approval';
    latencyMs?: number;
    reviewerNote?: string;
  }): TelemetrySpan {
    const statusMap: Record<string, TelemetryStatus> = {
      approved: 'approved',
      denied: 'denied',
      expired: 'expired',
      awaiting_approval: 'awaiting_approval',
    };

    return this.recordSpan({
      taskId: params.taskId,
      type: 'approval',
      status: statusMap[params.decision] ?? 'awaiting_approval',
      durationMs: params.latencyMs,
      component: 'authorization_manager',
      metadata: {
        requestId: params.requestId,
        toolName: params.toolName,
        riskLevel: params.riskLevel,
        action: params.action,
        target: params.target,
        decision: params.decision,
      },
      details: {
        reviewerNote: params.reviewerNote,
      },
    });
  }

  public recordAgentRun(params: {
    taskId: string;
    agentRole: string;
    runId?: string;
    status: TelemetryStatus;
    durationMs: number;
    stepCount?: number;
    toolCallsCount?: number;
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'agent_run',
      status: params.status,
      durationMs: params.durationMs,
      component: params.agentRole,
      metadata: {
        agentRole: params.agentRole,
        runId: params.runId,
        stepCount: params.stepCount ?? 0,
        toolCallsCount: params.toolCallsCount ?? 0,
      },
      details: {
        outcome: params.status,
      },
    });
  }

  public recordBrowserAction(params: {
    taskId: string;
    action: string;
    url?: string;
    selector?: string;
    durationMs: number;
    status: TelemetryStatus;
    error?: string;
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'browser_action',
      status: params.status,
      durationMs: params.durationMs,
      component: 'browser_agent',
      metadata: {
        action: params.action,
        url: params.url,
        selector: params.selector,
        hasError: Boolean(params.error),
      },
      details: {
        error: params.error,
      },
    });
  }

  public recordMemoryRetrieval(params: {
    taskId: string;
    query: string;
    count: number;
    durationMs: number;
    categories?: string[];
  }): TelemetrySpan {
    return this.recordSpan({
      taskId: params.taskId,
      type: 'memory_retrieval',
      status: 'succeeded',
      durationMs: params.durationMs,
      component: 'memory_service',
      metadata: {
        query: params.query,
        count: params.count,
        categories: params.categories ?? [],
      },
    });
  }

  // =========================================================================
  // Metrics & Querying
  // =========================================================================

  public getSpans(filter?: TelemetryQueryFilter): TelemetrySpan[] {
    let result = [...this.spans];

    if (filter) {
      if (filter.taskId) {
        result = result.filter((s) => s.taskId === filter.taskId);
      }
      if (filter.type) {
        result = result.filter((s) => s.type === filter.type);
      }
      if (filter.status) {
        result = result.filter((s) => s.status === filter.status);
      }
      if (filter.component) {
        result = result.filter((s) => s.component === filter.component);
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        result = result.filter(
          (s) =>
            s.taskId.toLowerCase().includes(query) ||
            s.component.toLowerCase().includes(query) ||
            JSON.stringify(s.metadata).toLowerCase().includes(query)
        );
      }
      if (filter.limit && filter.limit > 0) {
        result = result.slice(0, filter.limit);
      }
    }

    return result;
  }

  public getMetrics(): TelemetrySummaryMetrics {
    const taskSpans = this.spans.filter((s) => s.type === 'task_duration');
    const toolSpans = this.spans.filter((s) => s.type === 'tool_call');
    const failureSpans = this.spans.filter((s) => s.type === 'failure');
    const retrySpans = this.spans.filter((s) => s.type === 'retry');
    const approvalSpans = this.spans.filter((s) => s.type === 'approval');
    const agentSpans = this.spans.filter((s) => s.type === 'agent_run');
    const browserSpans = this.spans.filter((s) => s.type === 'browser_action');

    // Task durations
    const completedTasks = taskSpans.filter((s) => s.status === 'succeeded').length;
    const failedTasks = taskSpans.filter((s) => s.status === 'failed').length;
    const cancelledTasks = taskSpans.filter((s) => s.status === 'cancelled').length;
    const totalTaskDuration = taskSpans.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const avgTaskDuration = taskSpans.length > 0 ? Math.round(totalTaskDuration / taskSpans.length) : 0;

    // Tool calls
    const succeededTools = toolSpans.filter((s) => s.status === 'succeeded').length;
    const failedTools = toolSpans.filter((s) => s.status === 'failed').length;
    const totalToolDuration = toolSpans.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const avgToolDuration = toolSpans.length > 0 ? Math.round(totalToolDuration / toolSpans.length) : 0;
    const toolSuccessRate =
      toolSpans.length > 0 ? Math.round((succeededTools / toolSpans.length) * 100) : 100;

    // Failures by component
    const failuresByComponent: Record<string, number> = {};
    for (const f of failureSpans) {
      failuresByComponent[f.component] = (failuresByComponent[f.component] ?? 0) + 1;
    }
    const retryableFailures = failureSpans.filter((s) => s.metadata?.retryable === true).length;

    // Retries
    const recoveredRetries = retrySpans.filter((s) => s.status === 'succeeded').length;

    // Approvals
    const grantedApprovals = approvalSpans.filter((s) => s.status === 'approved').length;
    const deniedApprovals = approvalSpans.filter((s) => s.status === 'denied').length;
    const expiredApprovals = approvalSpans.filter((s) => s.status === 'expired').length;
    const approvalLatencies = approvalSpans
      .filter((s) => s.durationMs !== undefined)
      .map((s) => s.durationMs as number);
    const avgApprovalLatency =
      approvalLatencies.length > 0
        ? Math.round(approvalLatencies.reduce((a, b) => a + b, 0) / approvalLatencies.length)
        : 0;

    // Agent runs by role
    const agentRunsByRole: Record<string, number> = {};
    for (const a of agentSpans) {
      const role = String(a.metadata?.agentRole ?? a.component);
      agentRunsByRole[role] = (agentRunsByRole[role] ?? 0) + 1;
    }

    // Browser actions by action type
    const succeededBrowser = browserSpans.filter((s) => s.status === 'succeeded').length;
    const failedBrowser = browserSpans.filter((s) => s.status === 'failed').length;
    const browserByAction: Record<string, number> = {};
    for (const b of browserSpans) {
      const act = String(b.metadata?.action ?? 'unknown');
      browserByAction[act] = (browserByAction[act] ?? 0) + 1;
    }

    return {
      tasks: {
        total: taskSpans.length,
        completed: completedTasks,
        failed: failedTasks,
        cancelled: cancelledTasks,
        averageDurationMs: avgTaskDuration,
      },
      toolCalls: {
        total: toolSpans.length,
        succeeded: succeededTools,
        failed: failedTools,
        successRatePercent: toolSuccessRate,
        averageDurationMs: avgToolDuration,
      },
      failures: {
        total: failureSpans.length,
        byComponent: failuresByComponent,
        retryableCount: retryableFailures,
        fatalCount: failureSpans.length - retryableFailures,
      },
      retries: {
        total: retrySpans.length,
        recoveredCount: recoveredRetries,
      },
      approvals: {
        total: approvalSpans.length,
        granted: grantedApprovals,
        denied: deniedApprovals,
        expired: expiredApprovals,
        averageLatencyMs: avgApprovalLatency,
      },
      agentRuns: {
        total: agentSpans.length,
        byRole: agentRunsByRole,
      },
      browserActions: {
        total: browserSpans.length,
        succeeded: succeededBrowser,
        failed: failedBrowser,
        byAction: browserByAction,
      },
    };
  }

  public exportTelemetry(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      metrics: this.getMetrics(),
      spans: this.spans,
    };
    return JSON.stringify(data, null, 2);
  }

  public clear(): void {
    this.spans = [];
  }
}
