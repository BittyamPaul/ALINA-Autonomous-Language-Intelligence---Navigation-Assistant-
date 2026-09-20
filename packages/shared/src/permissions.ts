import { z } from 'zod';
import crypto from 'node:crypto';

// =========================================================================
// 1. Canonical 3-Tier Risk Level
// =========================================================================
export const CanonicalRiskLevelSchema = z.enum([
  'SAFE',
  'APPROVAL_REQUIRED',
  'HIGH_RISK',
]);
export type CanonicalRiskLevel = z.infer<typeof CanonicalRiskLevelSchema>;

// Permissive enum for backward compatibility with existing schemas and tools
export const RiskLevelSchema = z.enum([
  'SAFE',
  'APPROVAL_REQUIRED',
  'HIGH_RISK',
  'READ_ONLY',
  'LOW',
  'MEDIUM',
  'HIGH_DESTRUCTIVE',
  'REQUIRES_APPROVAL',
]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Normalizes any legacy or external risk level string into the canonical 3-tier model:
 * SAFE | APPROVAL_REQUIRED | HIGH_RISK.
 * Always fails closed to HIGH_RISK on unknown or missing inputs.
 */
export function normalizeRiskLevel(raw: unknown): CanonicalRiskLevel {
  if (typeof raw !== 'string') return 'HIGH_RISK';
  const upper = raw.toUpperCase().trim();
  switch (upper) {
    case 'SAFE':
    case 'READ_ONLY':
      return 'SAFE';
    case 'APPROVAL_REQUIRED':
    case 'REQUIRES_APPROVAL':
    case 'LOW':
    case 'MEDIUM':
      return 'APPROVAL_REQUIRED';
    case 'HIGH_RISK':
    case 'HIGH_DESTRUCTIVE':
      return 'HIGH_RISK';
    default:
      return 'HIGH_RISK'; // Fail-closed default
  }
}

// =========================================================================
// 2. Secret Redaction Utilities
// =========================================================================

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /private_?key/i,
  /authorization/i,
  /credential/i,
  /auth_?header/i,
];

export class SecretRedactor {
  public static redactString(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_SECRET]');
    sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED_SECRET]');
    sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{30,}/g, '[REDACTED_SECRET]');
    sanitized = sanitized.replace(
      /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      '[REDACTED_SECRET]'
    );
    sanitized = sanitized.replace(
      /(password|pass|secret|token|api_?key|private_?key)(\s*[:= ]\s*)([^\s,;!]+)/gi,
      '$1$2[REDACTED_SECRET]'
    );
    return sanitized;
  }

  public static sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return this.redactString(obj) as unknown as T;
    }
    if (typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item)) as unknown as T;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.redactString(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized as T;
  }
}

// =========================================================================
// 3. Approval Status & Models
// =========================================================================
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
  // Backward compatibility uppercase
  'PENDING',
  'APPROVED',
  'REJECTED',
  'AUTO_APPROVED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  action: z.string().min(1),
  target: z.string().min(1),
  source: z.string().optional(),
  reason: z.string().min(1),
  tool: z.string().min(1),
  riskLevel: CanonicalRiskLevelSchema,
  timestamp: z.string().datetime(),
  parametersSummary: z.string(),
  parameters: z.record(z.unknown()).default({}),
  diffPreview: z.string().optional(),
  expiresAt: z.string().datetime(),
  status: ApprovalStatusSchema.default('pending'),
  // Optional task linkage
  taskId: z.string().optional(),
  stepId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  impactSummary: z.string().optional(),
  requestedAt: z.string().optional(),
  toolName: z.string().optional(),
  // Resolution metadata
  decisionBy: z.string().optional(),
  decisionAt: z.string().datetime().optional(),
  denialReason: z.string().optional(),
  grantToken: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalDecisionSchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  reviewerNote: z.string().optional(),
  modifiedParameters: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// =========================================================================
// 4. Single-Use Cryptographic Authorization Grant
// =========================================================================
export const AuthorizationGrantSchema = z.object({
  grantId: z.string().uuid(),
  approvalRequestId: z.string(),
  toolName: z.string(),
  parameterHash: z.string(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  consumed: z.boolean().default(false),
  consumedAt: z.string().datetime().optional(),
});
export type AuthorizationGrant = z.infer<typeof AuthorizationGrantSchema>;

/**
 * Computes a deterministic SHA-256 hash of a tool's parameters.
 * Used to verify that approved parameters have not been tampered with before execution.
 */
export function computeParameterHash(params: unknown): string {
  if (params === undefined || params === null) {
    return crypto.createHash('sha256').update('{}').digest('hex');
  }
  // Canonical sorted JSON stringification
  const canonicalString = JSON.stringify(params, Object.keys(params as object).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
