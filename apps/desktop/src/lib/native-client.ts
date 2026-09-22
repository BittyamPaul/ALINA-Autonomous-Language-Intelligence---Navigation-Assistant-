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
  WifiNetwork,
  WifiConnectResult,
} from '@alina/shared';

const APPROVED_APPS = new Set(['calc', 'notepad', 'code', 'explorer', 'terminal', 'mspaint']);
const DANGEROUS_TOKENS = ['|', '>', '<', '&', ';', '`', '$', '%', 'rmdir', 'del', 'format', 'powershell', 'cmd.exe', '/c'];

export class NativeDesktopClient {
  private static instance: NativeDesktopClient | null = null;
  private auditEvents: NativeAuditEvent[] = [];

  public static getInstance(): NativeDesktopClient {
    if (!NativeDesktopClient.instance) {
      NativeDesktopClient.instance = new NativeDesktopClient();
    }
    return NativeDesktopClient.instance;
  }

  public isTauriAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return !!(win.__TAURI_INTERNALS__ || win.__TAURI__);
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

  public async getNativeSystemInfo(): Promise<NativeSystemInfo> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<NativeSystemInfo>('get_native_system_info');
        this.recordAudit('get_native_system_info', 'Safe', 'success', `Queried system info for ${res.hostname}`);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordAudit('get_native_system_info', 'Safe', 'failed', msg);
        throw new Error(`Tauri system info failed: ${msg}`);
      }
    }

    // Client fallback simulation
    const info: NativeSystemInfo = {
      os: 'windows',
      arch: 'x64',
      hostname: 'ALINA-DESKTOP-STATION',
      cpuCount: 8,
      memoryTotalMb: 32768,
      displays: [
        {
          width: typeof window !== 'undefined' ? window.screen.width : 1920,
          height: typeof window !== 'undefined' ? window.screen.height : 1080,
          scaleFactor: typeof window !== 'undefined' ? window.devicePixelRatio : 1.0,
          isPrimary: true,
        },
      ],
      permissionTier: 'Safe',
    };
    this.recordAudit('get_native_system_info', 'Safe', 'success', 'Queried native system telemetry in desktop simulation mode');
    return info;
  }

  public async launchApplication(input: NativeAppLaunchInput): Promise<NativeAppLaunchResult> {
    const cleanName = input.appName.trim().toLowerCase();

    if (!APPROVED_APPS.has(cleanName)) {
      this.recordAudit(
        `launch_application:${cleanName}`,
        'HighRiskBlocked',
        'rejected',
        `App "${cleanName}" is not in approved whitelist: ${Array.from(APPROVED_APPS).join(', ')}`
      );
      throw new Error(`Application "${cleanName}" is not permitted. Only pre-approved productivity applications may be launched.`);
    }

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

    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<NativeAppLaunchResult>('launch_application', { input });
        this.auditEvents.push(res.auditEvent);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordAudit(`launch_application:${cleanName}`, 'RequiresApproval', 'failed', msg);
        throw new Error(`Tauri app launch failed: ${msg}`);
      }
    }

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

  public async captureNativeScreenshot(input?: NativeScreenshotInput): Promise<NativeScreenshotResult> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<NativeScreenshotResult>('capture_native_screenshot', { input });
        this.auditEvents.push(res.auditEvent);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordAudit('capture_native_screenshot', 'RequiresApproval', 'failed', msg);
        throw new Error(`Tauri screenshot failed: ${msg}`);
      }
    }

    const auditEvent = this.recordAudit(
      'capture_native_screenshot',
      'RequiresApproval',
      'success',
      `Captured display ${input?.displayIndex ?? 0} to simulated artifact`
    );

    return {
      filePath: input?.savePath || 'C:\\Users\\bitty\\Desktop\\ALINA\\artifacts\\screenshot.png',
      width: typeof window !== 'undefined' ? window.screen.width : 1920,
      height: typeof window !== 'undefined' ? window.screen.height : 1080,
      format: 'png',
      byteSize: 314572,
      auditEvent,
    };
  }

  public async sendControlledKeyboard(input: NativeKeyboardInput): Promise<NativeInputResult> {
    if (input.keyCombination) {
      const lower = input.keyCombination.toLowerCase();
      if (lower.includes('ctrl+alt+del') || lower.includes('win+l')) {
        this.recordAudit('controlled_keyboard_input', 'HighRiskBlocked', 'rejected', `Disallowed key combo: ${input.keyCombination}`);
        throw new Error(`Disallowed key combination "${input.keyCombination}" protected by OS security policy.`);
      }
    }

    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<NativeInputResult>('controlled_keyboard_input', { input });
        this.auditEvents.push(res.auditEvent);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordAudit('controlled_keyboard_input', 'RequiresApproval', 'failed', msg);
        throw new Error(`Tauri keyboard input failed: ${msg}`);
      }
    }

    const details = input.keyCombination
      ? `Dispatched shortcut [${input.keyCombination}]`
      : `Typed text "${input.text?.slice(0, 30)}"`;

    const auditEvent = this.recordAudit('controlled_keyboard_input', 'RequiresApproval', 'success', details);

    return {
      success: true,
      actionType: 'keyboard',
      details,
      auditEvent,
    };
  }

  public async sendControlledMouse(input: NativeMouseInput): Promise<NativeInputResult> {
    if (input.x < 0 || input.x > 4096 || input.y < 0 || input.y > 4096) {
      this.recordAudit('controlled_mouse_input', 'HighRiskBlocked', 'rejected', `Coordinates (${input.x}, ${input.y}) out of safe bounds`);
      throw new Error(`Mouse coordinates (${input.x}, ${input.y}) are outside display bounds (0..4096).`);
    }

    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<NativeInputResult>('controlled_mouse_input', { input });
        this.auditEvents.push(res.auditEvent);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordAudit('controlled_mouse_input', 'RequiresApproval', 'failed', msg);
        throw new Error(`Tauri mouse input failed: ${msg}`);
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

  public async getNetworkStatus(): Promise<{
    network_available: boolean;
    internet_reachable: boolean;
    latency_ms: number | null;
    active_interface: string;
    dns_responsive: boolean;
  }> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_network_status');
      } catch {
        // Fallback
      }
    }
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      network_available: isOnline,
      internet_reachable: isOnline,
      latency_ms: isOnline ? 24 : null,
      active_interface: isOnline ? 'wifi' : 'none',
      dns_responsive: isOnline,
    };
  }

  public async getAutostartStatus(): Promise<boolean> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('get_autostart_status');
      } catch {
        // Fallback
      }
    }
    return false;
  }

  public async setAutostart(enabled: boolean): Promise<boolean> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('set_autostart', { enabled });
      } catch {
        // Fallback
      }
    }
    return enabled;
  }

  public async scanWifiNetworks(): Promise<WifiNetwork[]> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const raw = await invoke<Array<{ ssid: string; signal_percent: number; security: string; is_current: boolean }>>('scan_wifi_networks');
        return raw.map((r) => ({
          ssid: r.ssid,
          signalPercent: r.signal_percent,
          security: (r.security as 'open' | 'wpa' | 'wpa2' | 'wpa3' | 'enterprise') || 'wpa2',
          inRange: true,
          isCurrent: r.is_current,
        }));
      } catch {
        // Fallback
      }
    }
    return [
      { ssid: 'ALINA_Secure_Office', signalPercent: 96, security: 'wpa3', inRange: true, isCurrent: false },
      { ssid: 'Home_Fiber_5G', signalPercent: 88, security: 'wpa2', inRange: true, isCurrent: false },
      { ssid: 'Guest_Open_Wifi', signalPercent: 70, security: 'open', inRange: true, isCurrent: false },
    ];
  }

  public async connectWifi(ssid: string, password?: string): Promise<WifiConnectResult> {
    if (this.isTauriAvailable()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const raw = await invoke<{ success: boolean; ssid: string; error_code?: string; message: string }>('connect_wifi', {
          ssid,
          password,
        });
        return {
          success: raw.success,
          ssid: raw.ssid,
          errorCode: (raw.error_code as 'invalid_credentials' | 'permission_denied' | 'network_not_found' | 'timeout' | 'os_error') || undefined,
          message: raw.message,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          ssid,
          errorCode: 'os_error',
          message: msg,
        };
      }
    }

    if (password === 'wrong_password') {
      return {
        success: false,
        ssid,
        errorCode: 'invalid_credentials',
        message: 'Invalid Wi-Fi network password.',
      };
    }

    return {
      success: true,
      ssid,
      message: `Successfully connected to Wi-Fi network "${ssid}".`,
      connectedAt: new Date().toISOString(),
    };
  }
}
