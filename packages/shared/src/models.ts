import { z } from 'zod';
import { RiskLevelSchema } from './permissions';

export const PostConditionSchema = z.object({
  type: z.enum([
    'file_exists',
    'file_contains',
    'url_status',
    'command_exit_code',
    'custom_assert',
  ]),
  target: z.string(),
  expected: z.unknown().optional(),
  description: z.string(),
});
export type PostCondition = z.infer<typeof PostConditionSchema>;

export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'awaiting_approval',
  'verifying',
  'completed',
  'failed',
  'skipped',
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string(),
  description: z.string(),
  agentRole: z.enum([
    'supervisor',
    'browser_agent',
    'filesystem_agent',
    'computer_agent',
    'research_agent',
    'document_agent',
    'planner',
    'workspace',
    'navigator',
    'memory',
  ]),
  tool: z.string(),
  parameters: z.record(z.unknown()),
  riskLevel: RiskLevelSchema,
  postCondition: PostConditionSchema.optional(),
  status: StepStatusSchema.default('pending'),
  result: z.unknown().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().default(0),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanEdgeSchema = z.object({
  fromStepId: z.string(),
  toStepId: z.string(),
});
export type PlanEdge = z.infer<typeof PlanEdgeSchema>;

export const PlanDAGSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  steps: z.array(PlanStepSchema),
  edges: z.array(PlanEdgeSchema),
  createdAt: z.string().datetime(),
});
export type PlanDAG = z.infer<typeof PlanDAGSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'planning',
  'running',
  'waiting_for_approval',
  'completed',
  'failed',
  'cancelled',
  'draft',
  'ready',
  'executing',
  'awaiting_approval',
  'paused',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  goal: z.string(),
  sessionId: z.string(),
  projectId: z.string().optional(),
  status: TaskStatusSchema.default('draft'),
  plan: PlanDAGSchema.optional(),
  currentStepId: z.string().optional(),
  resultSummary: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  toolCallId: z.string().optional(),
  reasoning: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MemoryCategorySchema = z.enum([
  'preference',
  'project_info',
  'location',
  'recurring_task',
  'task_outcome',
  'relationship',
  'fact',
  'rule',
  'workflow_pattern',
  'project_context',
]);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const MemoryLayerSchema = z.enum(['conversation', 'episodic', 'semantic']);
export type MemoryLayer = z.infer<typeof MemoryLayerSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: MemoryCategorySchema,
  layer: MemoryLayerSchema.default('semantic'),
  importance: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  projectId: z.string().optional(),
  sourceSessionId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  supersededBy: z.string().optional(),
  accessCount: z.number().int().nonnegative().default(0),
  lastAccessedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

// =========================================================================
// Multi-Agent Architecture & Structured Delegation Contracts
// =========================================================================

export const AgentTypeSchema = z.enum([
  'supervisor',
  'browser',
  'filesystem',
  'computer',
  'research',
  'document',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const DelegationRequestSchema = z.object({
  delegationId: z.string(),
  taskId: z.string(),
  parentRunId: z.string().optional(),
  targetAgent: AgentTypeSchema,
  goal: z.string(),
  context: z.record(z.unknown()).default({}),
  timeoutMs: z.number().positive().optional(),
});
export type DelegationRequest = z.infer<typeof DelegationRequestSchema>;

export const ArtifactReferenceSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  type: z.string().default('text'),
  summary: z.string().optional(),
});
export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;

export const StructuredTaskResultSchema = z.object({
  delegationId: z.string(),
  targetAgent: AgentTypeSchema,
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  summary: z.string(),
  data: z.unknown().optional(),
  artifactsProduced: z.array(ArtifactReferenceSchema).default([]),
  stepsExecuted: z.number().int().nonnegative().default(0),
  durationMs: z.number().nonnegative().default(0),
  error: z.string().optional(),
  failureReason: z.enum([
    'tool_error',
    'timeout',
    'permission_denied',
    'content_empty',
    'unrecoverable',
  ]).optional(),
});
export type StructuredTaskResult = z.infer<typeof StructuredTaskResultSchema>;

export const RecoveryActionSchema = z.enum(['retry', 'replan', 'fail']);
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

export const RecoveryDecisionSchema = z.object({
  action: RecoveryActionSchema,
  reason: z.string(),
  retryParameters: z.record(z.unknown()).optional(),
  alternatePlan: z.string().optional(),
  targetAgent: AgentTypeSchema.optional(),
});
export type RecoveryDecision = z.infer<typeof RecoveryDecisionSchema>;

// ============================================================================
// Voice Interaction Schemas
// ============================================================================

export const VoiceStateSchema = z.enum([
  'idle',
  'listening',
  'processing',
  'speaking',
  'interrupted',
  'error',
]);
export type VoiceState = z.infer<typeof VoiceStateSchema>;

export const VoiceTranscriptSchema = z.object({
  text: z.string(),
  isFinal: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(1),
  interimText: z.string().optional(),
});
export type VoiceTranscript = z.infer<typeof VoiceTranscriptSchema>;

export const VoiceErrorReasonSchema = z.enum([
  'microphone_denied',
  'speech_service_unavailable',
  'network_timeout',
  'aborted',
  'synthesis_failed',
  'unknown',
]);
export type VoiceErrorReason = z.infer<typeof VoiceErrorReasonSchema>;

export const VoiceSessionConfigSchema = z.object({
  autoSubmitOnSilence: z.boolean().default(true),
  silenceTimeoutMs: z.number().positive().default(2000),
  ttsEnabled: z.boolean().default(true),
  voiceRate: z.number().min(0.5).max(2.0).default(1.0),
  voicePitch: z.number().min(0.5).max(2.0).default(1.0),
  language: z.string().default('en-US'),
});
export type VoiceSessionConfig = z.infer<typeof VoiceSessionConfigSchema>;
