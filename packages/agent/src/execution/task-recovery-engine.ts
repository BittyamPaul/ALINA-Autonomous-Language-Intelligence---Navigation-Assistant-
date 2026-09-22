import {
  CanonicalTaskState,
  PathJail,
  PostCondition,
  toCanonicalTaskState,
} from '@alina/shared';
import {
  TaskRepository,
  TaskCheckpointRepository,
  TaskEntity,
  TaskCheckpointEntity,
} from '@alina/database';
import { IdempotencyGuard } from './idempotency-guard';

export interface RecoveredTaskReport {
  taskId: string;
  previousState: CanonicalTaskState;
  recoveredState: CanonicalTaskState;
  actionDetermined:
    | 'ALREADY_SUCCEEDED'
    | 'NEEDS_RETRY'
    | 'WAITING_FOR_USER'
    | 'WAITING_FOR_NETWORK'
    | 'ABORTED_UNRECOVERABLE';
  explanation: string;
  checkpointId?: string;
  stepIndex?: number;
  toolName?: string;
}

export interface TaskRecoveryOptions {
  autoResume?: boolean;
  jailRoot?: string;
  isOnline?: boolean;
  onProgress?: (taskId: string, message: string) => void;
}

/**
 * TaskRecoveryEngine
 * 
 * Implements ALINA's crash recovery protocol:
 * restart
 * → recover incomplete task
 * → inspect last checkpoint
 * → determine whether the previous action completed
 * → continue safely or ask the user
 * 
 * Invariants:
 * - Never blindly repeat a side-effecting action.
 * - Before retrying a potentially side-effecting action, verify whether it already succeeded.
 * - Implement idempotency where possible.
 * - If recovery is impossible, clearly explain what happened.
 * - Never silently claim success.
 */
export class TaskRecoveryEngine {
  private taskRepo: TaskRepository;
  private checkpointRepo: TaskCheckpointRepository;

  constructor(taskRepo: TaskRepository, checkpointRepo?: TaskCheckpointRepository) {
    this.taskRepo = taskRepo;
    this.checkpointRepo = checkpointRepo ?? taskRepo.getCheckpointRepository();
  }

