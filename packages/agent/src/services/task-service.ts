import { z } from 'zod';
import {
  AlinaDatabaseClient,
  TaskRepository,
  GraphRepository,
  TaskCheckpointRepository,
  TaskRiskLevelSchema,
  TaskStatusSchema,
  CanonicalTaskStateSchema,
  type TaskEntity,
  type TaskStepEntity,
  type TaskStatus,
  type CanonicalTaskState,
  type TaskCheckpointEntity,
} from '@alina/database';
import { AlinaServiceError } from './base-service';

export const CreateTaskStepInputSchema = z.object({
  title: z.string().min(1),
  toolName: z.string().min(1),
  parameters: z.record(z.unknown()).default({}),
  riskLevel: TaskRiskLevelSchema.default('LOW'),
  verificationRule: z.record(z.unknown()).optional(),
});
export type CreateTaskStepInput = z.input<typeof CreateTaskStepInputSchema>;

export const CreateTaskInputSchema = z.object({
  id: z.string().optional(),
  goal: z.string().min(1, 'Goal cannot be empty').max(1000),
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  conversationId: z.string().optional(),
  riskLevel: TaskRiskLevelSchema.default('LOW'),
  steps: z.array(CreateTaskStepInputSchema).default([]),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskStatusInputSchema = z.object({
  status: TaskStatusSchema,
  resultSummary: z.string().optional(),
});
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;

export class TaskService {
  private taskRepo: TaskRepository;
  private graphRepo: GraphRepository;

  constructor(client: AlinaDatabaseClient) {
    this.taskRepo = new TaskRepository(client);
    this.graphRepo = new GraphRepository(client);
  }

  public async create(input: CreateTaskInput, userId = 'default_operator'): Promise<{ task: TaskEntity; steps: TaskStepEntity[] }> {
    const validated = CreateTaskInputSchema.parse(input);
    const taskId = validated.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const taskEntity: TaskEntity = {
      id: taskId,
      goal: validated.goal,
      workspaceId: validated.workspaceId,
      conversationId: validated.conversationId,
      status: 'draft',
      riskLevel: validated.riskLevel,
      plan: { stepCount: validated.steps.length },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stepEntities: TaskStepEntity[] = validated.steps.map((s, idx) => ({
      id: `step_${taskId}_${idx}`,
      taskId,
      index: idx,
      title: s.title,
      toolName: s.toolName,
      parameters: s.parameters,
      status: 'pending',
      riskLevel: s.riskLevel,
      verificationRule: s.verificationRule,
    }));

    const result = await this.taskRepo.createTaskWithSteps(taskEntity, stepEntities);
    await this.graphRepo.relate(`user:${userId}`, 'created', `task:${result.task.id}`);

    return result;
  }

  public async getById(id: string): Promise<{ task: TaskEntity; steps: TaskStepEntity[] }> {
    const task = await this.taskRepo.findById(id);
    if (!task) {
      throw new AlinaServiceError(`Task with ID ${id} was not found`, 'TASK_NOT_FOUND', 404);
    }
    const steps = await this.taskRepo.getTaskSteps(id);
    return { task, steps };
  }

  public async list(filter?: { workspaceId?: string; status?: TaskStatus }): Promise<TaskEntity[]> {
    let all = await this.taskRepo.list(200);
    if (filter?.workspaceId) {
      all = all.filter((t) => t.workspaceId === filter.workspaceId);
    }
    if (filter?.status) {
      all = all.filter((t) => t.status === filter.status);
    }
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateStatus(id: string, input: UpdateTaskStatusInput): Promise<TaskEntity> {
    const validated = UpdateTaskStatusInputSchema.parse(input);
    const updated = await this.taskRepo.update(id, {
      status: validated.status,
      resultSummary: validated.resultSummary,
      updatedAt: new Date().toISOString(),
    });

    if (!updated) {
      throw new AlinaServiceError(`Cannot update status: Task ${id} not found`, 'TASK_NOT_FOUND', 404);
    }
    return updated;
  }

  public async updateCanonicalState(
    id: string,
    state: CanonicalTaskState,
    patch?: Partial<TaskEntity>
  ): Promise<TaskEntity> {
    const validatedState = CanonicalTaskStateSchema.parse(state);
    const updated = await this.taskRepo.updateCanonicalState(id, validatedState, patch);

    if (!updated) {
      throw new AlinaServiceError(`Cannot update canonical state: Task ${id} not found`, 'TASK_NOT_FOUND', 404);
    }
    return updated;
  }

  public async saveCheckpoint(checkpoint: TaskCheckpointEntity): Promise<TaskCheckpointEntity> {
    return this.taskRepo.getCheckpointRepository().saveCheckpoint(checkpoint);
  }

  public async getLatestCheckpoint(taskId: string): Promise<TaskCheckpointEntity | null> {
    return this.taskRepo.getCheckpointRepository().getLatestCheckpoint(taskId);
  }

  public async getIncompleteTasks(): Promise<TaskEntity[]> {
    return this.taskRepo.getIncompleteTasks();
  }

  public getTaskRepository(): TaskRepository {
    return this.taskRepo;
  }

  public getCheckpointRepository(): TaskCheckpointRepository {
    return this.taskRepo.getCheckpointRepository();
  }
}
