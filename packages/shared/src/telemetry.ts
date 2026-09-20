import { z } from 'zod';
import { SecretRedactor } from './permissions';

export const TelemetryTypeSchema = z.enum([
  'task_duration',
  'tool_call',
  'failure',
  'retry',
  'approval',
  'agent_run',
  'browser_action',
  'memory_retrieval',
]);
export type TelemetryType = z.infer<typeof TelemetryTypeSchema>;

export const TelemetryStatusSchema = z.enum([
  'started',
  'succeeded',
  'failed',
  'retry',
  'awaiting_approval',
  'approved',
  'denied',
  'expired',
  'cancelled',
]);
export type TelemetryStatus = z.infer<typeof TelemetryStatusSchema>;

export const TelemetrySpanSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string(),
  type: TelemetryTypeSchema,
  status: TelemetryStatusSchema,
  timestamp: z.string().datetime(),
  durationMs: z.number().nonnegative().optional(),
  component: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  sanitizedDetails: z.record(z.unknown()).default({}),
});
export type TelemetrySpan = z.infer<typeof TelemetrySpanSchema>;

export interface TelemetrySummaryMetrics {
  tasks: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    averageDurationMs: number;
  };
  toolCalls: {
    total: number;
    succeeded: number;
    failed: number;
    successRatePercent: number;
    averageDurationMs: number;
  };
  failures: {
    total: number;
    byComponent: Record<string, number>;
    retryableCount: number;
    fatalCount: number;
  };
  retries: {
    total: number;
    recoveredCount: number;
  };
  approvals: {
    total: number;
    granted: number;
    denied: number;
    expired: number;
    averageLatencyMs: number;
  };
  agentRuns: {
    total: number;
    byRole: Record<string, number>;
  };
  browserActions: {
    total: number;
    succeeded: number;
    failed: number;
    byAction: Record<string, number>;
  };
}

export interface TelemetryQueryFilter {
  taskId?: string;
  type?: TelemetryType;
  status?: TelemetryStatus;
  component?: string;
  search?: string;
  limit?: number;
}

/**
 * Sanitizes any telemetry record before storage or presentation to ensure
 * zero secret or credentials leakage.
 */
export function sanitizeTelemetryRecord(record: Record<string, unknown>): Record<string, unknown> {
  return SecretRedactor.sanitizeObject(record);
}
