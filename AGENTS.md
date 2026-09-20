# AGENTS.md — Operational Directives for Autonomous & Pair-Programming AI Agents

> **Scope**: This document governs the behavior, constraints, and architecture for any AI agent, coding assistant (e.g., Antigravity, Claude, Copilot, Cursor), or automated subagent working on or within the **ALINA (Autonomous Language Intelligence & Navigation Assistant)** codebase.

---

## 1. Core Mission & Persona

ALINA is a **local-first, autonomous personal computer companion** designed to feel like a natural operating layer rather than a generic chatbot. It emphasizes calm, editorial elegance, high information density (Linear-inspired), Arc-like fluidity, and Apple-grade minimalism.

When implementing or modifying code in this repository, agents must:
- Act as senior software architects and precision systems engineers.
- Preserve the modular, decoupled architecture.
- Never write monolithic "all-in-one" files or bypass established boundaries.
- Treat safety and user privacy as non-negotiable first principles.

---

## 2. Non-Negotiable Operating Rules

### Rule 1: Zero Destructive Operations Without Human Approval
- **ALINA must NEVER execute destructive operations without explicit user authorization.**
- Destructive operations include, but are not limited to:
  - Deleting files or directories (`fs_delete_file`).
  - Writing or overwriting files outside the registered project root.
  - Modifying critical project configuration files (`package.json`, `Cargo.toml`, `.env*`).
  - Executing mutating shell commands (`rm`, `del`, `format`, `git push --force`, `git reset --hard`).
  - Submitting forms or modifying state on authenticated external web pages.
- High-risk operations must pause execution, transition into `awaiting_approval`, and invoke the `HitlCoordinator`.

### Rule 2: Agents Must Never Bypass Permission Checks
- Under **no circumstances** may an agent bypass `PathJail`, mock an affirmative approval token to skip human review in production code, or disable sandbox validations.
- Tests that verify approval flows must test the rejection paths as rigorously as the approval paths.

### Rule 3: TypeScript Strict Mode & Zero Arbitrary `any`
- Every TypeScript package runs under `"strict": true` with `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, and `noUnusedParameters`.
- The use of `any` is strictly prohibited unless interacting with an untyped 3rd-party library, in which case it must be wrapped in a typed adapter or cast to `unknown` with a Zod runtime validator.

### Rule 4: Canonical Shared Contracts First
- Every domain model, tool schema, IPC request/response, and event payload must be defined in `@alina/shared-types` with a corresponding **Zod schema** and TypeScript type inference.
- UI components and agent services must import types from `@alina/shared-types`, not create redundant local interfaces.

### Rule 5: No Duplicated Business Logic
- Business logic belongs in dedicated packages:
  - Security policies & jailing $\rightarrow$ `@alina/security`
  - Tool execution & registries $\rightarrow$ `@alina/tools`
  - Planning, orchestration & HITL $\rightarrow$ `@alina/core-agent`
  - Data storage & graph relationships $\rightarrow$ `@alina/db`
  - Semantic vector search $\rightarrow$ `@alina/memory`
  - Browser navigation $\rightarrow$ `@alina/browser-service`
- Frontend code in `apps/desktop` must remain purely presentational and invoke logic through IPC or agent hooks.

### Rule 6: Dependency Conservatism
- **Do not introduce new dependencies** unless they have a clear, documented architectural reason.
- Prefer official SDKs (e.g. `@surrealdb/surrealdb`, `playwright`, `@tauri-apps/api`) over third-party community wrappers.
- Never install unmaintained, unvetted, or GPL-licensed packages that jeopardize the project.

---

## 3. Tool Execution & MCP Conventions

When exposing or invoking tools (via internal registries or Model Context Protocol / MCP):

1. **Schema Validation**: Every tool must declare a Zod input schema. Inputs must be validated before execution begins.
2. **Dynamic Risk Scoring**: Tools must calculate their risk level dynamically based on parameters (e.g., writing to a scratch directory is `MEDIUM`, writing to `package.json` is `HIGH_DESTRUCTIVE`).
3. **Execution Context**: Tools must always be passed a `ToolExecutionContext` containing the active `PathJail`, `AuditLogger`, and approval status.
4. **Post-Condition Assertions**: Every mutating tool must define an expected post-condition (`file_exists`, `file_contains`, `command_exit_code`). The agent verification loop must verify this state before marking the step `completed`.
5. **Self-Healing Loop**: If verification fails, the agent must formulate a recovery strategy (exponential backoff, path normalization) and attempt self-healing up to a maximum of 3 retries before bubbling up a clear explanation to the user.

---

## 4. Coding Style & Aesthetics Discipline

- **Design Aesthetic**:
  - Warm neutrals (stone, alabaster, oatmeal, charcoal `#0c0a09` / `#1c1917`).
  - Warm amber/copper accents (`#f59e0b`, `#d97706`) for safety gates and highlights.
  - Crisp editorial typography (Inter, Geist Sans, Newsreader for accents, JetBrains Mono for code).
  - High information density (Linear-inspired): compact rows, badges, micro-animations.
- **Strictly Prohibited Visuals**:
  - ❌ Neon purple or cyan cyberpunk glows.
  - ❌ Robotic imagery, mascots, or chat bubble fluff.
  - ❌ Giant "AI" badges or floating sparkle balls.
  - ❌ Exposing raw terminal logs or stack traces to normal users in primary views.

---

## 5. Agent Self-Check Protocol

Before concluding any work, an autonomous agent must run:

```bash
# 1. Verify TypeScript types across the monorepo
pnpm run typecheck

# 2. Run the full Vitest suite
pnpm test

# 3. Verify that the desktop app builds cleanly
pnpm --filter @alina/desktop build
```

If any check fails, the agent is responsible for resolving the root cause before completing the task.
