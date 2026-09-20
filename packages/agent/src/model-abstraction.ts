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
    const hasApiKey = Boolean(
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.MISTRAL_API_KEY ||
      process.env.GROQ_API_KEY
    );

    if (hasApiKey) {
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
        console.warn(
          `[MastraModelAdapter] Remote model generation failed (${err instanceof Error ? err.message : String(err)}). Utilizing local deterministic planner fallback.`
        );
      }
    }

    return this.fallbackLocalPlanner(prompt, context);
  }

  private fallbackLocalPlanner(prompt: string, context?: ModelAdapterContext): ModelGenerationResult {
    const lower = prompt.toLowerCase();

    // 1. Filesystem inspection / directory listing
    if (lower.includes('workspace') || lower.includes('list') || lower.includes('inspect') || lower.includes('directory')) {
      const toolName = context?.availableTools?.some((t) => t.name === 'safe_workspace_inspector')
        ? 'safe_workspace_inspector'
        : context?.availableTools?.some((t) => t.name === 'fs_list_dir')
        ? 'fs_list_dir'
        : 'safe_workspace_inspector';

      return {
        text: `Inspecting directory contents for: "${prompt}".`,
        toolCalls: [
          {
            toolName,
            parameters: { path: '.', maxItems: 10 },
          },
        ],
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      };
    }

    // 2. Read file
    if (lower.includes('read') && (lower.includes('file') || lower.includes('.txt') || lower.includes('.json') || lower.includes('.md'))) {
      const match = prompt.match(/(?:read|cat|view)\s+(?:file\s+)?([^\s"']+)/i);
      const filePath = match?.[1] ?? 'package.json';
      return {
        text: `Reading file ${filePath}.`,
        toolCalls: [
          {
            toolName: 'fs_read_file',
            parameters: { path: filePath },
          },
        ],
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      };
    }

    // 3. Write / Create file (mutating, will trigger HITL approval as required)
    if (lower.includes('create') || lower.includes('write') || lower.includes('save')) {
      const match = prompt.match(/(?:create|write|save)\s+(?:file\s+)?([^\s"']+)/i);
      const targetPath = match?.[1] ?? 'alina_output.txt';
      return {
        text: `Creating file ${targetPath}.`,
        toolCalls: [
          {
            toolName: 'fs_write_file',
            parameters: { path: targetPath, content: '// Created by ALINA autonomous agent' },
          },
        ],
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      };
    }

    // 4. Delete file (mutating, will trigger HITL approval as required)
    if (lower.includes('delete') || lower.includes('remove') || lower.includes('purge')) {
      const match = prompt.match(/(?:delete|remove|purge)\s+(?:file\s+)?([^\s"']+)/i);
      const targetPath = match?.[1] ?? 'temp.txt';
      return {
        text: `Deleting file ${targetPath}.`,
        toolCalls: [
          {
            toolName: 'fs_delete_file',
            parameters: { path: targetPath },
          },
        ],
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      };
    }

    // 5. System info
    if (lower.includes('system') || lower.includes('os') || lower.includes('hardware') || lower.includes('status')) {
      return {
        text: 'Checking local operating system status.',
        toolCalls: [
          {
            toolName: 'os_get_system_info',
            parameters: {},
          },
        ],
        usage: { promptTokens: 20, completionTokens: 20, totalTokens: 40 },
      };
    }

    // 6. Generic task completion
    return {
      text: `Processed objective: "${prompt}". Execution plan formulated cleanly.`,
      toolCalls: [],
      usage: { promptTokens: 25, completionTokens: 15, totalTokens: 40 },
    };
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
