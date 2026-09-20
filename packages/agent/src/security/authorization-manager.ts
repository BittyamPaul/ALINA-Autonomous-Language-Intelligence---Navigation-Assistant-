import crypto from 'node:crypto';
import {
  RiskLevel,
  normalizeRiskLevel,
  SecretRedactor,
  ApprovalRequest,
  AuthorizationGrant,
  computeParameterHash,
  AuditLogger,
  AuditEntry,
  SecuritySandboxError,
} from '@alina/shared';
import { AlinaDatabaseClient, TaskRepository, type ApprovalEntity } from '@alina/database';

export interface AuthorizeResult {
  authorized: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  approvalRequest?: ApprovalRequest;
  grant?: AuthorizationGrant;
  error?: string;
}

export interface CreateApprovalParams {
  toolName: string;
  parameters: Record<string, unknown>;
  reason?: string;
  taskId?: string;
  stepId?: string;
  diffPreview?: string;
  timeoutMs?: number;
}

export interface ToolMetadataProvider {
  getToolRisk: (name: string, params: unknown) => RiskLevel;
  hasTool: (name: string) => boolean;
}

/**
 * Centralized Authorization Manager
 * 
 * Enforces ALINA's fail-closed security policy:
 * - Every tool declares a risk level: SAFE, APPROVAL_REQUIRED, HIGH_RISK.
 * - Agents can NEVER bypass the authorization layer (boolean approval flags without valid grants are rejected).
 * - Approval requests contain: action, target, source, reason, tool, risk level, timestamp, parameters summary.
 * - Secrets are strictly redacted from all approval dialog data.
 * - Single-use cryptographic authorization grants prevent replay attacks and parameter tampering.
 * - Timeouts, expirations, cancellations, and denied-action repeated-attempt protections are enforced.
 */
export class AuthorizationManager {
  private static instance?: AuthorizationManager;
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private activeGrants: Map<string, AuthorizationGrant> = new Map();
  private deniedActionsCooldown: Map<string, number> = new Map(); // key -> expiresTimestamp
  private taskRepo?: TaskRepository;
  private auditLogger?: AuditLogger;
  private metadataProvider?: ToolMetadataProvider;

  // Default approval expiration TTL: 3 minutes
  public static DEFAULT_APPROVAL_TTL_MS = 3 * 60 * 1000;
  // Single-use grant consumption TTL: 60 seconds
  public static DEFAULT_GRANT_TTL_MS = 60 * 1000;
  // Denied action cooldown: 30 seconds
  public static DENIED_ACTION_COOLDOWN_MS = 30 * 1000;

  constructor(options?: {
    client?: AlinaDatabaseClient;
    auditLogger?: AuditLogger;
    metadataProvider?: ToolMetadataProvider;
  }) {
    if (options?.client) {
      this.taskRepo = new TaskRepository(options.client);
    }
    this.auditLogger = options?.auditLogger;
    this.metadataProvider = options?.metadataProvider;
  }

  public static getInstance(options?: {
    client?: AlinaDatabaseClient;
    auditLogger?: AuditLogger;
    metadataProvider?: ToolMetadataProvider;
  }): AuthorizationManager {
    if (!AuthorizationManager.instance) {
      AuthorizationManager.instance = new AuthorizationManager(options);
    }
    return AuthorizationManager.instance;
  }

  public static resetInstance(): void {
    AuthorizationManager.instance = undefined;
  }

  public setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  public getAuditLogger(): AuditLogger | undefined {
    return this.auditLogger;
  }

  public setMetadataProvider(provider: ToolMetadataProvider): void {
    this.metadataProvider = provider;
  }

