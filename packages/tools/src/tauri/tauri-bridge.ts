import * as os from 'os';
import * as path from 'path';
import {
  NativeAppLaunchInput,
  NativeAppLaunchResult,
  NativeSystemInfo,
  NativeScreenshotInput,
  NativeScreenshotResult,
  NativeKeyboardInput,
  NativeMouseInput,
  NativeInputResult,
  NativeAuditEvent,
} from '@alina/shared';

// Whitelist matching Rust commands/app_launcher.rs
const APPROVED_APPS = new Set(['calc', 'notepad', 'code', 'explorer', 'terminal', 'mspaint']);
const DANGEROUS_TOKENS = ['|', '>', '<', '&', ';', '`', '$', '%', 'rmdir', 'del', 'format', 'powershell', 'cmd.exe', '/c'];

export interface INativeBridge {
  launchApplication(input: NativeAppLaunchInput): Promise<NativeAppLaunchResult>;
  getNativeSystemInfo(): Promise<NativeSystemInfo>;
  captureNativeScreenshot(input?: NativeScreenshotInput): Promise<NativeScreenshotResult>;
  sendControlledKeyboard(input: NativeKeyboardInput): Promise<NativeInputResult>;
  sendControlledMouse(input: NativeMouseInput): Promise<NativeInputResult>;
  isTauriAvailable(): boolean;
  getAuditLog(): NativeAuditEvent[];
}

/**
 * Tauri Native Bridge
 * Bridges TypeScript agent & MCP tools with Tauri 2 native Rust handlers.
 * In desktop environments with Tauri, communicates via Tauri IPC.
 * In headless/Node/test environments, dispatches to a strict native simulation driver.
 */
export class TauriNativeBridge implements INativeBridge {
  private auditEvents: NativeAuditEvent[] = [];
  private static instance: TauriNativeBridge | null = null;

  public static getInstance(): TauriNativeBridge {
    if (!TauriNativeBridge.instance) {
      TauriNativeBridge.instance = new TauriNativeBridge();
    }
    return TauriNativeBridge.instance;
  }

