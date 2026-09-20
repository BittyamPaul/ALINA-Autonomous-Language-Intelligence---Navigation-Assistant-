# Changelog

All notable changes to the **ALINA (Autonomous Language Intelligence & Navigation Assistant)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-20

### Added
- **Desktop Distribution & Packaging**:
  - Native installer configuration using NSIS in `currentUser` mode (allows non-administrative installation to `%LOCALAPPDATA%`).
  - High-resolution multi-platform brand icon suite (`icon.ico`, `icon.icns`, `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `app-icon.svg`).
  - Native Rust thread panic hook (`std::panic::set_hook`) with structured crash dump logging to `%LOCALAPPDATA%/ALINA/logs/crash.log`.
  - Native IPC commands for `get_system_metadata`, `request_app_restart`, and `request_app_shutdown`.
  - Client-safe React `ErrorBoundary` component wrapping the root layout with automated secret redaction (`[REDACTED_SECRET]`).
  - Cross-platform static export runner (`scripts/build-export.mjs`) for Tauri webview bundling.
  - 10-point automated desktop distribution smoke test suite (`tests/desktop-distribution.test.ts`).
  - Authoritative release and smoke test checklist (`RELEASE_CHECKLIST.md`).

---

## [0.9.0] - 2026-09-20

### Added
- **Production Deployment & Operational Hardening**:
  - Decoupled multi-tier deployment architecture separating Desktop client, Headless Agent server, SurrealDB cluster, and MCP worker sandboxes.
  - Production structured logger (`AlinaProductionLogger`) with JSON output, trace correlation (`traceId`), and automated secret redaction via `SecretRedactor`.
  - Production orchestration health probes at `/api/health`: liveness probe (`?probe=live` $\rightarrow$ HTTP 200) and readiness probe (`?probe=ready` $\rightarrow$ HTTP 200/503).
  - Automated SurrealDB backup and disaster recovery scripts (`backup-db.sh`, `backup-db.ps1`, `restore-db.sh`) with gzip -9 compression, SHA-256 tamper verification, and 30-day retention pruning.
  - GitHub Actions production CI/CD workflow (`.github/workflows/production-ci-cd.yml`) executing all 8 required verification and packaging stages.
  - Authoritative production operational manual (`DEPLOYMENT.md`).

---

## [0.8.0] - 2026-09-20

### Added
- **Infrastructure & Containerization**:
  - Multi-stage production Dockerfile (`infrastructure/docker/Dockerfile.server`) with non-root user (`UID 10001`) and security hardening.
  - Docker Compose profiles for base orchestration, development hot-reloading (`docker-compose.dev.yml`), and production-like isolated environments (`docker-compose.prod.yml`).
  - Automated database migration runner and seeding CLI (`packages/database/src/init-db.ts`).
  - Clean machine local setup guide (`SETUP.md`).

---

## [0.7.0] - 2026-09-19

### Added
- **Observability & Testing Suite**:
  - Structured telemetry service (`TelemetryService`) tracking task duration, tool execution latency, approval lifecycle, and retry counts.
  - Developer observability panel (`DeveloperObservabilityPanel`) providing transparent telemetry without exposing raw chain-of-thought.
  - Playwright browser integration testing battery.
  - Multi-layer Vitest test suite expanding coverage to 230 automated tests across 16 test files.

---

## [0.6.0] - 2026-09-19

### Added
- **Editorial UX Refinement & Design System**:
  - Warm stone neutral color palette (`#0c0a09`, `#1c1917`, `#292524`, `#f5f5f4`) with warm amber accents (`#f59e0b`).
  - Linear-inspired compact layout, conversational message stream, activity timeline, and status indicators.
  - Command palette dialog (`⌘ K` / `Ctrl + K`) with keyboard navigation.
  - Synchronized light and dark themes with zero layout shifts.

---

## [0.5.0] - 2026-09-19

### Added
- **Multimodal Voice Interaction Subsystem**:
  - Speech-to-Text and Text-to-Speech audio coordinator (`AlinaVoiceCoordinator`).
  - Real-time streaming transcription preview in `ChatComposer`.
  - Voice Activity Detection (VAD) and barge-in interruption capability.
  - Speech adapter interfaces (`WebSpeechRecognitionAdapter`, `WebSpeechSynthesisAdapter`, and test mocks).

---

## [0.4.0] - 2026-09-19

### Added
- **Controlled Multi-Agent Architecture**:
  - Supervisor Agent with deterministic delegation heuristics (`shouldDelegate`).
  - Specialized subagents: `ResearchAgent`, `BrowserAgent`, `DocumentAgent`, `FilesystemAgent`, and `ComputerAgent`.
  - Dynamic failure recovery engine (`evaluateRecovery`) with exponential backoff retries, fallback replanning, and fail-closed security.

---

## [0.3.0] - 2026-09-19

### Added
- **SurrealDB Multi-Model State Engine**:
  - Integration with SurrealDB v2 (`surrealkv`).
  - Graph relationship tables (`has_step`, `produced_deliverable`).
  - Associative vector memory (`memory_node`) with 1536-dimensional HNSW cosine MTREE index.
  - Versioned idempotent migration runner (`_schema_migrations`).

---

## [0.2.0] - 2026-09-19

### Added
- **Model Context Protocol (MCP) & Sandboxing**:
  - Standardized JSON-RPC 2.0 tool definitions with Zod schema validation.
  - `PathJail` directory containment engine preventing workspace escapes and path traversal attacks.
  - Dynamic 3-tier risk classification (`SAFE`, `APPROVAL_REQUIRED`, `HIGH_RISK`).
  - Human-In-The-Loop (`HitlCoordinator`) requiring single-use cryptographic authorization tokens.

---

## [0.1.0] - 2026-09-19

### Added
- Initial monorepo foundation with pnpm workspaces and Turborepo.
- Tauri v2 desktop shell with embedded Next.js frontend.
- Canonical domain contracts and schemas in `@alina/shared`.
- TypeScript strict mode configuration across all workspaces.
