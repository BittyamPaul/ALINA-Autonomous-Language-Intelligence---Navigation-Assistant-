import {
  AlinaDatabaseClient,
  BaseRepository,
  ToolCallSchema,
  type ToolCallEntity,
} from '@alina/database';
import { createDefaultToolRegistry, ToolRegistry, type RiskLevel } from '@alina/tools';
import { AlinaServiceError } from './base-service';

export class ToolService {
  private callRepo: BaseRepository<ToolCallEntity>;
  private registry: ToolRegistry;

  constructor(client: AlinaDatabaseClient, registry?: ToolRegistry) {
    this.callRepo = new BaseRepository(client, 'tool_call', ToolCallSchema);
    this.registry = registry || createDefaultToolRegistry();
  }

  public listAvailableTools(): Array<{
    name: string;
    description: string;
    riskLevel: RiskLevel;
  }> {
    return this.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      riskLevel: t.defaultRiskLevel,
    }));
  }

  public getToolByName(name: string) {
    const tool = this.registry.get(name);
    if (!tool) {
      throw new AlinaServiceError(`Tool '${name}' is not registered in the system`, 'TOOL_NOT_FOUND', 404);
    }
    return {
      name: tool.name,
      description: tool.description,
      riskLevel: tool.defaultRiskLevel,
    };
  }

  public async logToolCall(data: {
    agentRunId: string;
    toolId: string;
    taskStepId?: string;
    inputParameters: Record<string, unknown>;
    outputPayload?: unknown;
    durationMs: number;
    status: 'success' | 'failed' | 'rejected';
  }): Promise<ToolCallEntity> {
    const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entity: ToolCallEntity = {
      id,
      agentRunId: data.agentRunId,
      toolId: data.toolId,
      taskStepId: data.taskStepId,
      inputParameters: data.inputParameters,
      outputPayload: data.outputPayload,
      durationMs: data.durationMs,
      status: data.status,
      createdAt: new Date().toISOString(),
    };
    return this.callRepo.create(entity);
  }

  public async listRecentCalls(limit = 50): Promise<ToolCallEntity[]> {
    const all = await this.callRepo.list(Math.max(limit, 500));
    return all
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

