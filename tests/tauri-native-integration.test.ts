import { describe, it, expect, beforeEach } from 'vitest';
import {
  TauriNativeBridge,
  createAlinaMcpToolRegistry,
  computerLaunchAppTool,
  computerGetSystemInfoTool,
  computerCaptureScreenshotTool,
  computerKeyboardInputTool,
  computerMouseInputTool,
} from '../packages/tools/src';
import { AlinaSupervisorAgent } from '../packages/agent/src';
import {
  NativeSystemInfoSchema,
  NativeScreenshotResultSchema,
} from '../packages/shared/src';

describe('Tauri 2 Native Desktop Integration & Safety Architecture', () => {
  let bridge: TauriNativeBridge;

  beforeEach(() => {
    bridge = TauriNativeBridge.getInstance();
  });

  describe('1. Security & Strict Whitelist Enforcement', () => {
    it('allows launching pre-approved productivity applications (calc, notepad)', async () => {
      const calcResult = await bridge.launchApplication({
        appName: 'calc',
        args: [],
      });

      expect(calcResult.appName).toBe('calc');
      expect(calcResult.pid).toBeGreaterThan(0);
      expect(calcResult.auditEvent.permission_tier).toBe('RequiresApproval');
      expect(calcResult.auditEvent.outcome).toBe('success');

      const notepadResult = await bridge.launchApplication({
        appName: 'notepad',
        args: ['notes.txt'],
      });

      expect(notepadResult.appName).toBe('notepad');
      expect(notepadResult.auditEvent.outcome).toBe('success');
    });

    it('strictly rejects non-whitelisted binaries with HighRiskBlocked audit event', async () => {
      await expect(
        bridge.launchApplication({
          appName: 'cmd.exe',
          args: [],
        })
      ).rejects.toThrow(/not permitted/i);

      const recentAudit = bridge.getAuditLog().slice(-1)[0]!;
      expect(recentAudit.permission_tier).toBe('HighRiskBlocked');
      expect(recentAudit.outcome).toBe('rejected');
      expect(recentAudit.details).toContain('cmd.exe');
    });

    it('rejects commands containing dangerous shell redirection or mutating tokens', async () => {
      await expect(
        bridge.launchApplication({
          appName: 'calc',
          args: ['|', 'del', 'C:\\Windows'],
        })
      ).rejects.toThrow(/disallowed shell token/i);

      const recentAudit = bridge.getAuditLog().slice(-1)[0]!;
      expect(recentAudit.permission_tier).toBe('HighRiskBlocked');
      expect(recentAudit.outcome).toBe('rejected');
    });
  });

  describe('2. Permission Gating & Telemetry Inspection', () => {
    it('retrieves native system information with SAFE permission classification', async () => {
      const sysInfo = await bridge.getNativeSystemInfo();

      expect(sysInfo.permissionTier).toBe('Safe');
      expect(sysInfo.os).toBeDefined();
      expect(sysInfo.arch).toBeDefined();
      expect(sysInfo.cpuCount).toBeGreaterThan(0);
      expect(sysInfo.memoryTotalMb).toBeGreaterThan(0);
      expect(sysInfo.displays.length).toBeGreaterThan(0);
      expect(sysInfo.displays[0]!.width).toBeGreaterThan(0);

      // Verify Zod schema conformity
      const validated = NativeSystemInfoSchema.parse(sysInfo);
      expect(validated.os).toBe(sysInfo.os);
    });

    it('captures native screenshot with boundary validation', async () => {
      const screenshot = await bridge.captureNativeScreenshot({
        displayIndex: 0,
      });

      expect(screenshot.format).toBe('png');
      expect(screenshot.width).toBeGreaterThan(0);
      expect(screenshot.height).toBeGreaterThan(0);
      expect(screenshot.auditEvent.permission_tier).toBe('RequiresApproval');

      const validated = NativeScreenshotResultSchema.parse(screenshot);
      expect(validated.filePath).toBeDefined();
    });

    it('prevents saving screenshot to restricted system paths', async () => {
      await expect(
        bridge.captureNativeScreenshot({
          displayIndex: 0,
          savePath: 'C:\\Windows\\System32\\alina_leak.png',
        })
      ).rejects.toThrow(/restricted system location/i);

      const recentAudit = bridge.getAuditLog().slice(-1)[0]!;
      expect(recentAudit.permission_tier).toBe('HighRiskBlocked');
      expect(recentAudit.outcome).toBe('rejected');
    });
  });

  describe('3. Controlled Keyboard & Mouse Interactions', () => {
    it('dispatches controlled keyboard text and safe key combinations', async () => {
      const textResult = await bridge.sendControlledKeyboard({
        text: 'Autonomous Language Intelligence',
      });

      expect(textResult.success).toBe(true);
      expect(textResult.actionType).toBe('keyboard');
      expect(textResult.auditEvent.permission_tier).toBe('RequiresApproval');

      const comboResult = await bridge.sendControlledKeyboard({
        keyCombination: 'Ctrl+S',
      });

      expect(comboResult.success).toBe(true);
      expect(comboResult.details).toContain('Ctrl+S');
    });

    it('blocks dangerous security shortcut combinations (Ctrl+Alt+Del, Win+L)', async () => {
      await expect(
        bridge.sendControlledKeyboard({
          keyCombination: 'Ctrl+Alt+Del',
        })
      ).rejects.toThrow(/protected by OS security policy/i);

      const recentAudit = bridge.getAuditLog().slice(-1)[0]!;
      expect(recentAudit.permission_tier).toBe('HighRiskBlocked');
      expect(recentAudit.outcome).toBe('rejected');
    });

    it('dispatches bounded mouse coordinates and clicks', async () => {
      const clickResult = await bridge.sendControlledMouse({
        action: 'click',
        x: 640,
        y: 480,
        button: 'left',
      });

      expect(clickResult.success).toBe(true);
      expect(clickResult.actionType).toBe('mouse');
      expect(clickResult.auditEvent.permission_tier).toBe('RequiresApproval');
    });

    it('rejects out-of-bounds mouse coordinates', async () => {
      await expect(
        bridge.sendControlledMouse({
          action: 'click',
          x: 99999,
          y: 480,
          button: 'left',
        })
      ).rejects.toThrow(/outside valid display bounds/i);

      const recentAudit = bridge.getAuditLog().slice(-1)[0]!;
      expect(recentAudit.permission_tier).toBe('HighRiskBlocked');
    });
  });

  describe('4. Central MCP Registry Integration', () => {
    it('registers all native computer tools in AlinaMcpToolRegistry', () => {
      const registry = createAlinaMcpToolRegistry();

      const registered = registry.list();
      const toolNames = registered.map((t) => t.name);

      expect(toolNames).toContain('computer_get_system_info');
      expect(toolNames).toContain('computer_launch_app');
      expect(toolNames).toContain('computer_capture_screenshot');
      expect(toolNames).toContain('computer_keyboard_input');
      expect(toolNames).toContain('computer_mouse_input');

      // Verify permission classifications
      expect(computerGetSystemInfoTool.permission).toBe('SAFE');
      expect(computerLaunchAppTool.permission).toBe('REQUIRES_APPROVAL');
      expect(computerCaptureScreenshotTool.permission).toBe('REQUIRES_APPROVAL');
      expect(computerKeyboardInputTool.permission).toBe('REQUIRES_APPROVAL');
      expect(computerMouseInputTool.permission).toBe('REQUIRES_APPROVAL');
    });

    it('executes computer tools through MCP tool registry context with permission gating', async () => {
      const registry = createAlinaMcpToolRegistry();
      const unapprovedContext = {
        sessionId: 'test_session',
        taskId: 'test_task',
        isApprovalGranted: false,
      };

      // SAFE tool executes without explicit approval token
      const sysInfoResult = await registry.execute('computer_get_system_info', {}, unapprovedContext);
      expect(sysInfoResult.success).toBe(true);
      expect((sysInfoResult.data as any).os).toBeDefined();

      // REQUIRES_APPROVAL tool is blocked when approval is not granted
      const blockedResult = await registry.execute(
        'computer_launch_app',
        { appName: 'calc', args: [] },
        unapprovedContext
      );
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('requires explicit user approval');

      // REQUIRES_APPROVAL tool executes when explicit approval is granted
      const approvedContext = {
        sessionId: 'test_session',
        taskId: 'test_task',
        isApprovalGranted: true,
      };
      const launchResult = await registry.execute(
        'computer_launch_app',
        { appName: 'calc', args: [] },
        approvedContext
      );
      expect(launchResult.success).toBe(true);
      expect((launchResult.data as any).appName).toBe('calc');
    });
  });

  describe('5. End-to-End Pipeline: UI → Tauri → Native Tool → Agent → UI', () => {
    it('coordinates native tool invocation inside AlinaSupervisorAgent and generates editorial summaries', async () => {
      const mcpRegistry = createAlinaMcpToolRegistry();

      // Mock model adapter that selects native desktop tools in its execution plan
      const mockModelAdapter = {
        generate: async () => ({
          text: 'Planned native desktop system inspection and screenshot capture.',
          toolCalls: [
            {
              toolName: 'computer_get_system_info',
              parameters: {},
            },
            {
              toolName: 'computer_capture_screenshot',
              parameters: { displayIndex: 0 },
            },
          ],
        }),
      };

      const agent = new AlinaSupervisorAgent({
        mcpRegistry,
        modelAdapter: mockModelAdapter as any,
      });

      const events: string[] = [];
      const result = await agent.execute({
        goal: 'Inspect native desktop telemetry and capture screen artifact.',
        isApprovalGranted: true, // Affirmative human approval provided for screenshot
        onProgress: (evt) => {
          events.push(evt.type);
        },
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(2);
      expect(result.toolCallsCount).toBe(2);

      // Verify human-readable summary without chain-of-thought leakage
      expect(result.resultSummary).toContain('Native desktop telemetry');
      expect(result.resultSummary).toContain('Captured native screen');
      expect(result.resultSummary).not.toContain('<thought>');
      expect(result.resultSummary).not.toContain('trace');

      // Verify lifecycle event emission
      expect(events).toContain('step:started');
      expect(events).toContain('step:completed');
      expect(events).toContain('task:completed');
    });
  });
});
