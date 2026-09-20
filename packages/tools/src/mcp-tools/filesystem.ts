import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';

// =========================================================================
// 1. list_directory (and alias list_files)
// =========================================================================
export const ListDirectoryInputSchema = z.object({
  path: z.string().optional().default('.').describe('Target directory path relative to workspace root'),
  recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
  maxDepth: z.number().int().min(1).max(10).optional().default(2).describe('Maximum recursion depth'),
  maxItems: z.number().int().min(1).max(500).optional().default(100).describe('Maximum items to return'),
});
export type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  sizeBytes: z.number(),
  modifiedAt: z.string(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const ListDirectoryOutputSchema = z.object({
  items: z.array(FileEntrySchema),
  totalCount: z.number(),
  truncated: z.boolean(),
  targetDirectory: z.string(),
});
export type ListDirectoryOutput = z.infer<typeof ListDirectoryOutputSchema>;

export const listDirectoryTool: McpToolDefinition<ListDirectoryInput, ListDirectoryOutput> = {
  name: 'list_directory',
  group: 'filesystem',
  description: 'Safely lists files and directories within allowed workspace paths with metadata.',
  inputSchema: ListDirectoryInputSchema,
  outputSchema: ListDirectoryOutputSchema,
  permission: 'SAFE',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Enumerate workspace files and directory structure (read-only)',
    isReadOnly: true,
    tags: ['filesystem', 'list', 'read'],
  },
  execute: async (input: ListDirectoryInput, context: McpToolContext): Promise<ListDirectoryOutput> => {
    const target = input.path || '.';

    if (context.jail) {
      const check = context.jail.isPathAllowed(target);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${target}" is outside allowed workspace boundaries.`);
      }
    }

    const resolved = path.resolve(target);
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return {
        items: [
          {
            name: path.basename(resolved),
            path: target,
            isDirectory: false,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          },
        ],
        totalCount: 1,
        truncated: false,
        targetDirectory: target,
      };
    }

    const maxItems = input.maxItems || 100;
    const items: FileEntry[] = [];

    async function walk(currentDir: string, currentDepth: number) {
      if (items.length >= maxItems) return;
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (items.length >= maxItems) break;
        const full = path.join(currentDir, entry.name);
        const rel = path.relative(resolved, full);

        let size = 0;
        let mtime = new Date().toISOString();
        try {
          const s = await fs.stat(full);
          size = s.size;
          mtime = s.mtime.toISOString();
        } catch {
          // Ignore stat errors for inaccessible nodes
        }

        items.push({
          name: entry.name,
          path: rel || entry.name,
          isDirectory: entry.isDirectory(),
          sizeBytes: size,
          modifiedAt: mtime,
        });

        if (input.recursive && entry.isDirectory() && currentDepth < (input.maxDepth || 2)) {
          await walk(full, currentDepth + 1);
        }
      }
    }

    await walk(resolved, 1);

    return {
      items,
      totalCount: items.length,
      truncated: items.length >= maxItems,
      targetDirectory: target,
    };
  },
};

// Backward-compatible alias
export const listFilesTool: McpToolDefinition<ListDirectoryInput, ListDirectoryOutput> = {
  ...listDirectoryTool,
  name: 'list_files',
};

// =========================================================================
// 2. recursive_search (and alias search_files)
// =========================================================================
export const RecursiveSearchInputSchema = z.object({
  path: z.string().optional().default('.').describe('Directory to search inside'),
  pattern: z.string().optional().describe('Glob pattern (e.g. "**/*.pdf", "*.ts")'),
  extension: z.string().optional().describe('Filter by file extension (e.g. "pdf", ".pdf")'),
  maxResults: z.number().int().min(1).max(200).optional().default(50).describe('Max matches to return'),
});
export type RecursiveSearchInput = z.infer<typeof RecursiveSearchInputSchema>;

export const SearchMatchSchema = z.object({
  path: z.string(),
  name: z.string(),
  sizeBytes: z.number(),
  modifiedAt: z.string(),
});
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const RecursiveSearchOutputSchema = z.object({
  matches: z.array(SearchMatchSchema),
  totalMatches: z.number(),
  pattern: z.string(),
  searchedDirectory: z.string(),
});
export type RecursiveSearchOutput = z.infer<typeof RecursiveSearchOutputSchema>;

