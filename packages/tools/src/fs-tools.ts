import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import { ToolDefinition } from './registry';
import { RiskLevel } from '@alina/shared';

export const FsReadFileTool: ToolDefinition<{ filePath: string; maxBytes?: number }> = {
  name: 'fs_read_file',
  description: 'Read contents of a file within allowed workspace directories',
  schema: z.object({
    filePath: z.string().min(1),
    maxBytes: z.number().int().positive().optional().default(64 * 1024),
  }),
  defaultRiskLevel: 'READ_ONLY',
  async execute({ filePath, maxBytes }, { jail }) {
    const check = jail.isPathAllowed(filePath);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? 'Access denied');
    }

    const limit = maxBytes ?? 64 * 1024;
    const content = await fs.readFile(check.canonicalPath, 'utf8');
    if (content.length > limit) {
      return {
        content: content.slice(0, limit),
        truncated: true,
        totalBytes: content.length,
      };
    }
    return {
      content,
      truncated: false,
      totalBytes: content.length,
    };
  },
};

export const FsWriteFileTool: ToolDefinition<{
  filePath: string;
  content: string;
  createDirectories?: boolean;
}> = {
  name: 'fs_write_file',
  description: 'Write or update a file within allowed workspace directories',
  schema: z.object({
    filePath: z.string().min(1),
    content: z.string(),
    createDirectories: z.boolean().optional().default(true),
  }),
  defaultRiskLevel: 'MEDIUM',
  calculateDynamicRisk({ filePath }, { jail }): RiskLevel {
    const check = jail.isPathAllowed(filePath);
    if (!check.allowed) {
      return 'HIGH_DESTRUCTIVE';
    }
    // Sensitive file names always elevate to HIGH_DESTRUCTIVE
    const base = path.basename(filePath).toLowerCase();
    if (base.startsWith('.env') || base === 'package.json' || base === 'cargo.toml') {
      return 'HIGH_DESTRUCTIVE';
    }
    return 'MEDIUM';
  },
  async execute({ filePath, content, createDirectories }, { jail }) {
    const check = jail.isPathAllowed(filePath);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? 'Access denied');
    }

    if (createDirectories) {
      await fs.mkdir(path.dirname(check.canonicalPath), { recursive: true });
    }

    await fs.writeFile(check.canonicalPath, content, 'utf8');
    return {
      success: true,
      canonicalPath: check.canonicalPath,
      bytesWritten: Buffer.byteLength(content, 'utf8'),
    };
  },
};

export const FsListDirTool: ToolDefinition<{ dirPath?: string; recursive?: boolean }> = {
  name: 'fs_list_dir',
  description: 'List files and folders within an allowed directory',
  schema: z.object({
    dirPath: z.string().optional().default('.'),
    recursive: z.boolean().optional().default(false),
  }),
  defaultRiskLevel: 'READ_ONLY',
  async execute({ dirPath, recursive }, { jail }) {
    const targetDir = dirPath ?? '.';
    const check = jail.isPathAllowed(targetDir);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? 'Access denied');
    }

    if (recursive) {
      const entries = await fg('**/*', {
        cwd: check.canonicalPath,
        dot: false,
        deep: 3,
        stats: true,
      });
      return {
        path: check.canonicalPath,
        entries: entries.map((e) => ({
          name: e.name,
          path: e.path,
          size: e.stats?.size ?? 0,
          isDirectory: e.dirent.isDirectory(),
        })),
      };
    }

    const dirents = await fs.readdir(check.canonicalPath, { withFileTypes: true });
    return {
      path: check.canonicalPath,
      entries: dirents.map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
        isFile: d.isFile(),
      })),
    };
  },
};

export const FsDeleteFileTool: ToolDefinition<{ targetPath: string }> = {
  name: 'fs_delete_file',
  description: 'Delete a file or directory within the workspace sandbox',
  schema: z.object({
    targetPath: z.string().min(1),
  }),
  defaultRiskLevel: 'HIGH_DESTRUCTIVE',
  async execute({ targetPath }, { jail }) {
    const check = jail.isPathAllowed(targetPath);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? 'Access denied');
    }

    const stat = await fs.stat(check.canonicalPath);
    if (stat.isDirectory()) {
      await fs.rm(check.canonicalPath, { recursive: true, force: true });
    } else {
      await fs.unlink(check.canonicalPath);
    }

    return {
      deleted: true,
      canonicalPath: check.canonicalPath,
    };
  },
};

export const FsSearchGlobTool: ToolDefinition<{ pattern: string; cwd?: string }> = {
  name: 'fs_search_glob',
  description: 'Find files matching a glob pattern inside the workspace',
  schema: z.object({
    pattern: z.string().min(1),
    cwd: z.string().optional().default('.'),
  }),
  defaultRiskLevel: 'READ_ONLY',
  async execute({ pattern, cwd }, { jail }) {
    const targetCwd = cwd ?? '.';
    const check = jail.isPathAllowed(targetCwd);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? 'Access denied');
    }

    const files = await fg(pattern, {
      cwd: check.canonicalPath,
      dot: false,
      absolute: false,
    });

    return {
      matches: files,
      count: files.length,
      searchRoot: check.canonicalPath,
    };
  },
};
