# ALINA Production Deployment & Operational Manual

> **Scope**: This document establishes the authoritative production architecture, multi-cloud / hybrid provisioning guidelines, secret management standards, health monitoring, backup procedures, and CI/CD pipelines for **ALINA (Autonomous Language Intelligence & Navigation Assistant)**.

[README](README.md) • [Architecture](ARCHITECTURE.md) • [Security](SECURITY.md) • [Development](DEVELOPMENT.md) • [Contributing](CONTRIBUTING.md) • [Changelog](CHANGELOG.md)

---

## 1. Architectural Topology & Service Decoupling

ALINA enforces a **strict decoupling principle**. In accordance with our security directives, **no single monolithic server hosts all tiers**. The system is decoupled into four dedicated tiers based on operational characteristics and security domains:

```
                                  +-------------------------------------------------+
                                  |              Desktop Client Tier                |
                                  |   (Local-First Tauri v2 + Next.js UI Binary)    |
                                  |   - Distributed via signed OS installers        |
                                  |   - Stores client secrets in OS Keyring/DPAPI   |
                                  |   - Direct host filesystem via PathJail         |
                                  +-----------------------+-------------------------+
                                                          |
                                      HTTPS / WSS (mTLS)  |  (Private VPC / Corporate Ingress)
                                                          v
                                  +-------------------------------------------------+
                                  |              Ingress / API Gateway              |
                                  |   - Cloudflare / AWS ALB / Nginx Reverse Proxy  |
                                  |   - TLS 1.3 Termination & DDoS mitigation       |
                                  |   - Rate Limiting (Token Bucket) & CORS guards  |
                                  +-----------------------+-------------------------+
                                                          |
                                             Internal VPC | Network (10.0.0.0/16)
                                                          v
                       +----------------------------------+----------------------------------+
                       |                                                                     |
                       v                                                                     v
+---------------------------------------------+               +---------------------------------------------+
|        Backend / Headless Agent Server      |               |          Dedicated SurrealDB Cluster        |
|  (Containerized Node 22 / apps/desktop API) |               |  (State, Vector Graph Memory, Audit Logs)   |
|  - Runs in private ECS / Kubernetes pods    |               |  - Dedicated private subnet (No Public IP)  |
|  - Dynamic tool orchestration               | <===========> |  - Persistent high-IOPS NVMe SSD storage    |
|  - MCP Sandbox coordination                 |  SurrealKV    |  - HNSW cosine vector index acceleration    |
|  - Ephemeral task execution                 |  Protocol     |  - Continuous point-in-time snapshots       |
+---------------------------------------------+               +---------------------------------------------+
                       |
                       v
+---------------------------------------------+
|           MCP Sandboxed Workers             |
|  - Ephemeral rootless Docker / gVisor pods  |
|  - Sandboxed browser / web automation       |
|  - Strict PathJail directory containment    |
+---------------------------------------------+
```

### Decoupling Rationale

1. **Desktop Client vs Server**: The frontend UI is not hosted as a public website. It is packaged as a high-performance native desktop companion using **Tauri v2** with an embedded Next.js application, accessing hardware-accelerated system webviews, system trays, and local file systems.
2. **SurrealDB Isolation**: SurrealDB holds multi-tenant conversations, vector embeddings, and audit logs. It must run on a private database subnet with no public IP address, accessible only through the backend API gateway or authorized VPC peering.
3. **Agent & MCP Sandbox Isolation**: Untrusted browser automation or foreign code inspection executes inside ephemeral, non-root sandbox containers, strictly isolated from the production database and customer host machines.

---

## 2. Production Environment Configuration

Production environments must be provisioned using `.env.production.example` as a baseline template.

### Critical Production Environment Variables

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables V8 optimizations, disables debug assertions |
| `PORT` | `3000` | Internal listening port behind ingress proxy |
| `SURREAL_ENDPOINT` | `https://db.internal.alina.vpc:8000/rpc` | Private VPC SurrealDB RPC endpoint |
| `SURREAL_NAMESPACE` | `alina_prod` | Production tenant namespace |
| `SURREAL_DATABASE` | `alina_primary` | Production primary database |
| `SURREAL_USERNAME` | `alina_app_runner` | Least-privilege application service account |
| `SURREAL_PASSWORD` | Injected via Secrets Manager | Cryptographically random password (>32 chars) |
| `ALINA_LOG_LEVEL` | `info` (or `warn`) | Suppresses debug noise in production streams |
| `LOG_FORMAT` | `json` | Structured JSON output for cloud log aggregators |
| `ALINA_ENFORCE_HITL` | `true` | Enforces Human-In-The-Loop approval gates |
| `ALINA_APPROVAL_TIMEOUT_MS` | `300000` (5 minutes) | Expiration window for pending approval tokens |
| `ALINA_CORS_ALLOWED_ORIGINS` | `tauri://localhost,https://app.alina.internal` | Strict origin whitelist |