export const recursiveSearchTool: McpToolDefinition<RecursiveSearchInput, RecursiveSearchOutput> = {
  name: 'recursive_search',
  group: 'filesystem',
  description: 'Recursively searches workspace for files matching a glob pattern or file extension.',
  inputSchema: RecursiveSearchInputSchema,
  outputSchema: RecursiveSearchOutputSchema,
  permission: 'SAFE',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Recursive search across workspace files (read-only)',
    isReadOnly: true,
    tags: ['filesystem', 'search', 'glob', 'find'],
  },
  execute: async (input: RecursiveSearchInput, context: McpToolContext): Promise<RecursiveSearchOutput> => {
    const targetDir = input.path || '.';

    if (context.jail) {
      const check = context.jail.isPathAllowed(targetDir);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${targetDir}" is outside allowed workspace boundaries.`);
      }
    }

    const resolved = path.resolve(targetDir);
    const maxResults = input.maxResults || 50;

    let globPattern = input.pattern;
    if (!globPattern) {
      if (input.extension) {
        const ext = input.extension.startsWith('.') ? input.extension.slice(1) : input.extension;
        globPattern = `**/*.${ext}`;
      } else {
        globPattern = '**/*';
      }
    }

    const entries = await fg(globPattern, {
      cwd: resolved,
      dot: false,
      onlyFiles: true,
      stats: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    });

    // Map matches and sort by modifiedAt descending (most recently modified first)
    const matches: SearchMatch[] = entries.map((e) => ({
      path: e.path,
      name: path.basename(e.path),
      sizeBytes: e.stats?.size ?? 0,
      modifiedAt: e.stats?.mtime ? e.stats.mtime.toISOString() : new Date().toISOString(),
    }));

    matches.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    const sliced = matches.slice(0, maxResults);

    return {
      matches: sliced,
      totalMatches: matches.length,
      pattern: globPattern,
      searchedDirectory: targetDir,
    };
  },
};

// Backward-compatible alias
export const searchFilesTool: McpToolDefinition<RecursiveSearchInput, RecursiveSearchOutput> = {
  ...recursiveSearchTool,
  name: 'search_files',
};

// =========================================================================
// 3. get_file_metadata
// =========================================================================
export const GetFileMetadataInputSchema = z.object({
  path: z.string().min(1).describe('Target file or directory path'),
});
export type GetFileMetadataInput = z.infer<typeof GetFileMetadataInputSchema>;

export const GetFileMetadataOutputSchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
  sizeBytes: z.number(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  extension: z.string(),
});
export type GetFileMetadataOutput = z.infer<typeof GetFileMetadataOutputSchema>;

export const getFileMetadataTool: McpToolDefinition<GetFileMetadataInput, GetFileMetadataOutput> = {
  name: 'get_file_metadata',
  group: 'filesystem',
  description: 'Retrieves structural and timestamp metadata for a file or directory.',
  inputSchema: GetFileMetadataInputSchema,
  outputSchema: GetFileMetadataOutputSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Retrieve filesystem entity metadata (size, dates, type)',
    isReadOnly: true,
    tags: ['filesystem', 'metadata', 'stat'],
  },
  execute: async (input: GetFileMetadataInput, context: McpToolContext): Promise<GetFileMetadataOutput> => {
    if (context.jail) {
      const check = context.jail.isPathAllowed(input.path);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${input.path}" is outside allowed workspace boundaries.`);
      }
    }

    const resolved = path.resolve(input.path);
    const stats = await fs.stat(resolved);

    return {
      name: path.basename(resolved),
      path: input.path,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      sizeBytes: stats.size,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      extension: path.extname(resolved),
    };
  },
};

// =========================================================================
// 4. read_text_file
// =========================================================================
export const ReadTextFileInputSchema = z.object({
  path: z.string().min(1).describe('File path to read relative to workspace'),
  maxBytes: z.number().int().min(1).max(5 * 1024 * 1024).optional().default(1024 * 1024).describe('Maximum bytes to read (default 1MB)'),
  encoding: z.enum(['utf-8', 'ascii']).optional().default('utf-8').describe('File character encoding'),
});
export type ReadTextFileInput = z.infer<typeof ReadTextFileInputSchema>;

export const ReadTextFileOutputSchema = z.object({
  content: z.string(),
  sizeBytes: z.number(),
  truncated: z.boolean(),
  filePath: z.string(),
});
export type ReadTextFileOutput = z.infer<typeof ReadTextFileOutputSchema>;

