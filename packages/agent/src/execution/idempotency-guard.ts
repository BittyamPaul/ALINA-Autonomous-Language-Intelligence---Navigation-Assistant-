import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { PathJail, PostCondition } from '@alina/shared';
import { VerificationEngine } from '../verification';

export interface IdempotencyCheckResult {
  satisfied: boolean;
  reason: string;
  isSideEffecting: boolean;
  details?: Record<string, unknown>;
}

/**
 * IdempotencyGuard
 * 
 * Enforces ALINA's resilience invariant:
 * "Never blindly repeat a side-effecting action.
 *  Before retrying a potentially side-effecting action, verify whether it already succeeded.
 *  Implement idempotency where possible."
 */
export class IdempotencyGuard {
  private static readonly SIDE_EFFECTING_TOOLS = new Set([
    'fs_write_file',
    'fs_delete_file',
    'fs_move_file',
    'fs_copy_file',
    'fs_create_directory',
    'fs_append_file',
    'computer_launch_app',
    'computer_press_key',
    'computer_mouse_click',
    'browser_click',
    'browser_type',
    'browser_submit',
    'terminal_execute',
    'shell_execute',
  ]);

  /**
   * Determines whether an action is side-effecting.
   */
  public static isSideEffecting(toolName: string): boolean {
    const cleanName = toolName.toLowerCase().trim();
    if (this.SIDE_EFFECTING_TOOLS.has(cleanName)) return true;
    if (cleanName.includes('write') || cleanName.includes('delete') || cleanName.includes('copy') || cleanName.includes('move')) {
      return true;
    }
    return false;
  }

  /**
   * Generates a deterministic hash of tool parameters.
   */
  public static computeParametersHash(parameters: Record<string, unknown>): string {
    const sorted = Object.keys(parameters)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = parameters[key];
        return acc;
      }, {});
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
  }

  /**
   * Checks whether the side-effecting action has ALREADY been completed in the environment.
   */
  public static async verifyPostConditionAlreadyMet(
    options: {
      toolName: string;
      parameters: Record<string, unknown>;
      postConditions?: PostCondition[];
      jail: PathJail;
    }
  ): Promise<IdempotencyCheckResult> {
    const { toolName, parameters, postConditions, jail } = options;
    const isSide = this.isSideEffecting(toolName);

    // If explicit post-conditions exist, test each one
    if (postConditions && postConditions.length > 0) {
      for (const pc of postConditions) {
        const verifyRes = await VerificationEngine.verifyPostCondition(pc, undefined, jail);
        if (!verifyRes.passed) {
          return {
            satisfied: false,
            reason: `Post-condition check failed: ${verifyRes.reason ?? 'Condition not met'}`,
            isSideEffecting: isSide,
          };
        }
      }
      return {
        satisfied: true,
        reason: `All ${postConditions.length} post-condition(s) were already satisfied in the environment prior to execution.`,
        isSideEffecting: isSide,
      };
    }

    // Heuristic verification for common side-effecting file operations
    switch (toolName) {
      case 'fs_copy_file': {
        const sourcePath = String(parameters.source ?? parameters.src ?? parameters.from ?? '');
        const destPath = String(parameters.destination ?? parameters.dest ?? parameters.to ?? '');

        if (!destPath) {
          return { satisfied: false, reason: 'Destination path not specified', isSideEffecting: isSide };
        }

        const destCheck = jail.isPathAllowed(destPath);
        if (!destCheck.allowed || !destCheck.canonicalPath) {
          return { satisfied: false, reason: `Destination path outside jail: ${destCheck.reason}`, isSideEffecting: isSide };
        }

        try {
          const destStat = await fs.stat(destCheck.canonicalPath);
          if (destStat.isFile()) {
            if (sourcePath) {
              const srcCheck = jail.isPathAllowed(sourcePath);
              if (srcCheck.allowed && srcCheck.canonicalPath) {
                try {
                  const srcStat = await fs.stat(srcCheck.canonicalPath);
                  if (srcStat.size === destStat.size) {
                    return {
                      satisfied: true,
                      reason: `Destination file "${destPath}" already exists and matches source file size (${destStat.size} bytes).`,
                      isSideEffecting: isSide,
                      details: { destSize: destStat.size, srcSize: srcStat.size },
                    };
                  }
                } catch {
                  // Source stat error, rely on destination presence
                }
              }
            }
            return {
              satisfied: true,
              reason: `Destination file "${destPath}" already exists on disk.`,
              isSideEffecting: isSide,
              details: { destSize: destStat.size },
            };
          }
        } catch {
          return { satisfied: false, reason: `Destination file "${destPath}" does not exist yet.`, isSideEffecting: isSide };
        }
        break;
      }

      case 'fs_write_file': {
        const filePath = String(parameters.path ?? parameters.filePath ?? '');
        const expectedContent = parameters.content !== undefined ? String(parameters.content) : undefined;

        if (!filePath) {
          return { satisfied: false, reason: 'Target path not specified', isSideEffecting: isSide };
        }

        const fileCheck = jail.isPathAllowed(filePath);
        if (!fileCheck.allowed || !fileCheck.canonicalPath) {
          return { satisfied: false, reason: `Target path outside jail: ${fileCheck.reason}`, isSideEffecting: isSide };
        }

        try {
          const content = await fs.readFile(fileCheck.canonicalPath, 'utf8');
          if (expectedContent !== undefined) {
            if (content === expectedContent) {
              return {
                satisfied: true,
                reason: `Target file "${filePath}" already exists and matches expected content exactly.`,
                isSideEffecting: isSide,
              };
            } else {
              return {
                satisfied: false,
                reason: `Target file "${filePath}" exists but content does not match expected output.`,
                isSideEffecting: isSide,
              };
            }
          }
          return {
            satisfied: true,
            reason: `Target file "${filePath}" already exists.`,
            isSideEffecting: isSide,
          };
        } catch {
          return { satisfied: false, reason: `Target file "${filePath}" does not exist yet.`, isSideEffecting: isSide };
        }
      }

      case 'fs_create_directory': {
        const dirPath = String(parameters.path ?? parameters.dirPath ?? '');
        if (!dirPath) {
          return { satisfied: false, reason: 'Directory path not specified', isSideEffecting: isSide };
        }

        const dirCheck = jail.isPathAllowed(dirPath);
        if (!dirCheck.allowed || !dirCheck.canonicalPath) {
          return { satisfied: false, reason: `Directory path outside jail: ${dirCheck.reason}`, isSideEffecting: isSide };
        }

        try {
          const stat = await fs.stat(dirCheck.canonicalPath);
          if (stat.isDirectory()) {
            return {
              satisfied: true,
              reason: `Target directory "${dirPath}" already exists.`,
              isSideEffecting: isSide,
            };
          }
        } catch {
          return { satisfied: false, reason: `Target directory "${dirPath}" does not exist yet.`, isSideEffecting: isSide };
        }
        break;
      }

      default:
        break;
    }

    return {
      satisfied: false,
      reason: 'No prior environmental state satisfaction detected; fresh execution required.',
      isSideEffecting: isSide,
    };
  }
}
