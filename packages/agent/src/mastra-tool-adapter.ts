import { createTool } from '@mastra/core/tools';
import { ToolDefinition, ToolRegistry, ToolExecutionContext } from '@alina/tools';
import { SecuritySandboxError } from '@alina/shared';

/**
 * Bridges an ALINA ToolDefinition into a native Mastra Tool using Mastra's official createTool API.
 */
export function adaptAlinaToolToMastra<TParams = unknown, TOutput = unknown>(
  toolDef: ToolDefinition<TParams, TOutput>,
  getContext: () => ToolExecutionContext
) {
  return createTool({
    id: toolDef.name,
    description: toolDef.description,
    inputSchema: toolDef.schema,
    execute: async (inputParams: unknown) => {
      const context = getContext();
      // Enforce strict dynamic risk checks and PathJail confinement
      const dynamicRisk = toolDef.calculateDynamicRisk
        ? toolDef.calculateDynamicRisk(inputParams as TParams, context)
        : toolDef.defaultRiskLevel;

      if (dynamicRisk === 'HIGH_DESTRUCTIVE' && !context.isApprovalGranted) {
        context.auditLogger.log({
          actionType: 'sandbox_violation',
          toolName: toolDef.name,
          riskLevel: dynamicRisk,
          parameters: inputParams as Record<string, unknown>,
          outcome: 'blocked',
          details: 'Execution blocked: Destructive action requires user approval',
        });
        throw new SecuritySandboxError(
          `Tool "${toolDef.name}" requires explicit user approval before execution.`,
          toolDef.name
        );
      }

      try {
        const result = await toolDef.execute(inputParams as TParams, context);
        context.auditLogger.log({
          actionType: 'tool_execution',
          toolName: toolDef.name,
          riskLevel: dynamicRisk,
          parameters: inputParams as Record<string, unknown>,
          outcome: 'success',
          details: 'Mastra tool executed successfully',
        });
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        context.auditLogger.log({
          actionType: 'tool_execution',
          toolName: toolDef.name,
          riskLevel: dynamicRisk,
          parameters: inputParams as Record<string, unknown>,
          outcome: 'failure',
          details: errorMsg,
        });
        throw err;
      }
    },
  });
}

/**
 * ToolRegistrationBridge
 * 
 * Enforces ALINA's rule:
 * "The agent must not execute tools outside the registered tool system.
 *  Do not give the model unrestricted shell access."
 */
export class MastraToolRegistrationBridge {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  public getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Builds Mastra-compatible tools dictionary for the Mastra Agent instance.
   */
  public toMastraTools(getContext: () => ToolExecutionContext): Record<string, ReturnType<typeof createTool>> {
    const mastraTools: Record<string, ReturnType<typeof createTool>> = {};
    const tools = this.registry.list();

    for (const toolMeta of tools) {
      const toolDef = this.registry.get(toolMeta.name);
      if (toolDef) {
        // Enforce: unrestricted shell access is prohibited
        if (toolDef.name === 'exec_shell_raw' || toolDef.name === 'arbitrary_terminal') {
          continue;
        }
        mastraTools[toolDef.name] = adaptAlinaToolToMastra(toolDef, getContext);
      }
    }

    return mastraTools;
  }

  /**
   * Controlled execution gateway: strictly validates tool registration before running.
   */
  public async executeControlled(
    toolName: string,
    rawParams: unknown,
    context: ToolExecutionContext
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    // 1. Verify tool exists in registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      context.auditLogger.log({
        actionType: 'sandbox_violation',
        toolName,
        riskLevel: 'HIGH_DESTRUCTIVE',
        parameters: typeof rawParams === 'object' && rawParams ? (rawParams as Record<string, unknown>) : {},
        outcome: 'blocked',
        details: `Rejected unregistered tool call: "${toolName}"`,
      });
      return {
        success: false,
        error: `Security violation: Tool "${toolName}" is not part of the registered ALINA tool system.`,
      };
    }

    // 2. Execute via registry with active context and safety checks
    const execution = await this.registry.execute(toolName, rawParams, context);
    return {
      success: execution.success,
      data: execution.data,
      error: execution.error,
    };
  }
}
