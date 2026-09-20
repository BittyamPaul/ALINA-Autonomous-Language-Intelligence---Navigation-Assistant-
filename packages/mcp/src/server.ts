import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AlinaMcpToolRegistry } from './registry';
import { McpToolContext, McpApprovalRequest, McpApprovalResponse } from './tool-contract';
import { z } from 'zod';

export interface AlinaMcpServerOptions {
  name?: string;
  version?: string;
  getContext?: () => McpToolContext;
  requestApproval?: (request: McpApprovalRequest) => Promise<McpApprovalResponse>;
}

/**
 * AlinaMcpServer
 * 
 * Exposes ALINA's registered MCP tools through the official Model Context Protocol.
 * Standard-compliant with any MCP client (Claude Desktop, Cursor, Mastra, custom).
 */
export class AlinaMcpServer {
  private server: McpServer;
  private registry: AlinaMcpToolRegistry;
  private getContext: () => McpToolContext;
  private requestApproval?: (request: McpApprovalRequest) => Promise<McpApprovalResponse>;

  constructor(registry: AlinaMcpToolRegistry, options: AlinaMcpServerOptions = {}) {
    this.registry = registry;
    this.getContext = options.getContext ?? (() => ({}));
    this.requestApproval = options.requestApproval;
    this.server = new McpServer({
      name: options.name ?? 'alina-mcp-server',
      version: options.version ?? '0.1.0',
    });

    this.registerAllTools();
  }

  private registerAllTools(): void {
    const tools = this.registry.list();

    for (const tool of tools) {
      // Unpack Zod schema shape for McpServer.tool registration
      let paramShape: Record<string, z.ZodTypeAny> = {};
      if (tool.inputSchema instanceof z.ZodObject) {
        paramShape = tool.inputSchema.shape;
      }

      this.server.tool(
        tool.name,
        tool.description,
        paramShape,
        async (args: Record<string, unknown>) => {
          const context = this.getContext();
          if (this.requestApproval && !context.requestApproval) {
            context.requestApproval = this.requestApproval;
          }
          const result = await this.registry.execute(tool.name, args, context);

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error executing ${tool.name}: ${result.error ?? 'Unknown error'}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result.data, null, 2),
              },
            ],
          };
        }
      );
    }
  }

  public async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  public async close(): Promise<void> {
    await this.server.close();
  }

  public getRawServer(): McpServer {
    return this.server;
  }
}
