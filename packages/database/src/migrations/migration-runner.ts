import { AlinaDatabaseClient } from '../client';

export interface Migration {
  version: string;
  name: string;
  up: (client: AlinaDatabaseClient) => Promise<void>;
}

export interface AppliedMigration {
  id: string;
  version: string;
  name: string;
  applied_at: string;
  checksum?: string;
}

export class MigrationRunner {
  private client: AlinaDatabaseClient;
  private migrations: Migration[] = [];
  private static inMemoryApplied = new Set<string>();

  constructor(client: AlinaDatabaseClient) {
    this.client = client;
  }

  public register(migration: Migration): this {
    this.migrations.push(migration);
    // Keep migrations sorted by version
    this.migrations.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    return this;
  }

  public async getAppliedVersions(): Promise<string[]> {
    if (this.client.isConnected()) {
      try {
        const results = await this.client.query<AppliedMigration>(
          'SELECT version FROM _schema_migrations ORDER BY version ASC;'
        );
        // SurrealDB query returns array of results per statement
        const rows = Array.isArray(results[0]) ? (results[0] as unknown as AppliedMigration[]) : [];
        return rows.map((r) => r.version);
      } catch {
        return Array.from(MigrationRunner.inMemoryApplied);
      }
    }
    return Array.from(MigrationRunner.inMemoryApplied);
  }

  public async up(): Promise<{ applied: string[]; skipped: string[] }> {
    const applied: string[] = [];
    const skipped: string[] = [];

    // Ensure _schema_migrations table definition if connected
    if (this.client.isConnected()) {
      try {
        await this.client.query(`
          DEFINE TABLE IF NOT EXISTS _schema_migrations SCHEMAFULL;
          DEFINE FIELD IF NOT EXISTS version ON TABLE _schema_migrations TYPE string;
          DEFINE FIELD IF NOT EXISTS name ON TABLE _schema_migrations TYPE string;
          DEFINE FIELD IF NOT EXISTS applied_at ON TABLE _schema_migrations TYPE datetime DEFAULT time::now();
        `);
      } catch {
        // Fallback to in-memory tracking
      }
    }

    const appliedVersions = new Set(await this.getAppliedVersions());

    for (const migration of this.migrations) {
      if (appliedVersions.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }

      console.info(`[MigrationRunner] Applying migration ${migration.version}: ${migration.name}...`);
      await migration.up(this.client);

      if (this.client.isConnected()) {
        try {
          await this.client.query(
            `CREATE _schema_migrations CONTENT {
              version: $version,
              name: $name,
              applied_at: time::now()
            };`,
            {
              version: migration.version,
              name: migration.name,
            }
          );
        } catch {
          // Fallback to in-memory tracking
        }
      }

      MigrationRunner.inMemoryApplied.add(migration.version);
      applied.push(migration.version);
      console.info(`[MigrationRunner] Successfully applied migration ${migration.version}.`);
    }

    return { applied, skipped };
  }
}
