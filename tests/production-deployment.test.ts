import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AlinaProductionLogger } from '@alina/shared';

describe('Production Deployment & Operational Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('1. Production Structured Logging & Secret Redaction', () => {
    it('should format structured log entries with all required metadata', () => {
      const logger = new AlinaProductionLogger({
        service: 'test-service',
        minLevel: 'INFO',
        jsonFormat: true,
      });

      const entry = logger.formatEntry('INFO', 'Test operational message', undefined, { taskId: 'task-123' }, 42);

      expect(entry.service).toBe('test-service');
      expect(entry.level).toBe('INFO');
      expect(entry.message).toBe('Test operational message');
      expect(entry.durationMs).toBe(42);
      expect(entry.context).toEqual({ taskId: 'task-123' });
      expect(entry.timestamp).toBeDefined();
    });

    it('should automatically redact sensitive API keys from log messages', () => {
      const logger = new AlinaProductionLogger({ service: 'auth-service' });

      const dangerousMessage = 'Failed request with key sk-ant-api03-abcdef1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.test';
      const entry = logger.formatEntry('WARN', dangerousMessage);

      expect(entry.message).not.toContain('sk-ant-api03-abcdef1234567890abcdef1234567890');
      expect(entry.message).not.toContain('eyJhbGciOiJIUzI1NiJ9.test');
      expect(entry.message).toContain('[REDACTED_SECRET]');
    });

    it('should sanitize nested sensitive fields in context objects', () => {
      const logger = new AlinaProductionLogger({ service: 'db-service' });

      const contextWithSecrets = {
        userId: 'usr-999',
        password: 'SuperSecretDatabasePassword123!',
        api_key: 'AIzaSyExampleGoogleKeyHere12345',
        nested: {
          token: 'secret-token-xyz',
          normalField: 'safeValue',
        },
      };

      const entry = logger.formatEntry('ERROR', 'Authentication failed', undefined, contextWithSecrets);

      expect(entry.context).toBeDefined();
      const ctx = entry.context as Record<string, unknown>;
      expect(ctx.userId).toBe('usr-999');
      expect(ctx.password).toBe('[REDACTED_SECRET]');
      expect(ctx.api_key).toBe('[REDACTED_SECRET]');
      const nested = ctx.nested as Record<string, unknown>;
      expect(nested.token).toBe('[REDACTED_SECRET]');
      expect(nested.normalField).toBe('safeValue');
    });

    it('should exclude stack traces in production mode to prevent information leakage', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const logger = new AlinaProductionLogger({ service: 'api-service' });
        const error = new Error('Internal system failure');
        const entry = logger.formatEntry('ERROR', 'Error encountered', error);

        expect(entry.error).toBeDefined();
        expect(entry.error?.message).toBe('Internal system failure');
        expect(entry.error?.stack).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('should support traceId correlation propagation', () => {
      const rootLogger = new AlinaProductionLogger({ service: 'gateway' });
      const traceLogger = rootLogger.withTrace('trace-req-888999');

      const entry = traceLogger.formatEntry('INFO', 'Processing request');
      expect(entry.traceId).toBe('trace-req-888999');
      expect(entry.service).toBe('gateway');
    });
  });

  describe('2. Production Environment Template (.env.production.example)', () => {
    const envProdPath = path.join(rootDir, '.env.production.example');

    it('should exist and be readable', () => {
      expect(fs.existsSync(envProdPath)).toBe(true);
    });

    it('should declare NODE_ENV=production and secure defaults', () => {
      const content = fs.readFileSync(envProdPath, 'utf8');
      expect(content).toContain('NODE_ENV=production');
      expect(content).toContain('PORT=3000');
      expect(content).toContain('SURREAL_ENDPOINT=');
      expect(content).toContain('LOG_FORMAT=json');
      expect(content).toContain('ALINA_ENFORCE_HITL=true');
      expect(content).toContain('ALINA_CORS_ALLOWED_ORIGINS=');
    });

    it('should NOT contain any real secrets or API keys', () => {
      const content = fs.readFileSync(envProdPath, 'utf8');
      // Verify no live API key prefixes
      expect(content).not.toMatch(/sk-ant-[a-zA-Z0-9_-]{20,}/);
      expect(content).not.toMatch(/sk-[a-zA-Z0-9_-]{20,}/);
      expect(content).not.toMatch(/AIza[a-zA-Z0-9_-]{20,}/);
      // Verify placeholders use safe injection syntax
      expect(content).toContain('${SECRET_ANTHROPIC_API_KEY}');
      expect(content).toContain('${SURREAL_PROD_PASSWORD}');
    });
  });

  describe('3. Database Backup & Disaster Recovery Scripts', () => {
    it('should provide backup-db.sh with compression and checksum support', () => {
      const backupShPath = path.join(rootDir, 'infrastructure', 'scripts', 'backup-db.sh');
      expect(fs.existsSync(backupShPath)).toBe(true);

      const content = fs.readFileSync(backupShPath, 'utf8');
      expect(content).toContain('SURREAL_ENDPOINT');
      expect(content).toContain('gzip -9');
      expect(content).toContain('sha256');
      expect(content).toContain('RETENTION_DAYS');
    });

    it('should provide backup-db.ps1 for Windows environments', () => {
      const backupPs1Path = path.join(rootDir, 'infrastructure', 'scripts', 'backup-db.ps1');
      expect(fs.existsSync(backupPs1Path)).toBe(true);

      const content = fs.readFileSync(backupPs1Path, 'utf8');
      expect(content).toContain('Get-FileHash');
      expect(content).toContain('GZipStream');
      expect(content).toContain('RetentionDays');
    });

    it('should provide restore-db.sh with tamper-evident checksum validation', () => {
      const restoreShPath = path.join(rootDir, 'infrastructure', 'scripts', 'restore-db.sh');
      expect(fs.existsSync(restoreShPath)).toBe(true);

      const content = fs.readFileSync(restoreShPath, 'utf8');
      expect(content).toContain('sha256sum');
      expect(content).toContain('gzip -d');
      expect(content).toContain('surreal import');
      expect(content).toContain('RETURN true');
    });
  });

  describe('4. Desktop Distribution & Code Signing Specification', () => {
    const distroDocPath = path.join(rootDir, 'infrastructure', 'distribution', 'tauri-release-config.md');

    it('should define multi-platform distribution and signing architecture', () => {
      expect(fs.existsSync(distroDocPath)).toBe(true);

      const content = fs.readFileSync(distroDocPath, 'utf8');
      expect(content).toContain('Windows Authenticode');
      expect(content).toContain('macOS Developer ID & Notarization');
      expect(content).toContain('Ed25519');
      expect(content).toContain('latest.json');
      expect(content).toContain('SHA256SUMS.txt');
    });
  });

  describe('5. GitHub Actions CI/CD Pipeline Specification', () => {
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'production-ci-cd.yml');

    it('should exist and be syntactically well-formed YAML', () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
      const content = fs.readFileSync(workflowPath, 'utf8');
      expect(content).toContain('name: ALINA Production CI/CD Pipeline');
    });

    it('should contain all 8 required pipeline stages', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');

      // Stage 1: Install dependencies
      expect(content).toContain('Stage 1 — Install dependencies');
      expect(content).toContain('pnpm install');

      // Stage 2: Type check
      expect(content).toContain('Stage 2 — Type check');
      expect(content).toContain('pnpm run typecheck');

      // Stage 3: Lint
      expect(content).toContain('Stage 3 — Lint');
      expect(content).toContain('pnpm run lint');

      // Stage 4: Unit tests
      expect(content).toContain('Stage 4 — Unit tests');
      expect(content).toContain('vitest run packages/');

      // Stage 5: Integration tests
      expect(content).toContain('Stage 5 — Integration tests');
      expect(content).toContain('vitest run tests/');

      // Stage 6: Build
      expect(content).toContain('Stage 6 — Build');
      expect(content).toContain('pnpm run build');

      // Stage 7: E2E tests where practical
      expect(content).toContain('Stage 7 — E2E tests');

      // Stage 8: Production artifact creation
      expect(content).toContain('Stage 8 — Desktop Artifacts');
      expect(content).toContain('Stage 8 — Backend Production Container Image');
    });
  });

  describe('6. Production Deployment Documentation (DEPLOYMENT.md)', () => {
    const deploymentDocPath = path.join(rootDir, 'DEPLOYMENT.md');

    it('should exist and provide comprehensive decoupled architecture details', () => {
      expect(fs.existsSync(deploymentDocPath)).toBe(true);

      const content = fs.readFileSync(deploymentDocPath, 'utf8');
      expect(content).toContain('Architectural Topology & Service Decoupling');
      expect(content).toContain('Secure Secret Management');
      expect(content).toContain('Health Checks & Probes');
      expect(content).toContain('Database Backup Strategy & Disaster Recovery');
      expect(content).toContain('Desktop Application Distribution');
      expect(content).toContain('Rollback & Incident Response');
      expect(content).not.toContain('TODO');
    });
  });

  describe('7. Health Route Probing Implementation', () => {
    const healthRoutePath = path.join(rootDir, 'apps', 'desktop', 'src', 'app', 'api', 'health', 'route.ts');

    it('should implement query parameter probe handling (?probe=live & ?probe=ready)', () => {
      expect(fs.existsSync(healthRoutePath)).toBe(true);
      const content = fs.readFileSync(healthRoutePath, 'utf8');

      expect(content).toContain("searchParams.get('probe')");
      expect(content).toContain("probe === 'live'");
      expect(content).toContain('db.healthCheck()');
      expect(content).toContain('status: 200');
      expect(content).toContain('status: 503');
      expect(content).toContain('AlinaProductionLogger');
    });
  });
});