export const readTextFileTool: McpToolDefinition<ReadTextFileInput, ReadTextFileOutput> = {
  name: 'read_text_file',
  group: 'filesystem',
  description: 'Reads the text content of a workspace file with size limit protection.',
  inputSchema: ReadTextFileInputSchema,
  outputSchema: ReadTextFileOutputSchema,
  permission: 'SAFE',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Read file text contents safely within workspace limits (read-only)',
    isReadOnly: true,
    tags: ['filesystem', 'read', 'content'],
  },
  execute: async (input: ReadTextFileInput, context: McpToolContext): Promise<ReadTextFileOutput> => {
    if (context.jail) {
      const check = context.jail.isPathAllowed(input.path);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${input.path}" is outside allowed workspace boundaries.`);
      }
    }

    const resolved = path.resolve(input.path);
    const stats = await fs.stat(resolved);
    if (!stats.isFile()) {
      throw new Error(`Target path "${input.path}" is not a file.`);
    }

    if (context.jail) {
      const sizeCheck = context.jail.validateFileSize(stats.size, 'read');
      if (!sizeCheck.allowed) {
        throw new Error(sizeCheck.reason);
      }
    }

    const maxBytes = input.maxBytes || 1024 * 1024;
    const content = await fs.readFile(resolved, input.encoding || 'utf-8');

    const truncated = content.length > maxBytes;
    const sliced = truncated ? content.slice(0, maxBytes) : content;

    return {
      content: sliced,
      sizeBytes: stats.size,
      truncated,
      filePath: input.path,
    };
  },
};

// =========================================================================
// 5. create_directory [APPROVAL]
// =========================================================================
export const CreateDirectoryInputSchema = z.object({
  path: z.string().min(1).describe('Directory path to create within workspace'),
  recursive: z.boolean().optional().default(true).describe('Create parent directories if they do not exist'),
});
export type CreateDirectoryInput = z.infer<typeof CreateDirectoryInputSchema>;

export const CreateDirectoryOutputSchema = z.object({
  path: z.string(),
  created: z.boolean(),
  alreadyExisted: z.boolean(),
});
export type CreateDirectoryOutput = z.infer<typeof CreateDirectoryOutputSchema>;

export const createDirectoryTool: McpToolDefinition<CreateDirectoryInput, CreateDirectoryOutput> = {
  name: 'create_directory',
  group: 'filesystem',
  description: 'Creates a directory within allowed workspace boundaries. Requires operator approval.',
  inputSchema: CreateDirectoryInputSchema,
  outputSchema: CreateDirectoryOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Create directory within workspace root (mutating)',
    isReadOnly: false,
    tags: ['filesystem', 'write', 'mkdir'],
  },
  execute: async (input: CreateDirectoryInput, context: McpToolContext): Promise<CreateDirectoryOutput> => {
    if (context.jail) {
      const check = context.jail.isPathAllowed(input.path);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${input.path}" is outside allowed workspace boundaries.`);
      }
    }

    const resolved = path.resolve(input.path);
    const exists = fsSync.existsSync(resolved);
    if (exists) {
      return { path: input.path, created: false, alreadyExisted: true };
    }

    await fs.mkdir(resolved, { recursive: input.recursive ?? true });
    return { path: input.path, created: true, alreadyExisted: false };
  },
};

// =========================================================================
// 6. create_file [APPROVAL]
// =========================================================================
export const CreateFileInputSchema = z.object({
  path: z.string().min(1).describe('File path to create within workspace'),
  content: z.string().describe('File text content to write'),
  overwrite: z.boolean().optional().default(false).describe('Allow overwriting an existing file'),
  encoding: z.enum(['utf-8', 'ascii']).optional().default('utf-8'),
});
export type CreateFileInput = z.infer<typeof CreateFileInputSchema>;

export const CreateFileOutputSchema = z.object({
  path: z.string(),
  sizeBytes: z.number(),
  created: z.boolean(),
  overwritten: z.boolean(),
});
export type CreateFileOutput = z.infer<typeof CreateFileOutputSchema>;

