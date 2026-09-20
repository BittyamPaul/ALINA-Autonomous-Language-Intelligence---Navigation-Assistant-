import path from 'node:path';
import fs from 'node:fs';
import { SecuritySandboxError } from './errors';

export interface PathJailConfig {
  allowedRoots: string[];
  deniedPatterns?: Array<RegExp | string>;
  maxReadSizeBytes?: number;
  maxWriteSizeBytes?: number;
}

export class PathJail {
  private allowedRoots: string[] = [];
  private customDeniedPatterns: RegExp[] = [];
  public readonly maxReadSizeBytes: number;
  public readonly maxWriteSizeBytes: number;

  private static readonly SYSTEM_DENY_PATTERNS: RegExp[] = [
    // Windows system directories
    /^[a-zA-Z]:\\windows/i,
    /^[a-zA-Z]:\\program files/i,
    /^[a-zA-Z]:\\program files \(x86\)/i,
    /^[a-zA-Z]:\\programdata/i,
    // Unix system directories
    /^\/etc/i,
    /^\/usr/i,
    /^\/bin/i,
    /^\/sbin/i,
    /^\/var/i,
    /^\/system/i,
    /^\/library/i,
    // Sensitive user keys & credentials
    /[/\\]\.ssh([/\\]|$)/i,
    /[/\\]\.gnupg([/\\]|$)/i,
    /[/\\]\.aws([/\\]|$)/i,
    /[/\\]\.azure([/\\]|$)/i,
    /[/\\]id_rsa/i,
    /[/\\]\.env(\..+)?$/i,
    /[/\\][^/\\]*\.(pem|key|pfx|pkcs12)$/i,
  ];

  constructor(config: PathJailConfig) {
    for (const root of config.allowedRoots) {
      this.addAllowedRoot(root);
    }
    if (config.deniedPatterns) {
      for (const pattern of config.deniedPatterns) {
        if (typeof pattern === 'string') {
          this.customDeniedPatterns.push(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        } else {
          this.customDeniedPatterns.push(pattern);
        }
      }
    }
    this.maxReadSizeBytes = config.maxReadSizeBytes ?? 1024 * 1024; // 1MB default
    this.maxWriteSizeBytes = config.maxWriteSizeBytes ?? 10 * 1024 * 1024; // 10MB default
  }

  public addAllowedRoot(dirPath: string): void {
    const resolved = path.resolve(dirPath);
    if (!this.allowedRoots.includes(resolved)) {
      this.allowedRoots.push(resolved);
    }
  }

  public removeAllowedRoot(dirPath: string): void {
    const resolved = path.resolve(dirPath);
    this.allowedRoots = this.allowedRoots.filter((r) => r !== resolved);
  }

  public getAllowedRoots(): string[] {
    return [...this.allowedRoots];
  }

  public isPathAllowed(targetPath: string): {
    allowed: boolean;
    reason?: string;
    canonicalPath?: string;
  } {
    if (!targetPath || typeof targetPath !== 'string') {
      return { allowed: false, reason: 'Path must be a non-empty string' };
    }

    // 1. Prohibit null-byte injection attacks
    if (targetPath.includes('\0')) {
      return { allowed: false, reason: 'Path contains prohibited null bytes' };
    }

    // 2. Normalize and resolve canonical path
    const normalized = path.normalize(targetPath.trim());
    const resolved = path.resolve(normalized);

    // 3. Check against hardcoded critical system deny patterns & custom deny patterns
    for (const pattern of PathJail.SYSTEM_DENY_PATTERNS) {
      if (pattern.test(resolved)) {
        return {
          allowed: false,
          reason: `Access to sensitive system path is blocked: ${resolved}`,
          canonicalPath: resolved,
        };
      }
    }

    for (const pattern of this.customDeniedPatterns) {
      if (pattern.test(resolved)) {
        return {
          allowed: false,
          reason: `Access blocked by custom security deny rule: ${resolved}`,
          canonicalPath: resolved,
        };
      }
    }

    // 4. Must be contained within at least one allowed root
    if (this.allowedRoots.length === 0) {
      return {
        allowed: false,
        reason: 'No allowed workspace roots are currently registered in the sandbox jail',
        canonicalPath: resolved,
      };
    }

    const isInsideAllowedRoot = this.allowedRoots.some((root) => {
      const relative = path.relative(root, resolved);
      return !relative.startsWith('..') && !path.isAbsolute(relative);
    });

    if (!isInsideAllowedRoot) {
      return {
        allowed: false,
        reason: `Target path ${resolved} is outside all registered workspace roots: [${this.allowedRoots.join(', ')}]`,
        canonicalPath: resolved,
      };
    }

    // 5. Symlink target verification
    try {
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        const isRealInside = this.allowedRoots.some((root) => {
          const relative = path.relative(root, real);
          return !relative.startsWith('..') && !path.isAbsolute(relative);
        });

        if (!isRealInside) {
          return {
            allowed: false,
            reason: `Symlink target ${real} resolves outside allowed workspace roots. Access denied.`,
            canonicalPath: real,
          };
        }

        // Also check real path against system deny patterns
        for (const pattern of PathJail.SYSTEM_DENY_PATTERNS) {
          if (pattern.test(real)) {
            return {
              allowed: false,
              reason: `Symlink target points to sensitive system location: ${real}`,
              canonicalPath: real,
            };
          }
        }
      } else {
        // If file doesn't exist yet, inspect parent directory for symlink escape
        const parentDir = path.dirname(resolved);
        if (fs.existsSync(parentDir)) {
          const realParent = fs.realpathSync(parentDir);
          const isRealParentInside = this.allowedRoots.some((root) => {
            const relative = path.relative(root, realParent);
            return !relative.startsWith('..') && !path.isAbsolute(relative);
          });
          if (!isRealParentInside) {
            return {
              allowed: false,
              reason: `Parent directory symlink ${realParent} resolves outside allowed workspace roots.`,
              canonicalPath: realParent,
            };
          }
        }
      }
    } catch {
      // If filesystem check fails due to permissions, fail safely
      return {
        allowed: false,
        reason: `Unable to verify filesystem path safety for: ${resolved}`,
        canonicalPath: resolved,
      };
    }

    return { allowed: true, canonicalPath: resolved };
  }

  /**
   * Resolves path safely or throws a SecuritySandboxError.
   */
  public resolvePath(targetPath: string): string {
    const check = this.isPathAllowed(targetPath);
    if (!check.allowed || !check.canonicalPath) {
      throw new SecuritySandboxError(check.reason ?? `Access denied for path: "${targetPath}"`, targetPath);
    }
    return check.canonicalPath;
  }

  /**
   * Asserts path is allowed within registered roots or throws SecuritySandboxError.
   */
  public assertPathAllowed(targetPath: string): string {
    return this.resolvePath(targetPath);
  }

  /**
   * Validates file size against configured limits.
   */
  public validateFileSize(sizeBytes: number, mode: 'read' | 'write'): { allowed: boolean; reason?: string } {
    const limit = mode === 'read' ? this.maxReadSizeBytes : this.maxWriteSizeBytes;
    if (sizeBytes > limit) {
      return {
        allowed: false,
        reason: `File size (${sizeBytes} bytes) exceeds maximum permitted ${mode} limit (${limit} bytes).`,
      };
    }
    return { allowed: true };
  }
}
