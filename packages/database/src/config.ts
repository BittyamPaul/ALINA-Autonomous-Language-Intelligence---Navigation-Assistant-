import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  endpoint: z.string().default('http://127.0.0.1:8000/rpc'),
  namespace: z.string().min(1).default('alina'),
  database: z.string().min(1).default('main'),
  username: z.string().default('root'),
  password: z.string().default('root'),
  timeoutMs: z.number().int().positive().default(5000),
  maxRetries: z.number().int().nonnegative().default(3),
  retryDelayMs: z.number().int().positive().default(500),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function loadDatabaseConfig(overrides?: Partial<DatabaseConfig>): DatabaseConfig {
  const raw = {
    endpoint: process.env.ALINA_SURREAL_URL || overrides?.endpoint || 'http://127.0.0.1:8000/rpc',
    namespace: process.env.ALINA_SURREAL_NS || overrides?.namespace || 'alina',
    database: process.env.ALINA_SURREAL_DB || overrides?.database || 'main',
    username: process.env.ALINA_SURREAL_USER || overrides?.username || 'root',
    password: process.env.ALINA_SURREAL_PASS || overrides?.password || 'root',
    timeoutMs: process.env.ALINA_DATABASE_TIMEOUT_MS
      ? parseInt(process.env.ALINA_DATABASE_TIMEOUT_MS, 10)
      : (overrides?.timeoutMs ?? 5000),
    maxRetries: process.env.ALINA_DATABASE_MAX_RETRIES
      ? parseInt(process.env.ALINA_DATABASE_MAX_RETRIES, 10)
      : (overrides?.maxRetries ?? 3),
    retryDelayMs: overrides?.retryDelayMs ?? 500,
  };

  return DatabaseConfigSchema.parse(raw);
}