export const createFileTool: McpToolDefinition<CreateFileInput, CreateFileOutput> = {
  name: 'create_file',
  group: 'filesystem',
  description: 'Creates or updates a file within workspace boundaries. Requires operator approval.',
  inputSchema: CreateFileInputSchema,
  outputSchema: CreateFileOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Write file within workspace root (mutating)',
    isReadOnly: false,
    tags: ['filesystem', 'write', 'file'],
  },
  execute: async (input: CreateFileInput, context: McpToolContext): Promise<CreateFileOutput> => {
    if (context.jail) {
      const check = context.jail.isPathAllowed(input.path);
      if (!check.allowed || !check.canonicalPath) {
        throw new Error(check.reason ?? `Access denied: path "${input.path}" is outside allowed workspace boundaries.`);
      }
      const sizeCheck = context.jail.validateFileSize(Buffer.byteLength(input.content), 'write');
      if (!sizeCheck.allowed) {
        throw new Error(sizeCheck.reason);
      }
    }

    const resolved = path.resolve(input.path);
    const exists = fsSync.existsSync(resolved);

    if (exists && !input.overwrite) {
      throw new Error(`File already exists at "${input.path}". Set overwrite: true to replace it.`);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(resolved);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.writeFile(resolved, input.content, input.encoding || 'utf-8');
    const bytes = Buffer.byteLength(input.content);

    return {
      path: input.path,
      sizeBytes: bytes,
      created: !exists,
      overwritten: exists,
    };
  },
};

// =========================================================================
// 7. copy_file [APPROVAL]
// =========================================================================
export const CopyFileInputSchema = z.object({
  sourcePath: z.string().min(1).describe('Source file path to copy from'),
  destinationPath: z.string().min(1).describe('Destination file path to copy to'),
  overwrite: z.boolean().optional().default(false).describe('Allow overwriting existing destination file'),
});
export type CopyFileInput = z.infer<typeof CopyFileInputSchema>;

export const CopyFileOutputSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  copiedBytes: z.number(),
});
export type CopyFileOutput = z.infer<typeof CopyFileOutputSchema>;

export const copyFileTool: McpToolDefinition<CopyFileInput, CopyFileOutput> = {
  name: 'copy_file',
  group: 'filesystem',
  description: 'Copies a file from source to destination within workspace boundaries. Requires operator approval.',
  inputSchema: CopyFileInputSchema,
  outputSchema: CopyFileOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Copy workspace file to destination (mutating)',
    isReadOnly: false,
    tags: ['filesystem', 'copy', 'write'],
  },
  execute: async (input: CopyFileInput, context: McpToolContext): Promise<CopyFileOutput> => {
    if (context.jail) {
      const srcCheck = context.jail.isPathAllowed(input.sourcePath);
      if (!srcCheck.allowed || !srcCheck.canonicalPath) {
        throw new Error(srcCheck.reason ?? `Access denied for source path: "${input.sourcePath}"`);
      }
      const destCheck = context.jail.isPathAllowed(input.destinationPath);
      if (!destCheck.allowed || !destCheck.canonicalPath) {
        throw new Error(destCheck.reason ?? `Access denied for destination path: "${input.destinationPath}"`);
      }
    }

    const srcResolved = path.resolve(input.sourcePath);
    const destResolved = path.resolve(input.destinationPath);

    if (!fsSync.existsSync(srcResolved)) {
      throw new Error(`Source file does not exist: "${input.sourcePath}"`);
    }

    const stats = await fs.stat(srcResolved);
    if (!stats.isFile()) {
      throw new Error(`Source path is not a file: "${input.sourcePath}"`);
    }

    if (fsSync.existsSync(destResolved) && !input.overwrite) {
      throw new Error(`Destination file already exists: "${input.destinationPath}". Set overwrite: true to replace.`);
    }

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destResolved), { recursive: true });

    await fs.copyFile(srcResolved, destResolved);

    return {
      sourcePath: input.sourcePath,
      destinationPath: input.destinationPath,
      copiedBytes: stats.size,
    };
  },
};

// =========================================================================
// 8. move_file [APPROVAL]
// =========================================================================
export const MoveFileInputSchema = z.object({
  sourcePath: z.string().min(1).describe('Source file path to move'),
  destinationPath: z.string().min(1).describe('Destination path to move into'),
  overwrite: z.boolean().optional().default(false).describe('Allow overwriting destination if exists'),
});
export type MoveFileInput = z.infer<typeof MoveFileInputSchema>;

export const MoveFileOutputSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  moved: z.boolean(),
});
export type MoveFileOutput = z.infer<typeof MoveFileOutputSchema>;

