# Environment Variable Conventions — ALINA

This document defines conventions for managing environment variables across the ALINA monorepo.

---

## 1. Core Principles

1. **Zero Committed Secrets**: `.env`, `.env.local`, and all variations containing actual keys are strictly excluded via `.gitignore`.
2. **Canonical Template**: All recognized environment variables must be documented in `.env.example`.
3. **OS-Level Keyring in Production**: For production desktop builds, user credentials and model API keys are saved in the operating system's native keychain (Windows Credential Vault, macOS Keychain, Linux Secret Service) using Tauri's keyring plugin, rather than plain text environment files.

---

## 2. Recognized Variables Reference

| Variable | Package / App | Description | Default / Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Global | Execution environment | `development` / `production` |
| `PORT` | `apps/web`, `apps/desktop` | Local HTTP dev server port | `3000` |
| `SURREAL_ENDPOINT` | `@alina/database` | SurrealDB WebSocket RPC endpoint | `http://127.0.0.1:8000/rpc` |
| `SURREAL_NAMESPACE` | `@alina/database` | SurrealDB active namespace | `alina` |
| `SURREAL_DATABASE` | `@alina/database` | SurrealDB active database | `main` |
| `SURREAL_USERNAME` | `@alina/database` | SurrealDB root authentication user | `root` |
| `SURREAL_PASSWORD` | `@alina/database` | SurrealDB root authentication password | `root` |
| `ANTHROPIC_API_KEY` | `@alina/agent` | Anthropic Claude API Key | Optional for dev |
| `OPENAI_API_KEY` | `@alina/agent` | OpenAI API Key | Optional for dev |
| `GEMINI_API_KEY` | `@alina/agent` | Google Gemini API Key | Optional for dev |
| `OLLAMA_BASE_URL` | `@alina/agent` | Local Ollama endpoint | `http://localhost:11434` |
| `ALINA_SANDBOX_ALLOWED_ROOTS` | `@alina/shared` | Comma-separated paths allowed in PathJail | Current workspace root |
