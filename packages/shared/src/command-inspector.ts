import { RiskLevel } from './permissions';

export interface CommandInspectionResult {
  isPermitted: boolean;
  riskLevel: RiskLevel;
  reason: string;
  sanitizedTokens?: string[];
}

export class CommandInspector {
  private static readonly DESTRUCTIVE_PATTERNS = [
    /\b(rm\s+-rf\s+[\/\\])/i,
    /\b(del\s+\/[sfq]\s+c:)/i,
    /\b(format\s+[a-z]:)/i,
    /\b(dd\s+if=)/i,
    /\b(mkfs(\.[a-z0-9]+)?)\b/i,
    /\b(shutdown(\.exe)?)\b/i,
    /\b(reg\s+delete)\b/i,
    /\b(diskpart)\b/i,
    /\b(drop\s+database)\b/i,
    /:(){ :|:& };:/,
  ];

  /**
   * Shell metacharacters indicating command chaining, redirection, piping, or subshells.
   * Any command containing these must never evaluate to READ_ONLY.
   */
  private static readonly SHELL_CHAINING_PATTERNS = /[&|;`$<>(\n\r]/;

  private static readonly READ_ONLY_COMMANDS = new Set([
    'git status',
    'git log',
    'git diff',
    'git branch',
    'node -v',
    'npm -v',
    'pnpm -v',
    'cargo -v',
    'rustc -v',
    'python --version',
    'dir',
    'ls',
    'pwd',
    'whoami',
  ]);

  public static inspect(commandLine: string): CommandInspectionResult {
    const trimmed = commandLine.trim();
    if (!trimmed) {
      return {
        isPermitted: false,
        riskLevel: 'HIGH_DESTRUCTIVE',
        reason: 'Command cannot be empty',
      };
    }

    // 1. Check for catastrophic destructive patterns
    for (const pattern of CommandInspector.DESTRUCTIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          isPermitted: false,
          riskLevel: 'HIGH_DESTRUCTIVE',
          reason: `Command matches critical destructive signature: ${pattern.source}`,
        };
      }
    }

    // 2. Check for shell chaining, piping, redirection, or subshells
    if (CommandInspector.SHELL_CHAINING_PATTERNS.test(trimmed)) {
      return {
        isPermitted: true,
        riskLevel: 'HIGH_DESTRUCTIVE',
        reason: 'Compound shell command containing chaining, redirection, or piping requires explicit operator approval',
      };
    }

    // 3. Exact or prefix match for read-only benign queries (only if single command without chaining)
    for (const ro of CommandInspector.READ_ONLY_COMMANDS) {
      if (trimmed === ro || trimmed.startsWith(ro + ' ')) {
        return {
          isPermitted: true,
          riskLevel: 'READ_ONLY',
          reason: 'Standard read-only query command',
        };
      }
    }

    // 3. Destructive git flags
    if (/\bgit\s+(push\s+--force|reset\s+--hard|clean\s+-fdx)\b/i.test(trimmed)) {
      return {
        isPermitted: true,
        riskLevel: 'HIGH_DESTRUCTIVE',
        reason: 'Destructive git modification requires explicit user approval',
      };
    }

    // 4. Standard dev commands (package install, build, test)
    if (/^(pnpm|npm|yarn|cargo|npx)\s+(install|add|build|test|run|compile)/i.test(trimmed)) {
      return {
        isPermitted: true,
        riskLevel: 'MEDIUM',
        reason: 'Workspace build/package management command',
      };
    }

    // Default for general shell execution
    return {
      isPermitted: true,
      riskLevel: 'HIGH_DESTRUCTIVE',
      reason: 'General shell execution requires explicit confirmation',
    };
  }
}
