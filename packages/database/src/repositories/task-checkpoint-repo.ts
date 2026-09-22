import { BaseRepository } from './base-repository';
import {
  TaskCheckpointEntity,
  TaskCheckpointSchema,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export class TaskCheckpointRepository extends BaseRepository<TaskCheckpointEntity> {
  constructor(client: AlinaDatabaseClient = new AlinaDatabaseClient()) {
    super(client, 'task_checkpoint', TaskCheckpointSchema);
  }

  /**
   * Persists a task checkpoint atomically.
   */
  public async saveCheckpoint(checkpoint: TaskCheckpointEntity): Promise<TaskCheckpointEntity> {
    const validated = this.schema.parse(checkpoint);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record("task_checkpoint", $id) CONTENT $content;`,
          {
            id: idKey,
            content: validated,
          }
        );
        this.inMemoryStore.set(idKey, validated);
        return validated;
      } catch (err) {
        console.warn(`[TaskCheckpointRepository.saveCheckpoint] SurrealDB error, using fallback:`, err);
      }
    }

    return this.create(validated);
  }

  /**
   * Retrieves all checkpoints for a given task, sorted chronologically.
   */
  public async getCheckpointsForTask(taskId: string): Promise<TaskCheckpointEntity[]> {
    const taskIdClean = (taskId.includes(':') ? taskId.split(':')[1] : taskId) || taskId;
    const all = await this.list(500);
    return all
      .filter((cp) => {
        const cpTaskId = (cp.taskId.includes(':') ? cp.taskId.split(':')[1] : cp.taskId) || cp.taskId;
        return cpTaskId === taskIdClean;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Retrieves the most recent checkpoint for a given task.
   */
  public async getLatestCheckpoint(taskId: string): Promise<TaskCheckpointEntity | null> {
    const checkpoints = await this.getCheckpointsForTask(taskId);
    if (checkpoints.length === 0) return null;
    return checkpoints[checkpoints.length - 1] ?? null;
  }

  /**
   * Prunes older checkpoints, keeping only the most recent N checkpoints for a task.
   */
  public async pruneCheckpoints(taskId: string, keepLastCount = 10): Promise<void> {
    const checkpoints = await this.getCheckpointsForTask(taskId);
    if (checkpoints.length <= keepLastCount) return;

    const toDelete = checkpoints.slice(0, checkpoints.length - keepLastCount);
    for (const cp of toDelete) {
      await this.delete(cp.id).catch(() => {});
    }
  }
}
