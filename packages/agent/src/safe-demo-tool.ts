import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ToolDefinition, ToolExecutionContext } from '@alina/tools';

export const SafeWorkspaceInspectorInputSchema = z.object({
  path: z.string().optional().default('.').describe('Relative path within the sandboxed project root to inspect'),
  query: z.string().optional().describe('Optional name filter to search for'),
  maxItems: z.number().int().min(1).max(100).optional().default(20).describe('Maximum number of items to return'),
});

export interface SafeWorkspaceInspectorInput {
  path?: string;
  query?: string;
  maxItems?: number;
}

export const WorkspaceItemSchema = z.object({
  name: z.string(),
  isDirectory: z.boolean(),
  sizeBytes: z.number(),
});
export type WorkspaceItem = z.infer<typeof WorkspaceItemSchema>;

export const SafeWorkspaceInspectorOutputSchema = z.object({
  inspectedPath: z.string(),
  totalCount: z.number(),
  items: z.array(WorkspaceItemSchema),
  summary: z.string(),
});
export type SafeWorkspaceInspectorOutput = z.infer<typeof SafeWorkspaceInspectorOutputSchema>;

/**
 * safe_workspace_inspector
 * 
 * ALINA's official safe demonstration tool:
 * - Read-only risk level (zero destructive potential)
 * - Strict PathJail sandboxing (cannot access paths outside project root)
 * - No shell execution or command execution
 * - Clean structured output
 */
export const SafeWorkspaceInspectorTool: ToolDefinition<
  SafeWorkspaceInspectorInput,
  SafeWorkspaceInspectorOutput
> = {
  name: 'safe_workspace_inspector',
  description: 'Safely inspects files and directories within the registered project workspace. Read-only and strictly jailed.',
  schema: SafeWorkspaceInspectorInputSchema as z.ZodType<SafeWorkspaceInspectorInput>,
  defaultRiskLevel: 'READ_ONLY',
  calculateDynamicRisk: () => 'READ_ONLY',
  execute: async (params: SafeWorkspaceInspectorInput, context: ToolExecutionContext): Promise<SafeWorkspaceInspectorOutput> => {
    const inputPath = params.path ?? '.';

    // 1. PathJail validation: resolves path safely and throws if out of bounds
    const check = context.jail.isPathAllowed(inputPath);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(check.reason ?? `Access denied: "${inputPath}" is outside allowed workspace boundaries.`);
    }

    const targetDir = check.canonicalPath;

    // 2. Verify target directory exists
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(targetDir);
    } catch {
      throw new Error(`Path does not exist: "${inputPath}"`);
    }

    if (!stats.isDirectory()) {
      return {
        inspectedPath: inputPath,
        totalCount: 1,
        items: [
          {
            name: path.basename(targetDir),
            isDirectory: false,
            sizeBytes: stats.size,
          },
        ],
        summary: `Inspected single file "${path.basename(targetDir)}" (${stats.size} bytes).`,
      };
    }

    // 3. Read entries safely
    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
    
    // Filter by query if supplied
    let filtered = entries;
    if (params.query) {
      const q = params.query.toLowerCase();
      filtered = entries.filter((e) => e.name.toLowerCase().includes(q));
    }

    // Cap items
    const maxItems = params.maxItems ?? 20;
    const sliced = filtered.slice(0, maxItems);

    const items: WorkspaceItem[] = [];
    for (const entry of sliced) {
      const fullPath = path.join(targetDir, entry.name);
      let sizeBytes = 0;
      try {
        const itemStat = await fs.promises.stat(fullPath);
        sizeBytes = itemStat.size;
      } catch {
        // Ignored for unreadable files
      }

      items.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        sizeBytes,
      });
    }

    return {
      inspectedPath: inputPath,
      totalCount: filtered.length,
      items,
      summary: `Inspected directory "${inputPath}". Found ${filtered.length} item(s).`,
    };
  },
};
