import Surreal from 'surrealdb';
import { loadDatabaseConfig, type DatabaseConfig } from './config';

export class AlinaDatabaseClient {
  private db: Surreal;
  private config: DatabaseConfig;
  private connected = false;
  private inMemoryTables = new Map<string, Map<string, unknown>>();

  constructor(configOverrides?: Partial<DatabaseConfig>) {
    this.config = loadDatabaseConfig(configOverrides);
    this.db = new Surreal();
  }

  public getInMemoryTable<T = unknown>(tableName: string): Map<string, T> {
    if (!this.inMemoryTables.has(tableName)) {
      this.inMemoryTables.set(tableName, new Map<string, unknown>());
    }
    return this.inMemoryTables.get(tableName) as Map<string, T>;
  }

  public getRawClient(): Surreal {
    return this.db;
  }

  public getConfig(): DatabaseConfig {
    return this.config;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(): Promise<boolean> {
    let attempt = 0;
    while (attempt <= this.config.maxRetries) {
      try {
        await this.db.connect(this.config.endpoint, { versionCheck: false } as Record<string, unknown>);
        await this.db.signin({
          username: this.config.username,
          password: this.config.password,
        });
        try {
          await this.db.use({
            namespace: this.config.namespace,
            database: this.config.database,
          });
        } catch {
          try {
            await this.db.query(`DEFINE NAMESPACE ${this.config.namespace};`);
          } catch {
            // Already defined or root-level
          }
          try {
            await this.db.use({ namespace: this.config.namespace });
            await this.db.query(`DEFINE DATABASE ${this.config.database};`);
          } catch {
            // Already defined
          }
          await this.db.use({
            namespace: this.config.namespace,
            database: this.config.database,
          });
        }
        this.connected = true;
        return true;
      } catch (err) {
        attempt++;
        this.connected = false;
        if (attempt > this.config.maxRetries) {
          console.warn(
            `[AlinaDatabaseClient] Could not connect to SurrealDB at ${this.config.endpoint} after ${attempt} attempts:`,
            err instanceof Error ? err.message : String(err)
          );
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs * attempt));
      }
    }
    return false;
  }

  public async close(): Promise<void> {
    if (this.connected) {
      try {
        await this.db.close();
      } finally {
        this.connected = false;
      }
    }
  }

  public async healthCheck(): Promise<{
    healthy: boolean;
    endpoint: string;
    namespace: string;
    database: string;
    latencyMs?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      if (!this.connected) {
        const ok = await this.connect();
        if (!ok) {
          return {
            healthy: false,
            endpoint: this.config.endpoint,
            namespace: this.config.namespace,
            database: this.config.database,
            error: 'Connection failed',
          };
        }
      }
      await this.db.query('RETURN true;');
      return {
        healthy: true,
        endpoint: this.config.endpoint,
        namespace: this.config.namespace,
        database: this.config.database,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        healthy: false,
        endpoint: this.config.endpoint,
        namespace: this.config.namespace,
        database: this.config.database,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async query<T = unknown>(
    surql: string,
    vars?: Record<string, unknown>
  ): Promise<T[]> {
    if (!this.connected) {
      const ok = await this.connect();
      if (!ok) {
        console.warn(
          `[AlinaDatabaseClient] Database is not connected to ${this.config.endpoint}; returning offline fallback.`
        );
        return [] as T[];
      }
    }
    const results = await this.db.query(surql, vars);
    return results as T[];
  }

  public async applySchema(schemaSql: string): Promise<void> {
    if (!this.connected) {
      const ok = await this.connect();
      if (!ok) {
        // Offline / in-memory fallback for unit testing
        return;
      }
    }
    await this.db.query(schemaSql);
  }
}

export class AlinaDatabase extends AlinaDatabaseClient {
  private fallbackTasks = new Map<string, unknown>();

  public async saveTask<T extends { id: string }>(task: T): Promise<T> {
    if (this.isConnected()) {
      try {
        await this.query('UPSERT type::record("task", $id) MERGE $task;', {
          id: task.id,
          task,
        });
        return task;
      } catch {
        // Fallback
      }
    }
    this.fallbackTasks.set(task.id, task);
    return task;
  }

  public async getTask<T = unknown>(taskId: string): Promise<T | null> {
    if (this.isConnected()) {
      try {
        const results = await this.query<T>('SELECT * FROM type::record("task", $id);', {
          id: taskId,
        });
        const first = results[0];
        if (Array.isArray(first)) {
          const row = (first as T[])[0];
          if (row) return row;
        } else if (first) {
          return first;
        }
      } catch {
        // Fallback
      }
    }
    return (this.fallbackTasks.get(taskId) as T) ?? null;
  }
}

