import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';
import {
  NativeAppLaunchInputSchema,
  NativeAppLaunchInput,
  NativeAppLaunchResultSchema,
  NativeAppLaunchResult,
  NativeSystemInfoSchema,
  NativeSystemInfo,
  NativeScreenshotInputSchema,
  NativeScreenshotInput,
  NativeScreenshotResultSchema,
  NativeScreenshotResult,
  NativeKeyboardInputSchema,
  NativeKeyboardInput,
  NativeMouseInputSchema,
  NativeMouseInput,
  NativeInputResultSchema,
  NativeInputResult,
} from '@alina/shared';
import { TauriNativeBridge } from '../tauri/tauri-bridge';

const bridge = TauriNativeBridge.getInstance();

// =========================================================================
// 1. computer_get_system_info (SAFE)
// =========================================================================
export const ComputerGetSystemInfoInputSchema = z.object({}).default({});
export type ComputerGetSystemInfoInput = z.infer<typeof ComputerGetSystemInfoInputSchema>;

export const computerGetSystemInfoTool: McpToolDefinition<ComputerGetSystemInfoInput, NativeSystemInfo> = {
  name: 'computer_get_system_info',
  group: 'computer',
  description: 'Queries native desktop system telemetry, CPU count, memory, and monitor display metrics via Tauri.',
  inputSchema: ComputerGetSystemInfoInputSchema,
  outputSchema: NativeSystemInfoSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'computer',
    description: 'Query native OS and display telemetry through Tauri native layer (read-only)',
    isReadOnly: true,
    tags: ['computer', 'tauri', 'native', 'system', 'displays'],
  },
  execute: async (_input: ComputerGetSystemInfoInput, _context: McpToolContext): Promise<NativeSystemInfo> => {
    return await bridge.getNativeSystemInfo();
  },
};

// =========================================================================
// 2. computer_launch_app (REQUIRES_APPROVAL)
// =========================================================================
export const computerLaunchAppTool: McpToolDefinition<NativeAppLaunchInput, NativeAppLaunchResult> = {
  name: 'computer_launch_app',
  group: 'computer',
  description: 'Launches a pre-approved native desktop productivity application (calc, notepad, code, explorer, terminal, mspaint).',
  inputSchema: NativeAppLaunchInputSchema,
  outputSchema: NativeAppLaunchResultSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'computer',
    description: 'Launch whitelisted native desktop application in detached process',
    isReadOnly: false,
    tags: ['computer', 'tauri', 'launch', 'process'],
  },
  execute: async (input: NativeAppLaunchInput, _context: McpToolContext): Promise<NativeAppLaunchResult> => {
    return await bridge.launchApplication(input);
  },
};

// =========================================================================
// 3. computer_capture_screenshot (REQUIRES_APPROVAL)
// =========================================================================
export const computerCaptureScreenshotTool: McpToolDefinition<NativeScreenshotInput, NativeScreenshotResult> = {
  name: 'computer_capture_screenshot',
  group: 'computer',
  description: 'Captures a native screenshot of the active desktop monitor and returns the image artifact path.',
  inputSchema: NativeScreenshotInputSchema,
  outputSchema: NativeScreenshotResultSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'computer',
    description: 'Capture native desktop screen pixels to file',
    isReadOnly: false,
    tags: ['computer', 'tauri', 'screenshot', 'display'],
  },
  execute: async (input: NativeScreenshotInput, _context: McpToolContext): Promise<NativeScreenshotResult> => {
    return await bridge.captureNativeScreenshot(input);
  },
};

// =========================================================================
// 4. computer_keyboard_input (REQUIRES_APPROVAL)
// =========================================================================
export const computerKeyboardInputTool: McpToolDefinition<NativeKeyboardInput, NativeInputResult> = {
  name: 'computer_keyboard_input',
  group: 'computer',
  description: 'Sends controlled keyboard keystrokes or shortcut combinations to the native desktop.',
  inputSchema: NativeKeyboardInputSchema,
  outputSchema: NativeInputResultSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'computer',
    description: 'Simulate controlled native keyboard events',
    isReadOnly: false,
    tags: ['computer', 'tauri', 'keyboard', 'input'],
  },
  execute: async (input: NativeKeyboardInput, _context: McpToolContext): Promise<NativeInputResult> => {
    return await bridge.sendControlledKeyboard(input);
  },
};

// =========================================================================
// 5. computer_mouse_input (REQUIRES_APPROVAL)
// =========================================================================
export const computerMouseInputTool: McpToolDefinition<NativeMouseInput, NativeInputResult> = {
  name: 'computer_mouse_input',
  group: 'computer',
  description: 'Sends controlled mouse movement or click events within bounded screen coordinates.',
  inputSchema: NativeMouseInputSchema,
  outputSchema: NativeInputResultSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'computer',
    description: 'Simulate controlled native mouse coordinates and clicks',
    isReadOnly: false,
    tags: ['computer', 'tauri', 'mouse', 'input'],
  },
  execute: async (input: NativeMouseInput, _context: McpToolContext): Promise<NativeInputResult> => {
    return await bridge.sendControlledMouse(input);
  },
};

// =========================================================================
// 6. Legacy display info tool
// =========================================================================
export const ComputerGetDisplayInfoInputSchema = z.object({}).default({});
export type ComputerGetDisplayInfoInput = z.infer<typeof ComputerGetDisplayInfoInputSchema>;

export const ComputerGetDisplayInfoOutputSchema = z.object({
  supported: z.boolean(),
  os: z.string(),
  primaryDisplay: z.object({
    width: z.number(),
    height: z.number(),
    scaleFactor: z.number(),
  }),
});
export type ComputerGetDisplayInfoOutput = z.infer<typeof ComputerGetDisplayInfoOutputSchema>;

export const computerGetDisplayInfoTool: McpToolDefinition<ComputerGetDisplayInfoInput, ComputerGetDisplayInfoOutput> = {
  name: 'computer_get_display_info',
  group: 'computer',
  description: 'Queries desktop screen dimensions and scaling factor for computer interaction.',
  inputSchema: ComputerGetDisplayInfoInputSchema,
  outputSchema: ComputerGetDisplayInfoOutputSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'computer',
    description: 'Query desktop monitor metrics and DPI scaling (read-only)',
    isReadOnly: true,
    tags: ['computer', 'display', 'screen', 'resolution'],
  },
  execute: async (_input: ComputerGetDisplayInfoInput, _context: McpToolContext): Promise<ComputerGetDisplayInfoOutput> => {
    const sysInfo = await bridge.getNativeSystemInfo();
    const primary = sysInfo.displays[0] || { width: 1920, height: 1080, scaleFactor: 1.0 };
    return {
      supported: true,
      os: sysInfo.os,
      primaryDisplay: {
        width: primary.width,
        height: primary.height,
        scaleFactor: primary.scaleFactor,
      },
    };
  },
};

export const computerTools = [
  computerGetSystemInfoTool,
  computerLaunchAppTool,
  computerCaptureScreenshotTool,
  computerKeyboardInputTool,
  computerMouseInputTool,
  computerGetDisplayInfoTool,
];
