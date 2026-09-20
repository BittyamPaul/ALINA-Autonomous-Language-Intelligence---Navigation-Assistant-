# ALINA — Desktop Application Distribution & Code Signing Specification

## 1. Distribution Philosophy

In accordance with ALINA's architectural principles:
- **Client Binaries, Not Cloud-Hosted UI**: The desktop application is distributed as native standalone binaries compiled via **Tauri v2** with an embedded Next.js interface.
- **Local-First Security**: The application runs directly on the user's host OS, interfacing directly with native OS keychains (DPAPI / Keychain / SecretService) for API keys and local process sandboxes.
- **Zero Centralized Monolith**: The desktop application is decoupled from backend services. It can run in standalone local mode (connecting to a local SurrealDB instance) or in connected mode (connecting to a private team SurrealDB cluster).

---

## 2. Platform Matrix & Artifact Targets

| Operating System | Architecture | Package Formats | Target Users |
| :--- | :--- | :--- | :--- |
| **Windows** | `x86_64`, `aarch64` | `.exe` (NSIS Installer), `.msi` (WiX) | Windows 10 / 11 64-bit |
| **macOS** | `universal` (x86_64 + Apple Silicon) | `.dmg`, `.app.tar.gz` | macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia) |
| **Linux** | `x86_64` | `.AppImage`, `.deb` | Ubuntu 22.04+, Debian 12+, Fedora, Arch Linux |

---

## 3. Cryptographic Code Signing Specifications

### 3.1 Windows Authenticode Signing
To eliminate Microsoft SmartScreen warnings and guarantee binary provenance:
1. **Certificate Type**: Extended Validation (EV) or Cloud Signing via Azure Trusted Signing / AWS CloudHSM.
2. **Environment Variables**:
   - `TAURI_SIGNING_PRIVATE_KEY`: Private Ed25519 updater key.
   - `AZURE_CREDENTIALS` / `SM_CLIENT_CERT_FILE`: Azure Trusted Signing or Digicert ONE client credentials.
3. **Timestamping**: `http://timestamp.digicert.com` (RFC 3161).
4. **Command Pipeline**:
   ```powershell
   signtool.exe sign /v /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "ALINA_x64-setup.exe"
   ```

### 3.2 macOS Developer ID & Notarization
To comply with Apple Gatekeeper and secure execution standards:
1. **Developer Certificate**: Developer ID Application (`Apple Development: ...`).
2. **Hardened Runtime**: Enabled by default in Tauri v2 (`--options runtime`).
3. **Entitlements** (`src-tauri/Entitlements.plist`):
   - `com.apple.security.network.client`: Outbound API communication.
   - `com.apple.security.files.user-selected.read-write`: PathJail user selected workspace folders.
4. **Notarization Pipeline**:
   ```bash
   xcrun notarytool submit ALINA.dmg --keychain-profile "ALINA_NOTARY" --wait
   xcrun stapler staple ALINA.dmg
   ```

---

## 4. Tauri v2 Secure Auto-Updater Protocol

ALINA uses cryptographic Ed25519 signature verification on all updates.

### 4.1 Keypair Generation
```bash
# Generate release keypair
pnpm --filter @alina/desktop tauri signer generate -w ~/.tauri/alina.key
```
- **Public Key**: Placed in `tauri.conf.json` under `plugins.updater.pubkey`.
- **Private Key**: Injected during CI/CD via GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`.

### 4.2 Updater Configuration Schema (`tauri.conf.json`)
```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://releases.alina.ai/desktop/latest.json"
      ],
      "dialog": false,
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkKUldTeWRvL055b0FzY09s..."
    }
  }
}
```

### 4.3 Update Manifest (`latest.json`)
Generated automatically by GitHub Actions CI/CD on release:
```json
{
  "version": "1.0.0",
  "notes": "ALINA Production Release — Calm, Linear-inspired autonomous companion.",
  "pub_date": "2026-09-20T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/alina-ai/alina/releases/download/v1.0.0/ALINA_1.0.0_x64-setup.exe"
    },
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/alina-ai/alina/releases/download/v1.0.0/ALINA_1.0.0_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/alina-ai/alina/releases/download/v1.0.0/ALINA_1.0.0_amd64.AppImage.tar.gz"
    }
  }
}
```

---

## 5. Artifact Verification & Checksum Delivery

Every release includes a cryptographic `SHA256SUMS.txt` file containing the SHA-256 hashes of all distribution artifacts, signed with the release GPG key:
```bash
sha256sum ALINA_* > SHA256SUMS.txt
gpg --armor --detach-sign SHA256SUMS.txt
```
End users can verify installer integrity locally prior to execution:
```bash
sha256sum -c SHA256SUMS.txt
```
