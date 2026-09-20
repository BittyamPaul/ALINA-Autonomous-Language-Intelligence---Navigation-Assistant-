import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';

const execAsync = promisify(exec);

// =========================================================================
// 1. get_system_info
// =========================================================================
export const GetSystemInfoInputSchema = z.object({
  includeMemory: z.boolean().optional().default(true).describe('Include system memory metrics'),
  includeCpu: z.boolean().optional().default(true).describe('Include CPU architecture and core details'),
});
export type GetSystemInfoInput = z.infer<typeof GetSystemInfoInputSchema>;

export const GetSystemInfoOutputSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  osVersion: z.string(),
  hostname: z.string(),
  uptimeSeconds: z.number(),
  cpuCount: z.number(),
  cpuModel: z.string(),
  totalMemoryBytes: z.number(),
  freeMemoryBytes: z.number(),
  nodeVersion: z.string(),
});
export type GetSystemInfoOutput = z.infer<typeof GetSystemInfoOutputSchema>;

export const getSystemInfoTool: McpToolDefinition<GetSystemInfoInput, GetSystemInfoOutput> = {
  name: 'get_system_info',
  group: 'system',
  description: 'Retrieves non-sensitive operating system, CPU architecture, and memory telemetry.',
  inputSchema: GetSystemInfoInputSchema,
  outputSchema: GetSystemInfoOutputSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'system',
    description: 'Retrieve OS, hardware, and runtime environment specifications (read-only)',
    isReadOnly: true,
    tags: ['system', 'telemetry', 'hardware', 'info'],
  },
  execute: async (_input: GetSystemInfoInput, _context: McpToolContext): Promise<GetSystemInfoOutput> => {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 && cpus[0]?.model ? cpus[0].model : 'Unknown CPU';

    return {
      platform: os.platform(),
      arch: os.arch(),
      osVersion: os.release(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(os.uptime()),
      cpuCount: cpus.length,
      cpuModel,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      nodeVersion: process.version,
    };
  },
};

// =========================================================================
// 2. list_processes
// =========================================================================
export const ListProcessesInputSchema = z.object({
  maxProcesses: z.number().int().min(1).max(200).optional().default(30).describe('Max processes to return'),
  nameFilter: z.string().optional().describe('Optional filter by process name'),
});
export type ListProcessesInput = z.infer<typeof ListProcessesInputSchema>;

export const ProcessItemSchema = z.object({
  pid: z.number(),
  name: z.string(),
  sessionName: z.string().optional(),
  memoryKBytes: z.number().optional(),
});
export type ProcessItem = z.infer<typeof ProcessItemSchema>;

export const ListProcessesOutputSchema = z.object({
  processes: z.array(ProcessItemSchema),
  totalCount: z.number(),
  platform: z.string(),
});
export type ListProcessesOutput = z.infer<typeof ListProcessesOutputSchema>;

export const listProcessesTool: McpToolDefinition<ListProcessesInput, ListProcessesOutput> = {
  name: 'list_processes',
  group: 'system',
  description: 'Safely lists active operating system processes without mutating system state.',
  inputSchema: ListProcessesInputSchema,
  outputSchema: ListProcessesOutputSchema,
  permission: 'SAFE',
  timeoutMs: 8000,
  auditMetadata: {
    category: 'system',
    description: 'Query list of running OS processes (read-only, non-destructive)',
    isReadOnly: true,
    tags: ['system', 'processes', 'ps', 'tasklist'],
  },
  execute: async (input: ListProcessesInput, _context: McpToolContext): Promise<ListProcessesOutput> => {
    const maxProcesses = input.maxProcesses || 30;
    const isWindows = os.platform() === 'win32';
    const processes: ProcessItem[] = [];

    try {
      if (isWindows) {
        // Run safe, parameter-free tasklist on Windows with CSV formatting
        const { stdout } = await execAsync('tasklist /FO CSV /NH', { timeout: 6000 });
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);

        for (const line of lines) {
          // CSV row: "Image Name","PID","Session Name","Session#","Mem Usage"
          const parts = line.split('","').map((p) => p.replace(/^"|"$/g, ''));
          if (parts.length >= 2) {
            const name = parts[0] || 'unknown';
            const pid = parseInt(parts[1] || '0', 10);
            const sessionName = parts[2];
            const memStr = parts[4]?.replace(/[^\d]/g, '');
            const memoryKBytes = memStr ? parseInt(memStr, 10) : undefined;

            if (input.nameFilter && !name.toLowerCase().includes(input.nameFilter.toLowerCase())) {
              continue;
            }

            processes.push({
              pid,
              name,
              sessionName,
              memoryKBytes,
            });

            if (processes.length >= maxProcesses) break;
          }
        }
      } else {
        // Unix ps safe query
        const { stdout } = await execAsync('ps -e -o pid,comm', { timeout: 6000 });
        const lines = stdout.split('\n').slice(1);

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const [pidStr, ...nameParts] = trimmed.split(/\s+/);
          const pid = parseInt(pidStr || '0', 10);
          const name = nameParts.join(' ');

          if (input.nameFilter && !name.toLowerCase().includes(input.nameFilter.toLowerCase())) {
            continue;
          }

          processes.push({ pid, name });
          if (processes.length >= maxProcesses) break;
        }
      }
    } catch {
      // Fallback to current node process if OS command is restricted in environment
      processes.push({
        pid: process.pid,
        name: 'node',
      });
    }

    return {
      processes,
      totalCount: processes.length,
      platform: os.platform(),
    };
  },
};

export const systemTools = [
  getSystemInfoTool,
  listProcessesTool,
];
