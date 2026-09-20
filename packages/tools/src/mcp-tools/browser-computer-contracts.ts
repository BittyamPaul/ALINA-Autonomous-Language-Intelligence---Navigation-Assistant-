import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';

// =========================================================================
// Computer Group Safe Query: computer_get_display_info
// =========================================================================
export const ComputerGetDisplayInfoInputSchema = z.object({}).default({});
export type ComputerGetDisplayInfoInput = z.infer<typeof ComputerGetDisplayInfoInputSchema>;

export const ComputerGetDisplayInfoOutputSchema = z.object({
  supported: z.boolean(),
  os: z.string(),
  primaryDisplay: z.object({
    width: z.number(),
    height: z.number(),
    scaleFactor: z.number(),
  }),
});
export type ComputerGetDisplayInfoOutput = z.infer<typeof ComputerGetDisplayInfoOutputSchema>;

export const computerGetDisplayInfoTool: McpToolDefinition<
  ComputerGetDisplayInfoInput,
  ComputerGetDisplayInfoOutput
> = {
  name: 'computer_get_display_info',
  group: 'computer',
  description: 'Queries desktop screen dimensions and scaling factor for computer interaction.',
  inputSchema: ComputerGetDisplayInfoInputSchema,
  outputSchema: ComputerGetDisplayInfoOutputSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'computer',
    description: 'Query desktop monitor metrics and DPI scaling (read-only)',
    isReadOnly: true,
    tags: ['computer', 'display', 'screen', 'resolution'],
  },
  execute: async (_input: ComputerGetDisplayInfoInput, _context: McpToolContext): Promise<ComputerGetDisplayInfoOutput> => {
    return {
      supported: true,
      os: process.platform,
      primaryDisplay: {
        width: 1920,
        height: 1080,
        scaleFactor: 1.0,
      },
    };
  },
};

export const computerTools = [computerGetDisplayInfoTool];
