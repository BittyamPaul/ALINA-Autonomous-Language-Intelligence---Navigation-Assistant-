import fs from 'node:fs/promises';
import { PostCondition, PlanStep, PathJail } from '@alina/shared';

export interface VerificationResult {
  passed: boolean;
  reason?: string;
  actual?: unknown;
}

export interface RecoveryStrategy {
  canRecover: boolean;
  strategy: string;
  suggestedAction?: string;
  modifiedParameters?: Record<string, unknown>;
}

export class VerificationEngine {
  public static async verifyPostCondition(
    postCondition: PostCondition,
    stepResult: unknown,
    jail: PathJail
  ): Promise<VerificationResult> {
    switch (postCondition.type) {
      case 'file_exists': {
        const check = jail.isPathAllowed(postCondition.target);
        if (!check.allowed || !check.canonicalPath) {
          return {
            passed: false,
            reason: `Target path outside jail: ${check.reason}`,
          };
        }

        try {
          await fs.access(check.canonicalPath);
          return { passed: true };
        } catch {
          return {
            passed: false,
            reason: `Expected file does not exist at ${check.canonicalPath}`,
          };
        }
      }

      case 'file_contains': {
        const check = jail.isPathAllowed(postCondition.target);
        if (!check.allowed || !check.canonicalPath) {
          return {
            passed: false,
            reason: `Target path outside jail: ${check.reason}`,
          };
        }

        try {
          const content = await fs.readFile(check.canonicalPath, 'utf8');
          const expected = String(postCondition.expected ?? '');
          if (content.includes(expected)) {
            return { passed: true };
          }
          return {
            passed: false,
            reason: `File ${check.canonicalPath} does not contain expected substring "${expected}"`,
            actual: content.slice(0, 200),
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            passed: false,
            reason: `Failed to read target file: ${msg}`,
          };
        }
      }

      case 'command_exit_code': {
        const expectedCode = Number(postCondition.expected ?? 0);
        const actualCode =
          typeof stepResult === 'object' && stepResult !== null && 'exitCode' in stepResult
            ? (stepResult as { exitCode: number }).exitCode
            : undefined;
        if (actualCode === expectedCode) {
          return { passed: true };
        }
        return {
          passed: false,
          reason: `Command exited with code ${actualCode} (expected ${expectedCode})`,
          actual: stepResult,
        };
      }

      case 'custom_assert': {
        const passed = Boolean(stepResult);
        return {
          passed,
          reason: passed ? undefined : postCondition.description,
          actual: stepResult,
        };
      }

      default:
        return { passed: true };
    }
  }

  public static formulateRecoveryStrategy(
    step: PlanStep,
    failureReason: string,
    maxRetries = 3
  ): RecoveryStrategy {
    if (step.retryCount >= maxRetries) {
      return {
        canRecover: false,
        strategy: `Max retries (${maxRetries}) exceeded. Escalating to user.`,
      };
    }

    if (failureReason.includes('does not exist')) {
      return {
        canRecover: true,
        strategy: 'Attempt directory creation and path normalization before retrying file operation',
        suggestedAction: 'recreate_path_and_retry',
      };
    }

    if (failureReason.includes('timed out')) {
      const currentTimeout = Number((step.parameters as { timeoutMs?: number })?.timeoutMs ?? 30000);
      return {
        canRecover: true,
        strategy: `Exponential backoff: increase timeout from ${currentTimeout}ms to ${currentTimeout * 2}ms`,
        modifiedParameters: {
          ...step.parameters,
          timeoutMs: currentTimeout * 2,
        },
      };
    }

    return {
      canRecover: true,
      strategy: `Retry step ${step.title} with refreshed context (Attempt ${step.retryCount + 1}/${maxRetries})`,
    };
  }
}