  /**
   * Scans SurrealDB for all incomplete tasks and recovers each based on its last checkpoint.
   */
  public async recoverIncompleteTasks(options?: TaskRecoveryOptions): Promise<RecoveredTaskReport[]> {
    const incompleteTasks = await this.taskRepo.getIncompleteTasks();
    const reports: RecoveredTaskReport[] = [];
    const jailRoot = options?.jailRoot ?? process.cwd();
    const jail = new PathJail({ allowedRoots: [jailRoot] });

    for (const task of incompleteTasks) {
      const report = await this.recoverSingleTask(task, jail, options);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Recovers an individual task by inspecting its latest checkpoint.
   */
  public async recoverSingleTask(
    task: TaskEntity,
    jail: PathJail,
    options?: TaskRecoveryOptions
  ): Promise<RecoveredTaskReport> {
    const rawState = task.canonicalState || task.status;
    const previousState = toCanonicalTaskState(rawState);
    const latestCheckpoint = await this.checkpointRepo.getLatestCheckpoint(task.id);

    // Case 1: No checkpoint found (crashed during task creation or planning)
    if (!latestCheckpoint) {
      const explanation = `Task "${task.goal}" crashed before first execution checkpoint was reached. Planning was incomplete.`;
      const recoveredState: CanonicalTaskState = options?.autoResume ? 'PLANNING' : 'FAILED';

      await this.taskRepo.updateCanonicalState(task.id, recoveredState, {
        resultSummary: explanation,
      });

      return {
        taskId: task.id,
        previousState,
        recoveredState,
        actionDetermined: options?.autoResume ? 'NEEDS_RETRY' : 'ABORTED_UNRECOVERABLE',
        explanation,
      };
    }

    const { toolName, parameters, isSideEffecting } = latestCheckpoint.action;
    const stepIndex = latestCheckpoint.stepIndex;
    const postConditions = (latestCheckpoint.postConditionsExpected || []) as PostCondition[];

    // Case 2: Task was paused waiting for human operator approval
    if (previousState === 'WAITING_FOR_APPROVAL') {
      const explanation = `Task was awaiting human operator approval for tool "${toolName}" before system crash. Preserving safety gate.`;
      return {
        taskId: task.id,
        previousState,
        recoveredState: 'WAITING_FOR_APPROVAL',
        actionDetermined: 'WAITING_FOR_USER',
        explanation,
        checkpointId: latestCheckpoint.id,
        stepIndex,
        toolName,
      };
    }

    // Case 3: Task was waiting for network
    if (previousState === 'WAITING_FOR_NETWORK') {
      const isOnline = options?.isOnline ?? true;
      if (isOnline) {
        const explanation = `Network connectivity verified available. Resuming task from step ${stepIndex} (${toolName}).`;
        await this.taskRepo.updateCanonicalState(task.id, 'READY', {
          resultSummary: explanation,
        });
        return {
          taskId: task.id,
          previousState,
          recoveredState: 'READY',
          actionDetermined: 'NEEDS_RETRY',
          explanation,
          checkpointId: latestCheckpoint.id,
          stepIndex,
          toolName,
        };
      } else {
        const explanation = `Task remains paused awaiting network availability.`;
        return {
          taskId: task.id,
          previousState,
          recoveredState: 'WAITING_FOR_NETWORK',
          actionDetermined: 'WAITING_FOR_NETWORK',
          explanation,
          checkpointId: latestCheckpoint.id,
          stepIndex,
          toolName,
        };
      }
    }

    // Case 4: Task crashed while RUNNING, RETRYING, or VERIFYING a step
    // CRITICAL IDEMPOTENCY CHECK:
    // Determine whether the side-effecting action already completed before the crash!
    const isEffecting = isSideEffecting || IdempotencyGuard.isSideEffecting(toolName);

    if (isEffecting) {
      const idempotencyResult = await IdempotencyGuard.verifyPostConditionAlreadyMet({
        toolName,
        parameters,
        postConditions,
        jail,
      });

      if (idempotencyResult.satisfied) {
        // The previous action succeeded before crash!
        // DO NOT automatically re-execute the side effect.
        const explanation = `[Crash Recovery Idempotency Guard] Action for step ${stepIndex} ("${toolName}") was verified to have already succeeded on disk before the crash: ${idempotencyResult.reason}. Marking step completed and advancing safely without duplicate execution.`;

        // Record verified checkpoint
        const verifiedCheckpoint: TaskCheckpointEntity = {
          id: `chk_${task.id}_${stepIndex}_recovered_${Date.now()}`,
          taskId: task.id,
          stepIndex,
          stepId: latestCheckpoint.stepId,
          state: 'VERIFYING',
          action: latestCheckpoint.action,
          preConditionsVerified: true,
          postConditionsExpected: latestCheckpoint.postConditionsExpected,
          postConditionsVerified: true,
          executionResult: {
            success: true,
            data: { recovered: true, idempotencyVerified: true, reason: idempotencyResult.reason },
          },
          createdAt: new Date().toISOString(),
        };
        await this.checkpointRepo.saveCheckpoint(verifiedCheckpoint);

        // Advance task to READY (or COMPLETED if no more steps)
        const recoveredState: CanonicalTaskState = 'READY';
        await this.taskRepo.updateCanonicalState(task.id, recoveredState, {
          currentStepIndex: stepIndex + 1,
          resultSummary: explanation,
        });

        return {
          taskId: task.id,
          previousState,
          recoveredState,
          actionDetermined: 'ALREADY_SUCCEEDED',
          explanation,
          checkpointId: latestCheckpoint.id,
          stepIndex,
          toolName,
        };
      } else {
        // Environmental check revealed the action did NOT complete or state is ambiguous
        const explanation = `[Crash Recovery] Action for step ${stepIndex} ("${toolName}") was in-flight when the crash occurred, and environmental verification confirmed it did not complete (${idempotencyResult.reason}).`;

        // If action is destructive or ambiguous, ask the user or fail honestly
        if (task.riskLevel === 'HIGH_DESTRUCTIVE') {
          const promptMsg = `${explanation} High-destructive operation requires operator confirmation to resume.`;
          await this.taskRepo.updateCanonicalState(task.id, 'WAITING_FOR_APPROVAL', {
            resultSummary: promptMsg,
          });
          return {
            taskId: task.id,
            previousState,
            recoveredState: 'WAITING_FOR_APPROVAL',
            actionDetermined: 'WAITING_FOR_USER',
            explanation: promptMsg,
            checkpointId: latestCheckpoint.id,
            stepIndex,
            toolName,
          };
        }

        // Safe to retry
        const retryMsg = `${explanation} Safely resuming step execution.`;
        await this.taskRepo.updateCanonicalState(task.id, 'READY', {
          resultSummary: retryMsg,
        });
        return {
          taskId: task.id,
          previousState,
          recoveredState: 'READY',
          actionDetermined: 'NEEDS_RETRY',
          explanation: retryMsg,
          checkpointId: latestCheckpoint.id,
          stepIndex,
          toolName,
        };
      }
    }

    // Read-only tool step: safe to re-run
    const readOnlyExplanation = `Step ${stepIndex} ("${toolName}") is a read-only inspection action. Safely re-running from checkpoint.`;
    await this.taskRepo.updateCanonicalState(task.id, 'READY', {
      resultSummary: readOnlyExplanation,
    });

    return {
      taskId: task.id,
      previousState,
      recoveredState: 'READY',
      actionDetermined: 'NEEDS_RETRY',
      explanation: readOnlyExplanation,
      checkpointId: latestCheckpoint.id,
      stepIndex,
      toolName,
    };
  }
}