  /**
   * Evaluates the risk tier for a given tool.
   * Fails closed to HIGH_RISK if tool is unknown or unclassified.
   */
  public evaluateRisk(toolName: string, params: unknown = {}): RiskLevel {
    if (!toolName || typeof toolName !== 'string') {
      return 'HIGH_RISK';
    }

    if (this.metadataProvider) {
      if (!this.metadataProvider.hasTool(toolName)) {
        return 'HIGH_RISK'; // Unknown tool fails closed
      }
      const risk = this.metadataProvider.getToolRisk(toolName, params);
      return normalizeRiskLevel(risk);
    }

    // Default heuristics based on tool name prefixes if metadata provider not wired
    const name = toolName.toLowerCase();
    if (
      name.includes('delete') ||
      name.includes('destroy') ||
      name.includes('format') ||
      name.includes('shell') ||
      name.includes('terminal')
    ) {
      return 'HIGH_RISK';
    }

    if (
      name.includes('create') ||
      name.includes('write') ||
      name.includes('copy') ||
      name.includes('move') ||
      name.includes('rename') ||
      name.includes('launch') ||
      name.includes('input') ||
      name.includes('click') ||
      name.includes('type')
    ) {
      return 'APPROVAL_REQUIRED';
    }

    if (
      name.includes('read') ||
      name.includes('list') ||
      name.includes('search') ||
      name.includes('get_') ||
      name.includes('inspect')
    ) {
      return 'SAFE';
    }

    return 'HIGH_RISK'; // Unknown fails closed
  }

  /**
   * Parses action, target, source, and human summary from tool invocation.
   */
  public parseActionDetails(
    toolName: string,
    params: Record<string, unknown>
  ): {
    action: string;
    target: string;
    source?: string;
    parametersSummary: string;
  } {
    const p = params || {};
    const name = toolName.toLowerCase();

    // Filesystem: move
    if (name.includes('move')) {
      const src = String(p.sourcePath || p.src || p.source || 'source');
      const dest = String(p.destinationPath || p.dest || p.destination || p.target || 'destination');
      return {
        action: 'move',
        source: src,
        target: dest,
        parametersSummary: `Move "${src}" to "${dest}"${p.overwrite ? ' (overwrite enabled)' : ''}`,
      };
    }

    // Filesystem: copy
    if (name.includes('copy')) {
      const src = String(p.sourcePath || p.src || p.source || 'source');
      const dest = String(p.destinationPath || p.dest || p.destination || p.target || 'destination');
      return {
        action: 'copy',
        source: src,
        target: dest,
        parametersSummary: `Copy "${src}" to "${dest}"${p.overwrite ? ' (overwrite enabled)' : ''}`,
      };
    }

    // Filesystem: delete
    if (name.includes('delete') || name.includes('remove')) {
      const target = String(p.path || p.target || 'file');
      return {
        action: 'delete',
        target,
        parametersSummary: `Permanently delete "${target}"`,
      };
    }

    // Filesystem: write / create file
    if (name.includes('write') || name.includes('create_file')) {
      const target = String(p.path || p.filePath || p.target || 'file');
      return {
        action: 'write',
        target,
        parametersSummary: `Write contents to file "${target}"`,
      };
    }

    // Filesystem: rename
    if (name.includes('rename')) {
      const src = String(p.path || p.source || 'file');
      const target = String(p.newName || p.target || 'new_name');
      return {
        action: 'rename',
        source: src,
        target,
        parametersSummary: `Rename "${src}" to "${target}"`,
      };
    }

    // Native / Computer: launch app
    if (name.includes('launch')) {
      const app = String(p.app || p.application || p.target || 'app');
      return {
        action: 'launch_app',
        target: app,
        parametersSummary: `Launch desktop application "${app}"`,
      };
    }

    // Browser: navigate
    if (name.includes('navigate')) {
      const url = String(p.url || p.target || 'url');
      return {
        action: 'navigate',
        target: url,
        parametersSummary: `Navigate browser to "${url}"`,
      };
    }

    // Generic fallback
    const target = String(p.path || p.url || p.target || p.destinationPath || toolName);
    const action = name.replace(/^(fs_|computer_|browser_|mcp_)/, '');
    return {
      action,
      target,
      parametersSummary: `Execute "${toolName}" on "${target}"`,
    };
  }

