import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { ToolDefinition } from './registry';
import { CommandInspector, RiskLevel } from '@alina/shared';

const execAsync = promisify(exec);

export const OsGetSystemInfoTool: ToolDefinition<Record<string, never>> = {
  name: 'os_get_system_info',
  description: 'Retrieve local system architecture, memory, CPU, and platform details',
  schema: z.object({}),
  defaultRiskLevel: 'READ_ONLY',
  async execute() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? 'Unknown',
      memory: {
        totalGb: Number((totalMem / (1024 ** 3)).toFixed(2)),
        freeGb: Number((freeMem / (1024 ** 3)).toFixed(2)),
        usedGb: Number(((totalMem - freeMem) / (1024 ** 3)).toFixed(2)),
      },
      uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
      nodeVersion: process.version,
    };
  },
};

export const OsRunCommandTool: ToolDefinition<{ command: string; cwd?: string; timeoutMs?: number }> = {
  name: 'os_run_command',
  description: 'Execute a controlled shell command within allowed workspace directory',
  schema: z.object({
    command: z.string().min(1),
    cwd: z.string().optional().default('.'),
    timeoutMs: z.number().int().positive().optional().default(30000),
  }),
  defaultRiskLevel: 'HIGH_DESTRUCTIVE',
  calculateDynamicRisk({ command }): RiskLevel {
    const inspection = CommandInspector.inspect(command);
    return inspection.riskLevel;
  },
  async execute({ command, cwd, timeoutMs }, { jail }) {
    const targetCwd = cwd ?? '.';
    const check = jail.isPathAllowed(targetCwd);
    if (!check.allowed || !check.canonicalPath) {
      throw new Error(`Working directory outside jail: ${check.reason}`);
    }

    const inspection = CommandInspector.inspect(command);
    if (!inspection.isPermitted) {
      throw new Error(`Command blocked by security policy: ${inspection.reason}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: check.canonicalPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 5, // 5MB
      });

      return {
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (err: unknown) {
      const execError = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: execError.code ?? 1,
        stdout: (execError.stdout ?? '').trim(),
        stderr: (execError.stderr ?? execError.message ?? '').trim(),
      };
    }
  },
};
