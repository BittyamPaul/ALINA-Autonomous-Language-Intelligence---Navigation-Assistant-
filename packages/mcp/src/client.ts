import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface AlinaMcpClientOptions {
  name?: string;
  version?: string;
}

export interface McpCallToolResult {
  isError: boolean;
  content: string;
  parsed?: unknown;
}

/**
 * AlinaMcpClient
 * 
 * Standard MCP client for connecting to internal or external MCP servers
 * over InMemory, Stdio, or SSE transports.
 */
export class AlinaMcpClient {
  private client: Client;
  private connected = false;

  constructor(options: AlinaMcpClientOptions = {}) {
    this.client = new Client(
      {
        name: options.name ?? 'alina-mcp-client',
        version: options.version ?? '0.1.0',
      },
      {
        capabilities: {},
      }
    );
  }

  public async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
    this.connected = true;
  }

  public async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: unknown }>> {
    const response = await this.client.listTools();
    return response.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  public async callTool(name: string, parameters: Record<string, unknown> = {}): Promise<McpCallToolResult> {
    const result = await this.client.callTool({
      name,
      arguments: parameters,
    });

    const isError = Boolean(result.isError);
    let content = '';

    if (Array.isArray(result.content)) {
      content = result.content
        .map((c) => ('text' in c ? c.text : JSON.stringify(c)))
        .join('\n');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = content;
    }

    return {
      isError,
      content,
      parsed,
    };
  }

  public getRawClient(): Client {
    return this.client;
  }
}
