import { z } from 'zod';

// =========================================================================
// 1. Browser Task States
// =========================================================================
export const BrowserTaskStateSchema = z.enum([
  'idle',
  'launching',
  'navigating',
  'searching',
  'interacting',
  'extracting',
  'capturing',
  'closed',
  'error',
]);
export type BrowserTaskState = z.infer<typeof BrowserTaskStateSchema>;

// =========================================================================
// 2. Viewport & Session Info
// =========================================================================
export const BrowserViewportSchema = z.object({
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(800),
});
export type BrowserViewport = z.infer<typeof BrowserViewportSchema>;

export const BrowserSessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  currentUrl: z.string(),
  tabCount: z.number().int().nonnegative(),
  activeTabId: z.string(),
  viewport: BrowserViewportSchema,
  isHeadless: z.boolean(),
  status: BrowserTaskStateSchema,
  createdAt: z.string().datetime(),
});
export type BrowserSessionInfo = z.infer<typeof BrowserSessionInfoSchema>;

// =========================================================================
// 3. Navigation & Element Inspection
// =========================================================================
export const BrowserNavigationResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  status: z.number().int(),
  durationMs: z.number().nonnegative(),
  loadedAt: z.string().datetime(),
});
export type BrowserNavigationResult = z.infer<typeof BrowserNavigationResultSchema>;

export const BrowserElementInfoSchema = z.object({
  selector: z.string(),
  tagName: z.string(),
  text: z.string(),
  href: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  isVisible: z.boolean(),
  isInteractive: z.boolean(),
});
export type BrowserElementInfo = z.infer<typeof BrowserElementInfoSchema>;

export const BrowserInspectionResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  headings: z.array(z.string()),
  interactiveElements: z.array(BrowserElementInfoSchema),
  totalInteractiveCount: z.number().int().nonnegative(),
});
export type BrowserInspectionResult = z.infer<typeof BrowserInspectionResultSchema>;

// =========================================================================
// 4. Content Reading & Extraction
// =========================================================================
export const BrowserContentResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  textContent: z.string(),
  wordCount: z.number().int().nonnegative(),
  headings: z.array(z.string()),
  sources: z.array(z.string()),
  extractedAt: z.string().datetime(),
});
export type BrowserContentResult = z.infer<typeof BrowserContentResultSchema>;

// =========================================================================
// 5. Visual Capture & Artifacts
// =========================================================================
export const BrowserScreenshotResultSchema = z.object({
  filePath: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.enum(['png', 'jpeg']),
  byteSize: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
});
export type BrowserScreenshotResult = z.infer<typeof BrowserScreenshotResultSchema>;

// =========================================================================
// 6. Security & Privacy Sanitization
// =========================================================================
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /(?:password|passwd|pwd|secret|auth_token|access_token|apikey|api_key)\s*[:=]\s*['"]?[^\s'"]+/gi,
  /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*/g, // JWT pattern
];

/**
 * Sanitizes browser content before passing to model context.
 * Strips leaked credentials, tokens, and authorization parameters.
 */
export function sanitizeBrowserContent(content: string): string {
  if (!content) return '';
  let sanitized = content;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_AUTH_TOKEN]');
  }
  return sanitized;
}
