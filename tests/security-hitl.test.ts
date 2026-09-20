import { describe, it, expect, beforeEach } from 'vitest';
import {
  RiskLevel,
  normalizeRiskLevel,
  AuditLogger,
} from '../packages/shared/src';
import {
  AuthorizationManager,
  AlinaSupervisorAgent,
} from '../packages/agent/src';
import { AlinaMcpToolRegistry } from '../packages/mcp/src';
import { createAlinaMcpToolRegistry } from '../packages/tools/src';

describe('ALINA Security & Human-In-The-Loop Authorization Architecture', () => {
  let authManager: AuthorizationManager;
  let auditLogger: AuditLogger;
  let mcpRegistry: AlinaMcpToolRegistry;

  beforeEach(() => {
    auditLogger = new AuditLogger();
    mcpRegistry = createAlinaMcpToolRegistry();

    authManager = new AuthorizationManager({
      auditLogger,
      metadataProvider: {
        getToolRisk: (name) => {
          const tool = mcpRegistry.get(name);
          return tool ? (tool.permission as RiskLevel) : 'HIGH_RISK';
        },
        hasTool: (name) => mcpRegistry.has(name),
      },
    });
  });

  // =========================================================================
  // 1. Centralized Risk Level Classification
  // =========================================================================
  describe('1. Centralized Risk Level Classification', () => {
    it('declares SAFE for read-only tools', () => {
      expect(authManager.evaluateRisk('list_directory')).toBe('SAFE');
      expect(authManager.evaluateRisk('read_text_file')).toBe('SAFE');
      expect(authManager.evaluateRisk('get_system_info')).toBe('SAFE');
      expect(authManager.evaluateRisk('search_files')).toBe('SAFE');
    });

    it('declares APPROVAL_REQUIRED for mutating filesystem and native tools', () => {
      expect(authManager.evaluateRisk('create_file')).toBe('APPROVAL_REQUIRED');
      expect(authManager.evaluateRisk('move_file')).toBe('APPROVAL_REQUIRED');
      expect(authManager.evaluateRisk('copy_file')).toBe('APPROVAL_REQUIRED');
      expect(authManager.evaluateRisk('rename_file')).toBe('APPROVAL_REQUIRED');
      expect(authManager.evaluateRisk('computer_launch_app')).toBe('APPROVAL_REQUIRED');
      expect(authManager.evaluateRisk('computer_capture_screenshot')).toBe('APPROVAL_REQUIRED');
    });

    it('declares HIGH_RISK for destructive operations', () => {
      expect(authManager.evaluateRisk('delete_file')).toBe('HIGH_RISK');
    });

    it('fails closed to HIGH_RISK for unknown or malicious tools', () => {
      expect(authManager.evaluateRisk('arbitrary_malicious_tool')).toBe('HIGH_RISK');
      expect(authManager.evaluateRisk('')).toBe('HIGH_RISK');
      expect(authManager.evaluateRisk(null as any)).toBe('HIGH_RISK');
    });

    it('normalizes legacy risk tiers accurately', () => {
      expect(normalizeRiskLevel('READ_ONLY')).toBe('SAFE');
      expect(normalizeRiskLevel('SAFE')).toBe('SAFE');
      expect(normalizeRiskLevel('REQUIRES_APPROVAL')).toBe('APPROVAL_REQUIRED');
      expect(normalizeRiskLevel('MEDIUM')).toBe('APPROVAL_REQUIRED');
      expect(normalizeRiskLevel('LOW')).toBe('APPROVAL_REQUIRED');
      expect(normalizeRiskLevel('HIGH_DESTRUCTIVE')).toBe('HIGH_RISK');
      expect(normalizeRiskLevel('HIGH_RISK')).toBe('HIGH_RISK');
      expect(normalizeRiskLevel('unknown_tier')).toBe('HIGH_RISK'); // fails closed
    });
  });

  // =========================================================================
  // 2. Fail-Closed Security & Bypass Rejection
  // =========================================================================
  describe('2. Fail-Closed Security & Bypass Rejection', () => {
    it('auto-authorizes SAFE tools without approval tokens', async () => {
      const result = await authManager.authorize('list_directory', { path: '.' });
      expect(result.authorized).toBe(true);
      expect(result.riskLevel).toBe('SAFE');
      expect(result.requiresApproval).toBe(false);
    });

    it('blocks APPROVAL_REQUIRED and HIGH_RISK tools when no grant token is provided', async () => {
      const moveResult = await authManager.authorize('move_file', {
        sourcePath: 'Downloads/report.pdf',
        destinationPath: 'Documents/Projects/report.pdf',
      });
      expect(moveResult.authorized).toBe(false);
      expect(moveResult.requiresApproval).toBe(true);
      expect(moveResult.riskLevel).toBe('APPROVAL_REQUIRED');

      const deleteResult = await authManager.authorize('delete_file', { path: 'important.db' });
      expect(deleteResult.authorized).toBe(false);
      expect(deleteResult.requiresApproval).toBe(true);
      expect(deleteResult.riskLevel).toBe('HIGH_RISK');
    });

    it('strictly rejects forged, fake, or non-existent grant tokens', () => {
      expect(() => {
        authManager.validateAndConsumeGrant('move_file', { path: 'file.txt' }, 'forged_fake_token_123');
      }).toThrow(/Invalid authorization grant token/);

      // Verify security violation audit log was recorded
      const recentLogs = auditLogger.getRecent();
      expect(recentLogs.some((l) => l.actionType === 'security_violation' && l.details.includes('Invalid or forged'))).toBe(true);
    });

    it('strictly blocks tool execution if grant was issued for a different tool (tool mismatch)', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'copy_file',
        parameters: { sourcePath: 'a.txt', destinationPath: 'b.txt' },
      });
      const { grant } = await authManager.approve(req.id);

      expect(() => {
        authManager.validateAndConsumeGrant('delete_file', { path: 'b.txt' }, grant.grantId);
      }).toThrow(/issued for tool "copy_file", not "delete_file"/);
    });
  });

  // =========================================================================
  // 3. Approval Request Structure & Secret Hygiene
  // =========================================================================
  describe('3. Approval Request Structure & Secret Hygiene', () => {
    it('generates structured approval request containing action, target, source, reason, tool, and summary', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'move_file',
        parameters: {
          sourcePath: 'Downloads/report.pdf',
          destinationPath: 'Documents/Projects/report.pdf',
          overwrite: false,
        },
        reason: 'Move monthly PDF report to project archive folder.',
      });

      expect(req.id).toMatch(/^app_/);
      expect(req.action).toBe('move');
      expect(req.source).toBe('Downloads/report.pdf');
      expect(req.target).toBe('Documents/Projects/report.pdf');
      expect(req.tool).toBe('move_file');
      expect(req.riskLevel).toBe('APPROVAL_REQUIRED');
      expect(req.parametersSummary).toContain('Move "Downloads/report.pdf" to "Documents/Projects/report.pdf"');
      expect(req.reason).toBe('Move monthly PDF report to project archive folder.');
      expect(req.status).toBe('pending');
      expect(new Date(req.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('strictly redacts sensitive credentials, API keys, passwords, and tokens from approval requests', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'create_file',
        parameters: {
          path: 'config.json',
          apiKey: 'sk-abcdef12345678901234567890',
          token: 'Bearer sensitive_bearer_token_123456',
          password: 'superSecretPassword!',
          safeField: 'harmless_configuration_value',
        },
        reason: 'Store deployment config with apiKey sk-abcdef12345678901234567890 and password superSecretPassword!',
      });

      // Parameters must have secret values replaced
      expect(req.parameters.apiKey).toBe('[REDACTED_SECRET]');
      expect(req.parameters.token).toBe('[REDACTED_SECRET]');
      expect(req.parameters.password).toBe('[REDACTED_SECRET]');
      expect(req.parameters.safeField).toBe('harmless_configuration_value');

      // Reason must have secrets scrubbed
      expect(req.reason).not.toContain('sk-abcdef12345678901234567890');
      expect(req.reason).not.toContain('superSecretPassword!');
      expect(req.reason).toContain('[REDACTED_SECRET]');
    });
  });

  // =========================================================================
  // 4. Single-Use Grants, Replay Protection, and Parameter Tampering
  // =========================================================================
  describe('4. Single-Use Grants, Replay Protection, and Parameter Tampering', () => {
    it('mints a single-use AuthorizationGrant upon approval and executes once', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'move_file',
        parameters: {
          sourcePath: 'Downloads/report.pdf',
          destinationPath: 'Documents/Projects/report.pdf',
        },
      });

      const { grant } = await authManager.approve(req.id, 'lead_operator');
      expect(grant.grantId).toBeDefined();
      expect(grant.consumed).toBe(false);

      // First consumption succeeds
      const verification = authManager.validateAndConsumeGrant('move_file', {
        sourcePath: 'Downloads/report.pdf',
        destinationPath: 'Documents/Projects/report.pdf',
      }, grant.grantId);

      expect(verification.valid).toBe(true);
      expect(grant.consumed).toBe(true);
    });

    it('strictly blocks replay attacks when an agent attempts to reuse a consumed grant', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'create_file',
        parameters: { path: 'build.lock', content: 'locked' },
      });
      const { grant } = await authManager.approve(req.id);

      // Consume once
      authManager.validateAndConsumeGrant('create_file', { path: 'build.lock', content: 'locked' }, grant.grantId);

      // Attempt second consumption (replay attack)
      expect(() => {
        authManager.validateAndConsumeGrant('create_file', { path: 'build.lock', content: 'locked' }, grant.grantId);
      }).toThrow(/Replay attack.*has already been consumed/i);

      const logs = auditLogger.getRecent();
      expect(logs.some((l) => l.actionType === 'security_violation' && l.details.includes('Replay attack detected'))).toBe(true);
    });

    it('detects and blocks parameter tampering when execution parameters differ from approved parameters', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'move_file',
        parameters: {
          sourcePath: 'Downloads/report.pdf',
          destinationPath: 'Documents/Projects/report.pdf',
        },
      });
      const { grant } = await authManager.approve(req.id);

      // Tamper with destination parameter to point to a system location
      expect(() => {
        authManager.validateAndConsumeGrant('move_file', {
          sourcePath: 'Downloads/report.pdf',
          destinationPath: 'C:\\Windows\\System32\\malicious.dll', // Tampered!
        }, grant.grantId);
      }).toThrow(/Parameter Tampering/);
    });
  });

  // =========================================================================
  // 5. Expiration, Cancellation, and Denied Action Handling
  // =========================================================================
  describe('5. Expiration, Cancellation, and Denied Action Handling', () => {
    it('fails closed when an approval request has expired', async () => {
      // Create request with 1ms TTL
      const req = await authManager.createApprovalRequest({
        toolName: 'delete_file',
        parameters: { path: 'temp.log' },
        timeoutMs: 1,
      });

      // Wait 15ms for expiration
      await new Promise((resolve) => setTimeout(resolve, 15));

      // Attempting to approve an expired request fails closed
      await expect(authManager.approve(req.id)).rejects.toThrow(/has expired/);

      const updated = authManager.getRequest(req.id);
      expect(updated?.status).toBe('expired');
    });

    it('cancels pending approval cleanly and prevents execution', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'computer_launch_app',
        parameters: { app: 'notepad' },
      });

      const cancelled = await authManager.cancel(req.id, 'Operator aborted workflow');
      expect(cancelled.status).toBe('cancelled');

      // Cannot approve a cancelled request
      await expect(authManager.approve(req.id)).rejects.toThrow(/already cancelled/);
    });

    it('handles denied action cleanly and enforces repeated-action protection cooldown', async () => {
      const req = await authManager.createApprovalRequest({
        toolName: 'move_file',
        parameters: { sourcePath: 'A.txt', destinationPath: 'B.txt' },
      });

      const denied = await authManager.reject(req.id, 'Access forbidden by compliance policy.');
      expect(denied.status).toBe('rejected');
      expect(denied.denialReason).toContain('compliance policy');

      // If an agent tries to immediately re-request the exact same action, cooldown blocks it
      await expect(
        authManager.createApprovalRequest({
          toolName: 'move_file',
          parameters: { sourcePath: 'A.txt', destinationPath: 'B.txt' },
        })
      ).rejects.toThrow(/Repeated action protection/);
    });
  });

  // =========================================================================
  // 6. Supervisor Agent Human-In-The-Loop Integration
  // =========================================================================
  describe('6. Supervisor Agent Human-In-The-Loop Integration', () => {
    it('pauses execution on approval-required tools, creates approval request, and transitions to waiting_for_approval', async () => {
      const mockModel = {
        generate: async () => ({
          text: 'Planning to relocate file to project archive.',
          toolCalls: [
            {
              toolName: 'move_file',
              parameters: {
                sourcePath: 'Downloads/report.pdf',
                destinationPath: 'Documents/Projects/report.pdf',
              },
            },
          ],
        }),
      };

      const agent = new AlinaSupervisorAgent({
        mcpRegistry,
        modelAdapter: mockModel as any,
        authorizationManager: authManager,
      });

      const result = await agent.execute({
        goal: 'Move monthly report to projects archive',
      });

      expect(result.status).toBe('waiting_for_approval');
      expect(result.resultSummary).toContain('Execution paused awaiting approval');
      expect(result.approvalRequest).toBeDefined();
      expect(result.approvalRequest?.action).toBe('move');
      expect(result.approvalRequest?.source).toBe('Downloads/report.pdf');
      expect(result.approvalRequest?.target).toBe('Documents/Projects/report.pdf');
    });

    it('resumes and executes cleanly when supplied with valid single-use grant token', async () => {
      // First, create and approve request
      const req = await authManager.createApprovalRequest({
        toolName: 'move_file',
        parameters: {
          sourcePath: 'test_a.txt',
          destinationPath: 'test_b.txt',
        },
      });
      const { grant } = await authManager.approve(req.id);

      const mockModel = {
        generate: async () => ({
          text: 'Relocating file with granted authorization.',
          toolCalls: [
            {
              toolName: 'move_file',
              parameters: {
                sourcePath: 'test_a.txt',
                destinationPath: 'test_b.txt',
              },
            },
          ],
        }),
      };

      const agent = new AlinaSupervisorAgent({
        mcpRegistry,
        modelAdapter: mockModel as any,
        authorizationManager: authManager,
      });

      // Pass the authorized grantToken
      const result = await agent.execute({
        goal: 'Move file with approval',
        grantToken: grant.grantId,
        authorizationGrant: grant,
        isApprovalGranted: true,
      });

      // Execution moves past waiting_for_approval and completes or executes step
      expect(result.status).not.toBe('waiting_for_approval');
    });
  });
});
