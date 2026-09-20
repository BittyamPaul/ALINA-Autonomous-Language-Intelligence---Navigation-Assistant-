# ALINA Developer Onboarding & Engineering Guide

> **Welcome to ALINA engineering.** This document provides complete instructions for setting up your local development environment, navigating the monorepo, authoring new tools, extending multi-agent pipelines, and contributing code.

---

## 1. Prerequisites & Toolchain Setup

Ensure the following tools are installed on your host system:

| Tool | Minimum Version | Installation Instructions |
| :--- | :--- | :--- |
| **Node.js** | `v20.x` or `v22 LTS` (v24 supported) | [nodejs.org](https://nodejs.org/) or via `nvm` / `fnm` |
| **pnpm** | `v10.12.0+` | `npm install -g pnpm` |
| **Rust & Cargo** | `1.80.0+` (stable) | [rustup.rs](https://rustup.rs/) (required for native desktop development) |
| **Docker** | `24.0+` | [docker.com](https://www.docker.com/) (optional, for local SurrealDB container) |
| **Git** | `2.40+` | [git-scm.com](https://git-scm.com/) |

---

## 2. Initial Monorepo Setup

```bash
# 1. Clone repository
git clone https://github.com/alina-ai/alina.git
cd alina

# 2. Install monorepo workspace dependencies
pnpm install

# 3. Create development environment file
cp .env.example .env

# 4. Run TypeScript typecheck to verify dependencies
pnpm run typecheck

# 5. Run the complete automated test battery
pnpm test
```

---

## 3. Core Monorepo Commands

ALINA uses **Turborepo** to orchestrate build, lint, and test tasks across workspaces:

```bash
# Start all development servers in parallel
pnpm dev

# Compile all TypeScript packages and Next.js applications
pnpm build

# Run TypeScript strict typecheck across all 14 packages
pnpm run typecheck

# Run ESLint across all 8 packages
pnpm run lint

# Run all 17 automated test suites (248 tests)
pnpm test

# Clean all build outputs, dist directories, and caches
pnpm clean
```

### Running Specific Workspaces
You can target any workspace directly using the `pnpm --filter` flag:

```bash
# Run tests only in @alina/agent
pnpm --filter @alina/agent test

# Build only the desktop companion
pnpm --filter @alina/desktop build

# Run Next.js desktop UI in development mode
pnpm --filter @alina/desktop dev

# Run full Tauri v2 desktop shell
pnpm --filter @alina/desktop tauri dev
```

---

## 4. How to Add a New Tool to the MCP Registry

All tools must be authored in `packages/tools` following the Model Context Protocol (MCP) specification:

### Step 1: Define Schemas and Tool Specification
Create your tool definition with Zod schemas in `packages/tools/src/mcp-tools/`:

```typescript
import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';

export const MyNewToolInputSchema = z.object({
  targetQuery: z.string().min(1),
  maxResults: z.number().int().min(1).max(50).default(10),
});
export type MyNewToolInput = z.infer<typeof MyNewToolInputSchema>;

export const MyNewToolOutputSchema = z.object({
  results: z.array(z.string()),
  executionTimeMs: z.number(),
});
export type MyNewToolOutput = z.infer<typeof MyNewToolOutputSchema>;

export const myNewTool: McpToolDefinition<MyNewToolInput, MyNewToolOutput> = {
  name: 'my_new_tool',
  group: 'research',
  description: 'Executes a sandboxed research query with verified bounds.',
  inputSchema: MyNewToolInputSchema,
  outputSchema: MyNewToolOutputSchema,
  permission: 'SAFE', // 'SAFE' | 'APPROVAL_REQUIRED' | 'HIGH_RISK'
  timeoutMs: 15000,
  execute: async (input, context: McpToolContext) => {
    const start = Date.now();

    // 1. Audit log the invocation
    context.auditLogger.log('my_new_tool_invoked', { query: input.targetQuery });

    // 2. Perform tool logic
    const results = [`Result for ${input.targetQuery}`];

    return {
      results,
      executionTimeMs: Date.now() - start,
    };
  },
};
```

### Step 2: Register Tool in Tool Registry
Export your tool in `packages/tools/src/index.ts` and add it to `createAlinaMcpToolRegistry()`.

### Step 3: Author Automated Vitest Test
Add test coverage in `tests/` verifying schema validation, happy path execution, and error handling.

---

## 5. Database Development & Migrations

SurrealDB serves as the state, graph, and vector memory engine.

### Running SurrealDB Locally
```bash
# Start containerized SurrealDB instance
docker compose up -d surrealdb

# Initialize baseline schemas and tables
pnpm db:init

# (Optional) Populate development seed fixture
pnpm db:seed
```

### Creating Schema Migrations
Migrations are managed in `packages/database/src/migrations/`:
1. Add a new migration script implementing `MigrationDefinition`.
2. Register it in `packages/database/src/migrations/index.ts`.
3. Migrations execute idempotently and are tracked in the `_schema_migrations` table.

---

## 6. Desktop Application Packaging (Tauri v2)

### Generating Multi-Platform Brand Icons
```bash
# Generate Windows (.ico), macOS (.icns), and high-DPI PNG icons from SVG
pnpm --filter @alina/desktop tauri:icons
```

### Compiling Static Export for Webview
```bash
# Compiles static HTML/JS/CSS to apps/desktop/out/
pnpm --filter @alina/desktop build:export
```

### Building Desktop Installer
```bash
# Package NSIS Windows installer (or macOS DMG / Linux AppImage)
pnpm --filter @alina/desktop tauri:build
```
Installer bundles are generated in `apps/desktop/src-tauri/target/release/bundle/`.
