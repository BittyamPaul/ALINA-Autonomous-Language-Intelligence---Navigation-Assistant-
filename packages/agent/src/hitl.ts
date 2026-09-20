import { ApprovalRequest, ApprovalDecision, RiskLevel, AuthorizationGrant } from '@alina/shared';
import { AuthorizationManager } from './security/authorization-manager';

export interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision & { grant?: AuthorizationGrant }) => void;
  reject: (error: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
}

export class HitlCoordinator {
  private pendingApprovals = new Map<string, PendingApproval>();
  private onApprovalRequestedCallback?: (request: ApprovalRequest) => void;
  private authManager: AuthorizationManager;

  constructor(authManager?: AuthorizationManager) {
    this.authManager = authManager || AuthorizationManager.getInstance();
  }

  public setOnApprovalRequested(cb: (request: ApprovalRequest) => void): void {
    this.onApprovalRequestedCallback = cb;
  }

  public async requestApproval(params: {
    taskId: string;
    stepId: string;
    toolName: string;
    title?: string;
    description?: string;
    riskLevel?: RiskLevel;
    parameters: Record<string, unknown>;
    diffPreview?: string;
    impactSummary?: string;
    timeoutMs?: number;
  }): Promise<ApprovalDecision & { grant?: AuthorizationGrant }> {
    // Register structured request in AuthorizationManager synchronously
    const request = this.authManager.createApprovalRequestSync({
      toolName: params.toolName,
      parameters: params.parameters,
      reason: params.description || params.title,
      taskId: params.taskId,
      stepId: params.stepId,
      diffPreview: params.diffPreview,
      timeoutMs: params.timeoutMs,
    });

    return new Promise<ApprovalDecision & { grant?: AuthorizationGrant }>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutMs = params.timeoutMs || AuthorizationManager.DEFAULT_APPROVAL_TTL_MS;
      
      timeoutHandle = setTimeout(() => {
        this.pendingApprovals.delete(request.id);
        this.authManager.cancel(request.id, 'Approval request timed out.');
        reject(new Error(`Approval request ${request.id} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingApprovals.set(request.id, {
        request,
        resolve,
        reject,
        timeoutHandle,
      });

      if (this.onApprovalRequestedCallback) {
        this.onApprovalRequestedCallback(request);
      }
    });
  }

  public async resolveApproval(decision: ApprovalDecision): Promise<boolean> {
    const pending = this.pendingApprovals.get(decision.requestId);
    if (!pending) {
      return false;
    }

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }

    this.pendingApprovals.delete(decision.requestId);

    if (decision.approved) {
      const { grant } = await this.authManager.approve(decision.requestId, 'operator');
      pending.resolve({
        ...decision,
        grant,
      });
    } else {
      await this.authManager.reject(decision.requestId, decision.reviewerNote || 'Action denied by operator.');
      pending.resolve(decision);
    }

    return true;
  }

  public getPendingList(): ApprovalRequest[] {
    return this.authManager.getPendingRequests();
  }

  public cancelPending(requestId: string, reason: string): boolean {
    const pending = this.pendingApprovals.get(requestId);
    if (pending && pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
      this.pendingApprovals.delete(requestId);
      pending.reject(new Error(`Approval cancelled: ${reason}`));
    }

    try {
      this.authManager.cancel(requestId, reason);
      return true;
    } catch {
      return false;
    }
  }
}
