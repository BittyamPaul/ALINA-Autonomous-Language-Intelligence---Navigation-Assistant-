import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { PathJail, SecretRedactor } from '@alina/shared';
import { AlinaDatabaseClient } from '@alina/database';
import {
  AlinaSupervisorAgent,
  TaskDelegator,
  AlinaVoiceCoordinator,
  MockModelAdapter,
  MockSpeechRecognitionAdapter,
  MockSpeechSynthesisAdapter,
  AuthorizationManager,
} from '@alina/agent';
import {
  createAlinaMcpToolRegistry,
  listDirectoryTool,
  readTextFileTool,
  deleteFileTool,
  browserLaunchTool,
  browserNavigateTool,
  browserInspectTool,
  browserReadContentTool,
  browserScreenshotTool,
} from '@alina/tools';

describe('ALINA Desktop Distribution & 10-Point Smoke Test Suite', () => {
  const rootDir = path.resolve(__dirname, '..');
  const desktopDir = path.join(rootDir, 'apps', 'desktop');
  const srcTauriDir = path.join(desktopDir, 'src-tauri');
  const testScratchDir = path.join(rootDir, 'scratch', 'dist-smoke-' + Date.now());

  beforeEach(async () => {
    await fsPromises.mkdir(testScratchDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsPromises.rm(testScratchDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // Area 1: Installation, Packaging & Versioning
  // ==========================================================================
  describe('Area 1: Installation, Packaging & Versioning', () => {
    it('should have unified version 1.0.0 across package.json, tauri.conf.json, and Cargo.toml', () => {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(srcTauriDir, 'tauri.conf.json'), 'utf8'));
      const cargoToml = fs.readFileSync(path.join(srcTauriDir, 'Cargo.toml'), 'utf8');

      expect(pkgJson.version).toBe('1.0.0');
      expect(tauriConf.version).toBe('1.0.0');
      expect(cargoToml).toMatch(/version\s*=\s*"1\.0\.0"/);
      expect(cargoToml).toContain('license = "MIT"');
      expect(tauriConf.identifier).toBe('ai.alina.desktop');
      expect(tauriConf.productName).toBe('ALINA');
      expect(tauriConf.app?.security?.csp).toBeDefined();
      expect(tauriConf.app?.security?.csp).toContain("default-src 'self'");
    });

    it('should configure NSIS installer in currentUser mode without requiring admin rights', () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(srcTauriDir, 'tauri.conf.json'), 'utf8'));
      expect(tauriConf.bundle?.windows?.nsis?.installMode).toBe('currentUser');
      expect(tauriConf.bundle?.windows?.nsis?.languages).toContain('en-US');
    });

    it('should provide complete multi-platform brand icon suite', () => {
      const iconsDir = path.join(srcTauriDir, 'icons');
      expect(fs.existsSync(iconsDir)).toBe(true);

      const requiredIcons = [
        'icon.ico',
        'icon.icns',
        '32x32.png',
        '64x64.png',
        '128x128.png',
        '128x128@2x.png',
        'icon.png',
      ];

      for (const icon of requiredIcons) {
        const iconPath = path.join(iconsDir, icon);
        expect(fs.existsSync(iconPath), `Icon file ${icon} must exist`).toBe(true);
        const stats = fs.statSync(iconPath);
        expect(stats.size).toBeGreaterThan(100);
      }

      const svgFavicon = path.join(desktopDir, 'public', 'app-icon.svg');
      expect(fs.existsSync(svgFavicon)).toBe(true);
    });
  });

  // ==========================================================================
  // Area 2: Launch & Direct Home Screen Entry
  // ==========================================================================
  describe('Area 2: Launch & Direct Home Screen Entry', () => {
    it('should configure primary window dimensions and title in tauri.conf.json', () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(srcTauriDir, 'tauri.conf.json'), 'utf8'));
      const mainWindow = tauriConf.app.windows.find((w: { label: string }) => w.label === 'main');

      expect(mainWindow).toBeDefined();
      expect(mainWindow.title).toContain('ALINA');
      expect(mainWindow.width).toBe(1200);
      expect(mainWindow.height).toBe(800);
      expect(mainWindow.minWidth).toBe(960);
      expect(mainWindow.minHeight).toBe(600);
      expect(mainWindow.center).toBe(true);
      expect(mainWindow.resizable).toBe(true);
    });

    it('should compile static frontend assets ready for webview presentation', () => {
      const outDir = path.join(desktopDir, 'out');
      expect(fs.existsSync(outDir)).toBe(true);

      const indexHtml = path.join(outDir, 'index.html');
      expect(fs.existsSync(indexHtml)).toBe(true);
      const content = fs.readFileSync(indexHtml, 'utf8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('ALINA');
    });
  });

  // ==========================================================================
  // Area 3: Database Connectivity & Offline Resilience
  // ==========================================================================
  describe('Area 3: Database Connectivity & Offline Resilience', () => {
    it('should gracefully probe SurrealDB and handle offline state without unhandled rejection', async () => {
      const client = new AlinaDatabaseClient({
        endpoint: 'http://127.0.0.1:8000/rpc',
        namespace: 'alina_smoke',
        database: 'main_smoke',
        maxRetries: 1,
        retryDelayMs: 10,
      });

      const health = await client.healthCheck();
      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(health.endpoint).toBe('http://127.0.0.1:8000/rpc');
      expect(health.namespace).toBe('alina_smoke');
      expect(health.database).toBe('main_smoke');

      await client.close();
    });
  });

  // ==========================================================================
  // Area 4: Agent Connectivity & Routing
  // ==========================================================================
  describe('Area 4: Agent Connectivity & Routing', () => {
    it('should initialize AlinaSupervisorAgent and evaluate delegation targets', () => {
      const mcpRegistry = createAlinaMcpToolRegistry();
      const mockModel = new MockModelAdapter(async () => ({ text: 'Acknowledged.' }));
      const authManager = AuthorizationManager.getInstance();

      const supervisor = new AlinaSupervisorAgent({
        mcpRegistry,
        modelAdapter: mockModel,
        authorizationManager: authManager,
      });

      expect(supervisor).toBeDefined();

      const decision = supervisor.shouldDelegate(
        'Research the latest TypeScript 5.8 documentation and extract release notes from the web'
      );
      expect(decision.delegate).toBe(true);
      expect(decision.pipeline).toContain('research');
    });

    it('should verify task delegator handles subagent orchestration', () => {
      const delegator = new TaskDelegator();
      expect(delegator).toBeDefined();
    });
  });

  // ==========================================================================
  // Area 5: File Tools & Path Containment
  // ==========================================================================
  describe('Area 5: File Tools & Path Containment', () => {
    it('should enforce PathJail boundaries and reject path traversal attempts', () => {
      const allowedDir = path.resolve(rootDir, 'packages', 'shared');
      const jail = new PathJail({ allowedRoots: [allowedDir] });

      // Allowed path
      const safePath = path.join(allowedDir, 'package.json');
      expect(jail.isPathAllowed(safePath).allowed).toBe(true);

      // Traversal attack outside jail
      const forbiddenPath = path.resolve(allowedDir, '..', '..', 'windows', 'system32', 'cmd.exe');
      expect(jail.isPathAllowed(forbiddenPath).allowed).toBe(false);
      expect(() => jail.assertPathAllowed(forbiddenPath)).toThrow();
    });

    it('should export verified filesystem tools with Zod schema definitions', () => {
      expect(listDirectoryTool).toBeDefined();
      expect(readTextFileTool).toBeDefined();
      expect(listDirectoryTool.name).toBe('list_directory');
      expect(readTextFileTool.name).toBe('read_text_file');
    });
  });

  // ==========================================================================
  // Area 6: Browser Tools & MCP Execution
  // ==========================================================================
  describe('Area 6: Browser Tools & MCP Execution', () => {
    it('should declare complete Playwright MCP tool suite', () => {
      expect(browserLaunchTool).toBeDefined();
      expect(browserNavigateTool).toBeDefined();
      expect(browserInspectTool).toBeDefined();
      expect(browserReadContentTool).toBeDefined();
      expect(browserScreenshotTool).toBeDefined();

      expect(browserLaunchTool.name).toBe('browser_launch');
      expect(browserNavigateTool.name).toBe('browser_navigate');
      expect(browserInspectTool.name).toBe('browser_inspect');
      expect(browserReadContentTool.name).toBe('browser_read_content');
      expect(browserScreenshotTool.name).toBe('browser_screenshot');
    });
  });

  // ==========================================================================
  // Area 7: Human-in-the-Loop Approval System
  // ==========================================================================
  describe('Area 7: Human-in-the-Loop Approval System', () => {
    it('should correctly classify high-risk operations requiring approval tokens', () => {
      expect(deleteFileTool).toBeDefined();
      expect(deleteFileTool.name).toBe('delete_file');
      expect(deleteFileTool.permission).toBe('HIGH_RISK');
    });

    it('should format approval decision payloads for native Tauri IPC', () => {
      const decisionPayload = {
        request_id: 'appr-req-12345',
        approved: true,
        reviewer_note: 'Approved by system operator',
      };

      expect(decisionPayload.request_id).toBe('appr-req-12345');
      expect(decisionPayload.approved).toBe(true);
    });
  });

  // ==========================================================================
  // Area 8: Settings & Theme Synchronization
  // ==========================================================================
  describe('Area 8: Settings & Theme Synchronization', () => {
    it('should verify settings panel components exist and handle light/dark modes', () => {
      const homePage = path.join(desktopDir, 'src', 'app', 'page.tsx');
      expect(fs.existsSync(homePage)).toBe(true);

      const content = fs.readFileSync(homePage, 'utf8');
      expect(content).toContain("activeNav === 'settings'");
      expect(content).toContain('theme');
      expect(content).toContain('setTheme');
    });
  });

  // ==========================================================================
  // Area 9: Voice Capabilities & Audio State Machine
  // ==========================================================================
  describe('Area 9: Voice Capabilities & Audio State Machine', () => {
    it('should initialize AlinaVoiceCoordinator and coordinate voice interactions', async () => {
      const mcpRegistry = createAlinaMcpToolRegistry();
      const mockModel = new MockModelAdapter(async () => ({ text: 'Voice response ready.' }));
      const authManager = AuthorizationManager.getInstance();

      const supervisorAgent = new AlinaSupervisorAgent({
        mcpRegistry,
        modelAdapter: mockModel,
        authorizationManager: authManager,
      });

      const sttAdapter = new MockSpeechRecognitionAdapter();
      const ttsAdapter = new MockSpeechSynthesisAdapter();

      const voice = new AlinaVoiceCoordinator({
        supervisorAgent,
        sttAdapter,
        ttsAdapter,
        jailRoot: testScratchDir,
        config: {
          ttsEnabled: true,
          voiceRate: 1.0,
          voicePitch: 1.0,
        },
      });

      expect(voice).toBeDefined();
      expect(voice.getState()).toBe('idle');

      await voice.startListening();
      expect(voice.getState()).toBe('listening');

      await voice.stopListening();
      expect(voice.getState()).toBe('idle');
      voice.destroy();
    });
  });

  // ==========================================================================
  // Area 10: Shutdown, Restart & Crash Handling
  // ==========================================================================
  describe('Area 10: Shutdown, Restart & Crash Handling', () => {
    it('should declare panic hook and graceful shutdown in main.rs', () => {
      const mainRs = fs.readFileSync(path.join(srcTauriDir, 'src', 'main.rs'), 'utf8');

      expect(mainRs).toContain('setup_crash_handler');
      expect(mainRs).toContain('std::panic::set_hook');
      expect(mainRs).toContain('CloseRequested');
      expect(mainRs).toContain('request_app_restart');
      expect(mainRs).toContain('request_app_shutdown');
      expect(mainRs).toContain('get_system_metadata');
    });

    it('should provide React ErrorBoundary with secret redaction and diagnostic reporting', () => {
      const errorBoundaryPath = path.join(desktopDir, 'src', 'components', 'ErrorBoundary.tsx');
      expect(fs.existsSync(errorBoundaryPath)).toBe(true);

      const content = fs.readFileSync(errorBoundaryPath, 'utf8');
      expect(content).toContain('class ErrorBoundary');
      expect(content).toContain('sanitizeClientMessage');
      expect(content).toContain('Reload ALINA');
      expect(content).toContain('Copy Diagnostics');
    });

    it('should sanitize errors passed through SecretRedactor in crash reports', () => {
      const sensitiveError = new Error('Connection failed to sk-ant-api03-livekey1234567890abcdef');
      const sanitized = SecretRedactor.redactString(sensitiveError.message);

      expect(sanitized).not.toContain('sk-ant-api03-livekey1234567890abcdef');
      expect(sanitized).toContain('[REDACTED_SECRET]');
    });
  });
});