  /**
   * Creates an approval request synchronously in memory with strictly scrubbed secrets and expiration.
   */
  public createApprovalRequestSync(params: CreateApprovalParams): ApprovalRequest {
    const riskLevel = this.evaluateRisk(params.toolName, params.parameters);
    const { action, target, source, parametersSummary } = this.parseActionDetails(
      params.toolName,
      params.parameters
    );

    // Repeated action cooldown check (if user recently denied this exact operation)
    const paramHash = computeParameterHash(params.parameters);
    const cooldownKey = `${params.toolName}:${target}:${paramHash}`;
    const cooldownExpires = this.deniedActionsCooldown.get(cooldownKey);
    if (cooldownExpires && cooldownExpires > Date.now()) {
      const remainingSec = Math.ceil((cooldownExpires - Date.now()) / 1000);
      throw new SecuritySandboxError(
        `Repeated action protection: Operator recently denied this exact action. Cooldown active for ${remainingSec}s.`,
        params.toolName
      );
    }

    // Secret hygiene: Scrub secrets from parameters, reason, and summary
    const sanitizedParameters = SecretRedactor.sanitizeObject(params.parameters);
    const sanitizedReason = SecretRedactor.redactString(
      params.reason || `Operator authorization required for ${riskLevel} tool "${params.toolName}".`
    );
    const sanitizedSummary = SecretRedactor.redactString(parametersSummary);
    const sanitizedTarget = SecretRedactor.redactString(target);
    const sanitizedSource = source ? SecretRedactor.redactString(source) : undefined;
    const sanitizedDiff = params.diffPreview ? SecretRedactor.redactString(params.diffPreview) : undefined;

    const id = `app_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const timeoutMs = params.timeoutMs || AuthorizationManager.DEFAULT_APPROVAL_TTL_MS;
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    const request: ApprovalRequest = {
      id,
      action,
      target: sanitizedTarget,
      source: sanitizedSource,
      reason: sanitizedReason,
      tool: params.toolName,
      riskLevel: normalizeRiskLevel(riskLevel),
      timestamp: now,
      parametersSummary: sanitizedSummary,
      parameters: sanitizedParameters,
      diffPreview: sanitizedDiff,
      expiresAt,
      status: 'pending',
      taskId: params.taskId,
      stepId: params.stepId,
      toolName: params.toolName,
      description: sanitizedReason,
      requestedAt: now,
    };

    // Store in memory
    this.pendingRequests.set(id, request);

    // Persist in SurrealDB if repository configured
    if (this.taskRepo) {
      const entity: ApprovalEntity = {
        id: request.id,
        taskId: request.taskId || 'system_standalone',
        taskStepId: request.stepId,
        action: request.action,
        target: request.target,
        source: request.source,
        reason: request.reason,
        tool: request.tool,
        riskLevel: request.riskLevel,
        parametersSummary: request.parametersSummary,
        parameters: request.parameters,
        description: request.reason,
        diffPreview: request.diffPreview,
        status: 'pending',
        expiresAt: request.expiresAt,
        createdAt: request.timestamp,
      };
      void this.taskRepo.createApprovalGate(entity).catch(() => {});
    }

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.log({
        actionType: 'approval_requested',
        toolName: params.toolName,
        riskLevel,
        parameters: sanitizedParameters,
        outcome: 'pending',
        details: `Approval requested: ${sanitizedSummary} (Expires at ${expiresAt})`,
      });
    }

    return request;
  }

  /**
   * Creates an approval request with strictly scrubbed secrets and expiration.
   */
  public async createApprovalRequest(params: CreateApprovalParams): Promise<ApprovalRequest> {
    return this.createApprovalRequestSync(params);
  }

  /**
   * Approves an approval request and mints a single-use AuthorizationGrant.
   */
  public async approve(
    requestId: string,
    decisionBy = 'operator'
  ): Promise<{ request: ApprovalRequest; grant: AuthorizationGrant }> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new SecuritySandboxError(`Approval request "${requestId}" not found.`, 'security_gate');
    }

    // Check expiration
    if (Date.now() > new Date(request.expiresAt).getTime()) {
      request.status = 'expired';
      this.auditLogEvent('approval_expired', request.tool, request.riskLevel, request.parameters, 'expired', `Approval ${requestId} expired`);
      throw new SecuritySandboxError(`Approval request "${requestId}" has expired. Cannot approve.`, request.tool);
    }

    if (request.status !== 'pending') {
      throw new SecuritySandboxError(`Approval request "${requestId}" is already ${request.status}.`, request.tool);
    }

    // Mint single-use AuthorizationGrant
    const grantId = crypto.randomUUID();
    const now = new Date().toISOString();
    const grantExpiresAt = new Date(Date.now() + AuthorizationManager.DEFAULT_GRANT_TTL_MS).toISOString();
    const parameterHash = computeParameterHash(request.parameters);

    const grant: AuthorizationGrant = {
      grantId,
      approvalRequestId: requestId,
      toolName: request.tool,
      parameterHash,
      issuedAt: now,
      expiresAt: grantExpiresAt,
      consumed: false,
    };

    this.activeGrants.set(grantId, grant);

    // Update request
    request.status = 'approved';
    request.decisionBy = decisionBy;
    request.decisionAt = now;
    request.grantToken = grantId;

    // Persist in repository
    if (this.taskRepo) {
      try {
        await this.taskRepo.resolveApproval(requestId, 'approved', decisionBy, undefined, grantId);
      } catch {
        // Continue
      }
    }

    // Audit log
    this.auditLogEvent('approval_granted', request.tool, request.riskLevel, request.parameters, 'granted', `Operator approved action. Grant issued: ${grantId}`);

    return { request, grant };
  }

  /**
   * Rejects an approval request, blocks execution, and initiates repeated-action cooldown.
   */
  public async reject(
    requestId: string,
    reason = 'Action denied by operator.',
    decisionBy = 'operator'
  ): Promise<ApprovalRequest> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new SecuritySandboxError(`Approval request "${requestId}" not found.`, 'security_gate');
    }

    if (request.status !== 'pending') {
      throw new SecuritySandboxError(`Approval request "${requestId}" is already ${request.status}.`, request.tool);
    }

    const now = new Date().toISOString();
    request.status = 'rejected';
    request.decisionBy = decisionBy;
    request.decisionAt = now;
    request.denialReason = reason;

    // Activate repeated-action cooldown
    const paramHash = computeParameterHash(request.parameters);
    const cooldownKey = `${request.tool}:${request.target}:${paramHash}`;
    this.deniedActionsCooldown.set(cooldownKey, Date.now() + AuthorizationManager.DENIED_ACTION_COOLDOWN_MS);

    // Persist in repository
    if (this.taskRepo) {
      try {
        await this.taskRepo.resolveApproval(requestId, 'rejected', decisionBy, reason);
      } catch {
        // Continue
      }
    }

    // Audit log
    this.auditLogEvent('approval_denied', request.tool, request.riskLevel, request.parameters, 'denied', `Action denied by operator: ${reason}`);

    return request;
  }

  /**
   * Cancels a pending approval request.
   */
  public async cancel(requestId: string, reason = 'Cancelled by operator or system'): Promise<ApprovalRequest> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new SecuritySandboxError(`Approval request "${requestId}" not found.`, 'security_gate');
    }

    if (request.status !== 'pending') {
      throw new SecuritySandboxError(`Approval request "${requestId}" is already ${request.status}.`, request.tool);
    }

    const now = new Date().toISOString();
    request.status = 'cancelled';
    request.denialReason = reason;
    request.decisionAt = now;

    // Persist in repository
    if (this.taskRepo) {
      try {
        await this.taskRepo.cancelApproval(requestId, reason);
      } catch {
        // Continue
      }
    }

    // Audit log
    this.auditLogEvent('approval_cancelled', request.tool, request.riskLevel, request.parameters, 'cancelled', `Approval request cancelled: ${reason}`);

    return request;
  }

  /**
   * Verifies and atomically consumes a single-use authorization grant.
   * Fails closed if grant is missing, invalid, expired, reused, or parameters tampered.
   */
  public validateAndConsumeGrant(
    toolName: string,
    params: unknown,
    grantToken?: string
  ): { valid: boolean; grant: AuthorizationGrant } {
    if (!grantToken) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', 'Execution blocked: Missing required authorization grant token.');
      throw new SecuritySandboxError(
        `Security Policy Violation: Tool "${toolName}" requires an authorization grant token. Cannot bypass authorization.`,
        toolName
      );
    }

    const grant = this.activeGrants.get(grantToken);
    if (!grant) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', `Execution blocked: Invalid or forged grant token "${grantToken}".`);
      throw new SecuritySandboxError(
        `Security Policy Violation: Invalid authorization grant token "${grantToken}".`,
        toolName
      );
    }

    // Replay attack protection: Grant must NOT have been previously consumed
    if (grant.consumed) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', `Replay attack detected: Grant "${grantToken}" was already consumed at ${grant.consumedAt}.`);
      throw new SecuritySandboxError(
        `Security Policy Violation (Replay Attack): Authorization grant "${grantToken}" has already been consumed. Single-use grants cannot be reused.`,
        toolName
      );
    }

    // Tool name binding: Grant must belong to this exact tool
    if (grant.toolName !== toolName) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', `Tool mismatch: Grant issued for "${grant.toolName}" cannot be used for "${toolName}".`);
      throw new SecuritySandboxError(
        `Security Policy Violation: Grant token was issued for tool "${grant.toolName}", not "${toolName}".`,
        toolName
      );
    }

    // Expiration check
    if (Date.now() > new Date(grant.expiresAt).getTime()) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', `Grant expired: Grant "${grantToken}" expired at ${grant.expiresAt}.`);
      throw new SecuritySandboxError(
        `Security Policy Violation: Authorization grant has expired.`,
        toolName
      );
    }

    // Parameter tampering protection: Hash of execution params must match approved hash
    const incomingHash = computeParameterHash(params);
    if (incomingHash !== grant.parameterHash) {
      this.auditLogEvent('security_violation', toolName, 'HIGH_RISK', params as Record<string, unknown>, 'blocked', `Parameter tampering detected: Hash mismatch for tool "${toolName}".`);
      throw new SecuritySandboxError(
        `Security Policy Violation (Parameter Tampering): Tool parameters were modified after human authorization was granted.`,
        toolName
      );
    }

    // ATOMIC CONSUMPTION: Mark single-use grant as consumed
    grant.consumed = true;
    grant.consumedAt = new Date().toISOString();

    this.auditLogEvent('grant_consumed', toolName, 'APPROVAL_REQUIRED', params as Record<string, unknown>, 'success', `Authorization grant "${grantToken}" consumed successfully.`);

    return { valid: true, grant };
  }

  /**
   * Main gatekeeper: Authorizes tool execution or halts for approval.
   */
  public async authorize(
    toolName: string,
    params: unknown,
    grantToken?: string
  ): Promise<AuthorizeResult> {
    const riskLevel = this.evaluateRisk(toolName, params);

    // 1. SAFE tools are auto-authorized
    if (riskLevel === 'SAFE') {
      return {
        authorized: true,
        riskLevel: 'SAFE',
        requiresApproval: false,
      };
    }

    // 2. APPROVAL_REQUIRED or HIGH_RISK tools require an authorization grant
    if (!grantToken) {
      return {
        authorized: false,
        riskLevel,
        requiresApproval: true,
      };
    }

    // 3. Verify and consume grant (fails closed on any discrepancy)
    try {
      const { grant } = this.validateAndConsumeGrant(toolName, params, grantToken);
      return {
        authorized: true,
        riskLevel,
        requiresApproval: false,
        grant,
      };
    } catch (err: unknown) {
      return {
        authorized: false,
        riskLevel,
        requiresApproval: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Checks and sweeps all expired pending requests.
   */
  public sweepExpired(): number {
    let swept = 0;
    const now = Date.now();
    for (const [id, req] of this.pendingRequests.entries()) {
      if (req.status === 'pending' && now > new Date(req.expiresAt).getTime()) {
        req.status = 'expired';
        swept++;
        this.auditLogEvent('approval_expired', req.tool, req.riskLevel, req.parameters, 'expired', `Approval ${id} timed out.`);
      }
    }
    return swept;
  }

  public getPendingRequests(): ApprovalRequest[] {
    this.sweepExpired();
    return Array.from(this.pendingRequests.values()).filter((r) => r.status === 'pending');
  }

  public getRequest(id: string): ApprovalRequest | undefined {
    this.sweepExpired();
    return this.pendingRequests.get(id);
  }

  private auditLogEvent(
    actionType: AuditEntry['actionType'],
    toolName: string,
    riskLevel: RiskLevel,
    parameters: Record<string, unknown>,
    outcome: AuditEntry['outcome'],
    details: string
  ): void {
    if (this.auditLogger) {
      this.auditLogger.log({
        actionType,
        toolName,
        riskLevel,
        parameters: SecretRedactor.sanitizeObject(parameters),
        outcome,
        details,
      });
    }
  }
}
