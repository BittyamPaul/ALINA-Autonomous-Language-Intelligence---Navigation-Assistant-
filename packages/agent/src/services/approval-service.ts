import { z } from 'zod';
import {
  AlinaDatabaseClient,
  TaskRepository,
  type ApprovalEntity,
  type ApprovalRiskLevel,
} from '@alina/database';
import { RiskLevelSchema, normalizeRiskLevel, AuthorizationGrant } from '@alina/shared';
import { AuthorizationManager } from '../security/authorization-manager';

export const CreateApprovalGateInputSchema = z.object({
  taskId: z.string().optional().default('default_task'),
  taskStepId: z.string().optional(),
  toolCallId: z.string().optional(),
  action: z.string().optional(),
  target: z.string().optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
  tool: z.string().optional(),
  toolName: z.string().optional(),
  riskLevel: RiskLevelSchema.optional().default('APPROVAL_REQUIRED'),
  description: z.string().optional(),
  diffPreview: z.string().optional(),
  parameters: z.record(z.unknown()).optional().default({}),
  parametersSummary: z.string().optional(),
  timeoutMs: z.number().optional(),
});
export type CreateApprovalGateInput = z.infer<typeof CreateApprovalGateInputSchema>;

export const ResolveApprovalInputSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'cancelled']),
  decisionBy: z.string().default('operator'),
  rejectionReason: z.string().optional(),
});
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInputSchema>;

export class ApprovalService {
  private taskRepo: TaskRepository;
  private authManager: AuthorizationManager;

  constructor(client: AlinaDatabaseClient, authManager?: AuthorizationManager) {
    this.taskRepo = new TaskRepository(client);
    this.authManager = authManager || AuthorizationManager.getInstance({ client });
  }

  public async createGate(input: CreateApprovalGateInput): Promise<ApprovalEntity> {
    const validated = CreateApprovalGateInputSchema.parse(input);
    const tool = validated.tool || validated.toolName || 'system_tool';
    const canonicalRisk = normalizeRiskLevel(validated.riskLevel);

    // Create through AuthorizationManager to ensure secret sanitization and tracking
    const request = await this.authManager.createApprovalRequest({
      toolName: tool,
      parameters: validated.parameters,
      reason: validated.reason || validated.description,
      taskId: validated.taskId,
      stepId: validated.taskStepId,
      diffPreview: validated.diffPreview,
      timeoutMs: validated.timeoutMs,
    });

    const entity: ApprovalEntity = {
      id: request.id,
      taskId: request.taskId || validated.taskId,
      taskStepId: request.stepId || validated.taskStepId,
      toolCallId: validated.toolCallId,
      action: request.action,
      target: request.target,
      source: request.source,
      reason: request.reason,
      tool: request.tool,
      riskLevel: (validated.riskLevel as ApprovalRiskLevel) || canonicalRisk,
      description: request.reason,
      diffPreview: request.diffPreview,
      parametersSummary: request.parametersSummary,
      parameters: request.parameters,
      status: 'pending',
      expiresAt: request.expiresAt,
      createdAt: request.timestamp,
    };

    return entity;
  }

  public async listPending(taskId?: string): Promise<ApprovalEntity[]> {
    this.authManager.sweepExpired();
    if (taskId) {
      return this.taskRepo.getPendingApprovals(taskId);
    }
    const all = await this.taskRepo.list(200);
    const pendingList: ApprovalEntity[] = [];
    for (const t of all) {
      const p = await this.taskRepo.getPendingApprovals(t.id);
      pendingList.push(...p);
    }
    return pendingList;
  }

  public async getById(id: string): Promise<ApprovalEntity | undefined> {
    const req = this.authManager.getRequest(id);
    if (req) {
      return {
        id: req.id,
        taskId: req.taskId || 'default',
        taskStepId: req.stepId,
        action: req.action,
        target: req.target,
        source: req.source,
        reason: req.reason,
        tool: req.tool,
        riskLevel: req.riskLevel,
        description: req.reason,
        diffPreview: req.diffPreview,
        parametersSummary: req.parametersSummary,
        parameters: req.parameters,
        status: req.status.toLowerCase() as any,
        expiresAt: req.expiresAt,
        decisionBy: req.decisionBy,
        decisionAt: req.decisionAt,
        rejectionReason: req.denialReason,
        grantToken: req.grantToken,
        createdAt: req.timestamp,
      };
    }
    return undefined;
  }

  public async resolve(
    id: string,
    input: ResolveApprovalInput
  ): Promise<ApprovalEntity & { grant?: AuthorizationGrant }> {
    const validated = ResolveApprovalInputSchema.parse(input);

    if (validated.decision === 'approved') {
      const { request, grant } = await this.authManager.approve(id, validated.decisionBy);
      return {
        id: request.id,
        taskId: request.taskId || 'default',
        taskStepId: request.stepId,
        action: request.action,
        target: request.target,
        source: request.source,
        reason: request.reason,
        tool: request.tool,
        riskLevel: request.riskLevel,
        description: request.reason,
        parametersSummary: request.parametersSummary,
        parameters: request.parameters,
        status: 'approved',
        expiresAt: request.expiresAt,
        decisionBy: request.decisionBy,
        decisionAt: request.decisionAt,
        grantToken: grant.grantId,
        createdAt: request.timestamp,
        grant,
      };
    } else if (validated.decision === 'rejected') {
      const request = await this.authManager.reject(
        id,
        validated.rejectionReason || 'Action denied by operator',
        validated.decisionBy
      );
      return {
        id: request.id,
        taskId: request.taskId || 'default',
        taskStepId: request.stepId,
        action: request.action,
        target: request.target,
        source: request.source,
        reason: request.reason,
        tool: request.tool,
        riskLevel: request.riskLevel,
        description: request.reason,
        parametersSummary: request.parametersSummary,
        parameters: request.parameters,
        status: 'rejected',
        expiresAt: request.expiresAt,
        decisionBy: request.decisionBy,
        decisionAt: request.decisionAt,
        rejectionReason: request.denialReason,
        createdAt: request.timestamp,
      };
    } else {
      const request = await this.authManager.cancel(
        id,
        validated.rejectionReason || 'Cancelled by operator'
      );
      return {
        id: request.id,
        taskId: request.taskId || 'default',
        taskStepId: request.stepId,
        action: request.action,
        target: request.target,
        source: request.source,
        reason: request.reason,
        tool: request.tool,
        riskLevel: request.riskLevel,
        description: request.reason,
        parametersSummary: request.parametersSummary,
        parameters: request.parameters,
        status: 'cancelled',
        expiresAt: request.expiresAt,
        decisionBy: request.decisionBy,
        decisionAt: request.decisionAt,
        rejectionReason: request.denialReason,
        createdAt: request.timestamp,
      };
    }
  }

  public async cancel(id: string, reason = 'Cancelled by operator'): Promise<ApprovalEntity> {
    return this.resolve(id, {
      decision: 'cancelled',
      decisionBy: 'operator',
      rejectionReason: reason,
    });
  }
}
