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

export const ConceptualMemoryCategorySchema = z.enum([
  'PERSONAL_PREFERENCE',
  'WORK_STYLE',
  'COMMUNICATION_STYLE',
  'PROJECT_CONTEXT',
  'RECURRING_WORKFLOW',
  'TOOL_PREFERENCE',
  'UI_PREFERENCE',
  'TASK_PATTERN',
  'EXPLICIT_FACT',
  'TEMPORARY_CONTEXT',
]);
export type ConceptualMemoryCategory = z.infer<typeof ConceptualMemoryCategorySchema>;

export const LegacyMemoryCategorySchema = z.enum([
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
export type LegacyMemoryCategory = z.infer<typeof LegacyMemoryCategorySchema>;

export const MemoryCategorySchema = z.enum([
  // 10 Conceptual Categories
  'PERSONAL_PREFERENCE',
  'WORK_STYLE',
  'COMMUNICATION_STYLE',
  'PROJECT_CONTEXT',
  'RECURRING_WORKFLOW',
  'TOOL_PREFERENCE',
  'UI_PREFERENCE',
  'TASK_PATTERN',
  'EXPLICIT_FACT',
  'TEMPORARY_CONTEXT',
  // Legacy Categories (for backwards compatibility)
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

export const EpistemicTierSchema = z.enum(['EXPLICIT', 'OBSERVED', 'INFERRED']);
export type EpistemicTier = z.infer<typeof EpistemicTierSchema>;

export const MemoryLayerSchema = z.enum(['conversation', 'episodic', 'semantic']);
export type MemoryLayer = z.infer<typeof MemoryLayerSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: MemoryCategorySchema,
  layer: MemoryLayerSchema.default('semantic'),
  source: z.string().default('explicit_user'),
  confidence: z.number().min(0).max(1).default(1.0),
  importance: z.number().min(0).max(1).default(0.5),
  epistemicTier: EpistemicTierSchema.default('EXPLICIT'),
  userEditable: z.boolean().default(true),
  user_editable: z.boolean().optional(),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  projectId: z.string().optional(),
  sourceSessionId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  expiration: z.string().datetime().nullable().optional(),
  supersededBy: z.string().optional(),
  accessCount: z.number().int().nonnegative().default(0),
  lastAccessedAt: z.string().datetime().default(() => new Date().toISOString()),
  last_used_at: z.string().datetime().optional(),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  updated_at: z.string().datetime().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  created_at: z.string().datetime().optional(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const LearningSettingsSchema = z.object({
  learningEnabled: z.boolean().default(true),
  disabledCategories: z.array(MemoryCategorySchema).default([]),
  inferentialLearningEnabled: z.boolean().default(true),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningSettings = z.infer<typeof LearningSettingsSchema>;

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
  silenceTimeoutMs: z.number().positive().default(1500),
  ttsEnabled: z.boolean().default(true),
  voiceRate: z.number().min(0.5).max(2.0).default(1.0),
  voicePitch: z.number().min(0.5).max(2.0).default(1.0),
  voiceVolume: z.number().min(0.0).max(1.0).default(1.0),
  voiceId: z.string().optional(),
  voiceGender: z.enum(['female', 'male', 'neutral']).default('female'),
  language: z.string().default('en-US'),
  wakeWordEnabled: z.boolean().default(true),
  wakeWordPhrase: z.string().default('Hey Alina'),
  wakeWordSensitivity: z.number().min(0.1).max(1.0).default(0.7),
  transcriptDebugMode: z.boolean().default(false),
});
export type VoiceSessionConfig = z.infer<typeof VoiceSessionConfigSchema>;

export const VoiceOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  lang: z.string(),
  gender: z.enum(['female', 'male', 'neutral']).default('female'),
  isNatural: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});
export type VoiceOption = z.infer<typeof VoiceOptionSchema>;

export const TextToSpeechOptionsSchema = z.object({
  rate: z.number().min(0.5).max(2.0).optional(),
  pitch: z.number().min(0.5).max(2.0).optional(),
  volume: z.number().min(0.0).max(1.0).optional(),
  language: z.string().optional(),
  voiceId: z.string().optional(),
});
export type TextToSpeechOptions = z.infer<typeof TextToSpeechOptionsSchema>;

export const AlinaPersonalityConfigSchema = z.object({
  name: z.string().default('Alina'),
  tone: z.enum(['warm_calm', 'professional', 'concise']).default('warm_calm'),
  verbosity: z.enum(['concise', 'balanced', 'detailed']).default('concise'),
  conversationalFamiliarity: z.enum(['familiar', 'formal']).default('familiar'),
  useMemoryContext: z.boolean().default(true),
});
export type AlinaPersonalityConfig = z.infer<typeof AlinaPersonalityConfigSchema>;

export const TranscriptQualityTierSchema = z.object({
  rawTranscript: z.string(),
  finalTranscript: z.string(),
  normalizedInput: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  substitutionsCount: z.number().default(0),
  timestamp: z.string().default(() => new Date().toISOString()),
});
export type TranscriptQualityTier = z.infer<typeof TranscriptQualityTierSchema>;

export const WakeWordEventSchema = z.object({
  detectedPhrase: z.string(),
  confidence: z.number().min(0).max(1).default(0.9),
  timestamp: z.string().default(() => new Date().toISOString()),
});
export type WakeWordEvent = z.infer<typeof WakeWordEventSchema>;

// ============================================================================
// Voice Conversation Lifecycle & Session Models
// ============================================================================

export const VoiceConversationModeSchema = z.enum([
  'wake_mode',
  'conversation_mode',
]);
export type VoiceConversationMode = z.infer<typeof VoiceConversationModeSchema>;

export const VoiceActivityStateSchema = z.enum([
  'idle',
  'listening',
  'user_speaking',
  'silence',
  'end_of_utterance',
  'thinking',
  'speaking',
  'interrupted',
  'error',
]);
export type VoiceActivityState = z.infer<typeof VoiceActivityStateSchema>;

export const ConversationSessionStateSchema = z.enum([
  'wake_mode',
  'conversation_mode',
  'awaiting_confirmation',
  'ended',
]);
export type ConversationSessionState = z.infer<typeof ConversationSessionStateSchema>;

export const ConversationTimeoutPolicySchema = z.object({
  utteranceSilenceMs: z.number().positive().default(1500),
  inactivityPromptMs: z.number().positive().default(20000),
  inactivityCloseMs: z.number().positive().default(10000),
  maxSessionDurationMs: z.number().positive().default(1800000),
});
export type ConversationTimeoutPolicy = z.infer<typeof ConversationTimeoutPolicySchema>;

export const VoiceConversationSessionSchema = z.object({
  session_id: z.string(),
  started_at: z.string(),
  last_activity: z.string(),
  state: ConversationSessionStateSchema,
  conversation_id: z.string(),
  voice_enabled: z.boolean().default(true),
  wake_word_enabled: z.boolean().default(true),
  timeout_policy: ConversationTimeoutPolicySchema.default({
    utteranceSilenceMs: 1500,
    inactivityPromptMs: 20000,
    inactivityCloseMs: 10000,
    maxSessionDurationMs: 1800000,
  }),
  metadata: z.record(z.unknown()).optional(),
});
export type VoiceConversationSession = z.infer<typeof VoiceConversationSessionSchema>;

export const NATURAL_TERMINATION_PATTERNS: RegExp[] = [
  /^\s*(that'?s\s+all|that\s+is\s+all)(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*(good\s*bye|bye|bye\s*bye)(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*stop\s+listening(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*(end|close|stop|exit)\s+conversation(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
];

/**
 * Checks if an utterance is an explicit/natural command to end the voice conversation.
 */
export function isTerminationPhrase(phrase: string): boolean {
  const clean = phrase.trim().toLowerCase();
  if (!clean) return false;
  return NATURAL_TERMINATION_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Extracts an embedded voice command following a wake-word invocation.
 * E.g. "Hey Alina, open my project" -> { isWake: true, command: "open my project" }
 * E.g. "Hey Alina" -> { isWake: true, command: undefined }
 */
export function extractCommandAfterWakeWord(
  transcript: string,
  wakePhrase = 'hey alina'
): { isWake: boolean; command?: string } {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();
  const wakeVariants = [wakePhrase.toLowerCase(), 'hey alina', 'alina', 'hey aleena', 'hey elena', 'hi alina'];

  for (const variant of wakeVariants) {
    if (lower.startsWith(variant)) {
      const rest = clean.slice(variant.length).replace(/^[,.:;\s]+/, '').trim();
      return {
        isWake: true,
        command: rest.length > 0 ? rest : undefined,
      };
    }
  }

  // Check if wake word appears anywhere in first clause
  for (const variant of wakeVariants) {
    const idx = lower.indexOf(variant);
    if (idx !== -1 && idx <= 5) {
      const rest = clean.slice(idx + variant.length).replace(/^[,.:;\s]+/, '').trim();
      return {
        isWake: true,
        command: rest.length > 0 ? rest : undefined,
      };
    }
  }

  return { isWake: false };
}


// ============================================================================
// Knowledge Acquisition System Schemas (3-Layer Architecture)
// ============================================================================

export const KnowledgeSourceCategorySchema = z.enum([
  'official_docs',
  'technical_blog',
  'academic_paper',
  'pricing_page',
  'community_forum',
  'general_web',
]);
export type KnowledgeSourceCategory = z.infer<typeof KnowledgeSourceCategorySchema>;

export const KnowledgeSourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  authorOrOrg: z.string().optional(),
  reliabilityScore: z.number().min(0).max(1).default(0.8),
  lastFetchedAt: z.string().datetime().default(() => new Date().toISOString()),
  httpStatus: z.number().int().default(200),
  category: KnowledgeSourceCategorySchema.default('official_docs'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export const KnowledgeRefreshPolicyTypeSchema = z.enum([
  'software_documentation',
  'current_pricing',
  'stable_technical_concept',
  'custom',
  'manual_only',
]);
export type KnowledgeRefreshPolicyType = z.infer<typeof KnowledgeRefreshPolicyTypeSchema>;

export const KnowledgeRefreshPolicySchema = z.object({
  type: KnowledgeRefreshPolicyTypeSchema.default('software_documentation'),
  intervalDays: z.number().int().positive().default(60),
  reviewDate: z.string().datetime().nullable().optional(),
  autoRefresh: z.boolean().default(true),
});
export type KnowledgeRefreshPolicy = z.infer<typeof KnowledgeRefreshPolicySchema>;

export const KnowledgeItemStatusSchema = z.enum([
  'active',
  'stale',
  'expired',
  'refreshing',
]);
export type KnowledgeItemStatus = z.infer<typeof KnowledgeItemStatusSchema>;

export const KnowledgeItemSchema = z.object({
  id: z.string(),
  topicId: z.string().optional(),
  topic: z.string().min(1),
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceDomain: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  retrievedAt: z.string().datetime().default(() => new Date().toISOString()),
  expiresAt: z.string().datetime().nullable().optional(),
  reviewDate: z.string().datetime().nullable().optional(),
  refreshPolicy: KnowledgeRefreshPolicySchema.default({
    type: 'software_documentation',
    intervalDays: 60,
    autoRefresh: true,
  }),
  refreshCount: z.number().int().nonnegative().default(0),
  lastRefreshedAt: z.string().datetime().default(() => new Date().toISOString()),
  status: KnowledgeItemStatusSchema.default('active'),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;

export const KnowledgeTopicSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  parentTopicId: z.string().optional(),
  itemCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeTopic = z.infer<typeof KnowledgeTopicSchema>;

export const KnowledgeEmbeddingSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  chunkIndex: z.number().int().nonnegative().default(0),
  text: z.string().min(1),
  embedding: z.array(z.number()),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeEmbedding = z.infer<typeof KnowledgeEmbeddingSchema>;

export const KnowledgeUpdateTypeSchema = z.enum([
  'created',
  'refreshed',
  'invalidated',
  'confidence_adjusted',
  'promoted_from_working',
]);
export type KnowledgeUpdateType = z.infer<typeof KnowledgeUpdateTypeSchema>;

export const KnowledgeUpdateSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  updateType: KnowledgeUpdateTypeSchema.default('created'),
  previousValues: z.record(z.unknown()).optional(),
  newValues: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
  updatedBy: z.string().default('alina_knowledge_service'),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeUpdate = z.infer<typeof KnowledgeUpdateSchema>;

// Layer 2: Ephemeral Working Knowledge (Task-scoped)
export const WorkingKnowledgeItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  snippet: z.string(),
  relevanceScore: z.number().min(0).max(1).default(0.8),
  extractedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type WorkingKnowledgeItem = z.infer<typeof WorkingKnowledgeItemSchema>;

export const WorkingKnowledgeContextSchema = z.object({
  taskId: z.string(),
  goal: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), domain: z.string() })).default([]),
  candidateFacts: z.array(WorkingKnowledgeItemSchema).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type WorkingKnowledgeContext = z.infer<typeof WorkingKnowledgeContextSchema>;

// Explainability Result Schemas
export const KnowledgeProvenanceResultSchema = z.object({
  item: KnowledgeItemSchema,
  source: KnowledgeSourceSchema.optional(),
  topic: KnowledgeTopicSchema.optional(),
  updates: z.array(KnowledgeUpdateSchema).default([]),
  isFresh: z.boolean().default(true),
  daysUntilReview: z.number().optional(),
});
export type KnowledgeProvenanceResult = z.infer<typeof KnowledgeProvenanceResultSchema>;

export const KnowledgeProjectSummarySchema = z.object({
  projectId: z.string(),
  itemCount: z.number().int().nonnegative().default(0),
  topics: z.array(z.string()).default([]),
  sources: z.array(z.object({ domain: z.string(), url: z.string(), title: z.string() })).default([]),
  items: z.array(KnowledgeItemSchema).default([]),
  summary: z.string(),
});
export type KnowledgeProjectSummary = z.infer<typeof KnowledgeProjectSummarySchema>;

export const KnowledgeRecommendationExplanationSchema = z.object({
  query: z.string(),
  recommendation: z.string(),
  evidenceChain: z.array(z.object({
    itemId: z.string(),
    title: z.string(),
    sourceUrl: z.string(),
    sourceDomain: z.string(),
    confidence: z.number(),
    summary: z.string(),
    lastVerified: z.string(),
  })).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.8),
  rationale: z.string(),
});
export type KnowledgeRecommendationExplanation = z.infer<typeof KnowledgeRecommendationExplanationSchema>;
