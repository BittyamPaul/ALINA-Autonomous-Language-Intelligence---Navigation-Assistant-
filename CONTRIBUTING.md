# Contributing to ALINA

Thank you for your interest in contributing to **ALINA (Autonomous Language Intelligence & Navigation Assistant)**. We welcome community contributions that preserve our commitment to local-first privacy, zero-trust security sandboxing, and editorial design elegance.

---

## 1. Code of Conduct & Architectural Invariants

When contributing to this repository, you must adhere to our non-negotiable architectural rules (from `AGENTS.md`):

### Rule 1: Zero Destructive Operations Without Human Approval
- Any tool or operation that mutates state outside of temporary scratch directories, deletes files, or executes shell commands must declare `HIGH_RISK` permission and integrate with `HitlCoordinator`.

### Rule 2: Never Bypass Permission Checks
- Under no circumstances may code bypass `PathJail`, mock an affirmative approval token in production paths, or disable sandbox validations.

### Rule 3: TypeScript Strict Mode & Zero Arbitrary `any`
- Every package runs under `"strict": true` with `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, and `noUnusedParameters`.
- The use of `any` is strictly prohibited. Use typed generics, `unknown` with Zod runtime validation, or typed adapters.

### Rule 4: Canonical Shared Contracts First
- Every domain model, tool schema, IPC contract, and event payload must be defined in `@alina/shared` with a corresponding **Zod schema** and TypeScript type inference.

### Rule 5: No Duplicated Business Logic
- Business logic belongs in dedicated packages:
  - Security policies & jailing $\rightarrow$ `@alina/shared`
  - Tool execution & registries $\rightarrow$ `@alina/tools`
  - Protocol specifications $\rightarrow$ `@alina/mcp`
  - Planning, orchestration & HITL $\rightarrow$ `@alina/agent`
  - Data storage & graph relations $\rightarrow$ `@alina/database`
- Frontend code in `apps/desktop` must remain presentational.

### Rule 6: Dependency Conservatism
- Do not introduce new dependencies unless they have a clear, documented architectural reason. Prefer official SDKs (`@surrealdb/surrealdb`, `playwright`, `@tauri-apps/api`).

### Rule 7: Editorial Aesthetics Discipline
- UI contributions must adhere to ALINA's design language:
  - Warm stone neutrals (`#0c0a09`, `#1c1917`, `#292524`, `#f5f5f4`).
  - Warm amber accents (`#f59e0b`, `#d97706`) for safety gates.
  - Linear-inspired compact information density.
  - Strictly no neon purple cyberpunk glows, robot mascots, or chat bubble fluff.

---

## 2. Development & Branching Workflow

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/<your-username>/alina.git
   cd alina
   pnpm install
   ```

2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/sandboxed-pdf-export
   # or: fix/pathjail-symlink-resolution
   ```

3. **Commit Messages**:
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(tools): add sandboxed sqlite query inspection tool`
   - `fix(agent): handle empty deliverable recovery retry`
   - `docs(readme): clarify local surrealdb docker setup`
   - `refactor(database): optimize HNSW vector index definition`

---

## 3. Pre-Flight Quality Gate (Mandatory)

Before opening a Pull Request, run the local quality gate:

```bash
# 1. Typecheck across all 14 monorepo packages
pnpm run typecheck

# 2. Lint across all 8 packages
pnpm run lint

# 3. Run full Vitest suite (all 17 test suites)
pnpm test

# 4. Verify desktop bundle compiles cleanly
pnpm --filter @alina/desktop build
```

If any check fails, resolve the root cause before opening or updating your pull request.

---

## 4. Submitting a Pull Request

1. Push your branch to GitHub.
2. Open a Pull Request against the `main` branch.
3. Complete the PR template describing:
   - Summary of changes and architectural motivation.
   - Associated issue numbers.
   - Verification steps and testing proof.
4. Maintainers will review your PR against our architectural guidelines.