---

## 3. Secure Secret Management

ALINA enforces a **Zero Hardcoded Secrets Policy**:

1. **Never Commit Secrets**: No passwords, API keys, certificates, or updater private keys are stored in Git.
2. **Runtime Secret Injection**:
   - **Cloud / Backend Pods**: Secrets are provisioned dynamically at container startup using **AWS Secrets Manager**, **HashiCorp Vault**, or **GCP Secret Manager** through CSI volume drivers or environment injection.
   - **Desktop Companion**: User API keys are stored exclusively in the OS-native cryptographic vault:
     - **Windows**: Windows Data Protection API (DPAPI) / Credential Manager.
     - **macOS**: Apple Keychain Services.
     - **Linux**: Freedesktop Secret Service API via `libsecret`.
3. **Automated Secret Redaction**: All application logging passes through `SecretRedactor`, ensuring that tokens matching patterns (`sk-ant-*`, `sk-*`, `AIza*`, Bearer tokens, private keys) are scrubbed before reaching stdout or stderr.
4. **Key Rotation Lifecycle**:
   - Model provider keys: Rotated every 90 days.
   - SurrealDB root credentials: Managed through KMS with automatic 30-day rotation.
   - Tauri Ed25519 updater keys: Offline cold storage with hardware security modules (YubiKey / Nitrokey).

---

## 4. Component-by-Component Deployment

### Component A: Desktop Application Distribution

1. **Distribution Artifacts**:
   - Windows: `ALINA_<version>_x64-setup.exe` (NSIS) and `.msi`.
   - macOS: `ALINA_<version>_universal.dmg` (Universal binary for Intel & Apple Silicon).
   - Linux: `ALINA_<version>_amd64.AppImage` and `.deb`.
2. **Code Signing**:
   - **Windows**: Microsoft Authenticode signed via Azure Trusted Signing or EV Hardware Token.
   - **macOS**: Signed with Developer ID Application certificate, hardened runtime enabled, notarized via Apple Notary Service (`xcrun notarytool submit --wait`), and stapled (`xcrun stapler staple`).
3. **Auto-Updater CDN**:
   - Releases are uploaded to an S3/Cloudflare R2 bucket backing `https://releases.alina.ai/desktop/latest.json`.
   - The desktop client verifies updater Ed25519 signatures before unbundling updates.

### Component B: Backend API & Headless Agent Cluster

1. **Container Build**:
   ```bash
   docker build -t alina-server:production -f infrastructure/docker/Dockerfile.server .
   ```
2. **Container Security**:
   - Multi-stage build running on Alpine / Debian slim.
   - Executed as non-privileged user `nodejs:nodejs` (UID 10001).
   - Read-only root filesystem with temporary writable scratch paths mounted as `tmpfs`.
3. **Ingress Configuration (Nginx / Cloudflare)**:
   - Enforce TLS 1.3 only with modern cipher suites.
   - HTTP/2 or HTTP/3 transport.
   - Token bucket rate limiting: 600 requests/minute per client IP.
   - Strict CORS headers matching `tauri://localhost`.

### Component C: SurrealDB Cluster

1. **Compute & Storage**:
   - Dedicated instances (e.g. AWS EC2 `r6i.large` or GCP `n2-highmem-4`).
   - Storage: NVMe SSD volumes (`io2` or `gp3` with 6,000+ IOPS) mounted at `/var/lib/surrealdb`.
2. **Execution Engine**:
   - Run with `--strict` mode to enforce defined schemas.
   - Vector index: HNSW cosine index enabled for table `memory_node`.
   ```bash
   surreal start \
     --user root \
     --pass "${SURREAL_PROD_PASSWORD}" \
     --strict \
     surrealkv:///var/lib/surrealdb/alina.db
   ```
3. **Network Isolation**:
   - Bound to private VPC interface (`10.0.x.x:8000`).
   - Security Group ingress: Port 8000 allowed *only* from the Backend API security group.

### Component D: MCP Service Isolation

- **Host Inspection Tools**: Executed directly by the desktop client within the user-authorized `PathJail`.
- **Untrusted Automation Tools**: Spawned in ephemeral containers with dropped Linux capabilities (`CAP_DROP_ALL`), read-only root filesystems, and strict memory limits (512MB).

---

## 5. Health Checks & Probes

ALINA provides standard orchestration probes at `/api/health`:

### 1. Liveness Probe (`GET /api/health?probe=live`)
- **Purpose**: Verifies that the Node.js / Next.js HTTP server is responsive.
- **Expected Return**: HTTP `200 OK`
```json
{
  "status": "alive",
  "probe": "live",
  "process": {
    "uptimeSeconds": 86420,
    "timestamp": "2026-09-20T01:00:00.000Z",
    "nodeVersion": "v22.13.4",
    "memoryUsage": {
      "rssMb": 112.4,
      "heapTotalMb": 85.2,
      "heapUsedMb": 54.1
    },
    "pid": 42
  }
}
```

