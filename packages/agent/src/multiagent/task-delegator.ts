import {
  AgentType,
  DelegationRequest,
  StructuredTaskResult,
  AgentEventEnvelope,
} from '@alina/shared';
import { BaseSpecializedAgent } from './base-specialized-agent';
import { AgentRunService } from '../services/agent-run-service';

export interface DelegatorOptions {
  agentRunService?: AgentRunService;
  onProgress?: (event: AgentEventEnvelope) => void;
}

/**
 * TaskDelegator
 * 
 * Central coordinator enforcing ALINA's multi-agent communication boundaries:
 * 1. Guarantees state isolation: agents communicate ONLY through structured task results.
 * 2. Persists child agent runs and SurrealDB graph relationships (`delegated_to`).
 * 3. Enforces timeouts and captures failure reasons.
 * 4. Emits real-time progress events for desktop UI observability.
 */
export class TaskDelegator {
  private registry = new Map<AgentType, BaseSpecializedAgent>();
  private agentRunService?: AgentRunService;
  private onProgress?: (event: AgentEventEnvelope) => void;

  constructor(options?: DelegatorOptions) {
    this.agentRunService = options?.agentRunService;
    this.onProgress = options?.onProgress;
  }

  /**
   * Registers a specialized subagent.
   */
  public register(agent: BaseSpecializedAgent): void {
    this.registry.set(agent.agentType, agent);
  }

  /**
   * Checks if an agent for the specified type is registered.
   */
  public has(agentType: AgentType): boolean {
    return this.registry.has(agentType);
  }

  /**
   * Dispatches a structured delegation request to the designated specialized agent.
   */
  public async delegate(request: DelegationRequest): Promise<StructuredTaskResult> {
    const startTime = Date.now();
    const agent = this.registry.get(request.targetAgent);

    if (!agent) {
      return {
        delegationId: request.delegationId,
        targetAgent: request.targetAgent,
        status: 'failed',
        summary: `Delegation error: No specialized agent registered for type "${request.targetAgent}".`,
        error: `Agent type "${request.targetAgent}" not registered`,
        failureReason: 'unrecoverable',
        artifactsProduced: [],
        stepsExecuted: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Persist child agent run in SurrealDB
    let childRunId: string | undefined;
    if (this.agentRunService) {
      try {
        const run = await this.agentRunService.startRun(
          request.taskId,
          `${request.targetAgent}_agent`,
          {
            parentRunId: request.parentRunId,
            delegationReason: request.goal,
            inputPayload: request.context,
          }
        );
        childRunId = run.id;
      } catch {
        // Fallback gracefully if database is in offline mode
      }
    }

    // 2. Emit delegation start event
    this.emitProgress(
      request.taskId,
      `Delegated task to ${request.targetAgent}: "${request.goal}"`,
      'subagent:started',
      request.targetAgent
    );

    // 3. Execute with timeout wrapper
    let result: StructuredTaskResult;
    const timeoutMs = request.timeoutMs || 60000;

    try {
      const execPromise = agent.execute(request);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Subagent "${request.targetAgent}" execution timed out after ${timeoutMs}ms.`)), timeoutMs)
      );

      result = await Promise.race([execPromise, timeoutPromise]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMsg.includes('timed out');
      result = {
        delegationId: request.delegationId,
        targetAgent: request.targetAgent,
        status: 'failed',
        summary: `Execution failed in ${request.targetAgent}: ${errorMsg}`,
        error: errorMsg,
        failureReason: isTimeout ? 'timeout' : 'tool_error',
        artifactsProduced: [],
        stepsExecuted: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Update child agent run status in SurrealDB
    if (this.agentRunService && childRunId) {
      try {
        await this.agentRunService.updateRun(childRunId, {
          status: result.status === 'succeeded' ? 'succeeded' : 'failed',
          stepCount: result.stepsExecuted,
          outputPayload: result.data,
          endedAt: new Date().toISOString(),
        });
      } catch {
        // Fallback
      }
    }

    // 5. Emit completion or failure event
    this.emitProgress(
      request.taskId,
      result.status === 'succeeded'
        ? `${request.targetAgent} completed successfully: ${result.summary}`
        : `${request.targetAgent} reported failure: ${result.error}`,
      result.status === 'succeeded' ? 'subagent:completed' : 'subagent:failed',
      request.targetAgent
    );

    return result;
  }

  private emitProgress(
    taskId: string,
    message: string,
    type: AgentEventEnvelope['type'] = 'step:progress',
    agentType: AgentType
  ): void {
    if (this.onProgress) {
      this.onProgress({
        id: crypto.randomUUID(),
        taskId,
        timestamp: new Date().toISOString(),
        type,
        payload: {
          subagent: agentType,
          message,
        },
      });
    }
  }
}
