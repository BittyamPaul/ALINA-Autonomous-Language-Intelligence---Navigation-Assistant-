import { z } from 'zod';
import { RiskLevelSchema } from '@alina/shared';

export const McpTransportSchema = z.enum(['stdio', 'sse']);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  env: z.record(z.string()).optional(),
  disabled: z.boolean().default(false),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpToolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
  riskLevel: RiskLevelSchema.default('READ_ONLY'),
});
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;

export interface McpClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(name: string, parameters: Record<string, unknown>): Promise<unknown>;
}
