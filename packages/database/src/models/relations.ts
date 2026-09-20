import { z } from 'zod';

export const GraphRelationSchema = z.object({
  id: z.string(),
  in: z.string(),  // Source RecordId
  out: z.string(), // Target RecordId
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type GraphRelation = z.infer<typeof GraphRelationSchema>;

// Specific graph edge schemas
export const UserOwnsWorkspaceSchema = GraphRelationSchema.extend({
  role: z.enum(['owner', 'collaborator']).default('owner'),
});
export type UserOwnsWorkspace = z.infer<typeof UserOwnsWorkspaceSchema>;

export const UserStartedConversationSchema = GraphRelationSchema;
export type UserStartedConversation = z.infer<typeof UserStartedConversationSchema>;

export const ConversationContainsMessageSchema = GraphRelationSchema.extend({
  sequenceOrder: z.number().int().nonnegative().optional(),
});
export type ConversationContainsMessage = z.infer<typeof ConversationContainsMessageSchema>;

export const UserCreatedTaskSchema = GraphRelationSchema;
export type UserCreatedTask = z.infer<typeof UserCreatedTaskSchema>;

export const TaskContainsStepSchema = GraphRelationSchema.extend({
  stepIndex: z.number().int().nonnegative(),
});
export type TaskContainsStep = z.infer<typeof TaskContainsStepSchema>;

export const TaskExecutedByAgentRunSchema = GraphRelationSchema;
export type TaskExecutedByAgentRun = z.infer<typeof TaskExecutedByAgentRunSchema>;

export const AgentRunInvokedToolCallSchema = GraphRelationSchema;
export type AgentRunInvokedToolCall = z.infer<typeof AgentRunInvokedToolCallSchema>;

export const ToolCallUsedToolSchema = GraphRelationSchema;
export type ToolCallUsedTool = z.infer<typeof ToolCallUsedToolSchema>;

export const TaskRequiresApprovalSchema = GraphRelationSchema.extend({
  isResolved: z.boolean().default(false),
});
export type TaskRequiresApproval = z.infer<typeof TaskRequiresApprovalSchema>;

export const UserRemembersMemorySchema = GraphRelationSchema.extend({
  accessCount: z.number().int().nonnegative().default(1),
});
export type UserRemembersMemory = z.infer<typeof UserRemembersMemorySchema>;

export const UserPrefersMemorySchema = GraphRelationSchema.extend({
  strength: z.number().min(0).max(1).default(1.0),
});
export type UserPrefersMemory = z.infer<typeof UserPrefersMemorySchema>;

export const TaskProducedMemorySchema = GraphRelationSchema.extend({
  outcome: z.enum(['success', 'failure', 'learning']).default('success'),
});
export type TaskProducedMemory = z.infer<typeof TaskProducedMemorySchema>;

export const MemoryRelatesToEntitySchema = GraphRelationSchema.extend({
  relationType: z.string().default('associates_with'),
  weight: z.number().min(0).max(1).default(0.8),
});
export type MemoryRelatesToEntity = z.infer<typeof MemoryRelatesToEntitySchema>;

export const TaskProducedFileSchema = GraphRelationSchema.extend({
  action: z.enum(['created', 'modified', 'inspected']).default('created'),
});
export type TaskProducedFile = z.infer<typeof TaskProducedFileSchema>;

export const WorkspaceContainsFileSchema = GraphRelationSchema;
export type WorkspaceContainsFile = z.infer<typeof WorkspaceContainsFileSchema>;
