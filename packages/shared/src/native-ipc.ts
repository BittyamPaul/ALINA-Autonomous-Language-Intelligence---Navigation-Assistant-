import { z } from 'zod';

// =========================================================================
// 1. Permission Tier & Audit Schemas
// =========================================================================
export const NativePermissionTierSchema = z.enum(['Safe', 'RequiresApproval', 'HighRiskBlocked']);
export type NativePermissionTier = z.infer<typeof NativePermissionTierSchema>;

export const NativeAuditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  command: z.string(),
  permission_tier: NativePermissionTierSchema,
  outcome: z.string(),
  details: z.string(),
});
export type NativeAuditEvent = z.infer<typeof NativeAuditEventSchema>;

export const NativeCommandErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type NativeCommandError = z.infer<typeof NativeCommandErrorSchema>;

// =========================================================================
// 2. Application Launching Schemas
// =========================================================================
export const NativeAppLaunchInputSchema = z.object({
  appName: z.string().min(1).describe('Approved application binary name (e.g. "calc", "notepad", "code")'),
  args: z.array(z.string()).optional().default([]).describe('Whitelisted command line arguments'),
});
export type NativeAppLaunchInput = z.infer<typeof NativeAppLaunchInputSchema>;

export const NativeAppLaunchResultSchema = z.object({
  pid: z.number().int().nonnegative(),
  appName: z.string(),
  launchedAt: z.string(),
  auditEvent: NativeAuditEventSchema,
});
export type NativeAppLaunchResult = z.infer<typeof NativeAppLaunchResultSchema>;

// =========================================================================
// 3. System Information & Displays Schemas
// =========================================================================
export const NativeDisplayInfoSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scaleFactor: z.number().positive(),
  isPrimary: z.boolean(),
});
export type NativeDisplayInfo = z.infer<typeof NativeDisplayInfoSchema>;

export const NativeSystemInfoSchema = z.object({
  os: z.string(),
  arch: z.string(),
  hostname: z.string(),
  cpuCount: z.number().int().positive(),
  memoryTotalMb: z.number().positive(),
  displays: z.array(NativeDisplayInfoSchema),
  permissionTier: NativePermissionTierSchema,
});
export type NativeSystemInfo = z.infer<typeof NativeSystemInfoSchema>;

// =========================================================================
// 4. Native Screenshot Schemas
// =========================================================================
export const NativeScreenshotInputSchema = z.object({
  displayIndex: z.number().int().nonnegative().optional().default(0),
  savePath: z.string().optional(),
});
export type NativeScreenshotInput = z.infer<typeof NativeScreenshotInputSchema>;

export const NativeScreenshotResultSchema = z.object({
  filePath: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.string(),
  byteSize: z.number().int().nonnegative(),
  auditEvent: NativeAuditEventSchema,
});
export type NativeScreenshotResult = z.infer<typeof NativeScreenshotResultSchema>;

// =========================================================================
// 5. Controlled Keyboard & Mouse Interaction Schemas
// =========================================================================
export const NativeKeyboardInputSchema = z.object({
  text: z.string().optional().describe('Text to type safely'),
  keyCombination: z.string().optional().describe('Key combination (e.g. "Ctrl+S", "Alt+Tab")'),
});
export type NativeKeyboardInput = z.infer<typeof NativeKeyboardInputSchema>;

export const NativeMouseInputSchema = z.object({
  action: z.enum(['move', 'click', 'double_click', 'scroll']),
  x: z.number().int().min(0).max(4096),
  y: z.number().int().min(0).max(4096),
  button: z.enum(['left', 'right', 'middle']).optional().default('left'),
});
export type NativeMouseInput = z.infer<typeof NativeMouseInputSchema>;

export const NativeInputResultSchema = z.object({
  success: z.boolean(),
  actionType: z.string(),
  details: z.string(),
  auditEvent: NativeAuditEventSchema,
});
export type NativeInputResult = z.infer<typeof NativeInputResultSchema>;
