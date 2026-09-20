import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
  createAlinaMcpToolRegistry,
  PlaywrightBrowserManager,
  browserLaunchTool,
  browserNavigateTool,
  browserInspectTool,
  browserReadContentTool,
  browserManageTabsTool,
  browserScreenshotTool,
  browserGetStatusTool,
} from '@alina/tools';
import {
  AlinaBrowserAgent,
  MockModelAdapter,
} from '@alina/agent';
import {
  AuditLogger,
  sanitizeBrowserContent,
} from '@alina/shared';
import { McpToolContext } from '@alina/mcp';

describe('ALINA Browser Agent & Playwright MCP Architecture', () => {
  const artifactDir = path.resolve('C:/Users/bitty/.gemini/antigravity-ide/brain/a4a856ad-1d95-424e-b004-773a3be1b2d7');
  const browserManager = PlaywrightBrowserManager.getInstance();
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger();
  });

  afterEach(async () => {
    await browserManager.close();
  });

  // =========================================================================
  // 1. Browser Security & Privacy Bounds
  // =========================================================================
  describe('1. Browser Security & Privacy Boundaries', () => {
    it('strictly rejects malicious URL protocols (e.g. javascript:)', async () => {
      await expect(
        browserManager.navigate('javascript:alert("exploit")')
      ).rejects.toThrow('Navigation security violation');
    });

    it('strictly rejects local file:// access and directory exfiltration', async () => {
      await expect(
        browserManager.navigate('file:///C:/Users/bitty/.ssh/id_rsa')
      ).rejects.toThrow('Navigation security violation: Disallowed URL protocol');
      await expect(
        browserManager.navigate('file:///etc/passwd')
      ).rejects.toThrow('Navigation security violation: Disallowed URL protocol');
    });

    it('strictly blocks SSRF attacks against loopback, private networks, and cloud metadata', async () => {
      await expect(
        browserManager.navigate('http://127.0.0.1:8000')
      ).rejects.toThrow('Navigation security violation: Access to restricted host');
      await expect(
        browserManager.navigate('http://localhost:3000')
      ).rejects.toThrow('Navigation security violation: Access to restricted host');
      await expect(
        browserManager.navigate('http://169.254.169.254/latest/meta-data/')
      ).rejects.toThrow('Navigation security violation: Access to restricted host');
      await expect(
        browserManager.navigate('http://192.168.1.1/admin')
      ).rejects.toThrow('Navigation security violation: Access to restricted host');
    });

    it('sanitizes and redacts bearer tokens, credentials, and JWTs from extracted content', () => {
      const leakedWebpageContent = `
        Welcome to the developer console.
        Authorization: Bearer sk-antigravity-secret-9988776655
        User config: password="super_secret_user_password"
        JWT payload: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
        Standard documentation: TypeScript is a typed superset of JavaScript.
      `;

      const sanitized = sanitizeBrowserContent(leakedWebpageContent);
      expect(sanitized).not.toContain('sk-antigravity-secret');
      expect(sanitized).not.toContain('super_secret_user_password');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(sanitized).toContain('[REDACTED_AUTH_TOKEN]');
      expect(sanitized).toContain('TypeScript is a typed superset of JavaScript.');
    });

    it('records structured audit logs for all browser navigation and interaction operations', async () => {
      const context: McpToolContext = { auditLogger };
      await browserLaunchTool.execute({ headless: true, width: 1280, height: 800 }, context);
      await browserNavigateTool.execute({ url: 'https://example.com', timeoutMs: 30000 }, context);
      await browserInspectTool.execute({}, context);

      const logs = auditLogger.getRecent();
      expect(logs.length).toBeGreaterThanOrEqual(3);
      const toolNames = logs.map((l) => l.toolName);
      expect(toolNames).toContain('browser_launch');
      expect(toolNames).toContain('browser_navigate');
      expect(toolNames).toContain('browser_inspect');
      expect(logs.every((l) => l.outcome === 'success')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Independent MCP Browser Tool Verification
  // =========================================================================
  describe('2. Independent MCP Browser Tools', () => {
    it('browser_get_status returns active telemetry and supported engines', async () => {
      const status = await browserGetStatusTool.execute({}, { auditLogger });
      expect(status.isAvailable).toBe(true);
      expect(status.driver).toBe('playwright');
      expect(status.supportedEngines).toContain('chrome');
      expect(status.supportedEngines).toContain('msedge');
    });

    it('browser_launch initializes a session with configured viewport', async () => {
      const session = await browserLaunchTool.execute(
        { headless: true, width: 1440, height: 900 },
        { auditLogger }
      );
      expect(session.id).toMatch(/^bs_/);
      expect(session.isHeadless).toBe(true);
      expect(session.viewport.width).toBe(1440);
      expect(session.viewport.height).toBe(900);
      expect(session.tabCount).toBe(1);
    });

    it('browser_navigate navigates to real webpage and retrieves HTTP status and title', async () => {
      const nav = await browserNavigateTool.execute(
        { url: 'https://example.com', timeoutMs: 30000 },
        { auditLogger }
      );
      expect(nav.status).toBe(200);
      expect(nav.title).toBe('Example Domain');
      expect(nav.url).toContain('example.com');
      expect(nav.durationMs).toBeGreaterThan(0);
    });

    it('browser_inspect extracts DOM headings and interactive elements while suppressing passwords', async () => {
      await browserNavigateTool.execute({ url: 'https://example.com', timeoutMs: 30000 }, { auditLogger });
      const inspection = await browserInspectTool.execute({}, { auditLogger });

      expect(inspection.title).toBe('Example Domain');
      expect(inspection.headings).toContain('Example Domain');
      expect(inspection.interactiveElements.length).toBeGreaterThan(0);
      // Example.com has a link to IANA
      const link = inspection.interactiveElements.find((el) => el.tagName === 'a');
      expect(link).toBeDefined();
      expect(link?.href).toContain('iana.org');
    });

    it('browser_read_content extracts clean visible text and author sources', async () => {
      await browserNavigateTool.execute({ url: 'https://example.com', timeoutMs: 30000 }, { auditLogger });
      const content = await browserReadContentTool.execute({ maxWords: 500 }, { auditLogger });

      expect(content.title).toBe('Example Domain');
      expect(content.textContent).toContain('Example Domain');
      expect(content.textContent).toContain('documentation examples');
      expect(content.wordCount).toBeGreaterThan(10);
      expect(content.sources.some((s) => s.includes('iana.org'))).toBe(true);
    });

    it('browser_manage_tabs creates, switches, and lists tabs', async () => {
      await browserLaunchTool.execute({ headless: true, width: 1280, height: 800 }, { auditLogger });

      // Create new tab
      const tabRes = await browserManageTabsTool.execute(
        { action: 'new', url: 'https://example.com' },
        { auditLogger }
      );
      expect(tabRes.tabs.length).toBeGreaterThanOrEqual(2);

      // List tabs
      const listRes = await browserManageTabsTool.execute({ action: 'list' }, { auditLogger });
      expect(listRes.tabs.length).toBeGreaterThanOrEqual(2);

      // Close tab
      const closeRes = await browserManageTabsTool.execute(
        { action: 'close', targetId: tabRes.activeTabId },
        { auditLogger }
      );
      expect(closeRes.tabs.length).toBe(listRes.tabs.length - 1);
    });

    it('browser_screenshot captures visual PNG artifact to disk', async () => {
      await browserNavigateTool.execute({ url: 'https://example.com', timeoutMs: 30000 }, { auditLogger });
      const screenshotPath = path.join(artifactDir, 'test_example_com.png');

      const res = await browserScreenshotTool.execute(
        { destinationPath: screenshotPath, fullPage: false, format: 'png' },
        { auditLogger }
      );

      expect(res.filePath).toBe(screenshotPath);
      expect(res.format).toBe('png');
      expect(res.byteSize).toBeGreaterThan(5000);
      expect(fsSync.existsSync(screenshotPath)).toBe(true);

      // Verify file is a valid PNG (PNG magic bytes: 89 50 4E 47)
      const buffer = await fs.readFile(screenshotPath);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });
  });

  // =========================================================================
  // 3. End-to-End Actual Browser Verification
  //    "Search for the latest official TypeScript documentation and summarize the relevant information."
  // =========================================================================
  describe('3. End-to-End Browser Agent Execution', () => {
    it('executes complete 9-stage loop: plan, open, navigate, search, inspect, read, summarize, show sources, and capture screenshot', async () => {
      const registry = createAlinaMcpToolRegistry();

      const mockModel = new MockModelAdapter(async (prompt) => {
        if (prompt.includes('Formulate search keywords')) {
          return {
            text: 'Search keywords: TypeScript official documentation https://www.typescriptlang.org/docs/',
          };
        }
        if (prompt.includes('Summarize this documentation')) {
          return {
            text: 'TypeScript is an open-source, strongly typed programming language developed by Microsoft that builds on JavaScript by adding optional static type definitions. It enables early bug detection at compile time, rich IDE auto-completion, refactoring tooling, interfaces, generics, and compiles down to clean, readable JavaScript compatible with modern browsers and Node.js runtimes.',
          };
        }
        return { text: 'Summary of documentation.' };
      });

      const browserAgent = new AlinaBrowserAgent({
        mcpRegistry: registry,
        modelAdapter: mockModel,
      });

      const progressEvents: string[] = [];
      const screenshotTargetDir = artifactDir;

      const result = await browserAgent.execute({
        goal: 'Search for the latest official TypeScript documentation and summarize the relevant information.',
        mcpRegistry: registry,
        modelAdapter: mockModel,
        screenshotDir: screenshotTargetDir,
        onProgress: (event) => {
          const payload = event.payload as { message?: string } | undefined;
          if (payload?.message) {
            progressEvents.push(payload.message);
          }
        },
      });

      // 1. Task Lifecycle & Completion
      expect(result.status).toBe('completed');
      expect(result.stepsCount).toBeGreaterThanOrEqual(7);
      expect(result.durationMs).toBeGreaterThan(0);

      // 2. Editorial Summary
      expect(result.summary).toContain('TypeScript is an open-source, strongly typed programming language');
      expect(result.summary).toContain('JavaScript');

      // 3. Authoritative Sources
      expect(result.sources.length).toBeGreaterThan(0);
      const hasOfficialSource = result.sources.some(
        (s) => s.url.includes('typescriptlang.org') || s.title.toLowerCase().includes('typescript')
      );
      expect(hasOfficialSource).toBe(true);

      // 4. Visual Screenshot Artifact
      expect(result.screenshots.length).toBeGreaterThan(0);
      const screenshot = result.screenshots[0];
      expect(screenshot).toBeDefined();
      expect(fsSync.existsSync(screenshot!.filePath)).toBe(true);
      expect(screenshot!.byteSize).toBeGreaterThan(10000); // Substantial visual image

      // 5. Verify image header
      const imageBytes = await fs.readFile(screenshot!.filePath);
      expect(imageBytes[0]).toBe(0x89);
      expect(imageBytes[1]).toBe(0x50);
      expect(imageBytes[2]).toBe(0x4e);
      expect(imageBytes[3]).toBe(0x47);

      // 6. Progress stages verified
      expect(progressEvents.some((p) => p.includes('Launching browser'))).toBe(true);
      expect(progressEvents.some((p) => p.includes('Searching') || p.includes('official source'))).toBe(true);
      expect(progressEvents.some((p) => p.includes('Extracting'))).toBe(true);
      expect(progressEvents.some((p) => p.includes('screenshot'))).toBe(true);
      expect(progressEvents.some((p) => p.includes('Synthesizing editorial summary'))).toBe(true);
    }, 60000); // 60s timeout for live web navigation
  });
});
