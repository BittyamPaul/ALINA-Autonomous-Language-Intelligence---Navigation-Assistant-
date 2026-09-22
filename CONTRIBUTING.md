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

# Contributing to ALINA

Thank you for your interest in contributing to **ALINA (Autonomous Language Intelligence & Navigation Assistant)**. We welcome community contributions that preserve our commitment to local-first privacy, zero-trust security sandboxing, high reliability, and editorial design elegance.

---

## 1. Code of Conduct & Architectural Invariants

When contributing to this repository, you must adhere to our non-negotiable architectural rules (from `AGENTS.md`):

### Rule 1: Zero Destructive Operations Without Human Approval
- Any tool or operation that mutates state outside of temporary scratch directories, deletes files, or executes shell commands must declare `HIGH_DESTRUCTIVE` permission and integrate with `HitlCoordinator`.

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
  - Planning, orchestration, crash recovery & HITL $\rightarrow$ `@alina/agent`
  - Data storage & graph relations $\rightarrow$ `@alina/database`
- Frontend code in `apps/desktop` must remain purely presentational.

### Rule 6: Dependency Conservatism
- Do not introduce new dependencies unless they have a clear, documented architectural reason. Prefer official SDKs (`@surrealdb/surrealdb`, `playwright`, `@tauri-apps/api`).

### Rule 7: Never Commit Secrets
- Never commit real API keys, passwords, private keys, or tokens. Use `.env.example` as a template and OS Keyring or local `.env` (git-ignored) for secret configuration.

---

## 2. Disciplined Development Checkpoint Procedure

To maintain an incorruptible, bisectable Git history and prevent accidental regressions, contributors must follow this procedure:

### Before Starting a Major Feature
1. Verify working directory cleanliness:
   ```bash
   git status
   ```
2. If working directory has uncommitted work, create a checkpoint commit:
   ```bash
   git add .
   git commit -m "chore: checkpoint working state before <feature-name>"
   ```
3. Create and switch to a new feature branch:
   ```bash
   git checkout -b feature/<feature-name>
   # or for bug fixes:
   git checkout -b fix/<bug-name>
   ```

### After Successful Feature Completion
1. Run the full verification suite (must pass 100%):
   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm test
   pnpm --filter @alina/desktop build
   ```
2. Stage and commit changes with a conventional commit message:
   ```bash
   git add .
   git commit -m "feat(<scope>): <concise description>"
   ```
3. Push branch to GitHub:
   ```bash
   git push -u origin feature/<feature-name>
   ```
4. Prepare a Pull Request summary detailing the motivation, scope, and test proof.

### Strict Git Constraints
- ❌ **Do NOT automatically merge pull requests.** All PRs require review and CI approval.
- ❌ **Do NOT force push (`git push -f`) to shared or protected branches.**
- ❌ **Do NOT rewrite shared Git history (`git rebase` on pushed branches).**

---

## 3. Commit Message Conventions

We enforce the [Conventional Commits](https://www.conventionalcommits.org/) standard. All commit messages must use one of the canonical prefixes:

| Prefix | Description | Example |
| :--- | :--- | :--- |
| `feat:` | New features or capabilities | `feat(task): implement crash recovery and checkpointing` |
| `fix:` | Bug fixes or corrective logic | `fix(supervisor): fail fast on permanent errors` |
| `refactor:` | Code restructuring without feature or bug changes | `refactor(db): migrate in-memory table to structured map` |
| `test:` | Adding or improving test coverage | `test(resilience): add watchdog timeout verification` |
| `docs:` | Documentation updates | `docs(readme): add high-reliability execution guide` |
| `chore:` | Tooling, dependencies, or configuration | `chore(ci): add 7-stage GitHub Actions verification` |
| `security:` | Hardening, sandboxing, or vulnerability fixes | `security(pathjail): block alternate data stream attacks` |

---

## 4. Pre-Flight Quality Gate (Mandatory)

Before opening or updating a Pull Request, verify that all local checks pass:

```bash
# 1. Typecheck across all 14 monorepo packages
pnpm run typecheck

# 2. Lint across all packages and apps
pnpm run lint

# 3. Run full Vitest suite (all 26 test suites)
pnpm test

# 4. Verify desktop bundle compiles cleanly
pnpm --filter @alina/desktop build
```

If any check fails, resolve the root cause before opening your PR.

---

## 5. Submitting a Pull Request

1. Push your branch to GitHub (`git push -u origin feature/<feature-name>`).
2. Open a Pull Request against the `main` branch.
3. Complete the PR template describing:
   - Summary of changes and architectural motivation.
   - Associated issue numbers.
   - Verification steps and testing proof.
4. Maintainers will review your PR against our architectural guidelines.

