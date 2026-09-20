import { Agent as MastraAgent } from '@mastra/core/agent';
import { AgentConfig } from './agent-config';

export interface ModelToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ModelGenerationResult {
  text: string;
  toolCalls?: ModelToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelAdapterContext {
  systemPrompt?: string;
  availableTools?: Array<{ name: string; description: string }>;
  taskId?: string;
}

export interface ModelAdapter {
  generate(prompt: string, context?: ModelAdapterContext): Promise<ModelGenerationResult>;
}

/**
 * MastraModelAdapter connects directly to Mastra's official Agent router.
 * Supports any model supported by Mastra (e.g. 'openai/gpt-4o', 'anthropic/claude-3-5-sonnet', etc.).
 */
export class MastraModelAdapter implements ModelAdapter {
  private config: AgentConfig;
  private tools?: Record<string, unknown>;

  constructor(config: AgentConfig, options?: { tools?: Record<string, unknown> }) {
    this.config = config;
    this.tools = options?.tools;
  }

  public async generate(prompt: string, context?: ModelAdapterContext): Promise<ModelGenerationResult> {
    try {
      const agentOptions: Record<string, unknown> = {
        id: this.config.id,
        name: this.config.name,
        instructions: context?.systemPrompt ?? this.config.instructions ?? '',
        model: this.config.model,
      };

      if (this.tools) {
        agentOptions.tools = this.tools;
      }

      const agent = new MastraAgent(agentOptions as any);
      const response: any = await agent.generate(prompt);

      // Extract tool calls from Mastra response
      const toolCalls: ModelToolCall[] = [];

      // 1. Direct response.toolCalls (standard Vercel AI / Mastra format)
      if (Array.isArray(response.toolCalls)) {
        for (const tc of response.toolCalls) {
          toolCalls.push({
            toolName: tc.toolName || tc.name || '',
            parameters: (typeof tc.args === 'object' && tc.args ? tc.args : tc.parameters) || {},
          });
        }
      }

      // 2. Extracted from response.steps (multi-step execution)
      if (toolCalls.length === 0 && Array.isArray(response.steps)) {
        for (const step of response.steps) {
          if (Array.isArray(step.toolCalls)) {
            for (const tc of step.toolCalls) {
              toolCalls.push({
                toolName: tc.toolName || tc.name || '',
                parameters: (typeof tc.args === 'object' && tc.args ? tc.args : tc.parameters) || {},
              });
            }
          }
        }
      }

      // 3. Fallback: check response.toolResults
      if (toolCalls.length === 0 && Array.isArray(response.toolResults)) {
        for (const tr of response.toolResults) {
          toolCalls.push({
            toolName: tr.toolName || tr.name || '',
            parameters: (typeof tr.args === 'object' && tr.args ? tr.args : tr.parameters) || {},
          });
        }
      }

      // In Mastra, response.text contains the generated textual content
      return {
        text: response.text ?? '',
        toolCalls,
        usage: {
          promptTokens: response.usage?.promptTokens || response.usage?.inputTokens || 0,
          completionTokens: response.usage?.completionTokens || response.usage?.outputTokens || 0,
          totalTokens: response.usage?.totalTokens || 0,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`MastraModelAdapter generation failed: ${errorMsg}`);
    }
  }
}

/**
 * MockModelAdapter provides deterministic, offline model simulation for unit tests,
 * CI/CD environments, and predictable end-to-end task validation without external API keys.
 */
export class MockModelAdapter implements ModelAdapter {
  private customHandler?: (prompt: string, context?: ModelAdapterContext) => Promise<ModelGenerationResult>;

  constructor(customHandler?: (prompt: string, context?: ModelAdapterContext) => Promise<ModelGenerationResult>) {
    this.customHandler = customHandler;
  }

  public async generate(prompt: string, context?: ModelAdapterContext): Promise<ModelGenerationResult> {
    if (this.customHandler) {
      return this.customHandler(prompt, context);
    }

    // Default deterministic behavior:
    // If prompt requests workspace or files inspection, call safe_workspace_inspector
    const lower = prompt.toLowerCase();
    if (lower.includes('workspace') || lower.includes('file') || lower.includes('inspect') || lower.includes('list')) {
      return {
        text: 'Inspecting the registered workspace.',
        toolCalls: [
          {
            toolName: 'safe_workspace_inspector',
            parameters: {
              path: '.',
              maxItems: 10,
            },
          },
        ],
        usage: {
          promptTokens: 50,
          completionTokens: 30,
          totalTokens: 80,
        },
      };
    }

    return {
      text: `Understood goal: "${prompt}". Completed task with standard response.`,
      usage: {
        promptTokens: 40,
        completionTokens: 20,
        totalTokens: 60,
      },
    };
  }
}