### 2. Readiness Probe (`GET /api/health?probe=ready`)
- **Purpose**: Verifies that dependencies (specifically the SurrealDB storage engine) are reachable and queryable.
- **Expected Return**:
  - HTTP `200 OK` when SurrealDB responds normally.
  - HTTP `503 Service Unavailable` if SurrealDB is degraded or unreachable.
```json
{
  "status": "ready",
  "probe": "ready",
  "database": {
    "healthy": true,
    "endpoint": "https://db.internal.alina.vpc:8000/rpc",
    "namespace": "alina_prod",
    "database": "alina_primary",
    "latencyMs": 4
  },
  "process": { ... },
  "durationMs": 5
}
```

### Kubernetes Pod Spec Example:
```yaml
livenessProbe:
  httpGet:
    path: /api/health?probe=live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /api/health?probe=ready
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3
```

---

## 6. Observability, Logging & Error Handling

1. **Structured Logging**:
   - Handled via `AlinaProductionLogger` (`@alina/shared`).
   - Every entry is output as a single-line JSON object containing `timestamp`, `level`, `service`, `message`, `traceId`, `durationMs`, and sanitized `context`.
   - Error stack traces are included only in non-production environments to avoid leaking code layout.
2. **Secret Redaction**:
   - `SecretRedactor` automatically masks API keys (`sk-ant-***`, `AIza***`), database passwords, and authorization tokens with `[REDACTED_API_KEY]`.
3. **Telemetry & Metrics**:
   - Agent runs emit structured telemetry records for task duration, tool execution latency, approval status, and retry counts.

---

## 7. Database Backup Strategy & Disaster Recovery

### Automated Backup Pipeline
- Automated backups run daily at 02:00 UTC via cron or Kubernetes CronJob.
- **Script**: `infrastructure/scripts/backup-db.sh`
  1. Exports SurrealDB database dump (`.surql`).
  2. Compresses with Gzip (`-9`) for maximum space efficiency.
  3. Computes cryptographic SHA-256 integrity hash (`.sha256`).
  4. Encrypts and syncs snapshot to off-site cloud storage (`BACKUP_STORAGE_BUCKET`).
  5. Prunes snapshots older than `RETENTION_DAYS` (default 30 days).

### Disaster Recovery Runbook (Restore Procedure)
1. **Isolate Cluster**: Pause incoming traffic to Backend API by setting readiness probe down or redirecting to maintenance page.
2. **Verify Snapshot Integrity**:
   ```bash
   ./infrastructure/scripts/restore-db.sh ./backups/alina_backup_alina_prod_alina_primary_20260920_020000Z.surql.gz
   ```
   The script verifies the SHA-256 hash against `.sha256`. If the hash matches, it uncompresses and executes `surreal import`.
3. **Post-Restore Health Check**:
   The script queries `RETURN true;` on the restored database.
4. **Resume Traffic**: Unpause backend API traffic and verify `/api/health?probe=ready` returns HTTP 200.

---

## 8. CI/CD Pipeline (GitHub Actions)

The production CI/CD workflow (`.github/workflows/production-ci-cd.yml`) enforces an 8-stage gate:

| Stage | Step Name | Tooling / Command | Gate Criteria |
| :--- | :--- | :--- | :--- |
| **1** | Install dependencies | `pnpm install --frozen-lockfile` | Lockfile integrity verified |
| **2** | Type check | `pnpm run typecheck` | 0 TypeScript errors across 14 packages |
| **3** | Lint | `pnpm run lint` | ESLint zero warnings, strict style adherence |
| **4** | Unit tests | `npx vitest run packages/` | 100% unit tests pass |
| **5** | Integration tests | `npx vitest run tests/` | Runs with live SurrealDB container service |
| **6** | Build | `pnpm run build` | Next.js and package builds compile cleanly |
| **7** | E2E tests | `npx vitest run tests/production-scenarios.test.ts` | Health probes and production gates validated |
| **8** | Production artifacts | Tauri Action & Docker Buildx | Signed desktop installers & container images |

---

## 9. Rollback & Incident Response

1. **Backend Server Rollback**:
   - In Kubernetes/ECS, issue a rolling deployment rollback:
     ```bash
     kubectl rollout undo deployment/alina-server -n production
     ```
2. **Database Migration Rollback**:
   - If a database schema update causes corruption, execute `restore-db.sh` using the pre-deployment snapshot recorded in Stage 8.
3. **Desktop Client Hotfix**:
   - In case of critical client defect, increment patch version (`1.0.1`), trigger GitHub Actions release tag `v1.0.1`, which generates updater payloads and publishes updated `latest.json` to the distribution CDN.
