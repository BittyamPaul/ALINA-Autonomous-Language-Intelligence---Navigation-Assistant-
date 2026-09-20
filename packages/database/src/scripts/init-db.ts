/**
 * ALINA Database Initialization & Migration CLI
 *
 * Can be executed locally or inside a Docker container:
 *   pnpm db:init
 *   pnpm db:seed
 *   docker compose run --rm db-init
 */

import { AlinaDatabaseClient } from '../client';
import type { DatabaseConfig } from '../config';
import { MigrationRunner } from '../migrations/migration-runner';
import { migration001InitialSchema } from '../migrations/001_initial_schema';
import { seedDevelopmentDatabase } from '../seeds/dev-seed';

interface InitOptions {
  seed: boolean;
  maxAttempts: number;
  retryDelayMs: number;
  endpoint?: string;
  clientConfig?: Partial<DatabaseConfig>;
}

export async function runDatabaseInit(options: Partial<InitOptions> = {}): Promise<{
  success: boolean;
  migrationsApplied: string[];
  seeded: boolean;
}> {
  const opts: InitOptions = {
    seed: options.seed ?? process.argv.includes('--seed'),
    maxAttempts: options.maxAttempts ?? (process.env.DB_INIT_MAX_ATTEMPTS ? Number(process.env.DB_INIT_MAX_ATTEMPTS) : 15),
    retryDelayMs: options.retryDelayMs ?? 1000,
    endpoint: options.endpoint,
    clientConfig: options.clientConfig,
  };

  console.info('====================================================');
  console.info(' ALINA Database Initialization & Migration Runner');
  console.info('====================================================');

  const client = new AlinaDatabaseClient(opts.clientConfig ?? (opts.endpoint ? { endpoint: opts.endpoint } : undefined));
  const config = client.getConfig();

  console.info(`Target Endpoint : ${config.endpoint}`);
  console.info(`Namespace       : ${config.namespace}`);
  console.info(`Database        : ${config.database}`);
  console.info(`Seed Enabled    : ${opts.seed ? 'YES' : 'NO'}`);
  console.info('----------------------------------------------------');

  // Step 1: Wait for SurrealDB availability
  let connected = false;
  let attempt = 1;

  while (attempt <= opts.maxAttempts) {
    console.info(`[init-db] Probing SurrealDB at ${config.endpoint} (attempt ${attempt}/${opts.maxAttempts})...`);
    const health = await client.healthCheck();
    if (health.healthy) {
      connected = true;
      console.info(`[init-db] SurrealDB is healthy (latency: ${health.latencyMs ?? 0}ms).`);
      break;
    }

    console.warn(`[init-db] SurrealDB not ready yet (${health.error || 'probing...'}). Waiting ${opts.retryDelayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs));
    attempt++;
  }

  if (!connected) {
    console.error(`[init-db] FATAL: Failed to establish connection to SurrealDB after ${opts.maxAttempts} attempts.`);
    return {
      success: false,
      migrationsApplied: [],
      seeded: false,
    };
  }

  try {
    // Step 2: Register & Execute Migrations
    console.info('[init-db] Executing idempotent schema migrations...');
    const runner = new MigrationRunner(client);
    runner.register(migration001InitialSchema);

    const result = await runner.up();
    console.info(`[init-db] Migrations applied: [${result.applied.join(', ')}] | Skipped: [${result.skipped.join(', ')}]`);

    // Step 3: Optional Seeding
    let seeded = false;
    if (opts.seed) {
      console.info('[init-db] Populating development seed fixture...');
      const seedResult = await seedDevelopmentDatabase(client);
      console.info(`[init-db] Seed complete: User="${seedResult.user}", Workspace="${seedResult.workspace}", Memories=${seedResult.memoryCount}`);
      seeded = true;
    }

    console.info('====================================================');
    console.info(' ALINA Database Initialization Completed Successfully');
    console.info('====================================================');

    return {
      success: true,
      migrationsApplied: result.applied,
      seeded,
    };
  } catch (err) {
    console.error('[init-db] FATAL error during database initialization:', err);
    throw err;
  } finally {
    await client.close();
  }
}

// Execute directly when invoked via CLI
if (typeof require !== 'undefined' && require.main === module) {
  runDatabaseInit()
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch(() => {
      process.exit(1);
    });
}
