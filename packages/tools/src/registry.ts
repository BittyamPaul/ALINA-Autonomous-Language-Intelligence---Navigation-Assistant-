import { ZodType } from 'zod';
import { RiskLevel, PathJail, AuditLogger } from '@alina/shared';

export interface ToolExecutionContext {
  jail: PathJail;
  auditLogger: AuditLogger;
  taskId?: string;
  stepId?: string;
  isApprovalGranted?: boolean;
}

export interface ToolDefinition<TParams = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: ZodType<TParams>;
  defaultRiskLevel: RiskLevel;
  calculateDynamicRisk?: (params: TParams, context: ToolExecutionContext) => RiskLevel;
  execute: (params: TParams, context: ToolExecutionContext) => Promise<TOutput>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  public register<TParams, TOutput>(tool: ToolDefinition<TParams, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public list(): Array<{ name: string; description: string; defaultRiskLevel: RiskLevel }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      defaultRiskLevel: t.defaultRiskLevel,
    }));
  }

  public async execute(
    name: string,
    rawParams: unknown,
    context: ToolExecutionContext
  ): Promise<{ success: boolean; data?: unknown; error?: string; riskLevel: RiskLevel }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found in registry`,
        riskLevel: 'READ_ONLY',
      };
    }

    // Validate parameters against Zod schema
    const parseResult = tool.schema.safeParse(rawParams);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid parameters for tool "${name}": ${parseResult.error.message}`,
        riskLevel: tool.defaultRiskLevel,
      };
    }

    const params = parseResult.data;
    const dynamicRisk = tool.calculateDynamicRisk
      ? tool.calculateDynamicRisk(params, context)
      : tool.defaultRiskLevel;

    // Check if HIGH_DESTRUCTIVE requires explicit approval
    if (dynamicRisk === 'HIGH_DESTRUCTIVE' && !context.isApprovalGranted) {
      context.auditLogger.log({
        actionType: 'sandbox_violation',
        toolName: name,
        riskLevel: dynamicRisk,
        parameters: params as Record<string, unknown>,
        outcome: 'blocked',
        details: 'Execution blocked: High-risk action requires user approval',
      });
      return {
        success: false,
        error: 'Execution blocked: High-risk action requires human-in-the-loop approval',
        riskLevel: dynamicRisk,
      };
    }

    try {
      const output = await tool.execute(params, context);
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: name,
        riskLevel: dynamicRisk,
        parameters: params as Record<string, unknown>,
        outcome: 'success',
        details: 'Execution succeeded',
      });
      return {
        success: true,
        data: output,
        riskLevel: dynamicRisk,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: name,
        riskLevel: dynamicRisk,
        parameters: params as Record<string, unknown>,
        outcome: 'failure',
        details: `Tool error: ${errorMsg}`,
      });
      return {
        success: false,
        error: errorMsg,
        riskLevel: dynamicRisk,
      };
    }
  }
}
