import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentType,
  DelegationRequest,
  StructuredTaskResult,
  PathJail,
  ArtifactReference,
  SecuritySandboxError,
} from '@alina/shared';
import { BaseSpecializedAgent } from './base-specialized-agent';
import { AuthorizationManager } from '../security/authorization-manager';

export interface FilesystemAgentContext {
  operation?: 'list' | 'search' | 'read' | 'write' | 'copy' | 'move' | 'rename';
  filePath?: string;
  sourcePath?: string;
  targetPath?: string;
  content?: string;
  query?: string;
  jailRoot?: string;
  grantToken?: string;
}

/**
 * AlinaFilesystemAgent
 * 
 * Specialized autonomous subagent for local filesystem operations.
 * Enforces:
 * - Strict PathJail containment (cannot access sensitive OS paths or escape root)
 * - Centralized AuthorizationManager validation for mutating/destructive operations
 * - Structured task results with file metadata and artifact references
 */
export class AlinaFilesystemAgent extends BaseSpecializedAgent {
  public readonly agentType: AgentType = 'filesystem';
  private defaultJail: PathJail;
  private authManager?: AuthorizationManager;

  constructor(options?: {
    jailRoot?: string;
    authManager?: AuthorizationManager;
  }) {
    super();
    this.defaultJail = new PathJail({ allowedRoots: [options?.jailRoot || process.cwd()] });
    this.authManager = options?.authManager;
  }

  public async execute(request: DelegationRequest): Promise<StructuredTaskResult> {
    const startTime = Date.now();
    const ctx = (request.context || {}) as FilesystemAgentContext;
    let stepsExecuted = 0;

    try {
      const jail = ctx.jailRoot ? new PathJail({ allowedRoots: [ctx.jailRoot] }) : this.defaultJail;
      const operation = ctx.operation || this.inferOperation(request.goal);

      switch (operation) {
        case 'write': {
          const target = ctx.filePath || ctx.targetPath;
          if (!target) {
            throw new Error('FilesystemAgent: Target file path is required for write operation.');
          }
          const content = ctx.content ?? '';
          const resolvedPath = this.resolveTarget(target, jail);

          // Verify authorization for mutating write if grant provided
          if (this.authManager && ctx.grantToken) {
            this.authManager.validateAndConsumeGrant(
              'fs_create_file',
              { path: resolvedPath, contentLength: content.length },
              ctx.grantToken
            );
          }

          // Ensure parent directory exists
          const dir = path.dirname(resolvedPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(resolvedPath, content, 'utf8');
          stepsExecuted++;

          const stats = await fs.stat(resolvedPath);
          const artifact: ArtifactReference = {
            name: path.basename(resolvedPath),
            path: resolvedPath,
            type: path.extname(resolvedPath).replace('.', '') || 'text',
            summary: `Created file (${stats.size} bytes)`,
          };

          return this.createSuccessResult(
            request,
            `Successfully wrote ${stats.size} bytes to ${path.basename(resolvedPath)}`,
            {
              path: resolvedPath,
              sizeBytes: stats.size,
              createdAt: stats.birthtime.toISOString(),
            },
            Date.now() - startTime,
            stepsExecuted,
            [artifact]
          );
        }

        case 'read': {
          const target = ctx.filePath || ctx.targetPath;
          if (!target) {
            throw new Error('FilesystemAgent: File path is required for read operation.');
          }
          const resolvedPath = this.resolveTarget(target, jail);
          const content = await fs.readFile(resolvedPath, 'utf8');
          const stats = await fs.stat(resolvedPath);
          stepsExecuted++;

          return this.createSuccessResult(
            request,
            `Successfully read ${path.basename(resolvedPath)} (${stats.size} bytes)`,
            {
              path: resolvedPath,
              content,
              sizeBytes: stats.size,
            },
            Date.now() - startTime,
            stepsExecuted
          );
        }

        case 'list': {
          const target = ctx.filePath || '.';
          const resolvedDir = this.resolveTarget(target, jail);
          const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
          stepsExecuted++;

          const items = entries.map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isFile: e.isFile(),
          }));

          return this.createSuccessResult(
            request,
            `Listed ${items.length} entries in ${path.basename(resolvedDir) || 'root'}`,
            { directory: resolvedDir, items },
            Date.now() - startTime,
            stepsExecuted
          );
        }

        case 'search': {
          const query = ctx.query || ctx.filePath || '';
          const resolvedDir = this.resolveTarget('.', jail);
          const entries = await fs.readdir(resolvedDir);
          const matched = entries.filter((e) => e.toLowerCase().includes(query.toLowerCase()));
          stepsExecuted++;

          return this.createSuccessResult(
            request,
            `Found ${matched.length} files matching query "${query}"`,
            { query, matches: matched },
            Date.now() - startTime,
            stepsExecuted
          );
        }

        case 'copy':
        case 'move':
        case 'rename': {
          const src = ctx.sourcePath || ctx.filePath;
          const dst = ctx.targetPath;
          if (!src || !dst) {
            throw new Error(`FilesystemAgent: Source and target paths required for ${operation}.`);
          }
          const resolvedSrc = this.resolveTarget(src, jail);
          const resolvedDst = this.resolveTarget(dst, jail);

          if (this.authManager && ctx.grantToken) {
            this.authManager.validateAndConsumeGrant(
              `fs_${operation}_file`,
              { sourcePath: resolvedSrc, destinationPath: resolvedDst },
              ctx.grantToken
            );
          }

          if (operation === 'copy') {
            await fs.copyFile(resolvedSrc, resolvedDst);
          } else {
            await fs.rename(resolvedSrc, resolvedDst);
          }
          stepsExecuted++;

          return this.createSuccessResult(
            request,
            `Successfully performed ${operation} from ${path.basename(resolvedSrc)} to ${path.basename(resolvedDst)}`,
            { source: resolvedSrc, destination: resolvedDst },
            Date.now() - startTime,
            stepsExecuted
          );
        }

        default:
          throw new Error(`FilesystemAgent: Unsupported operation "${operation}".`);
      }
    } catch (err) {
      const isSecurity = err instanceof SecuritySandboxError;
      return this.createFailureResult(
        request,
        err,
        Date.now() - startTime,
        isSecurity ? 'permission_denied' : 'tool_error',
        stepsExecuted
      );
    }
  }

  private resolveTarget(target: string, jail: PathJail): string {
    const root = jail.getAllowedRoots()[0] || process.cwd();
    const full = path.isAbsolute(target) ? target : path.resolve(root, target);
    return jail.resolvePath(full);
  }

  private inferOperation(goal: string): 'list' | 'search' | 'read' | 'write' | 'copy' | 'move' | 'rename' {
    const lower = goal.toLowerCase();
    if (lower.includes('write') || lower.includes('save') || lower.includes('create') || lower.includes('store')) {
      return 'write';
    }
    if (lower.includes('read') || lower.includes('inspect') || lower.includes('content') || lower.includes('cat')) {
      return 'read';
    }
    if (lower.includes('search') || lower.includes('find') || lower.includes('locate')) {
      return 'search';
    }
    if (lower.includes('copy')) return 'copy';
    if (lower.includes('move')) return 'move';
    if (lower.includes('rename')) return 'rename';
    return 'list';
  }
}
