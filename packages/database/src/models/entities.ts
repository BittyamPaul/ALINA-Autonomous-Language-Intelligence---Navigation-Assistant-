import { z } from 'zod';

// Helper to ensure sensitive secret keys are never present
const NoSecretsSchema = z.record(z.unknown()).refine(
  (obj) => {
    const forbidden = ['password', 'secret', 'apikey', 'api_key', 'token', 'access_token', 'private_key', 'privatekey'];
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    return !keys.some((k) => forbidden.includes(k));
  },
  { message: 'Security violation: secrets or credentials must never be stored in database records' }
);

// 1. User Entity
export const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  preferences: NoSecretsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type UserEntity = z.infer<typeof UserSchema>;

// 2. Workspace Entity
export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  allowedPaths: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  settings: NoSecretsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type WorkspaceEntity = z.infer<typeof WorkspaceSchema>;

// 3. Conversation Entity
export const ConversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ConversationEntity = z.infer<typeof ConversationSchema>;

// 4. Message Entity
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  reasoning: z.string().optional(),
  metadata: NoSecretsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type MessageEntity = z.infer<typeof MessageSchema>;

// 5. Task Entity
export const TaskRiskLevelSchema = z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH_DESTRUCTIVE']);
export type TaskRiskLevel = z.infer<typeof TaskRiskLevelSchema>;

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
  goal: z.string().min(1),
  workspaceId: z.string(),
  conversationId: z.string().optional(),
  status: TaskStatusSchema.default('draft'),
  riskLevel: TaskRiskLevelSchema.default('LOW'),
  plan: z.record(z.unknown()).optional(),
  resultSummary: z.string().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type TaskEntity = z.infer<typeof TaskSchema>;

// 6. Task Step Entity
export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'skipped',
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const TaskStepSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  toolName: z.string().min(1),
  parameters: NoSecretsSchema.default({}),
  status: StepStatusSchema.default('pending'),
  riskLevel: TaskRiskLevelSchema.default('LOW'),
  verificationRule: z.record(z.unknown()).optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});
export type TaskStepEntity = z.infer<typeof TaskStepSchema>;

// 7. Agent Run Entity
export const AgentRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  parentRunId: z.string().optional(),
  delegationReason: z.string().optional(),
  inputPayload: z.record(z.unknown()).optional(),
  outputPayload: z.unknown().optional(),
  status: z.enum(['running', 'succeeded', 'failed', 'halted_approval', 'cancelled']).default('running'),
  stepCount: z.number().int().nonnegative().default(0),
  tokenUsage: z.record(z.number()).default({}),
  startedAt: z.string().datetime().default(() => new Date().toISOString()),
  endedAt: z.string().datetime().optional(),
});
export type AgentRunEntity = z.infer<typeof AgentRunSchema>;

// 8. Agent Entity
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.string().min(1),
  modelProvider: z.string().default('local'),
  modelName: z.string().default('default'),
  capabilities: z.array(z.string()).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type AgentEntity = z.infer<typeof AgentSchema>;

// 9. Tool Entity
export const ToolSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  riskLevel: TaskRiskLevelSchema.default('LOW'),
  inputSchema: z.record(z.unknown()).default({}),
  isEnabled: z.boolean().default(true),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ToolEntity = z.infer<typeof ToolSchema>;

