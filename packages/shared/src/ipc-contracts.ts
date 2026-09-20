import { z } from 'zod';
import { TaskSchema } from './models';
import { ApprovalDecisionSchema } from './permissions';

export const CreateTaskInputSchema = z.object({
  goal: z.string().min(1),
  sessionId: z.string(),
  projectId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const CreateTaskOutputSchema = z.object({
  task: TaskSchema,
});
export type CreateTaskOutput = z.infer<typeof CreateTaskOutputSchema>;

export const StartTaskInputSchema = z.object({
  taskId: z.string(),
});
export type StartTaskInput = z.infer<typeof StartTaskInputSchema>;

export const ResolveApprovalInputSchema = z.object({
  decision: ApprovalDecisionSchema,
});
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInputSchema>;

export const SearchMemoryInputSchema = z.object({
  query: z.string(),
  projectId: z.string().optional(),
  limit: z.number().int().positive().default(5),
  minImportance: z.number().min(0).max(1).optional(),
});
export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export const SystemStatusSchema = z.object({
  dbConnected: z.boolean(),
  agentReady: z.boolean(),
  activeTasks: z.number().int(),
  pendingApprovals: z.number().int(),
  allowedRoots: z.array(z.string()),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
