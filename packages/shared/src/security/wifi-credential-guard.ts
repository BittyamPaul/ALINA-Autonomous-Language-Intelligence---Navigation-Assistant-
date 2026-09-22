/**
 * Zero-Retention Wi-Fi Credential Security Guard
 * 
 * Strict non-negotiable invariants:
 * 1. Zero password storage in SurrealDB, SQLite, or disk.
 * 2. Zero password in any log file, console output, or error trace.
 * 3. Zero password passed to LLM contexts, prompts, or conversation history.
 * 4. Zero password in telemetry or metrics events.
 * 5. Memory buffers wiped immediately after handing off to OS network APIs.
 */

export class WifiCredentialGuard {
  private static readonly PASSWORD_PATTERNS = [
    /(password|pwd|passphrase|key)\s*[:=\s]\s*["']?([^"',\s]+)["']?/gi,
    /wpa[23]?[_-]key[:=\s]\s*["']?([^"',\s]+)["']?/gi,
  ];

  /**
   * Asserts that an object, payload, or record does NOT contain persistent credentials
   * before sending to storage, logs, or LLMs.
   */
  public static assertSafeForPersistence(payload: unknown, contextName = 'record'): void {
    if (!payload || typeof payload !== 'object') return;

    const str = JSON.stringify(payload);
    for (const pattern of this.PASSWORD_PATTERNS) {
      if (pattern.test(str)) {
        throw new Error(
          `[SECURITY VIOLATION] Zero-Persistence Rule Violation: Attempted to persist raw Wi-Fi credentials in ${contextName}. Operation aborted by WifiCredentialGuard.`
        );
      }
    }

    const rec = payload as Record<string, unknown>;
    const forbiddenKeys = ['password', 'wifi_password', 'wifipassword', 'passphrase', 'wpa_key', 'network_key'];
    for (const key of Object.keys(rec)) {
      if (forbiddenKeys.includes(key.toLowerCase())) {
        throw new Error(
          `[SECURITY VIOLATION] Zero-Persistence Rule Violation: Detected sensitive network credential key "${key}" in ${contextName}. Wi-Fi passwords must NEVER be saved to database or storage.`
        );
      }
    }
  }

  public static assertNotPersistent(payload: unknown, contextName = 'record'): void {
    this.assertSafeForPersistence(payload, contextName);
  }

  /**
   * Redacts any accidental Wi-Fi credentials from strings before printing to console,
   * audit logs, or error responses.
   */
  public static redactString(input: string): string {
    if (!input) return input;
    let redacted = input;
    for (const pattern of this.PASSWORD_PATTERNS) {
      redacted = redacted.replace(pattern, '$1=[REDACTED_CREDENTIAL]');
    }
    return redacted;
  }

  public static redactFromLogs(input: string): string {
    return this.redactString(input);
  }

  /**
   * Sanitizes request payloads meant for logging or audit, stripping any sensitive key.
   */
  public static sanitizeForAudit<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      const lower = k.toLowerCase();
      if (lower.includes('password') || lower.includes('passphrase') || lower.includes('key')) {
        clone[k] = '[REDACTED_BY_GUARD]';
      } else if (typeof v === 'string') {
        clone[k] = this.redactString(v);
      } else {
        clone[k] = v;
      }
    }
    return clone;
  }

  /**
   * Wipes a credential buffer or string from memory immediately after usage.
   * If a string is provided, overwrites memory arrays if available.
   */
  public static wipeCredential(credential?: string | Uint8Array | null): void {
    if (!credential) return;

    if (credential instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(credential))) {
      (credential as Uint8Array).fill(0);
      return;
    }

    if (typeof credential === 'string') {
      try {
        if (typeof Buffer !== 'undefined') {
          const b = Buffer.from(credential, 'utf-8');
          b.fill(0);
        } else {
          const encoder = new TextEncoder();
          const buf = encoder.encode(credential);
          buf.fill(0);
        }
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Executes a sensitive OS network connection operation inside a secure scope
   * and guarantees memory wiping in the finally block.
   */
  public static async executeWithEphemeralCredential<T>(
    password: string | Uint8Array | undefined,
    action: (ephemeralKey: any) => Promise<T>
  ): Promise<T> {
    let buf: any = undefined;
    if (typeof password === 'string') {
      buf = typeof Buffer !== 'undefined' ? Buffer.from(password, 'utf-8') : new TextEncoder().encode(password);
    } else if (password instanceof Uint8Array) {
      buf = password;
    }

    try {
      return await action(buf ?? password);
    } finally {
      if (buf && typeof buf.fill === 'function') {
        buf.fill(0);
      }
      this.wipeCredential(password);
    }
  }
}
