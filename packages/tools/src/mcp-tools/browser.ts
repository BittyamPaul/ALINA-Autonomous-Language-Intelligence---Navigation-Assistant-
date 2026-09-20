import { z } from 'zod';
import { McpToolDefinition, McpToolContext } from '@alina/mcp';
import { PlaywrightBrowserManager } from '../browser/browser-manager';
import {
  BrowserSessionInfoSchema,
  BrowserNavigationResultSchema,
  BrowserInspectionResultSchema,
  BrowserContentResultSchema,
  BrowserScreenshotResultSchema,
  BrowserSessionInfo,
  BrowserNavigationResult,
  BrowserInspectionResult,
  BrowserContentResult,
  BrowserScreenshotResult,
} from '@alina/shared';

const browserManager = PlaywrightBrowserManager.getInstance();

// =========================================================================
// 1. browser_launch [SAFE]
// =========================================================================
export const BrowserLaunchInputSchema = z.object({
  headless: z.boolean().optional().default(true).describe('Run in headless mode'),
  width: z.number().int().positive().optional().default(1280),
  height: z.number().int().positive().optional().default(800),
});
export type BrowserLaunchInput = z.infer<typeof BrowserLaunchInputSchema>;

export const browserLaunchTool: McpToolDefinition<BrowserLaunchInput, BrowserSessionInfo> = {
  name: 'browser_launch',
  group: 'browser',
  description: 'Launches or acquires the ALINA browser session with specified viewport.',
  inputSchema: BrowserLaunchInputSchema,
  outputSchema: BrowserSessionInfoSchema,
  permission: 'SAFE',
  timeoutMs: 30000,
  auditMetadata: {
    category: 'browser',
    description: 'Launch or attach to browser automation session',
    isReadOnly: false,
    tags: ['browser', 'launch', 'session'],
  },
  execute: async (input: BrowserLaunchInput, context: McpToolContext): Promise<BrowserSessionInfo> => {
    const session = await browserManager.launch({
      headless: input.headless,
      viewport: { width: input.width || 1280, height: input.height || 800 },
    });

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_launch',
        riskLevel: 'READ_ONLY',
        parameters: input as Record<string, unknown>,
        outcome: 'success',
        details: `Browser session initialized (${session.id})`,
      });
    }

    return session;
  },
};

// =========================================================================
// 2. browser_navigate [SAFE]
// =========================================================================
export const BrowserNavigateInputSchema = z.object({
  url: z.string().min(1).describe('Target URL to navigate to (http/https)'),
  timeoutMs: z.number().int().min(1000).max(60000).optional().default(20000),
});
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;

export const browserNavigateTool: McpToolDefinition<BrowserNavigateInput, BrowserNavigationResult> = {
  name: 'browser_navigate',
  group: 'browser',
  description: 'Navigates active browser page to target URL safely.',
  inputSchema: BrowserNavigateInputSchema,
  outputSchema: BrowserNavigationResultSchema,
  permission: 'SAFE',
  timeoutMs: 25000,
  auditMetadata: {
    category: 'browser',
    description: 'Navigate browser to external URL',
    isReadOnly: true,
    tags: ['browser', 'navigate', 'web'],
  },
  execute: async (input: BrowserNavigateInput, context: McpToolContext): Promise<BrowserNavigationResult> => {
    const result = await browserManager.navigate(input.url, input.timeoutMs);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_navigate',
        riskLevel: 'READ_ONLY',
        parameters: { url: input.url },
        outcome: 'success',
        details: `Navigated to "${result.url}" (${result.status})`,
      });
    }

    return result;
  },
};

// =========================================================================
// 3. browser_search [SAFE]
// =========================================================================
export const BrowserSearchInputSchema = z.object({
  query: z.string().min(1).describe('Search query text'),
  engineUrl: z.string().optional().describe('Custom search engine URL template'),
});
export type BrowserSearchInput = z.infer<typeof BrowserSearchInputSchema>;

export const BrowserSearchOutputSchema = z.object({
  query: z.string(),
  resultsCount: z.number(),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional(),
  })),
  pageTitle: z.string(),
  pageUrl: z.string(),
});
export type BrowserSearchOutput = z.infer<typeof BrowserSearchOutputSchema>;

