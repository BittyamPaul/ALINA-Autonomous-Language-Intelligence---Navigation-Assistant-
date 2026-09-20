import type { Browser, BrowserContext, Page } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import {
  BrowserTaskState,
  BrowserSessionInfo,
  BrowserNavigationResult,
  BrowserInspectionResult,
  BrowserContentResult,
  BrowserScreenshotResult,
  sanitizeBrowserContent,
} from '@alina/shared';

export interface TabEntry {
  id: string;
  page: Page;
  createdAt: string;
}

export interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
}

/**
 * Detects private, loopback, link-local, and cloud metadata network hosts to prevent SSRF.
 */
export function isRestrictedNetworkHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '0:0:0:0:0:0:0:1') {
    return true;
  }
  // Cloud metadata services (AWS / GCP / Azure: 169.254.169.254, metadata.google.internal)
  if (h === '169.254.169.254' || h === 'metadata.google.internal') {
    return true;
  }
  // Check IPv4 octets for private networks
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4Match) {
    const o1 = Number(ipv4Match[1]);
    const o2 = Number(ipv4Match[2]);
    // 127.0.0.0/8 loopback
    if (o1 === 127) return true;
    // 10.0.0.0/8 private
    if (o1 === 10) return true;
    // 172.16.0.0/12 private (172.16.0.0 - 172.31.255.255)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16 private
    if (o1 === 192 && o2 === 168) return true;
    // 169.254.0.0/16 link-local
    if (o1 === 169 && o2 === 254) return true;
    // 0.0.0.0/8
    if (o1 === 0) return true;
  }
  return false;
}

/**
 * PlaywrightBrowserManager
 * 
 * Manages the browser lifecycle, tabs, navigation, safe content extraction,
 * element inspection, interactions, visual captures, and strict privacy boundaries.
 */
export class PlaywrightBrowserManager {
  private static instance?: PlaywrightBrowserManager;
  private browser?: Browser;
  private context?: BrowserContext;
  private tabs: Map<string, TabEntry> = new Map();
  private activeTabId?: string;
  private currentState: BrowserTaskState = 'idle';
  private currentSessionId?: string;
  private viewport = { width: 1280, height: 800 };
  private isHeadless = true;

  private constructor() {}

  public static getInstance(): PlaywrightBrowserManager {
    if (!PlaywrightBrowserManager.instance) {
      PlaywrightBrowserManager.instance = new PlaywrightBrowserManager();
    }
    return PlaywrightBrowserManager.instance;
  }

  public getState(): BrowserTaskState {
    return this.currentState;
  }

  public isRunning(): boolean {
    return Boolean(this.browser && this.browser.isConnected());
  }