// 10. Tool Call Entity
export const ToolCallSchema = z.object({
  id: z.string(),
  agentRunId: z.string(),
  toolId: z.string(),
  taskStepId: z.string().optional(),
  inputParameters: NoSecretsSchema.default({}),
  outputPayload: z.unknown().optional(),
  durationMs: z.number().nonnegative().default(0),
  status: z.enum(['success', 'failed', 'rejected']).default('success'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ToolCallEntity = z.infer<typeof ToolCallSchema>;

// 11. Approval Entity
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRiskLevelSchema = z.enum([
  'SAFE',
  'APPROVAL_REQUIRED',
  'HIGH_RISK',
  'MEDIUM',
  'HIGH_DESTRUCTIVE',
  'REQUIRES_APPROVAL',
]);
export type ApprovalRiskLevel = z.infer<typeof ApprovalRiskLevelSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskStepId: z.string().optional(),
  toolCallId: z.string().optional(),
  action: z.string().optional(),
  target: z.string().optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
  tool: z.string().optional(),
  riskLevel: ApprovalRiskLevelSchema.default('APPROVAL_REQUIRED'),
  parametersSummary: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  description: z.string().default(''),
  diffPreview: z.string().optional(),
  status: ApprovalStatusSchema.default('pending'),
  expiresAt: z.string().datetime().optional(),
  decisionBy: z.string().optional(),
  decisionAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
  grantToken: z.string().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ApprovalEntity = z.infer<typeof ApprovalSchema>;

// 12. Memory Entity
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
  // Legacy Categories
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

export const EpistemicTierSchema = z.enum(['EXPLICIT', 'OBSERVED', 'INFERRED']);
export type EpistemicTier = z.infer<typeof EpistemicTierSchema>;

export const MemorySourceSchema = z.union([
  z.enum(['user_explicit', 'agent_reflection', 'task_outcome', 'dialogue']),
  z.string(),
]);
export type MemorySource = z.infer<typeof MemorySourceSchema>;

export const MemorySchema = z.object({
  id: z.string(),
  content: z.string().min(1),
  category: MemoryCategorySchema.default('EXPLICIT_FACT'),
  layer: MemoryLayerSchema.default('semantic'),
  importance: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(1.0),
  epistemicTier: EpistemicTierSchema.default('EXPLICIT'),
  source: z.string().default('user_explicit'),
  userEditable: z.boolean().default(true),
  user_editable: z.boolean().optional(),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).length(384).optional(),
  workspaceId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  expiration: z.string().datetime().nullable().optional(),
  supersededBy: z.string().optional(),
  accessCount: z.number().int().nonnegative().default(0),
  metadata: NoSecretsSchema.default({}),
  lastAccessedAt: z.string().datetime().default(() => new Date().toISOString()),
  last_used_at: z.string().datetime().optional(),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  updated_at: z.string().datetime().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  created_at: z.string().datetime().optional(),
});
export type MemoryEntity = z.infer<typeof MemorySchema>;

export const LearningSettingsSchema = z.object({
  learningEnabled: z.boolean().default(true),
  disabledCategories: z.array(MemoryCategorySchema).default([]),
  inferentialLearningEnabled: z.boolean().default(true),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningSettings = z.infer<typeof LearningSettingsSchema>;

// 13. File Reference Entity
export const FileReferenceCategorySchema = z.enum([
  'source_code',
  'config',
  'document',
  'artifact',
  'scratch',
]);
export type FileReferenceCategory = z.infer<typeof FileReferenceCategorySchema>;

export const FileReferenceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  path: z.string().min(1),
  mimeType: z.string().default('text/plain'),
  sizeBytes: z.number().int().nonnegative().default(0),
  contentHash: z.string().min(1),
  category: FileReferenceCategorySchema.default('source_code'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type FileReferenceEntity = z.infer<typeof FileReferenceSchema>;

// 14. Browser Session Entity
export const BrowserSessionSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  currentUrl: z.string().url(),
  title: z.string().default('New Tab'),
  viewport: z.object({ width: z.number(), height: z.number() }).default({ width: 1280, height: 800 }),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  closedAt: z.string().datetime().optional(),
});
export type BrowserSessionEntity = z.infer<typeof BrowserSessionSchema>;

// 15. Audit Event Entity
export const AuditSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  eventType: z.enum([
    'tool_executed',
    'approval_requested',
    'approval_granted',
    'approval_denied',
    'sandbox_violation',
    'path_jail_breach',
    'schema_migrated',
  ]),
  severity: AuditSeveritySchema.default('info'),
  actor: z.string().min(1),
  target: z.string().min(1),
  details: NoSecretsSchema.default({}),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});
export type AuditEventEntity = z.infer<typeof AuditEventSchema>;

// 16. Knowledge Source Entity
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
export type KnowledgeSourceEntity = z.infer<typeof KnowledgeSourceSchema>;

// 17. Knowledge Item Entity (Persistent Reusable Knowledge)
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
  metadata: NoSecretsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeItemEntity = z.infer<typeof KnowledgeItemSchema>;

// 18. Knowledge Topic Entity
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
export type KnowledgeTopicEntity = z.infer<typeof KnowledgeTopicSchema>;

// 19. Knowledge Embedding Entity
export const KnowledgeEmbeddingSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  chunkIndex: z.number().int().nonnegative().default(0),
  text: z.string().min(1),
  embedding: z.array(z.number()),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeEmbeddingEntity = z.infer<typeof KnowledgeEmbeddingSchema>;

// 20. Knowledge Update Log Entity
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
export type KnowledgeUpdateEntity = z.infer<typeof KnowledgeUpdateSchema>;

// 21. Ephemeral Working Knowledge Entity (Task-scoped)
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
export type WorkingKnowledgeItemEntity = z.infer<typeof WorkingKnowledgeItemSchema>;

export const WorkingKnowledgeContextSchema = z.object({
  taskId: z.string(),
  goal: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), domain: z.string() })).default([]),
  candidateFacts: z.array(WorkingKnowledgeItemSchema).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type WorkingKnowledgeContextEntity = z.infer<typeof WorkingKnowledgeContextSchema>;

// ============================================================================
// "Learn With Me" Collaborative Learning Database Entities
// ============================================================================

export const KnowledgeWorkspaceStatusSchema = z.enum(['active', 'archived', 'completed']);
export type KnowledgeWorkspaceStatus = z.infer<typeof KnowledgeWorkspaceStatusSchema>;

