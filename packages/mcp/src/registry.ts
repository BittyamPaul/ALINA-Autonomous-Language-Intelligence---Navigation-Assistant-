import {
  McpToolDefinition,
  McpToolGroup,
  McpToolContext,
  McpToolExecutionResult,
} from './tool-contract';
import { permissionToRiskLevel } from './permissions';

/**
 * AlinaMcpToolRegistry
 * 
 * Central registry managing all MCP tools in ALINA.
 * Enforces:
 * - Unique tool names
 * - Strict Zod input & output schema validation
 * - 3-tier permission classification (SAFE, REQUIRES_APPROVAL, HIGH_RISK)
 * - Execution timeout enforcement
 * - Robust structured error handling (no unhandled rejections)
 * - Automatic audit logging
 */
export class AlinaMcpToolRegistry {
  private tools: Map<string, McpToolDefinition> = new Map();

  /**
   * Registers a tool into the central registry.
   * Throws an error if a tool with the same unique name is already registered.
   */
  public register(tool: McpToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`[McpToolRegistry] Tool "${tool.name}" is already registered. Tool names must be strictly unique.`);
    }

    // Validate required fields
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('[McpToolRegistry] Tool registration failed: name is required and must be a string.');
    }
    if (!tool.description) {
      throw new Error(`[McpToolRegistry] Tool "${tool.name}" is missing a description.`);
    }
    if (!tool.inputSchema || !tool.outputSchema) {
      throw new Error(`[McpToolRegistry] Tool "${tool.name}" must define both inputSchema and outputSchema.`);
    }
    if (!tool.permission) {
      throw new Error(`[McpToolRegistry] Tool "${tool.name}" must declare a permission classification (SAFE, REQUIRES_APPROVAL, HIGH_RISK).`);
    }

    this.tools.set(tool.name, tool);
  }

  public get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public listByGroup(group: McpToolGroup): McpToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.group === group);
  }

  /**
   * Executes a registered MCP tool under strict safety, validation, timeout, and audit controls.
   */
  public async execute(
    name: string,
    rawInput: unknown,
    context: McpToolContext = {}
  ): Promise<McpToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      const errorMsg = `Tool "${name}" is not registered in the central ALINA MCP tool registry.`;
      if (context.auditLogger) {
        context.auditLogger.log({
          actionType: 'sandbox_violation',
          toolName: name,
          riskLevel: 'HIGH_DESTRUCTIVE',
          outcome: 'blocked',
          details: errorMsg,
        });
      }
      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        permission: 'HIGH_RISK',
        auditLogged: Boolean(context.auditLogger),
      };
    }

    const permission = tool.permission;
    const riskLevel = permissionToRiskLevel(permission);

    // 1. Strict Input Schema Validation
    const inputParse = tool.inputSchema.safeParse(rawInput ?? {});
    if (!inputParse.success) {
      const errorMsg = `Invalid input for tool "${name}": ${inputParse.error.message}`;
      if (context.auditLogger) {
        context.auditLogger.log({
          actionType: 'tool_execution',
          toolName: name,
          riskLevel,
          parameters: typeof rawInput === 'object' && rawInput ? (rawInput as Record<string, unknown>) : {},
          outcome: 'failure',
          details: errorMsg,
        });
      }
      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        permission,
        auditLogged: Boolean(context.auditLogger),
      };
    }

    // 2. Permission Gate Enforcement with Interactive Elicitation
    if ((permission === 'REQUIRES_APPROVAL' || permission === 'HIGH_RISK') && !context.isApprovalGranted) {
      if (context.requestApproval) {
        try {
          const decision = await context.requestApproval({
            toolName: name,
            parameters: (inputParse.data as Record<string, unknown>) || {},
            permission,
            reason: `Tool "${name}" requires operator approval (${permission}).`,
          });
          if (decision.approved) {
            context.isApprovalGranted = true;
            if (decision.grantToken) {
              context.grantToken = decision.grantToken;
            }
          }
        } catch {
          // Rejection or failure handled below
        }
      }
    }

    if ((permission === 'REQUIRES_APPROVAL' || permission === 'HIGH_RISK') && !context.isApprovalGranted) {
      const errorMsg = `Execution blocked: Tool "${name}" requires explicit user approval (Permission: ${permission}).`;
      if (context.auditLogger) {
        context.auditLogger.log({
          actionType: 'sandbox_violation',
          toolName: name,
          riskLevel,
          parameters: inputParse.data as Record<string, unknown>,
          outcome: 'blocked',
          details: errorMsg,
        });
      }
      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        permission,
        auditLogged: Boolean(context.auditLogger),
      };
    }

    // 3. Timeout & Execution Wrapper
    const timeoutMs = tool.timeoutMs || 15000;

    try {
      const executionPromise = tool.execute(inputParse.data, context);
      
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Tool "${name}" execution timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      });

      const rawResult = await Promise.race([executionPromise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      // 4. Strict Output Schema Validation
      const outputParse = tool.outputSchema.safeParse(rawResult);
      if (!outputParse.success) {
        const errorMsg = `Tool "${name}" produced invalid output structure: ${outputParse.error.message}`;
        if (context.auditLogger) {
          context.auditLogger.log({
            actionType: 'tool_execution',
            toolName: name,
            riskLevel,
            parameters: inputParse.data as Record<string, unknown>,
            outcome: 'failure',
            details: errorMsg,
          });
        }
        return {
          success: false,
          error: errorMsg,
          durationMs: Date.now() - startTime,
          permission,
          auditLogged: Boolean(context.auditLogger),
        };
      }

      // 5. Successful Execution & Audit Log
      const durationMs = Date.now() - startTime;
      if (context.auditLogger) {
        context.auditLogger.log({
          actionType: 'tool_execution',
          toolName: name,
          riskLevel,
          parameters: inputParse.data as Record<string, unknown>,
          outcome: 'success',
          details: `Executed in ${durationMs}ms`,
        });
      }

      return {
        success: true,
        data: outputParse.data,
        durationMs,
        permission,
        auditLogged: Boolean(context.auditLogger),
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (context.auditLogger) {
        context.auditLogger.log({
          actionType: 'tool_execution',
          toolName: name,
          riskLevel,
          parameters: inputParse.data as Record<string, unknown>,
          outcome: 'failure',
          details: errorMsg,
        });
      }

      return {
        success: false,
        error: errorMsg,
        durationMs,
        permission,
        auditLogged: Boolean(context.auditLogger),
      };
    }
  }
}
