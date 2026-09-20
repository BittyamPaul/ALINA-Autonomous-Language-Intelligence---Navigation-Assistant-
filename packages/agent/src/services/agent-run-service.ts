import {
  AlinaDatabaseClient,
  BaseRepository,
  AgentRunSchema,
  GraphRepository,
  type AgentRunEntity,
} from '@alina/database';
import { AlinaServiceError } from './base-service';

export class AgentRunService {
  private runRepo: BaseRepository<AgentRunEntity>;
  private graphRepo: GraphRepository;

  constructor(client: AlinaDatabaseClient) {
    this.runRepo = new BaseRepository(client, 'agent_run', AgentRunSchema);
    this.graphRepo = new GraphRepository(client);
  }

  public async startRun(
    taskId: string,
    agentId = 'supervisor_agent',
    options?: {
      parentRunId?: string;
      delegationReason?: string;
      inputPayload?: Record<string, unknown>;
    }
  ): Promise<AgentRunEntity> {
    const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entity: AgentRunEntity = {
      id,
      taskId,
      agentId,
      parentRunId: options?.parentRunId,
      delegationReason: options?.delegationReason,
      inputPayload: options?.inputPayload,
      status: 'running',
      stepCount: 0,
      tokenUsage: {},
      startedAt: new Date().toISOString(),
    };

    const created = await this.runRepo.create(entity);
    await this.graphRepo.relate(`task:${taskId}`, 'executed_by', `agent_run:${created.id}`);

    // If this is a delegated subagent run, record graph relationship in SurrealDB
    if (options?.parentRunId) {
      try {
        await this.graphRepo.relate(
          `agent_run:${options.parentRunId}`,
          'delegated_to',
          `agent_run:${created.id}`
        );
      } catch {
        // Fallback gracefully if graph edge exists
      }
    }

    return created;
  }

  public async updateRun(
    id: string,
    patch: {
      status?: AgentRunEntity['status'];
      stepCount?: number;
      tokenUsage?: Record<string, number>;
      outputPayload?: unknown;
      endedAt?: string;
    }
  ): Promise<AgentRunEntity> {
    const updated = await this.runRepo.update(id, patch);
    if (!updated) {
      throw new AlinaServiceError(`Agent run with ID ${id} was not found`, 'RUN_NOT_FOUND', 404);
    }
    return updated;
  }

  public async getById(id: string): Promise<AgentRunEntity> {
    const run = await this.runRepo.findById(id);
    if (!run) {
      throw new AlinaServiceError(`Agent run with ID ${id} was not found`, 'RUN_NOT_FOUND', 404);
    }
    return run;
  }

  public async listForTask(taskId: string): Promise<AgentRunEntity[]> {
    const all = await this.runRepo.list(200);
    return all.filter((r) => r.taskId === taskId);
  }
}