export const KnowledgeWorkspaceStatsSchema = z.object({
  totalConcepts: z.number().int().nonnegative().default(0),
  understoodConcepts: z.number().int().nonnegative().default(0),
  masteredConcepts: z.number().int().nonnegative().default(0),
  openQuestionsCount: z.number().int().nonnegative().default(0),
  practiceTasksCount: z.number().int().nonnegative().default(0),
});
export type KnowledgeWorkspaceStats = z.infer<typeof KnowledgeWorkspaceStatsSchema>;

export const KnowledgeWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  subject: z.string().min(1),
  description: z.string().default(''),
  status: KnowledgeWorkspaceStatusSchema.default('active'),
  activeTopicId: z.string().optional(),
  linkedProjectId: z.string().optional(),
  stats: KnowledgeWorkspaceStatsSchema.default({
    totalConcepts: 0,
    understoodConcepts: 0,
    masteredConcepts: 0,
    openQuestionsCount: 0,
    practiceTasksCount: 0,
  }),
  metadata: NoSecretsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type KnowledgeWorkspaceEntity = z.infer<typeof KnowledgeWorkspaceSchema>;

export const LearningTopicStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type LearningTopicStatus = z.infer<typeof LearningTopicStatusSchema>;

export const LearningCodeExampleSchema = z.object({
  title: z.string(),
  code: z.string(),
  language: z.string().default('rust'),
  explanation: z.string().optional(),
});
export type LearningCodeExample = z.infer<typeof LearningCodeExampleSchema>;

export const LearningTopicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().default(''),
  keyPrinciples: z.array(z.string()).default([]),
  codeExamples: z.array(LearningCodeExampleSchema).default([]),
  status: LearningTopicStatusSchema.default('not_started'),
  orderIndex: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningTopicEntity = z.infer<typeof LearningTopicSchema>;

export const ConceptMasteryLevelSchema = z.enum(['not_started', 'in_progress', 'understood', 'mastered']);
export type ConceptMasteryLevel = z.infer<typeof ConceptMasteryLevelSchema>;

export const LearningProgressSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string().optional(),
  conceptName: z.string().min(1),
  masteryLevel: ConceptMasteryLevelSchema.default('not_started'),
  timesReviewed: z.number().int().nonnegative().default(0),
  confidenceScore: z.number().min(0).max(1).default(0.0),
  lastReviewedAt: z.string().datetime().default(() => new Date().toISOString()),
  notes: z.string().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningProgressEntity = z.infer<typeof LearningProgressSchema>;

export const ConceptRelationTypeSchema = z.enum([
  'prerequisite_of',
  'builds_on',
  'relates_to',
  'extends',
  'applied_in',
]);
export type ConceptRelationType = z.infer<typeof ConceptRelationTypeSchema>;

export const ConceptRelationshipSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  fromConcept: z.string().min(1),
  toConcept: z.string().min(1),
  relationType: ConceptRelationTypeSchema.default('builds_on'),
  description: z.string().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ConceptRelationshipEntity = z.infer<typeof ConceptRelationshipSchema>;

export const QuestionStatusSchema = z.enum(['open', 'investigating', 'answered']);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

export const LearningQuestionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string().optional(),
  question: z.string().min(1),
  status: QuestionStatusSchema.default('open'),
  answer: z.string().optional(),
  askedBy: z.enum(['user', 'alina']).default('user'),
  resolvedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningQuestionEntity = z.infer<typeof LearningQuestionSchema>;

export const LearningDiscoverySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string().optional(),
  discovery: z.string().min(1),
  sourceUrl: z.string().optional(),
  connectedConcept: z.string().optional(),
  discoveredAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningDiscoveryEntity = z.infer<typeof LearningDiscoverySchema>;

export const PracticeTaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
export type PracticeTaskStatus = z.infer<typeof PracticeTaskStatusSchema>;

export const PracticeTaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string().optional(),
  title: z.string().min(1),
  instructions: z.string().min(1),
  starterCode: z.string().optional(),
  solutionCode: z.string().optional(),
  evaluationCriteria: z.array(z.string()).default([]),
  status: PracticeTaskStatusSchema.default('pending'),
  userSubmission: z.string().optional(),
  feedback: z.string().optional(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type PracticeTaskEntity = z.infer<typeof PracticeTaskSchema>;

export const LearningSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string().optional(),
  startedAt: z.string().datetime().default(() => new Date().toISOString()),
  endedAt: z.string().datetime().optional(),
  objective: z.string().min(1),
  summary: z.string().default(''),
  notes: z.array(z.string()).default([]),
  conceptsCovered: z.array(z.string()).default([]),
  questionsAsked: z.array(z.string()).default([]),
  practiceTasksGenerated: z.array(z.string()).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type LearningSessionEntity = z.infer<typeof LearningSessionSchema>;


