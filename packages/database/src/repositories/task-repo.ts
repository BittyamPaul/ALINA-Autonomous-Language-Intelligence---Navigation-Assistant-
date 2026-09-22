import { BaseRepository } from './base-repository';
import {
  TaskEntity,
  TaskSchema,
  TaskStepEntity,
  TaskStepSchema,
  ApprovalEntity,
  ApprovalSchema,
  TaskStatus,
  CanonicalTaskState,
  fromCanonicalTaskState,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';
import { TaskCheckpointRepository } from './task-checkpoint-repo';

export class TaskRepository extends BaseRepository<TaskEntity> {
  private stepRepo: BaseRepository<TaskStepEntity>;
  private approvalRepo: BaseRepository<ApprovalEntity>;
  private checkpointRepo: TaskCheckpointRepository;

  constructor(client: AlinaDatabaseClient) {
    super(client, 'task', TaskSchema);
    this.stepRepo = new BaseRepository(client, 'task_step', TaskStepSchema);
    this.approvalRepo = new BaseRepository(client, 'approval', ApprovalSchema);
    this.checkpointRepo = new TaskCheckpointRepository(client);
  }

  public getCheckpointRepository(): TaskCheckpointRepository {
    return this.checkpointRepo;
  }

  public async createTaskWithSteps(
    task: TaskEntity,
    steps: TaskStepEntity[]
  ): Promise<{ task: TaskEntity; steps: TaskStepEntity[] }> {
    const validatedTask = this.schema.parse(task);
    const taskIdKey = (validatedTask.id.includes(':') ? validatedTask.id.split(':')[1] : validatedTask.id) || validatedTask.id;

    // 1. If SurrealDB is live, wrap in an atomic transactional block
    if (this.client.isConnected()) {
      try {
        const statements: string[] = ['BEGIN TRANSACTION;'];
        const vars: Record<string, unknown> = {
          taskId: taskIdKey,
          taskContent: validatedTask,
        };
        statements.push('UPSERT type::record("task", $taskId) CONTENT $taskContent;');

        const createdSteps: TaskStepEntity[] = [];
        steps.forEach((step, idx) => {
          const validatedStep = TaskStepSchema.parse(step);
          const stepIdKey = (validatedStep.id.includes(':') ? validatedStep.id.split(':')[1] : validatedStep.id) || validatedStep.id;
          vars[`stepId_${idx}`] = stepIdKey;
          vars[`stepContent_${idx}`] = validatedStep;
          vars[`stepIdx_${idx}`] = validatedStep.index;
          statements.push(`UPSERT type::record("task_step", $stepId_${idx}) CONTENT $stepContent_${idx};`);
          statements.push(
            `RELATE (type::record("task", $taskId))->contains_step->(type::record("task_step", $stepId_${idx})) SET step_index = $stepIdx_${idx};`
          );
          createdSteps.push(validatedStep);
        });

        statements.push('COMMIT TRANSACTION;');
        await this.client.query(statements.join('\n'), vars);

        this.inMemoryStore.set(taskIdKey, validatedTask);
        for (const createdStep of createdSteps) {
          const stepIdKey = (createdStep.id.includes(':') ? createdStep.id.split(':')[1] : createdStep.id) || createdStep.id;
          this.client.getInMemoryTable<TaskStepEntity>('task_step').set(stepIdKey, createdStep);
        }

        return { task: validatedTask, steps: createdSteps };
      } catch (err) {
        throw new Error(`Failed to create task with steps atomically: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Offline / Local In-Memory Fallback with Automatic Rollback
    const createdTask = await this.create(task);
    const createdSteps: TaskStepEntity[] = [];
    try {
      for (const step of steps) {
        const createdStep = await this.stepRepo.create(step);
        createdSteps.push(createdStep);
      }
      return { task: createdTask, steps: createdSteps };
    } catch (err) {
      // Rollback created steps & task
      for (const createdStep of createdSteps) {
        await this.stepRepo.delete(createdStep.id).catch(() => {});
      }
      await this.delete(createdTask.id).catch(() => {});
      throw err;
    }
  }

  public async getTaskSteps(taskId: string): Promise<TaskStepEntity[]> {
    const allSteps = await this.stepRepo.list();
    return allSteps
      .filter((s) => s.taskId === taskId)
      .sort((a, b) => a.index - b.index);
  }

  public async updateStatus(taskId: string, status: TaskStatus): Promise<TaskEntity | null> {
    return this.update(taskId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  public async updateCanonicalState(
    taskId: string,
    state: CanonicalTaskState,
    patch?: Partial<TaskEntity>
  ): Promise<TaskEntity | null> {
    return this.update(taskId, {
      ...patch,
      canonicalState: state,
      status: fromCanonicalTaskState(state),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Retrieves all tasks that are currently in an active or non-terminal state.
   */
  public async getIncompleteTasks(): Promise<TaskEntity[]> {
    const all = await this.list(500);
    const terminalStates = new Set([
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'completed',
      'failed',
      'cancelled',
    ]);

    return all.filter((task) => {
      const canonical = task.canonicalState;
      const status = task.status;
      const isCanonicalTerminal = canonical ? terminalStates.has(canonical) : false;
      const isStatusTerminal = status ? terminalStates.has(status) : false;
      return !isCanonicalTerminal && !isStatusTerminal;
    });
  }

  public async createApprovalGate(approval: ApprovalEntity): Promise<ApprovalEntity> {
    const created = await this.approvalRepo.create(approval);

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `RELATE (type::record("task", $taskId))->requires->(type::record("approval", $appId)) SET is_resolved = false;`,
          {
            taskId: approval.taskId,
            appId: created.id,
          }
        );
      } catch {
        // Fallback
      }
    }

    return created;
  }

  public async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected' | 'cancelled' | 'expired',
    decisionBy: string,
    rejectionReason?: string,
    grantToken?: string
  ): Promise<ApprovalEntity | null> {
    const updated = await this.approvalRepo.update(approvalId, {
      status: decision,
      decisionBy,
      decisionAt: new Date().toISOString(),
      rejectionReason,
      grantToken,
    });

    if (updated && this.client.isConnected()) {
      try {
        await this.client.query(
          `UPDATE requires SET is_resolved = true WHERE out = type::record("approval", $appId);`,
          { appId: approvalId }
        );
      } catch {
        // Fallback
      }
    }

    return updated;
  }

  public async getPendingApprovals(taskId: string): Promise<ApprovalEntity[]> {
    const all = await this.approvalRepo.list();
    return all.filter((a) => a.taskId === taskId && a.status === 'pending');
  }

  public async cancelApproval(approvalId: string, reason: string): Promise<ApprovalEntity | null> {
    return this.resolveApproval(approvalId, 'cancelled', 'operator', reason);
  }
}