  public isTauriAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || (window as unknown as Record<string, unknown>).__TAURI__);
  }

  public getAuditLog(): NativeAuditEvent[] {
    return [...this.auditEvents];
  }

  private recordAudit(command: string, tier: 'Safe' | 'RequiresApproval' | 'HighRiskBlocked', outcome: string, details: string): NativeAuditEvent {
    const event: NativeAuditEvent = {
      id: `audit_native_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      command,
      permission_tier: tier,
      outcome,
      details,
    };
    this.auditEvents.push(event);
    return event;
  }

  /**
   * Safe native application launch with strict whitelisting and argument sanitization.
   */
  public async launchApplication(input: NativeAppLaunchInput): Promise<NativeAppLaunchResult> {
    const cleanName = input.appName.trim().toLowerCase();

    // Whitelist verification
    if (!APPROVED_APPS.has(cleanName)) {
      this.recordAudit(
        `launch_application:${cleanName}`,
        'HighRiskBlocked',
        'rejected',
        `App "${cleanName}" is not in approved native whitelist: ${Array.from(APPROVED_APPS).join(', ')}`
      );
      throw new Error(`Application "${cleanName}" is not permitted. Only pre-approved productivity applications may be launched.`);
    }

    // Argument sanitization
    const args = input.args || [];
    for (const arg of args) {
      const lower = arg.toLowerCase();
      for (const token of DANGEROUS_TOKENS) {
        if (lower.includes(token)) {
          this.recordAudit(
            `launch_application:${cleanName}`,
            'HighRiskBlocked',
            'rejected',
            `Dangerous shell token detected in arguments: "${token}"`
          );
          throw new Error(`Command arguments contain disallowed shell token: "${token}"`);
        }
      }
    }

    // If Tauri is available in the current runtime context
    if (this.isTauriAvailable()) {
      try {
        // Dynamic import to avoid node-side breakage
        const tauriCore = await import('@tauri-apps/api/core');
        return await tauriCore.invoke<NativeAppLaunchResult>('launch_application', { input });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordAudit(`launch_application:${cleanName}`, 'RequiresApproval', 'failed', message);
        throw new Error(`Tauri native execution failed: ${message}`);
      }
    }

    // Node / Headless driver execution
    const pid = Math.floor(1000 + Math.random() * 9000);
    const auditEvent = this.recordAudit(
      `launch_application:${cleanName}`,
      'RequiresApproval',
      'success',
      `Launched application "${cleanName}" with args [${args.join(', ')}] (PID: ${pid})`
    );

    return {
      pid,
      appName: cleanName,
      launchedAt: new Date().toISOString(),
      auditEvent,
    };
  }

  /**
   * System Information & Display Metrics (Safe, Read-Only)
   */
  public async getNativeSystemInfo(): Promise<NativeSystemInfo> {
    if (this.isTauriAvailable()) {
      try {
        const tauriCore = await import('@tauri-apps/api/core');
        return await tauriCore.invoke<NativeSystemInfo>('get_native_system_info');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordAudit('get_native_system_info', 'Safe', 'failed', message);
        throw new Error(`Tauri system info failed: ${message}`);
      }
    }

    const cpus = os.cpus();
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    this.recordAudit('get_native_system_info', 'Safe', 'success', `Queried system info for ${os.hostname()}`);

    return {
      os: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpuCount: cpus.length || 4,
      memoryTotalMb: totalMem,
      displays: [
        {
          width: 1920,
          height: 1080,
          scaleFactor: 1.0,
          isPrimary: true,
        },
      ],
      permissionTier: 'Safe',
    };
  }

  /**
   * Screen Capture (Requires Approval)
   */
  public async captureNativeScreenshot(input?: NativeScreenshotInput): Promise<NativeScreenshotResult> {
    const savePath = input?.savePath;
    if (savePath) {
      const lower = savePath.toLowerCase().replace(/\\/g, '/');
      const sensitive = ['/windows/system32', '/etc/shadow', '/var/root', '..'];
      for (const s of sensitive) {
        if (lower.includes(s)) {
          this.recordAudit('capture_native_screenshot', 'HighRiskBlocked', 'rejected', `Disallowed screenshot path: ${savePath}`);
          throw new Error(`Screenshot path "${savePath}" targets a restricted system location.`);
        }
      }
    }

    if (this.isTauriAvailable()) {
      try {
        const tauriCore = await import('@tauri-apps/api/core');
        return await tauriCore.invoke<NativeScreenshotResult>('capture_native_screenshot', { input });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordAudit('capture_native_screenshot', 'RequiresApproval', 'failed', message);
        throw new Error(`Tauri screenshot failed: ${message}`);
      }
    }

    const targetPath = savePath || path.join(os.tmpdir(), `alina_screenshot_${Date.now()}.png`);
    const auditEvent = this.recordAudit(
      'capture_native_screenshot',
      'RequiresApproval',
      'success',
      `Captured display ${input?.displayIndex ?? 0} to ${targetPath}`
    );

    return {
      filePath: targetPath,
      width: 1920,
      height: 1080,
      format: 'png',
      byteSize: 245760,
      auditEvent,
    };
  }

  /**
   * Controlled Keyboard Input (Requires Approval)
   */
  public async sendControlledKeyboard(input: NativeKeyboardInput): Promise<NativeInputResult> {
    if (input.keyCombination) {
      const lower = input.keyCombination.toLowerCase();
      if (lower.includes('ctrl+alt+del') || lower.includes('win+l')) {
        this.recordAudit('controlled_keyboard_input', 'HighRiskBlocked', 'rejected', `Disallowed security key sequence: ${input.keyCombination}`);
        throw new Error(`Disallowed key combination: "${input.keyCombination}" is protected by OS security policy.`);
      }
    }

    if (this.isTauriAvailable()) {
      try {
        const tauriCore = await import('@tauri-apps/api/core');
        return await tauriCore.invoke<NativeInputResult>('controlled_keyboard_input', { input });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordAudit('controlled_keyboard_input', 'RequiresApproval', 'failed', message);
        throw new Error(`Tauri keyboard input failed: ${message}`);
      }
    }

    const details = input.keyCombination
      ? `Simulated key combination [${input.keyCombination}]`
      : `Simulated typing "${input.text?.slice(0, 30)}${(input.text?.length || 0) > 30 ? '...' : ''}"`;

    const auditEvent = this.recordAudit('controlled_keyboard_input', 'RequiresApproval', 'success', details);

    return {
      success: true,
      actionType: 'keyboard',
      details,
      auditEvent,
    };
  }

  /**
   * Controlled Mouse Interaction (Requires Approval)
   */
  public async sendControlledMouse(input: NativeMouseInput): Promise<NativeInputResult> {
    if (input.x < 0 || input.x > 4096 || input.y < 0 || input.y > 4096) {
      this.recordAudit('controlled_mouse_input', 'HighRiskBlocked', 'rejected', `Coordinates (${input.x}, ${input.y}) out of safe bounds`);
      throw new Error(`Mouse coordinates (${input.x}, ${input.y}) are outside valid display bounds (0..4096).`);
    }

    if (this.isTauriAvailable()) {
      try {
        const tauriCore = await import('@tauri-apps/api/core');
        return await tauriCore.invoke<NativeInputResult>('controlled_mouse_input', { input });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordAudit('controlled_mouse_input', 'RequiresApproval', 'failed', message);
        throw new Error(`Tauri mouse input failed: ${message}`);
      }
    }

    const details = `Mouse ${input.action} at (${input.x}, ${input.y}) [button: ${input.button || 'left'}]`;
    const auditEvent = this.recordAudit('controlled_mouse_input', 'RequiresApproval', 'success', details);

    return {
      success: true,
      actionType: 'mouse',
      details,
      auditEvent,
    };
  }
}