export const browserSearchTool: McpToolDefinition<BrowserSearchInput, BrowserSearchOutput> = {
  name: 'browser_search',
  group: 'browser',
  description: 'Searches the web via search engine and extracts candidate links.',
  inputSchema: BrowserSearchInputSchema,
  outputSchema: BrowserSearchOutputSchema,
  permission: 'SAFE',
  timeoutMs: 25000,
  auditMetadata: {
    category: 'browser',
    description: 'Search web via browser search engine',
    isReadOnly: true,
    tags: ['browser', 'search', 'web'],
  },
  execute: async (input: BrowserSearchInput, context: McpToolContext): Promise<BrowserSearchOutput> => {
    const res = await browserManager.search(input.query, input.engineUrl);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_search',
        riskLevel: 'READ_ONLY',
        parameters: { query: input.query },
        outcome: 'success',
        details: `Found ${res.resultsCount} search results for "${input.query}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 4. browser_inspect [SAFE]
// =========================================================================
export const BrowserInspectInputSchema = z.object({}).default({});
export type BrowserInspectInput = z.infer<typeof BrowserInspectInputSchema>;

export const browserInspectTool: McpToolDefinition<BrowserInspectInput, BrowserInspectionResult> = {
  name: 'browser_inspect',
  group: 'browser',
  description: 'Inspects DOM structure, headings, and interactive elements on active page.',
  inputSchema: BrowserInspectInputSchema,
  outputSchema: BrowserInspectionResultSchema,
  permission: 'SAFE',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'browser',
    description: 'Inspect active page DOM and interactive elements',
    isReadOnly: true,
    tags: ['browser', 'inspect', 'dom'],
  },
  execute: async (_input: BrowserInspectInput, context: McpToolContext): Promise<BrowserInspectionResult> => {
    const res = await browserManager.inspectPage();

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_inspect',
        riskLevel: 'READ_ONLY',
        outcome: 'success',
        details: `Inspected page "${res.title}" (${res.totalInteractiveCount} interactive items)`,
      });
    }

    return res;
  },
};

// =========================================================================
// 5. browser_click [SAFE / APPROVAL]
// =========================================================================
export const BrowserClickInputSchema = z.object({
  selector: z.string().min(1).describe('CSS selector, ID, or visible text of element to click'),
  timeoutMs: z.number().int().min(1000).max(30000).optional().default(10000),
});
export type BrowserClickInput = z.infer<typeof BrowserClickInputSchema>;

export const BrowserClickOutputSchema = z.object({
  clicked: z.boolean(),
  target: z.string(),
  newUrl: z.string(),
});
export type BrowserClickOutput = z.infer<typeof BrowserClickOutputSchema>;

export const browserClickTool: McpToolDefinition<BrowserClickInput, BrowserClickOutput> = {
  name: 'browser_click',
  group: 'browser',
  description: 'Clicks an interactive element on the active page.',
  inputSchema: BrowserClickInputSchema,
  outputSchema: BrowserClickOutputSchema,
  permission: 'SAFE',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'browser',
    description: 'Click interactive element in browser',
    isReadOnly: false,
    tags: ['browser', 'click', 'interaction'],
  },
  execute: async (input: BrowserClickInput, context: McpToolContext): Promise<BrowserClickOutput> => {
    const res = await browserManager.click(input.selector, input.timeoutMs);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_click',
        riskLevel: 'READ_ONLY',
        parameters: { selector: input.selector },
        outcome: 'success',
        details: `Clicked "${input.selector}", landed at "${res.newUrl}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 6. browser_type [REQUIRES_APPROVAL]
// =========================================================================
export const BrowserTypeInputSchema = z.object({
  selector: z.string().min(1).describe('Input selector to type into'),
  text: z.string().describe('Text to enter into the field'),
});
export type BrowserTypeInput = z.infer<typeof BrowserTypeInputSchema>;

export const BrowserTypeOutputSchema = z.object({
  typed: z.boolean(),
  selector: z.string(),
  length: z.number(),
});
export type BrowserTypeOutput = z.infer<typeof BrowserTypeOutputSchema>;

export const browserTypeTool: McpToolDefinition<BrowserTypeInput, BrowserTypeOutput> = {
  name: 'browser_type',
  group: 'browser',
  description: 'Enters text into an input field. Requires approval for form mutations.',
  inputSchema: BrowserTypeInputSchema,
  outputSchema: BrowserTypeOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'browser',
    description: 'Type text into browser form field (mutating)',
    isReadOnly: false,
    tags: ['browser', 'type', 'form'],
  },
  execute: async (input: BrowserTypeInput, context: McpToolContext): Promise<BrowserTypeOutput> => {
    const res = await browserManager.typeText(input.selector, input.text);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_type',
        riskLevel: 'MEDIUM',
        parameters: { selector: input.selector, textLength: input.text.length },
        outcome: 'success',
        details: `Typed ${res.length} chars into "${input.selector}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 7. browser_select [REQUIRES_APPROVAL]
// =========================================================================
export const BrowserSelectInputSchema = z.object({
  selector: z.string().min(1).describe('Select element selector'),
  value: z.string().min(1).describe('Option value to select'),
});
export type BrowserSelectInput = z.infer<typeof BrowserSelectInputSchema>;

export const BrowserSelectOutputSchema = z.object({
  selected: z.boolean(),
  selector: z.string(),
  value: z.string(),
});
export type BrowserSelectOutput = z.infer<typeof BrowserSelectOutputSchema>;

export const browserSelectTool: McpToolDefinition<BrowserSelectInput, BrowserSelectOutput> = {
  name: 'browser_select',
  group: 'browser',
  description: 'Selects an option from a dropdown on the active page. Requires operator approval.',
  inputSchema: BrowserSelectInputSchema,
  outputSchema: BrowserSelectOutputSchema,
  permission: 'REQUIRES_APPROVAL',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'browser',
    description: 'Select option in browser dropdown',
    isReadOnly: false,
    tags: ['browser', 'select', 'form'],
  },
  execute: async (input: BrowserSelectInput, context: McpToolContext): Promise<BrowserSelectOutput> => {
    const res = await browserManager.selectOption(input.selector, input.value);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_select',
        riskLevel: 'MEDIUM',
        parameters: { selector: input.selector, value: input.value },
        outcome: 'success',
        details: `Selected value "${input.value}" in "${input.selector}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 8. browser_read_content [SAFE]
// =========================================================================
export const BrowserReadContentInputSchema = z.object({
  maxWords: z.number().int().min(50).max(10000).optional().default(3000),
});
export type BrowserReadContentInput = z.infer<typeof BrowserReadContentInputSchema>;

export const browserReadContentTool: McpToolDefinition<BrowserReadContentInput, BrowserContentResult> = {
  name: 'browser_read_content',
  group: 'browser',
  description: 'Extracts readable, visible text content, headings, and source links from active page.',
  inputSchema: BrowserReadContentInputSchema,
  outputSchema: BrowserContentResultSchema,
  permission: 'SAFE',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'browser',
    description: 'Read visible webpage content safely (read-only)',
    isReadOnly: true,
    tags: ['browser', 'read', 'content', 'scrape'],
  },
  execute: async (input: BrowserReadContentInput, context: McpToolContext): Promise<BrowserContentResult> => {
    const res = await browserManager.readVisibleContent(input.maxWords);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_read_content',
        riskLevel: 'READ_ONLY',
        outcome: 'success',
        details: `Read ${res.wordCount} words from "${res.title}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 9. browser_manage_tabs [SAFE]
// =========================================================================
export const BrowserManageTabsInputSchema = z.object({
  action: z.enum(['list', 'new', 'switch', 'close']).describe('Tab action to perform'),
  targetId: z.string().optional().describe('Tab ID to switch to or close'),
  url: z.string().optional().describe('Initial URL if opening a new tab'),
});
export type BrowserManageTabsInput = z.infer<typeof BrowserManageTabsInputSchema>;

export const BrowserManageTabsOutputSchema = z.object({
  action: z.string(),
  activeTabId: z.string(),
  tabs: z.array(z.object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
  })),
});
export type BrowserManageTabsOutput = z.infer<typeof BrowserManageTabsOutputSchema>;

export const browserManageTabsTool: McpToolDefinition<BrowserManageTabsInput, BrowserManageTabsOutput> = {
  name: 'browser_manage_tabs',
  group: 'browser',
  description: 'Manages browser tabs (list, open new, switch active, close).',
  inputSchema: BrowserManageTabsInputSchema,
  outputSchema: BrowserManageTabsOutputSchema,
  permission: 'SAFE',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'browser',
    description: 'Manage browser tabs',
    isReadOnly: false,
    tags: ['browser', 'tabs'],
  },
  execute: async (input: BrowserManageTabsInput, context: McpToolContext): Promise<BrowserManageTabsOutput> => {
    const res = await browserManager.manageTabs(input.action, input.targetId, input.url);

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_manage_tabs',
        riskLevel: 'READ_ONLY',
        parameters: { action: input.action },
        outcome: 'success',
        details: `Tab action: ${input.action} (active: ${res.activeTabId}, count: ${res.tabs.length})`,
      });
    }

    return res;
  },
};

// =========================================================================
// 10. browser_screenshot [SAFE]
// =========================================================================
export const BrowserScreenshotInputSchema = z.object({
  destinationPath: z.string().optional().describe('File path to save screenshot PNG to'),
  fullPage: z.boolean().optional().default(false).describe('Capture full page or viewport only'),
  format: z.enum(['png', 'jpeg']).optional().default('png'),
});
export type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInputSchema>;

export const browserScreenshotTool: McpToolDefinition<BrowserScreenshotInput, BrowserScreenshotResult> = {
  name: 'browser_screenshot',
  group: 'browser',
  description: 'Captures visual screenshot of the active webpage and writes to file.',
  inputSchema: BrowserScreenshotInputSchema,
  outputSchema: BrowserScreenshotResultSchema,
  permission: 'SAFE',
  timeoutMs: 15000,
  auditMetadata: {
    category: 'browser',
    description: 'Capture visual webpage screenshot',
    isReadOnly: false,
    tags: ['browser', 'screenshot', 'visual'],
  },
  execute: async (input: BrowserScreenshotInput, context: McpToolContext): Promise<BrowserScreenshotResult> => {
    const res = await browserManager.captureScreenshot({
      destinationPath: input.destinationPath,
      fullPage: input.fullPage,
      format: input.format,
    });

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_screenshot',
        riskLevel: 'READ_ONLY',
        parameters: { destinationPath: res.filePath },
        outcome: 'success',
        details: `Captured screenshot (${res.width}x${res.height}, ${res.byteSize} bytes) -> "${res.filePath}"`,
      });
    }

    return res;
  },
};

// =========================================================================
// 11. browser_close [SAFE]
// =========================================================================
export const BrowserCloseInputSchema = z.object({}).default({});
export type BrowserCloseInput = z.infer<typeof BrowserCloseInputSchema>;

export const BrowserCloseOutputSchema = z.object({
  closed: z.boolean(),
  status: z.string(),
});
export type BrowserCloseOutput = z.infer<typeof BrowserCloseOutputSchema>;

export const browserCloseTool: McpToolDefinition<BrowserCloseInput, BrowserCloseOutput> = {
  name: 'browser_close',
  group: 'browser',
  description: 'Closes active browser session cleanly.',
  inputSchema: BrowserCloseInputSchema,
  outputSchema: BrowserCloseOutputSchema,
  permission: 'SAFE',
  timeoutMs: 10000,
  auditMetadata: {
    category: 'browser',
    description: 'Close browser automation session',
    isReadOnly: false,
    tags: ['browser', 'close'],
  },
  execute: async (_input: BrowserCloseInput, context: McpToolContext): Promise<BrowserCloseOutput> => {
    await browserManager.close();

    if (context.auditLogger) {
      context.auditLogger.log({
        actionType: 'tool_execution',
        toolName: 'browser_close',
        riskLevel: 'READ_ONLY',
        outcome: 'success',
        details: 'Closed browser session',
      });
    }

    return {
      closed: true,
      status: 'closed',
    };
  },
};

// =========================================================================
// 12. browser_get_status [SAFE]
// =========================================================================
export const BrowserGetStatusInputSchema = z.object({}).default({});
export type BrowserGetStatusInput = z.infer<typeof BrowserGetStatusInputSchema>;

export const BrowserGetStatusOutputSchema = z.object({
  isAvailable: z.boolean(),
  isRunning: z.boolean(),
  driver: z.string(),
  activeSessionsCount: z.number(),
  supportedEngines: z.array(z.string()),
  status: z.string(),
});
export type BrowserGetStatusOutput = z.infer<typeof BrowserGetStatusOutputSchema>;

export const browserGetStatusTool: McpToolDefinition<BrowserGetStatusInput, BrowserGetStatusOutput> = {
  name: 'browser_get_status',
  group: 'browser',
  description: 'Checks the availability and status of ALINA browser navigation services.',
  inputSchema: BrowserGetStatusInputSchema,
  outputSchema: BrowserGetStatusOutputSchema,
  permission: 'SAFE',
  timeoutMs: 5000,
  auditMetadata: {
    category: 'browser',
    description: 'Query browser engine status (read-only)',
    isReadOnly: true,
    tags: ['browser', 'status', 'playwright'],
  },
  execute: async (_input: BrowserGetStatusInput, _context: McpToolContext): Promise<BrowserGetStatusOutput> => {
    const isRunning = browserManager.isRunning();
    const state = browserManager.getState();
    return {
      isAvailable: true,
      isRunning,
      driver: 'playwright',
      activeSessionsCount: isRunning ? 1 : 0,
      supportedEngines: ['chromium', 'chrome', 'msedge'],
      status: state,
    };
  },
};

export const browserTools = [
  browserLaunchTool,
  browserNavigateTool,
  browserSearchTool,
  browserInspectTool,
  browserClickTool,
  browserTypeTool,
  browserSelectTool,
  browserReadContentTool,
  browserManageTabsTool,
  browserScreenshotTool,
  browserCloseTool,
  browserGetStatusTool,
];
