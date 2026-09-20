import { z } from 'zod';
import { PlanDAGSchema, PlanStepSchema, TaskSchema } from './models';
import { ApprovalRequestSchema } from './permissions';

export const AgentEventTypeSchema = z.enum([
  'task:created',
  'task:plan_ready',
  'step:started',
  'step:progress',
  'step:awaiting_approval',
  'step:verifying',
  'step:recovery_attempt',
  'step:completed',
  'step:failed',
  'subagent:started',
  'subagent:completed',
  'subagent:failed',
  'task:completed',
  'task:failed',
  'message:delta',
  'memory:extracted',
]);
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: AgentEventTypeSchema,
  taskId: z.string().optional(),
  stepId: z.string().optional(),
  timestamp: z.string().datetime(),
  payload: z.unknown(),
});
export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelopeSchema>;

export const TaskPlanReadyEventSchema = z.object({
  task: TaskSchema,
  plan: PlanDAGSchema,
});
export type TaskPlanReadyEvent = z.infer<typeof TaskPlanReadyEventSchema>;

export const StepProgressEventSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  message: z.string(),
  progressPercent: z.number().min(0).max(100).optional(),
});
export type StepProgressEvent = z.infer<typeof StepProgressEventSchema>;

export const StepAwaitingApprovalEventSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  approvalRequest: ApprovalRequestSchema,
});
export type StepAwaitingApprovalEvent = z.infer<typeof StepAwaitingApprovalEventSchema>;

export const StepVerifyingEventSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  assertionDescription: z.string(),
  target: z.string(),
});
export type StepVerifyingEvent = z.infer<typeof StepVerifyingEventSchema>;

export const StepRecoveryEventSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  attempt: z.number().int(),
  maxAttempts: z.number().int(),
  reason: z.string(),
  strategy: z.string(),
});
export type StepRecoveryEvent = z.infer<typeof StepRecoveryEventSchema>;

export const StepCompletedEventSchema = z.object({
  taskId: z.string(),
  step: PlanStepSchema,
  outputSummary: z.string(),
});
export type StepCompletedEvent = z.infer<typeof StepCompletedEventSchema>;

export const MessageDeltaEventSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
  delta: z.string(),
});
export type MessageDeltaEvent = z.infer<typeof MessageDeltaEventSchema>;
