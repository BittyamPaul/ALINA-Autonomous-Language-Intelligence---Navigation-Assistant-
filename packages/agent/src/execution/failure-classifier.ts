import {
  FailureKind,
  FailureClassification,
} from '@alina/shared';

export interface ClassificationContext {
  toolName?: string;
  isOnline?: boolean;
  isApprovalDenied?: boolean;
  isJailViolation?: boolean;
  attempt?: number;
  maxAttempts?: number;
}

/**
 * FailureClassifier
 * 
 * Classifies runtime exceptions, tool errors, and process exit codes into
 * ALINA's 6 canonical failure kinds:
 * - TRANSIENT
 * - PERMANENT
 * - USER_ACTION_REQUIRED
 * - PERMISSION_REQUIRED
 * - NETWORK_REQUIRED
 * - UNKNOWN
 */
export class FailureClassifier {
  public static classify(error: unknown, context?: ClassificationContext): FailureClassification {
    const errorMsg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const errorName = error instanceof Error ? error.name : '';
    const lowerMsg = errorMsg.toLowerCase();

    // 1. NETWORK_REQUIRED
    if (
      context?.isOnline === false ||
      lowerMsg.includes('offline') ||
      lowerMsg.includes('enotfound') ||
      lowerMsg.includes('eai_again') ||
      lowerMsg.includes('network unreachable') ||
      lowerMsg.includes('fetch failed') ||
      lowerMsg.includes('no internet') ||
      lowerMsg.includes('dns lookup failed') ||
      lowerMsg.includes('internet connection')
    ) {
      return {
        kind: 'NETWORK_REQUIRED',
        reason: `Network connectivity is unavailable: ${errorMsg}`,
        retryable: true,
        suggestedRecovery: 'PAUSE_FOR_NETWORK',
        details: { originalError: errorMsg },
      };
    }

    // 2. PERMISSION_REQUIRED
    if (
      context?.isApprovalDenied ||
      context?.isJailViolation ||
      lowerMsg.includes('pathjail') ||
      lowerMsg.includes('outside jail') ||
      lowerMsg.includes('permission denied') ||
      lowerMsg.includes('eacces') ||
      lowerMsg.includes('eperm') ||
      lowerMsg.includes('forbidden') ||
      lowerMsg.includes('unauthorized') ||
      lowerMsg.includes('operator approval required') ||
      lowerMsg.includes('rule 1')
    ) {
      return {
        kind: 'PERMISSION_REQUIRED',
        reason: `Action blocked by safety policy or operating system permissions: ${errorMsg}`,
        retryable: false,
        suggestedRecovery: 'PAUSE_FOR_APPROVAL',
        details: { originalError: errorMsg },
      };
    }

    // 3. USER_ACTION_REQUIRED
    if (
      lowerMsg.includes('ambiguous') ||
      lowerMsg.includes('user confirmation required') ||
      lowerMsg.includes('missing credentials') ||
      lowerMsg.includes('human decision') ||
      lowerMsg.includes('checkpoint corrupted') ||
      lowerMsg.includes('operator intervention') ||
      lowerMsg.includes('manual step')
    ) {
      return {
        kind: 'USER_ACTION_REQUIRED',
        reason: `Task requires human decision or credentials: ${errorMsg}`,
        retryable: false,
        suggestedRecovery: 'ESCALATE_TO_USER',
        details: { originalError: errorMsg },
      };
    }

    // 4. TRANSIENT
    if (
      lowerMsg.includes('timeout') ||
      lowerMsg.includes('timed out') ||
      lowerMsg.includes('etimedout') ||
      lowerMsg.includes('econnreset') ||
      lowerMsg.includes('socket hang up') ||
      lowerMsg.includes('too many requests') ||
      lowerMsg.includes('429') ||
      lowerMsg.includes('503') ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('etxtbsy') ||
      lowerMsg.includes('busy') ||
      lowerMsg.includes('locked') ||
      lowerMsg.includes('temporary failure') ||
      errorName === 'TimeoutError'
    ) {
      const isRetriesExhausted =
        context?.attempt !== undefined &&
        context?.maxAttempts !== undefined &&
        context.attempt >= context.maxAttempts;

      return {
        kind: 'TRANSIENT',
        reason: `Transient operational error: ${errorMsg}`,
        retryable: !isRetriesExhausted,
        suggestedRecovery: isRetriesExhausted ? 'ESCALATE_TO_USER' : 'AUTO_RETRY',
        details: { originalError: errorMsg, attempt: context?.attempt },
      };
    }

    // 5. PERMANENT
    if (
      lowerMsg.includes('syntax error') ||
      lowerMsg.includes('invalid tool') ||
      lowerMsg.includes('is not registered') ||
      lowerMsg.includes('schema validation') ||
      lowerMsg.includes('zoderror') ||
      lowerMsg.includes('not a directory') ||
      lowerMsg.includes('enoent') ||
      lowerMsg.includes('404 not found') ||
      lowerMsg.includes('unsupported operation') ||
      lowerMsg.includes('illegal argument')
    ) {
      return {
        kind: 'PERMANENT',
        reason: `Deterministic permanent failure: ${errorMsg}`,
        retryable: false,
        suggestedRecovery: 'FAIL_FAST',
        details: { originalError: errorMsg },
      };
    }

    // 6. UNKNOWN
    return {
      kind: 'UNKNOWN',
      reason: `Unclassified execution error: ${errorMsg}`,
      retryable: context?.attempt ? context.attempt < (context.maxAttempts ?? 3) : true,
      suggestedRecovery: 'AUTO_RETRY',
      details: { originalError: errorMsg },
    };
  }

  public static isRetryable(kind: FailureKind): boolean {
    return kind === 'TRANSIENT' || kind === 'NETWORK_REQUIRED';
  }
}
