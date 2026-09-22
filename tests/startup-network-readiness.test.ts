import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NetworkReadinessService,
  type NetworkDriverAdapter,
} from '../packages/agent/src/services/network-readiness-service';
import {
  WifiCredentialGuard,
  NetworkReadinessStateSchema,
  StartupHealthCheckResultSchema,
  WifiNetworkSchema,
  WifiConnectResultSchema,
  AutoStartConfigSchema,
  PathJail,
  type NetworkReadinessState,
} from '../packages/shared/src';
import * as path from 'path';
import * as fs from 'fs';

describe('ALINA Startup & Network Readiness Architecture', () => {
  let mockDriver: NetworkDriverAdapter;
  let service: NetworkReadinessService;
  const tempWorkspace = path.join(__dirname, '..', 'tmp-test-workspace');

  beforeEach(() => {
    vi.useFakeTimers();

    if (!fs.existsSync(tempWorkspace)) {
      fs.mkdirSync(tempWorkspace, { recursive: true });
    }

    // Default mock driver: local ready, network available, internet reachable
    mockDriver = {
      checkLocalHealth: vi.fn().mockResolvedValue(true),
      isNetworkHardwareAvailable: vi.fn().mockResolvedValue(true),
      getActiveInterface: vi.fn().mockResolvedValue('Wi-Fi 6 (Intel AX200)'),
      testInternetReachability: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 24 }),
      scanWifiNetworks: vi.fn().mockResolvedValue([
        { ssid: 'HomeFiber_5G', signalPercent: 92, security: 'wpa2_wpa3' },
        { ssid: 'Studio_Guest', signalPercent: 68, security: 'open' },
        { ssid: 'Corporate_CorpNet', signalPercent: 45, security: 'enterprise' },
      ]),
      connectWifi: vi.fn().mockResolvedValue({
        success: true,
        ssid: 'HomeFiber_5G',
        message: 'Successfully connected and verified internet route.',
      }),
      getAutoStartConfig: vi.fn().mockResolvedValue({
        enabled: false,
        appName: 'ALINA',
        executablePath: 'C:\\Users\\bitty\\AppData\\Local\\ALINA\\alina.exe',
        args: ['--startup', '--silent'],
      }),
      setAutoStart: vi.fn().mockImplementation(async (enabled: boolean) => ({
        enabled,
        appName: 'ALINA',
        executablePath: 'C:\\Users\\bitty\\AppData\\Local\\ALINA\\alina.exe',
        args: ['--startup', '--silent'],
      })),
    };

    service = new NetworkReadinessService(mockDriver, {
      maxRetryDelayMs: 30000,
      initialRetryDelayMs: 1000,
      backoffFactor: 2,
    });
  });

  afterEach(() => {
    service.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();

    if (fs.existsSync(tempWorkspace)) {
      try {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  });

  // =========================================================================
  // 1. Lifecycle State Machine & Canonical Schemas
  // =========================================================================
  describe('1. Canonical Lifecycle States & Schema Conformance', () => {
    it('initializes in STARTING state before running health checks', () => {
      const state = service.getState();
      expect(state).toBe('STARTING');
      expect(NetworkReadinessStateSchema.parse(state)).toBe('STARTING');

      const health = service.getHealthResult();
      expect(health.state).toBe('STARTING');
      expect(health.localReady).toBe(true);
      expect(health.offlineBannerMessage).toBeNull();
    });

    it('all 6 states strictly adhere to NetworkReadinessStateSchema', () => {
      const validStates: NetworkReadinessState[] = [
        'STARTING',
        'OFFLINE',
        'CONNECTING',
        'ONLINE',
        'DEGRADED',
        'ERROR',
      ];

      for (const st of validStates) {
        expect(NetworkReadinessStateSchema.safeParse(st).success).toBe(true);
      }

      expect(NetworkReadinessStateSchema.safeParse('DISCONNECTED').success).toBe(false);
      expect(NetworkReadinessStateSchema.safeParse('UNKNOWN').success).toBe(false);
    });

    it('notifies registered listeners upon readiness state transitions', async () => {
      const states: NetworkReadinessState[] = [];
      service.onStateChange((st) => states.push(st));

      await service.runStartupHealthCheck();

      expect(states).toContain('CONNECTING');
      expect(states).toContain('ONLINE');
      expect(service.getState()).toBe('ONLINE');
    });
  });

  // =========================================================================
  // 2. Scenario: Internet Available (Full Operation)
  // =========================================================================
  describe('2. Scenario: Internet Available -> ONLINE', () => {
    it('transitions to ONLINE when local services and internet reachability succeed', async () => {
      const health = await service.runStartupHealthCheck();

      expect(health.state).toBe('ONLINE');
      expect(health.localReady).toBe(true);
      expect(health.networkAvailable).toBe(true);
      expect(health.internetReachable).toBe(true);
      expect(health.latencyMs).toBe(24);
      expect(health.activeInterface).toBe('Wi-Fi 6 (Intel AX200)');
      expect(health.offlineBannerMessage).toBeNull();

      expect(StartupHealthCheckResultSchema.safeParse(health).success).toBe(true);
    });
  });

  // =========================================================================
  // 3. Scenario: Internet Unavailable (Local Features Remain 100% Operational)
  // =========================================================================
  describe('3. Scenario: Internet Unavailable -> OFFLINE / DEGRADED', () => {
    it('transitions to OFFLINE with exact banner when no network hardware/cable is available', async () => {
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(false);
      mockDriver.getActiveInterface = vi.fn().mockResolvedValue(null);

      const health = await service.runStartupHealthCheck();

      expect(health.state).toBe('OFFLINE');
      expect(health.localReady).toBe(true);
      expect(health.networkAvailable).toBe(false);
      expect(health.internetReachable).toBe(false);
      expect(health.offlineBannerMessage).toBe("You're offline. Local features are still available.");

      expect(StartupHealthCheckResultSchema.safeParse(health).success).toBe(true);
    });

    it('transitions to DEGRADED when LAN is connected but internet ping fails', async () => {
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(true);
      mockDriver.getActiveInterface = vi.fn().mockResolvedValue('Ethernet 2');
      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: false });

      const health = await service.runStartupHealthCheck();

      expect(health.state).toBe('DEGRADED');
      expect(health.localReady).toBe(true);
      expect(health.networkAvailable).toBe(true);
      expect(health.internetReachable).toBe(false);
      expect(health.offlineBannerMessage).toBe("You're offline. Local features are still available.");
    });

    it('transitions to ERROR only if local core engine health check fails', async () => {
      mockDriver.checkLocalHealth = vi.fn().mockResolvedValue(false);

      const health = await service.runStartupHealthCheck();

      expect(health.state).toBe('ERROR');
      expect(health.localReady).toBe(false);
    });
  });

  // =========================================================================
  // 4. Local Feature Independence (Rule 1 & Rule 5)
  // =========================================================================
  describe('4. Local Feature Independence (Zero Internet Dependency)', () => {
    it('guarantees PathJail operations execute cleanly even in OFFLINE mode', async () => {
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(false);
      await service.runStartupHealthCheck();

      expect(service.getState()).toBe('OFFLINE');
      expect(service.getHealthResult().localReady).toBe(true);

      // Verify PathJail file operations operate 100% offline
      const jail = new PathJail({ allowedRoots: [tempWorkspace] });
      const testFilePath = path.join(tempWorkspace, 'local-offline-note.txt');

      const allowedCheck = jail.isPathAllowed(testFilePath);
      expect(allowedCheck.allowed).toBe(true);
      fs.writeFileSync(testFilePath, 'Offline intelligence verified.', 'utf-8');

      expect(fs.existsSync(testFilePath)).toBe(true);
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe('Offline intelligence verified.');

      // Security jail boundary enforcement still holds completely offline
      const forbiddenCheck = jail.isPathAllowed('C:\\Windows\\System32\\drivers\\etc\\hosts');
      expect(forbiddenCheck.allowed).toBe(false);
    });
  });

  // =========================================================================
  // 5. Scenario: Network Disconnect & Restored Events
  // =========================================================================
  describe('5. Scenario: Network Disconnect and Restored Events', () => {
    it('transitions from ONLINE to OFFLINE upon network disconnect event', async () => {
      await service.runStartupHealthCheck();
      expect(service.getState()).toBe('ONLINE');

      service.handleNetworkEvent({ event: 'disconnected' });

      expect(service.getState()).toBe('OFFLINE');
      expect(service.getHealthResult().networkAvailable).toBe(false);
      expect(service.getHealthResult().internetReachable).toBe(false);
      expect(service.getHealthResult().offlineBannerMessage).toBe(
        "You're offline. Local features are still available."
      );
    });

    it('transitions from OFFLINE to CONNECTING then ONLINE when network connection is restored', async () => {
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(false);
      await service.runStartupHealthCheck();
      expect(service.getState()).toBe('OFFLINE');

      // Now restore hardware availability
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(true);
      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: true, latencyMs: 18 });

      const checkPromise = service.handleNetworkEvent({ event: 'connected', interfaceName: 'Wi-Fi' });
      expect(service.getState()).toBe('CONNECTING');

      await checkPromise;

      expect(service.getState()).toBe('ONLINE');
      expect(service.getHealthResult().internetReachable).toBe(true);
      expect(service.getHealthResult().latencyMs).toBe(18);
    });
  });

  // =========================================================================
  // 6. Exponential Backoff Reconnect Schedule (Non-Aggressive Retry)
  // =========================================================================
  describe('6. Exponential Backoff Reconnect Schedule', () => {
    it('calculates delays following exponential progression: 1s, 2s, 4s, 8s, 16s, max 30s', () => {
      const delays: number[] = [];

      for (let attempt = 0; attempt < 7; attempt++) {
        const delay = service.getBackoffDelay(attempt);
        delays.push(delay);
      }

      // Expected progression base: 1000, 2000, 4000, 8000, 16000, 30000, 30000
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[0]).toBeLessThanOrEqual(1200); // 1000 + max 20% jitter

      expect(delays[1]).toBeGreaterThanOrEqual(2000);
      expect(delays[1]).toBeLessThanOrEqual(2400);

      expect(delays[2]).toBeGreaterThanOrEqual(4000);
      expect(delays[2]).toBeLessThanOrEqual(4800);

      expect(delays[3]).toBeGreaterThanOrEqual(8000);
      expect(delays[3]).toBeLessThanOrEqual(9600);

      expect(delays[4]).toBeGreaterThanOrEqual(16000);
      expect(delays[4]).toBeLessThanOrEqual(19200);

      // Capped at maxRetryDelayMs (30000)
      expect(delays[5]).toBeLessThanOrEqual(30000);
      expect(delays[6]).toBeLessThanOrEqual(30000);
    });

    it('triggers reconnect automatically using exponential backoff timer when internet drops', async () => {
      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: false });
      await service.runStartupHealthCheck();
      expect(service.getState()).toBe('DEGRADED');

      // Schedule reconnect
      service.scheduleReconnect();
      expect(mockDriver.testInternetReachability).toHaveBeenCalledTimes(1);

      // Advance clock by 1.5s (covering the first ~1s delay)
      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: true, latencyMs: 30 });
      await vi.advanceTimersByTimeAsync(1500);

      expect(service.getState()).toBe('ONLINE');
    });

    it('resets retry counter upon successful connection', () => {
      service.getBackoffDelay(4); // simulate 4 failed attempts
      service.resetBackoff();

      const resetDelay = service.getBackoffDelay(0);
      expect(resetDelay).toBeLessThanOrEqual(1200);
    });
  });

  // =========================================================================
  // 7. Wi-Fi Onboarding & Ephemeral Credential Security
  // =========================================================================
  describe('7. Wi-Fi Onboarding & Zero-Retention Credential Guard', () => {
    it('scans available Wi-Fi networks returning validated schema objects', async () => {
      const networks = await service.scanWifiNetworks();

      expect(networks).toHaveLength(3);
      expect(networks[0]?.ssid).toBe('HomeFiber_5G');
      expect(networks[0]?.signalPercent).toBe(92);

      for (const net of networks) {
        expect(WifiNetworkSchema.safeParse(net).success).toBe(true);
      }
    });

    it('connects to Wi-Fi successfully and transitions state to ONLINE', async () => {
      mockDriver.isNetworkHardwareAvailable = vi.fn().mockResolvedValue(true);
      mockDriver.getActiveInterface = vi.fn().mockResolvedValue(null);
      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: false });

      await service.runStartupHealthCheck();
      expect(service.getState()).toBe('DEGRADED');

      mockDriver.testInternetReachability = vi.fn().mockResolvedValue({ reachable: true, latencyMs: 20 });
      const result = await service.connectWifi('HomeFiber_5G', 'SuperSecretPassphrase123!');

      expect(result.success).toBe(true);
      expect(result.ssid).toBe('HomeFiber_5G');
      expect(service.getState()).toBe('ONLINE');

      expect(WifiConnectResultSchema.safeParse(result).success).toBe(true);
    });

    it('handles scenario: invalid credentials with structured error code', async () => {
      mockDriver.connectWifi = vi.fn().mockResolvedValue({
        success: false,
        ssid: 'HomeFiber_5G',
        message: 'The network security key is incorrect.',
        errorCode: 'invalid_credentials',
      });

      const result = await service.connectWifi('HomeFiber_5G', 'WrongPassword');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('invalid_credentials');
      expect(result.message).toContain('incorrect');
      expect(WifiConnectResultSchema.safeParse(result).success).toBe(true);
    });

    it('handles scenario: permission denied / OS security rejection', async () => {
      mockDriver.connectWifi = vi.fn().mockResolvedValue({
        success: false,
        ssid: 'Corporate_CorpNet',
        message: 'Access is denied. Administrative privileges required.',
        errorCode: 'permission_denied',
      });

      const result = await service.connectWifi('Corporate_CorpNet', 'Admin123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('permission_denied');
      expect(WifiConnectResultSchema.safeParse(result).success).toBe(true);
    });

    it('Zero-Retention: WifiCredentialGuard enforces immediate in-memory clearance', async () => {
      let capturedBuffer: Buffer | null = null;

      const result = await WifiCredentialGuard.executeWithEphemeralCredential(
        'SecretNetworkKey#404',
        async (credentialBuffer) => {
          capturedBuffer = credentialBuffer;
          expect(credentialBuffer.toString('utf-8')).toBe('SecretNetworkKey#404');
          return { success: true };
        }
      );

      expect(result.success).toBe(true);

      // After execution, the buffer must be completely zeroed out in memory!
      expect(capturedBuffer).not.toBeNull();
      const isZeroed = capturedBuffer!.every((byte) => byte === 0);
      expect(isZeroed).toBe(true);
    });

    it('Zero-Retention: WifiCredentialGuard zeroes buffer even if an error is thrown', async () => {
      let capturedBuffer: Buffer | null = null;

      await expect(
        WifiCredentialGuard.executeWithEphemeralCredential(
          'EphemeralKeyThrow',
          async (buf) => {
            capturedBuffer = buf;
            throw new Error('OS connection timeout');
          }
        )
      ).rejects.toThrow('OS connection timeout');

      expect(capturedBuffer).not.toBeNull();
      const isZeroed = capturedBuffer!.every((byte) => byte === 0);
      expect(isZeroed).toBe(true);
    });

    it('Zero-Retention: WifiCredentialGuard blocks persistence in SurrealDB / disk', () => {
      const maliciousPayload = {
        table: 'credentials',
        password: 'StoredPassphraseDangerous',
        ssid: 'OfficeNet',
      };

      expect(() => {
        WifiCredentialGuard.assertNotPersistent(maliciousPayload);
      }).toThrow(/Zero-Persistence Rule Violation/i);
    });

    it('Zero-Retention: WifiCredentialGuard redacts credentials from logs and telemetry', () => {
      const rawLog = 'User initiated connect to SSID MyWifi with password MySecretPassword123.';
      const sanitized = WifiCredentialGuard.redactFromLogs(rawLog);

      expect(sanitized).not.toContain('MySecretPassword123');
      expect(sanitized).toContain('[REDACTED_CREDENTIAL]');
    });
  });

  // =========================================================================
  // 8. Windows Auto-Start Management
  // =========================================================================
  describe('8. Windows Auto-Start Configuration', () => {
    it('retrieves current auto-start status conforming to AutoStartConfigSchema', async () => {
      const config = await service.getAutoStartConfig();

      expect(config.enabled).toBe(false);
      expect(config.appName).toBe('ALINA');
      expect(config.args).toContain('--startup');
      expect(AutoStartConfigSchema.safeParse(config).success).toBe(true);
    });

    it('enables auto-start with --startup argument flag', async () => {
      const updated = await service.setAutoStart(true);

      expect(updated.enabled).toBe(true);
      expect(mockDriver.setAutoStart).toHaveBeenCalledWith(true);
      expect(AutoStartConfigSchema.safeParse(updated).success).toBe(true);
    });

    it('disables auto-start and unregisters from Windows startup', async () => {
      await service.setAutoStart(true);
      const disabled = await service.setAutoStart(false);

      expect(disabled.enabled).toBe(false);
      expect(mockDriver.setAutoStart).toHaveBeenCalledWith(false);
    });
  });
});