  /**
   * Launches the browser instance using auto-detected engine (Chromium, Chrome, or Edge).
   */
  public async launch(options: LaunchOptions = {}): Promise<BrowserSessionInfo> {
    if (this.isRunning() && this.context) {
      return this.getSessionInfo();
    }

    this.currentState = 'launching';
    this.isHeadless = options.headless ?? true;
    if (options.viewport) {
      this.viewport = options.viewport;
    }

    const moduleName = 'playwright';
    const pw = await import(/* webpackIgnore: true */ moduleName);
    const chromium = pw.chromium;
    const launchAttempts: Array<() => Promise<Browser>> = [
      () => chromium.launch({ headless: this.isHeadless }),
      () => chromium.launch({ channel: 'chrome', headless: this.isHeadless }),
      () => chromium.launch({ channel: 'msedge', headless: this.isHeadless }),
    ];

    let launchedBrowser: Browser | undefined;
    let lastError: unknown;

    for (const attempt of launchAttempts) {
      try {
        launchedBrowser = await attempt();
        if (launchedBrowser) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!launchedBrowser) {
      this.currentState = 'error';
      throw new Error(`Failed to launch browser engine: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }

    this.browser = launchedBrowser;
    this.currentSessionId = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.context = await this.browser.newContext({
      viewport: this.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ALINA/0.1.0',
    });

    // Create initial page
    const initialPage = await this.context.newPage();
    const tabId = 'tab_1';
    this.tabs.set(tabId, {
      id: tabId,
      page: initialPage,
      createdAt: new Date().toISOString(),
    });
    this.activeTabId = tabId;
    this.currentState = 'idle';

    return this.getSessionInfo();
  }

  /**
   * Retrieves active page. Launches browser automatically if not running.
   */
  public async getActivePage(): Promise<Page> {
    if (!this.isRunning() || !this.context) {
      await this.launch();
    }

    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
      const page = await this.context!.newPage();
      const tabId = `tab_${Date.now()}`;
      this.tabs.set(tabId, { id: tabId, page, createdAt: new Date().toISOString() });
      this.activeTabId = tabId;
    }

    return this.tabs.get(this.activeTabId!)!.page;
  }

  public async getSessionInfo(): Promise<BrowserSessionInfo> {
    const page = this.activeTabId ? this.tabs.get(this.activeTabId)?.page : undefined;
    const currentUrl = page ? page.url() : 'about:blank';
    let title = 'New Tab';
    try {
      if (page) title = await page.title();
    } catch {
      // Best-effort title fetch
    }

    return {
      id: this.currentSessionId ?? 'bs_uninitialized',
      title: title || 'New Tab',
      currentUrl: currentUrl || 'about:blank',
      tabCount: this.tabs.size,
      activeTabId: this.activeTabId ?? 'none',
      viewport: this.viewport,
      isHeadless: this.isHeadless,
      status: this.currentState,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Navigates to a target URL safely with protocol and SSRF protection.
   */
  public async navigate(
    targetUrl: string,
    timeoutMs: number = 20000,
    options?: { allowPrivateHosts?: boolean }
  ): Promise<BrowserNavigationResult> {
    // Protocol validation: disallow dangerous schemes including file://
    const lower = targetUrl.toLowerCase().trim();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('file:')
    ) {
      throw new Error('Navigation security violation: Disallowed URL protocol.');
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    // SSRF & loopback protection
    try {
      const parsed = new URL(targetUrl);
      if (!options?.allowPrivateHosts && isRestrictedNetworkHost(parsed.hostname)) {
        throw new Error(`Navigation security violation: Access to restricted host "${parsed.hostname}" is blocked.`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Navigation security violation')) {
        throw err;
      }
      throw new Error(`Invalid navigation URL "${targetUrl}": ${err instanceof Error ? err.message : String(err)}`);
    }

    this.currentState = 'navigating';
    const startTime = Date.now();
    const page = await this.getActivePage();

    try {
      const response = await page.goto(targetUrl, {
        timeout: timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      const title = await page.title();
      const finalUrl = page.url();
      const status = response ? response.status() : 200;
      const durationMs = Date.now() - startTime;

      this.currentState = 'idle';
      return {
        url: finalUrl,
        title,
        status,
        durationMs,
        loadedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.currentState = 'error';
      throw new Error(`Navigation to "${targetUrl}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Searches the web using DuckDuckGo HTML / search engines.
   */
  public async search(query: string, searchEngineUrl?: string): Promise<{
    query: string;
    resultsCount: number;
    results: Array<{ title: string; url: string; snippet?: string }>;
    pageTitle: string;
    pageUrl: string;
  }> {
    this.currentState = 'searching';
    const page = await this.getActivePage();

    const engine = searchEngineUrl || `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(engine, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const pageTitle = await page.title();
    const pageUrl = page.url();

    // Extract search result links
    const results = await page.evaluate(() => {
      const items: Array<{ title: string; url: string; snippet?: string }> = [];
      const links = document.querySelectorAll('a.result__url, a.result__title, .results_links a, a[href^="http"]');

      const seen = new Set<string>();
      for (const el of Array.from(links)) {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        const text = anchor.textContent?.trim() || '';

        if (
          href &&
          !href.includes('duckduckgo.com') &&
          !href.includes('google.com') &&
          !seen.has(href) &&
          text.length > 2
        ) {
          seen.add(href);
          const snippetEl = anchor.closest('.result')?.querySelector('.result__snippet');
          items.push({
            title: text,
            url: href,
            snippet: snippetEl?.textContent?.trim() || undefined,
          });
          if (items.length >= 10) break;
        }
      }
      return items;
    });

    this.currentState = 'idle';
    return {
      query,
      resultsCount: results.length,
      results,
      pageTitle,
      pageUrl,
    };
  }

  /**
   * Inspects the active page DOM for headings and interactive elements.
   * Suppresses password inputs and security tokens.
   */
  public async inspectPage(): Promise<BrowserInspectionResult> {
    this.currentState = 'extracting';
    const page = await this.getActivePage();

    const inspection = await page.evaluate(() => {
      const headings: string[] = [];
      document.querySelectorAll('h1, h2, h3').forEach((h) => {
        const text = h.textContent?.trim();
        if (text) headings.push(text);
      });

      const interactiveElements: Array<{
        selector: string;
        tagName: string;
        text: string;
        href?: string;
        role?: string;
        type?: string;
        isVisible: boolean;
        isInteractive: boolean;
      }> = [];

      // Query candidate interactive items
      const candidates = document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]');
      let count = 0;

      for (const el of Array.from(candidates)) {
        if (count >= 50) break;

        const inputType = (el as HTMLInputElement).type?.toLowerCase();
        const inputName = (el.getAttribute('name') || '').toLowerCase();

        // STRICT SECURITY RULE: Ignore password fields
        if (inputType === 'password' || inputName.includes('password') || inputName.includes('token')) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const text = (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').trim();

        let selector = el.tagName.toLowerCase();
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.trim().split(/\s+/)[0];
          if (firstClass) selector = `${selector}.${firstClass}`;
        }

        interactiveElements.push({
          selector,
          tagName: el.tagName.toLowerCase(),
          text: text.slice(0, 100),
          href: (el as HTMLAnchorElement).href || undefined,
          role: el.getAttribute('role') || undefined,
          type: inputType || undefined,
          isVisible,
          isInteractive: true,
        });
        count++;
      }

      return {
        title: document.title,
        url: window.location.href,
        headings: headings.slice(0, 20),
        interactiveElements,
        totalInteractiveCount: interactiveElements.length,
      };
    });

    this.currentState = 'idle';
    return inspection;
  }

  /**
   * Clicks an element by selector, aria-label, or text.
   */
  public async click(selectorOrText: string, timeoutMs: number = 10000): Promise<{ clicked: boolean; target: string; newUrl: string }> {
    this.currentState = 'interacting';
    const page = await this.getActivePage();

    try {
      if (selectorOrText.startsWith('#') || selectorOrText.startsWith('.') || selectorOrText.startsWith('//') || selectorOrText.includes('[')) {
        await page.click(selectorOrText, { timeout: timeoutMs });
      } else {
        // Click by visible text
        await page.getByText(selectorOrText, { exact: false }).first().click({ timeout: timeoutMs });
      }

      await page.waitForLoadState('domcontentloaded').catch(() => {});
      this.currentState = 'idle';

      return {
        clicked: true,
        target: selectorOrText,
        newUrl: page.url(),
      };
    } catch (err) {
      this.currentState = 'error';
      throw new Error(`Click action on "${selectorOrText}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Types or fills text into an input field.
   * Strictly refuses to interact with password fields.
   */
  public async typeText(selector: string, text: string): Promise<{ typed: boolean; selector: string; length: number }> {
    this.currentState = 'interacting';
    const page = await this.getActivePage();

    // Check if target is a password input
    const isPassword = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const type = (el as HTMLInputElement).type?.toLowerCase();
      const name = (el.getAttribute('name') || '').toLowerCase();
      return type === 'password' || name.includes('password');
    }, selector);

    if (isPassword) {
      this.currentState = 'error';
      throw new Error('Security violation: Automating credentials or password fields is strictly prohibited.');
    }

    await page.fill(selector, text);
    this.currentState = 'idle';

    return {
      typed: true,
      selector,
      length: text.length,
    };
  }

  /**
   * Selects an option from a <select> dropdown.
   */
  public async selectOption(selector: string, value: string): Promise<{ selected: boolean; selector: string; value: string }> {
    this.currentState = 'interacting';
    const page = await this.getActivePage();
    await page.selectOption(selector, value);
    this.currentState = 'idle';

    return {
      selected: true,
      selector,
      value,
    };
  }

  /**
   * Extracts clean, visible textual content from the page.
   * Strips scripts, styles, hidden tags, and sanitizes leaked credentials.
   */
  public async readVisibleContent(maxWords: number = 3000): Promise<BrowserContentResult> {
    this.currentState = 'extracting';
    const page = await this.getActivePage();

    const rawData = await page.evaluate(() => {
      const headings: string[] = [];
      document.querySelectorAll('h1, h2, h3').forEach((h) => {
        const text = h.textContent?.trim();
        if (text) headings.push(text);
      });

      const sources: string[] = [];
      document.querySelectorAll('a[href^="http"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (href && !sources.includes(href)) sources.push(href);
      });

      // Prefer article, main, or content containers
      const mainContainer = document.querySelector('article, main, [role="main"], #content, .content') || document.body;
      const clone = mainContainer.cloneNode(true) as HTMLElement;

      // Remove unwanted elements
      const unwanted = clone.querySelectorAll('script, style, noscript, svg, nav, footer, iframe, [aria-hidden="true"]');
      unwanted.forEach((el) => el.remove());

      const rawText = clone.innerText || clone.textContent || '';
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const cleanText = lines.join('\n');

      return {
        title: document.title,
        url: window.location.href,
        textContent: cleanText,
        headings: headings.slice(0, 15),
        sources: sources.slice(0, 20),
      };
    });

    const sanitizedText = sanitizeBrowserContent(rawData.textContent);
    const words = sanitizedText.split(/\s+/).filter(Boolean);
    const truncatedText = words.slice(0, maxWords).join(' ');

    this.currentState = 'idle';
    return {
      title: rawData.title,
      url: rawData.url,
      textContent: truncatedText,
      wordCount: words.length,
      headings: rawData.headings,
      sources: rawData.sources,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Manages browser tabs (list, new, switch, close).
   */
  public async manageTabs(action: 'list' | 'new' | 'switch' | 'close', targetId?: string, url?: string): Promise<{
    action: string;
    activeTabId: string;
    tabs: Array<{ id: string; url: string; title: string }>;
  }> {
    if (!this.isRunning() || !this.context) {
      await this.launch();
    }

    if (action === 'new') {
      const newPage = await this.context!.newPage();
      const tabId = `tab_${Date.now()}`;
      this.tabs.set(tabId, { id: tabId, page: newPage, createdAt: new Date().toISOString() });
      this.activeTabId = tabId;
      if (url) {
        await this.navigate(url);
      }
    } else if (action === 'switch') {
      if (!targetId || !this.tabs.has(targetId)) {
        throw new Error(`Tab ID "${targetId}" does not exist.`);
      }
      this.activeTabId = targetId;
      await this.tabs.get(targetId)!.page.bringToFront();
    } else if (action === 'close') {
      const toCloseId = targetId || this.activeTabId;
      if (toCloseId && this.tabs.has(toCloseId)) {
        const tab = this.tabs.get(toCloseId)!;
        await tab.page.close();
        this.tabs.delete(toCloseId);
        // Switch to next available tab or open a new one
        const next = Array.from(this.tabs.keys())[0];
        if (next) {
          this.activeTabId = next;
        } else {
          const newPage = await this.context!.newPage();
          const freshId = 'tab_1';
          this.tabs.set(freshId, { id: freshId, page: newPage, createdAt: new Date().toISOString() });
          this.activeTabId = freshId;
        }
      }
    }

    const tabList: Array<{ id: string; url: string; title: string }> = [];
    for (const [id, t] of this.tabs.entries()) {
      let title = 'Tab';
      try {
        title = await t.page.title();
      } catch {}
      tabList.push({ id, url: t.page.url(), title });
    }

    return {
      action,
      activeTabId: this.activeTabId!,
      tabs: tabList,
    };
  }

  /**
   * Captures a screenshot of the active page.
   */
  public async captureScreenshot(options: {
    destinationPath?: string;
    fullPage?: boolean;
    format?: 'png' | 'jpeg';
  } = {}): Promise<BrowserScreenshotResult> {
    this.currentState = 'capturing';
    const page = await this.getActivePage();

    const format = options.format || 'png';
    const filename = `screenshot_${Date.now()}.${format}`;
    const destination = options.destinationPath || path.resolve(process.cwd(), 'scratch', filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await page.screenshot({
      path: destination,
      fullPage: options.fullPage ?? false,
      type: format,
    });

    const stats = fsSync.statSync(destination);
    const viewportSize = page.viewportSize() || this.viewport;

    this.currentState = 'idle';
    return {
      filePath: destination,
      width: viewportSize.width,
      height: viewportSize.height,
      format,
      byteSize: stats.size,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Cleanly closes all browser pages, contexts, and browser process.
   */
  public async close(): Promise<void> {
    this.currentState = 'closed';
    this.tabs.clear();
    this.activeTabId = undefined;

    if (this.context) {
      try {
        await this.context.close();
      } catch {}
      this.context = undefined;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = undefined;
    }

    this.currentSessionId = undefined;
  }
}
