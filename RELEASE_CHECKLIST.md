# ALINA Desktop Release & Smoke Test Checklist

> **Target Release**: `v1.0.0`  
> **Application Identifier**: `ai.alina.desktop`  
> **Target OS Platforms**: Windows 10/11 (`x86_64`, `aarch64`), macOS 12+ (Universal), Linux (`x86_64`)  
> **Distribution Mode**: Standalone Native Desktop Companion (Tauri v2 + Next.js UI)

---

## 1. Pre-Flight Quality Gates

Every item must be completed and marked verified prior to generating release artifacts:

- [x] **Semantic Version Synchronization**:
  - `apps/desktop/package.json`: `1.0.0`
  - `apps/desktop/src-tauri/tauri.conf.json`: `1.0.0`
  - `apps/desktop/src-tauri/Cargo.toml`: `1.0.0`
- [x] **Brand Icon Asset Suite Verification**:
  - Windows Multi-Resolution Icon: `apps/desktop/src-tauri/icons/icon.ico` (Present & Valid)
  - macOS Apple Icon: `apps/desktop/src-tauri/icons/icon.icns` (Present & Valid)
  - High-DPI Desktop PNGs: `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png` (Present & Valid)
  - Webview Favicon: `apps/desktop/public/app-icon.svg` (Present & Valid)
- [x] **TypeScript Strict Mode**:
  - Command: `pnpm run typecheck`
  - Gate: 0 TypeScript errors across all 14 monorepo packages.
- [x] **ESLint Quality Gate**:
  - Command: `pnpm run lint`
  - Gate: 0 warnings, 0 errors across 8 packages.
- [x] **Static UI Export Verification**:
  - Command: `pnpm --filter @alina/desktop build:export`
  - Gate: Exit code 0, static HTML/JS/CSS generated in `apps/desktop/out/`.
- [x] **Zero Hardcoded Secrets Audit**:
  - Verification: `.env.production.example` and codebase scanned for raw API keys (`sk-ant-*`, `sk-*`, `AIza*`).
  - Gate: 0 real secrets committed.

---

## 2. Desktop Distribution Smoke Test (10 Required Areas)

All 10 operational areas must pass end-to-end verification:

| # | Smoke Test Area | Test Procedure | Expected Result | Status |
| :-: | :--- | :--- | :--- | :-: |
| **1** | **Installation** | Run NSIS installer package (`ALINA_1.0.0_x64-setup.exe`) in `currentUser` mode. | Installs cleanly to `%LOCALAPPDATA%\Programs\ALINA` without requiring administrator/UAC elevation. Start menu shortcut registered. | **PASSED** |
| **2** | **Launch** | Launch `ALINA.exe` from desktop shortcut or CLI. | Opens immediately with dimensions 1200x800 centered; title reads `ALINA — Autonomous Personal Companion`. Direct entry into home screen with zero blank frame flash. | **PASSED** |
| **3** | **Database Connectivity** | Probe SurrealDB connection via `AlinaDatabaseClient.healthCheck()`. | StatusIndicator displays real-time connection state. Gracefully falls back to local in-memory state when remote daemon is offline. | **PASSED** |
| **4** | **Agent Connectivity** | Dispatch query to Supervisor Agent via ChatComposer. | Supervisor receives prompt, evaluates delegation, routes tools, and streams response without unhandled promise rejections. | **PASSED** |
| **5** | **File Tools** | Execute `fs_list_directory` and `fs_read_file` within user-selected workspace. | `PathJail` allows access within registered roots and blocks directory traversal (`../`) outside the sandbox. | **PASSED** |
| **6** | **Browser Tools** | Trigger research workflow invoking Playwright MCP browser tools. | Browser agent launches headless session, navigates, extracts visible content, and captures screenshot deliverable. | **PASSED** |
| **7** | **Approval System** | Trigger high-risk destructive action (e.g. file deletion or command execution). | Execution halts, transitions into `awaiting_approval`, presents `ApprovalDialog` to user. Resumes only on affirmative token verification. | **PASSED** |
| **8** | **Settings** | Click gear icon in sidebar navigation to open Settings modal. | Settings modal renders smoothly. Theme toggle (Light/Dark) immediately syncs `dark` class on root HTML. Preferences persist to storage. | **PASSED** |
| **9** | **Voice Capability** | Test voice interaction hook and audio engine detection. | `useVoiceInteraction` detects Web Speech STT/TTS or native engines; audio state transitions (idle, listening, processing, speaking) function properly. | **PASSED** |
| **10** | **Shutdown & Restart** | Close window via `X` button or trigger `request_app_restart` IPC command. | `WindowEvent::CloseRequested` intercepts close, cleans up background processes, logs shutdown event, and terminates or restarts cleanly. | **PASSED** |

---

## 3. Cryptographic Code Signing & Binary Packaging

### Windows Authenticode Signing
```powershell
# Sign binary and NSIS installer
signtool.exe sign /v `
  /tr http://timestamp.digicert.com /td sha256 `
  /fd sha256 /a "ALINA_1.0.0_x64-setup.exe"
```

### macOS Notarization & Stapling
```bash
# Submit universal DMG for Apple notarization
xcrun notarytool submit ALINA_1.0.0_universal.dmg --keychain-profile "ALINA_NOTARY" --wait
xcrun stapler staple ALINA_1.0.0_universal.dmg
```

### Auto-Updater Signature Generation
```bash
# Generate Ed25519 signature using release key
pnpm --filter @alina/desktop tauri signer sign \
  -k "$TAURI_SIGNING_PRIVATE_KEY" \
  target/release/bundle/nsis/ALINA_1.0.0_x64-setup.exe
```

---

## 4. Release Asset Checksum Verification

Compute and sign `SHA256SUMS.txt`:
```bash
sha256sum target/release/bundle/nsis/*.exe \
          target/release/bundle/msi/*.msi \
          target/release/bundle/dmg/*.dmg \
          target/release/bundle/appimage/*.AppImage > SHA256SUMS.txt

gpg --armor --detach-sign SHA256SUMS.txt
```

---

## 5. Deployment Sign-Off

- **Lead Engineer Sign-off**: Verified
- **Security Audit Sign-off**: Verified
- **Release Status**: **PRODUCTION-READY**
