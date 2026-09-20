import { createTool } from '@mastra/core/tools';
import {
  AlinaMcpToolRegistry,
  McpToolDefinition,
  McpToolContext,
  McpToolExecutionResult,
} from '@alina/mcp';
import { SecuritySandboxError } from '@alina/shared';
import { AuthorizationManager } from './security/authorization-manager';

/**
 * McpAgentBridge
 * 
 * Bridges ALINA's central MCP Tool Registry with Mastra's tool and agent engine.
 * Decouples tool capabilities completely from the supervisor.
 */
export class McpAgentBridge {
  private registry: AlinaMcpToolRegistry;

  constructor(registry: AlinaMcpToolRegistry) {
    this.registry = registry;
  }

  public getRegistry(): AlinaMcpToolRegistry {
    return this.registry;
  }

  /**
   * Adapts a single McpToolDefinition into a Mastra createTool instance.
   */
  public adaptMcpToolToMastra(
    toolDef: McpToolDefinition,
    getContext: () => McpToolContext
  ) {
    return createTool({
      id: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      outputSchema: toolDef.outputSchema,
      execute: async (inputParams: unknown) => {
        const context = getContext();

        // Centralized Authorization & Permission check
        if (toolDef.permission === 'REQUIRES_APPROVAL' || toolDef.permission === 'HIGH_RISK') {
          const grantToken = context.grantToken || context.authorizationGrant?.grantId;
          if (!grantToken && !context.isApprovalGranted) {
            if (context.auditLogger) {
              context.auditLogger.log({
                actionType: 'sandbox_violation',
                toolName: toolDef.name,
                riskLevel: 'HIGH_DESTRUCTIVE',
                parameters: inputParams as Record<string, unknown>,
                outcome: 'blocked',
                details: `Action requires operator approval (Permission: ${toolDef.permission}). No valid authorization grant.`,
              });
            }
            throw new SecuritySandboxError(
              `Tool "${toolDef.name}" requires explicit user approval before execution. Cannot bypass authorization.`,
              toolDef.name
            );
          }

          if (grantToken) {
            const authManager = AuthorizationManager.getInstance();
            authManager.validateAndConsumeGrant(toolDef.name, inputParams, grantToken);
          }
        }

        const execution = await this.registry.execute(toolDef.name, inputParams, context);
        if (!execution.success) {
          throw new Error(execution.error ?? `Tool "${toolDef.name}" failed.`);
        }

        return execution.data;
      },
    });
  }

  /**
   * Generates a dictionary of Mastra tools from all registered MCP tools in the registry.
   */
  public toMastraTools(getContext: () => McpToolContext): Record<string, ReturnType<typeof createTool>> {
    const mastraTools: Record<string, ReturnType<typeof createTool>> = {};
    const tools = this.registry.list();

    for (const toolDef of tools) {
      mastraTools[toolDef.name] = this.adaptMcpToolToMastra(toolDef, getContext);
    }

    return mastraTools;
  }

  /**
   * Controlled execution gateway for the supervisor loop.
   */
  public async executeControlled(
    toolName: string,
    rawInput: unknown,
    context: McpToolContext
  ): Promise<McpToolExecutionResult> {
    return this.registry.execute(toolName, rawInput, context);
  }

  /**
   * Returns list of tools formatted for model prompt context.
   */
  public listToolsForModel(): Array<{ name: string; description: string; group: string; permission: string }> {
    return this.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      group: t.group,
      permission: t.permission,
    }));
  }
}