export const moveFileTool: McpToolDefinition<MoveFileInput, MoveFileOutput> = {
  name: 'move_file',
  group: 'filesystem',
  description: 'Moves a file to a new destination within workspace boundaries. Requires operator approval.',
  inputSchema: MoveFileInputSchema,
  outputSchema: MoveFileOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Move file within workspace roots (mutating)',
    isReadOnly: false,
    tags: ['filesystem', 'move', 'write'],
  },
  execute: async (input: MoveFileInput, context: McpToolContext): Promise<MoveFileOutput> => {
    if (context.jail) {
      const srcCheck = context.jail.isPathAllowed(input.sourcePath);
      if (!srcCheck.allowed) throw new Error(srcCheck.reason ?? `Access denied: "${input.sourcePath}"`);
      const destCheck = context.jail.isPathAllowed(input.destinationPath);
      if (!destCheck.allowed) throw new Error(destCheck.reason ?? `Access denied: "${input.destinationPath}"`);
    }

    const srcResolved = path.resolve(input.sourcePath);
    const destResolved = path.resolve(input.destinationPath);

    if (!fsSync.existsSync(srcResolved)) {
      throw new Error(`Source file does not exist: "${input.sourcePath}"`);
    }

    if (fsSync.existsSync(destResolved) && !input.overwrite) {
      throw new Error(`Destination already exists: "${input.destinationPath}". Set overwrite: true.`);
    }

    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    await fs.rename(srcResolved, destResolved);

    return {
      sourcePath: input.sourcePath,
      destinationPath: input.destinationPath,
      moved: true,
    };
  },
};

// =========================================================================
// 9. rename_file [APPROVAL]
// =========================================================================
export const RenameFileInputSchema = z.object({
  path: z.string().min(1).describe('Path of the file or directory to rename'),
  newName: z.string().min(1).describe('New filename (cannot contain path separators)'),
});
export type RenameFileInput = z.infer<typeof RenameFileInputSchema>;

export const RenameFileOutputSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  renamed: z.boolean(),
});
export type RenameFileOutput = z.infer<typeof RenameFileOutputSchema>;

export const renameFileTool: McpToolDefinition<RenameFileInput, RenameFileOutput> = {
  name: 'rename_file',
  group: 'filesystem',
  description: 'Renames a file or directory within its directory. Requires operator approval.',
  inputSchema: RenameFileInputSchema,
  outputSchema: RenameFileOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Rename file/directory in place (mutating)',
    isReadOnly: false,
    tags: ['filesystem', 'rename', 'write'],
  },
  execute: async (input: RenameFileInput, context: McpToolContext): Promise<RenameFileOutput> => {
    // Prohibit path separators in newName (traversal protection)
    if (input.newName.includes('/') || input.newName.includes('\\')) {
      throw new Error('New name must not contain path separators or directory traversal.');
    }

    if (context.jail) {
      const check = context.jail.isPathAllowed(input.path);
      if (!check.allowed) throw new Error(check.reason ?? `Access denied: "${input.path}"`);
    }

    const resolvedOld = path.resolve(input.path);
    if (!fsSync.existsSync(resolvedOld)) {
      throw new Error(`Target path does not exist: "${input.path}"`);
    }

    const parentDir = path.dirname(resolvedOld);
    const resolvedNew = path.join(parentDir, input.newName);

    if (context.jail) {
      const checkNew = context.jail.isPathAllowed(resolvedNew);
      if (!checkNew.allowed) throw new Error(checkNew.reason ?? `Access denied for new name: "${input.newName}"`);
    }

    await fs.rename(resolvedOld, resolvedNew);
    const newRelative = path.relative(process.cwd(), resolvedNew);

    return {
      oldPath: input.path,
      newPath: newRelative,
      renamed: true,
    };
  },
};

// =========================================================================
// 10. delete_file [HIGH_RISK] - Guarded & Blocked
// =========================================================================
export const deleteFileTool: McpToolDefinition<{ path: string }, { deleted: boolean }> = {
  name: 'delete_file',
  group: 'filesystem',
  description: 'Deletes a file. HIGH_RISK operation strictly guarded by security gates.',
  inputSchema: z.object({ path: z.string().min(1) }),
  outputSchema: z.object({ deleted: z.boolean() }),
  permission: 'HIGH_RISK',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'filesystem',
    description: 'Delete file from filesystem (destructive)',
    isReadOnly: false,
    tags: ['filesystem', 'delete', 'destructive'],
  },
  execute: async (_input: { path: string }, _context: McpToolContext): Promise<{ deleted: boolean }> => {
    throw new Error('Unrestricted deletion is currently disabled. Destructive operations require explicit system authorization.');
  },
};

export const filesystemTools = [
  listDirectoryTool,
  listFilesTool,
  recursiveSearchTool,
  searchFilesTool,
  getFileMetadataTool,
  readTextFileTool,
  createDirectoryTool,
  createFileTool,
  copyFileTool,
  moveFileTool,
  renameFileTool,
  deleteFileTool,
];
