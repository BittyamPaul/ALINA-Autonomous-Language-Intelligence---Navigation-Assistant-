import {
  AgentType,
  DelegationRequest,
  StructuredTaskResult,
  ArtifactReference,
} from '@alina/shared';

/**
 * BaseSpecializedAgent
 * 
 * Abstract foundational class for ALINA's specialized subagents:
 * 1. Browser Agent
 * 2. Filesystem Agent
 * 3. Computer Agent
 * 4. Research Agent
 * 5. Document Agent
 * 
 * Guarantees:
 * - Strict state isolation (no shared internal memory or property manipulation).
 * - Standardized execution contract via DelegationRequest -> StructuredTaskResult.
 * - Uniform error catching, timing, and structured reporting.
 */
export abstract class BaseSpecializedAgent {
  public abstract readonly agentType: AgentType;

  /**
   * Executes the delegated goal encapsulated in the request.
   * Receives only the isolated task context, preventing state leakage.
   */
  public abstract execute(request: DelegationRequest): Promise<StructuredTaskResult>;

  /**
   * Helper to format a successful structured task result.
   */
  protected createSuccessResult(
    request: DelegationRequest,
    summary: string,
    data: unknown,
    durationMs: number,
    stepsExecuted = 1,
    artifacts: ArtifactReference[] = []
  ): StructuredTaskResult {
    return {
      delegationId: request.delegationId,
      targetAgent: this.agentType,
      status: 'succeeded',
      summary,
      data,
      artifactsProduced: artifacts,
      stepsExecuted,
      durationMs,
    };
  }

  /**
   * Helper to format a structured failure result without crashing caller.
   */
  protected createFailureResult(
    request: DelegationRequest,
    error: unknown,
    durationMs: number,
    failureReason: StructuredTaskResult['failureReason'] = 'tool_error',
    stepsExecuted = 0
  ): StructuredTaskResult {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      delegationId: request.delegationId,
      targetAgent: this.agentType,
      status: 'failed',
      summary: `${this.agentType} failed to fulfill delegation: ${errorMsg}`,
      error: errorMsg,
      failureReason,
      artifactsProduced: [],
      stepsExecuted,
      durationMs,
    };
  }
}
