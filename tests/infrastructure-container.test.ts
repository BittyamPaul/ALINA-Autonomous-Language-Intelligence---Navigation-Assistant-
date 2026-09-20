import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runDatabaseInit } from '../packages/database/src/scripts/init-db';

describe('ALINA Infrastructure & Containerization Architecture', () => {
  const rootDir = path.resolve(__dirname, '..');

  // ===========================================================================
  // 1. Environment Template & Security Secrets Audit
  // ===========================================================================
  describe('1. Environment Configuration & Secret Leak Protection', () => {
    const envExamplePath = path.join(rootDir, '.env.example');

    it('.env.example exists and contains comprehensive configuration categories', () => {
      expect(fs.existsSync(envExamplePath)).toBe(true);
      const content = fs.readFileSync(envExamplePath, 'utf8');

      const expectedKeys = [
        'NODE_ENV',
        'PORT',
        'HOST',
        'SURREAL_ENDPOINT',
        'SURREAL_NAMESPACE',
        'SURREAL_DATABASE',
        'SURREAL_USERNAME',
        'SURREAL_PASSWORD',
        'COMPOSE_PROJECT_NAME',
        'DOCKER_SURREALDB_PORT',
        'DOCKER_SERVER_PORT',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GEMINI_API_KEY',
        'OLLAMA_BASE_URL',
        'ALINA_SANDBOX_ALLOWED_ROOTS',
        'ALINA_LOG_LEVEL',
        'ALINA_TELEMETRY_ENABLED',
      ];

      for (const key of expectedKeys) {
        expect(content).toContain(key);
      }
    });

    it('STRICT SECURITY RULE: .env.example contains ZERO real API keys or credentials', () => {
      const content = fs.readFileSync(envExamplePath, 'utf8');

      // Reject common real secret patterns
      expect(content).not.toMatch(/sk-ant-api[a-zA-Z0-9_-]{20,}/);
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{32,}/);
      expect(content).not.toMatch(/ghp_[a-zA-Z0-9]{30,}/);
      expect(content).not.toMatch(/-----BEGIN (RSA|EC|PRIVATE) KEY-----/);

      // Model provider keys must be empty strings or purely commented placeholders
      const anthropicLine = content.split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
      expect(anthropicLine?.trim()).toBe('ANTHROPIC_API_KEY=');

      const openaiLine = content.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
      expect(openaiLine?.trim()).toBe('OPENAI_API_KEY=');

      const geminiLine = content.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
      expect(geminiLine?.trim()).toBe('GEMINI_API_KEY=');
    });

    it('.dockerignore strictly excludes sensitive environment and local secret files', () => {
      const dockerignorePath = path.join(rootDir, '.dockerignore');
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      const content = fs.readFileSync(dockerignorePath, 'utf8');

      expect(content).toContain('.env');
      expect(content).toContain('.env.local');
      expect(content).toContain('node_modules');
      expect(content).toContain('.git');
      expect(content).toContain('apps/desktop/src-tauri/target');
    });
  });

  // ===========================================================================
  // 2. Multi-Stage Dockerfile Architecture & Container Best Practices
  // ===========================================================================
  describe('2. Dockerfile Architecture & Security Hardening', () => {
    const serverDockerfile = path.join(rootDir, 'infrastructure', 'docker', 'Dockerfile.server');
    const dbInitDockerfile = path.join(rootDir, 'infrastructure', 'docker', 'Dockerfile.db-init');

    it('Dockerfile.server implements multi-stage builds (base, deps, builder, runner)', () => {
      expect(fs.existsSync(serverDockerfile)).toBe(true);
      const content = fs.readFileSync(serverDockerfile, 'utf8');

      expect(content).toMatch(/FROM\s+node:\d+-alpine\s+AS\s+base/);
      expect(content).toMatch(/FROM\s+base\s+AS\s+deps/);
      expect(content).toMatch(/FROM\s+base\s+AS\s+builder/);
      expect(content).toMatch(/FROM\s+base\s+AS\s+runner/);
    });

    it('Dockerfile.server adheres to unprivileged non-root user execution', () => {
      const content = fs.readFileSync(serverDockerfile, 'utf8');
      expect(content).toContain('addgroup --system');
      expect(content).toContain('adduser --system');
      expect(content).toContain('USER nextjs');
    });

    it('Dockerfile.server configures container health checks and dumb-init process manager', () => {
      const content = fs.readFileSync(serverDockerfile, 'utf8');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('/api/health');
      expect(content).toContain('dumb-init');
      expect(content).toContain('EXPOSE 3000');
    });

    it('Dockerfile.db-init configures lightweight one-shot migration runner', () => {
      expect(fs.existsSync(dbInitDockerfile)).toBe(true);
      const content = fs.readFileSync(dbInitDockerfile, 'utf8');

      expect(content).toContain('@alina/database');
      expect(content).toContain('dumb-init');
      expect(content).toContain('db:init');
      expect(content).toContain('USER dbinit');
    });
  });

  // ===========================================================================
  // 3. Docker Compose Orchestration & Environments
  // ===========================================================================
  describe('3. Docker Compose Services & Network Isolation', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    const composeDevPath = path.join(rootDir, 'docker-compose.dev.yml');
    const composeProdPath = path.join(rootDir, 'docker-compose.prod.yml');

    it('docker-compose.yml defines surrealdb, alina-server, and db-init services', () => {
      expect(fs.existsSync(composePath)).toBe(true);
      const content = fs.readFileSync(composePath, 'utf8');

      expect(content).toContain('surrealdb:');
      expect(content).toContain('alina-server:');
      expect(content).toContain('db-init:');
      expect(content).toContain('surrealdb/surrealdb:v2.2.1');
      expect(content).toContain('alina-bridge-network');
      expect(content).toContain('alina-surreal-data');
    });

    it('docker-compose.yml enforces healthcheck dependencies and non-containerized Tauri', () => {
      const content = fs.readFileSync(composePath, 'utf8');

      // Server depends on healthy SurrealDB
      expect(content).toContain('condition: service_healthy');

      // Verify Tauri desktop client is NOT containerized
      expect(content).not.toContain('tauri-app:');
      expect(content).not.toContain('src-tauri');
    });

    it('docker-compose.dev.yml configures live source volume mounting and dev profile', () => {
      expect(fs.existsSync(composeDevPath)).toBe(true);
      const content = fs.readFileSync(composeDevPath, 'utf8');

      expect(content).toContain('NODE_ENV=development');
      expect(content).toContain('/surreal');
      expect(content).toContain('alina-dev.db');
      expect(content).toContain('db:seed');
    });

    it('docker-compose.prod.yml specifies resource quotas and log rotation policies', () => {
      expect(fs.existsSync(composeProdPath)).toBe(true);
      const content = fs.readFileSync(composeProdPath, 'utf8');

      expect(content).toContain('cpus:');
      expect(content).toContain('memory:');
      expect(content).toContain('json-file');
      expect(content).toContain('max-size:');
      expect(content).toContain('no-new-privileges:true');
    });
  });

  // ===========================================================================
  // 4. Database Initialization Logic & Robust Error Recovery
  // ===========================================================================
  describe('4. Database Initializer CLI & Error Handling', () => {
    it('runDatabaseInit probes SurrealDB and cleanly reports offline state without unhandled exception', async () => {
      // Execute with 1 attempt to verify connection failure handling
      const result = await runDatabaseInit({
        maxAttempts: 1,
        retryDelayMs: 50,
        seed: false,
        endpoint: 'http://127.0.0.1:59999/rpc',
      });

      expect(result.success).toBe(false);
      expect(result.migrationsApplied).toEqual([]);
      expect(result.seeded).toBe(false);
    });
  });

  // ===========================================================================
  // 5. Clean Machine Setup Guide & Operational Commands
  // ===========================================================================
  describe('5. Clean Machine Setup Documentation & Script Commands', () => {
    const setupDocPath = path.join(rootDir, 'SETUP.md');
    const packageJsonPath = path.join(rootDir, 'package.json');

    it('SETUP.md documents step-by-step onboarding, prerequisites, and Tauri architecture', () => {
      expect(fs.existsSync(setupDocPath)).toBe(true);
      const content = fs.readFileSync(setupDocPath, 'utf8');

      expect(content).toContain('Prerequisites');
      expect(content).toContain('Docker Desktop');
      expect(content).toContain('pnpm docker:dev');
      expect(content).toContain('pnpm docker:prod');
      expect(content).toContain('pnpm db:init');
      expect(content).toContain('pnpm db:seed');
      expect(content).toContain('Native Host Client (Not Containerized)');
      expect(content).toContain('Troubleshooting');
    });

    it('root package.json defines unified operational commands for dev, prod, test, and db', () => {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(pkg.scripts['docker:dev']).toBeDefined();
      expect(pkg.scripts['docker:prod']).toBeDefined();
      expect(pkg.scripts['docker:build']).toBeDefined();
      expect(pkg.scripts['docker:down']).toBeDefined();
      expect(pkg.scripts['db:init']).toBeDefined();
      expect(pkg.scripts['db:seed']).toBeDefined();
    });
  });
});
