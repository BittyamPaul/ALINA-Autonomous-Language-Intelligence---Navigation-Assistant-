import { z } from 'zod';
import { PathJail, AuditLogger } from '@alina/shared';
import { McpPermissionClassification } from './permissions';

export const McpToolGroupSchema = z.enum(['filesystem', 'browser', 'computer', 'system']);
export type McpToolGroup = z.infer<typeof McpToolGroupSchema>;

export interface McpAuditMetadata {
  category: McpToolGroup;
  description: string;
  isReadOnly: boolean;
  tags?: string[];
}

export interface McpApprovalRequest {
  toolName: string;
  parameters: Record<string, unknown>;
  permission: McpPermissionClassification;
  reason: string;
}

export interface McpApprovalResponse {
  approved: boolean;
  grantToken?: string;
  reason?: string;
}

export interface McpToolContext {
  jail?: PathJail;
  auditLogger?: AuditLogger;
  taskId?: string;
  stepId?: string;
  isApprovalGranted?: boolean;
  grantToken?: string;
  authorizationGrant?: import('@alina/shared').AuthorizationGrant;
  signal?: AbortSignal;
  requestApproval?: (request: McpApprovalRequest) => Promise<McpApprovalResponse>;
}

export interface McpToolExecutionResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  durationMs: number;
  permission: McpPermissionClassification;
  auditLogged: boolean;
}

/**
 * Standard MCP Tool Definition Contract.
 * Every ALINA tool conforms to this specification.
 */
export interface McpToolDefinition<TInput = any, TOutput = any> {
  name: string;
  group: McpToolGroup;
  description: string;
  inputSchema: z.ZodType<any, any, any>;
  outputSchema: z.ZodType<any, any, any>;
  permission: McpPermissionClassification;
  timeoutMs: number;
  auditMetadata: McpAuditMetadata;
  execute: (input: TInput, context: McpToolContext) => Promise<TOutput>;
}
