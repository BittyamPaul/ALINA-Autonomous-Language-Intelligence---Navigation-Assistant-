import { z } from 'zod';
import { PlanDAG, Task, AgentEventEnvelope } from '@alina/shared';

export const AgentRoleSchema = z.enum([
  'supervisor',
  'planner',
  'workspace',
  'navigator',
  'memory',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export interface AgentContext {
  taskId: string;
  sessionId: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunner {
  createTask(goal: string, context: AgentContext): Promise<Task>;
  generatePlan(taskId: string): Promise<PlanDAG>;
  executeTask(taskId: string): Promise<Task>;
  cancelTask(taskId: string): Promise<boolean>;
  onEvent(callback: (event: AgentEventEnvelope) => void): void;
}
