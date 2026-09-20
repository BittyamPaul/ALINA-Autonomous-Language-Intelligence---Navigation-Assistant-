import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { PlaywrightBrowserManager } from '../packages/tools/src/browser/browser-manager';

async function runVisualUxAudit() {
  const artifactScreenshotsDir = path.resolve(
    'C:/Users/bitty/.gemini/antigravity-ide/brain/a4a856ad-1d95-424e-b004-773a3be1b2d7/screenshots'
  );
  await fs.mkdir(artifactScreenshotsDir, { recursive: true });

  console.log('[UX Audit] Initializing PlaywrightBrowserManager...');
  const manager = PlaywrightBrowserManager.getInstance();
  await manager.launch({
    headless: true,
    viewport: { width: 1280, height: 860 },
  });

  const page = await manager.getActivePage();
  console.log('[UX Audit] Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  async function setLightMode() {
    const btn = await page.$('button[aria-label="Switch to Warm Light mode"]');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(400);
    }
  }

  async function setDarkMode() {
    const btn = await page.$('button[aria-label="Switch to Charcoal Dark mode"]');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(400);
    }
  }

  async function take(name: string) {
    const dest = path.join(artifactScreenshotsDir, `${name}.png`);
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`[Screenshot Captured] ${name}.png`);
  }

  // 1. Home - Warm Light Mode
  console.log('[Screen 1] Capturing Home in Warm Light mode...');
  await setLightMode();
  await take('01_home_light_mode');

  // 2. Home - Charcoal Dark Mode
  console.log('[Screen 2] Capturing Home in Charcoal Dark mode...');
  await setDarkMode();
  await take('02_home_dark_mode');

  // 3. Active Tasks - Dark Mode
  console.log('[Screen 3] Navigating to Active Tasks (Dark Mode)...');
  await page.click('button[aria-label="Active Tasks"]');
  await page.waitForTimeout(400);
  await take('03_active_tasks_dark');

  // 4. Active Tasks - Light Mode
  console.log('[Screen 4] Active Tasks (Light Mode)...');
  await setLightMode();
  await take('04_active_tasks_light');

  // 5. Execution Stream - Light Mode
  console.log('[Screen 5] Navigating to Execution Stream (Light Mode)...');
  await page.click('button[aria-label="Execution Stream"]');
  await page.waitForTimeout(400);
  await take('05_execution_stream_light');

  // 6. Execution Stream - Dark Mode
  console.log('[Screen 6] Execution Stream (Dark Mode)...');
  await setDarkMode();
  await take('06_execution_stream_dark');

  // 7. Semantic Memory - Dark Mode
  console.log('[Screen 7] Navigating to Semantic Memory (Dark Mode)...');
  await page.click('button[aria-label="Semantic Memory"]');
  await page.waitForTimeout(500);
  await take('07_semantic_memory_dark');

  // 8. Semantic Memory - Light Mode
  console.log('[Screen 8] Semantic Memory (Light Mode)...');
  await setLightMode();
  await take('08_semantic_memory_light');

  // 9. Safety & PathJail - Light Mode
  console.log('[Screen 9] Navigating to Safety & PathJail (Light Mode)...');
  await page.click('button[aria-label="Safety & PathJail"]');
  await page.waitForTimeout(400);
  await take('09_safety_pathjail_light');

  // 10. Safety & PathJail - Dark Mode
  console.log('[Screen 10] Safety & PathJail (Dark Mode)...');
  await setDarkMode();
  await take('10_safety_pathjail_dark');

  // 11. Approval Safety Gate Dialog - Dark Mode
  console.log('[Screen 11] Testing Approval Dialog (Dark Mode)...');
  const testDialogBtn = await page.$('button:has-text("Test Safety Authorization Dialog")');
  if (testDialogBtn) {
    await testDialogBtn.click();
    await page.waitForTimeout(500);
    await take('11_approval_dialog_dark');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 12. Approval Safety Gate Dialog - Light Mode
  console.log('[Screen 12] Testing Approval Dialog (Light Mode)...');
  await setLightMode();
  if (testDialogBtn) {
    await testDialogBtn.click();
    await page.waitForTimeout(500);
    await take('12_approval_dialog_light');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 13. Command Palette - Light Mode
  console.log('[Screen 13] Testing Command Palette (Light Mode)...');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  await page.keyboard.type('TypeScript', { delay: 40 });
  await page.waitForTimeout(300);
  await take('13_command_palette_light');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 14. Command Palette - Dark Mode
  console.log('[Screen 14] Testing Command Palette (Dark Mode)...');
  await setDarkMode();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  await page.keyboard.type('security', { delay: 40 });
  await page.waitForTimeout(300);
  await take('14_command_palette_dark');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 15. Preferences Tab - Dark Mode
  console.log('[Screen 15] Preferences Tab (Dark Mode)...');
  await page.click('button[aria-label="Preferences"]');
  await page.waitForTimeout(400);
  await take('15_preferences_dark');

  // 16. Preferences Tab - Light Mode
  console.log('[Screen 16] Preferences Tab (Light Mode)...');
  await setLightMode();
  await take('16_preferences_light');

  console.log('[UX Audit] All 16 screenshots updated successfully!');
  await manager.close();
}

runVisualUxAudit().catch((err) => {
  console.error('[UX Audit Error]', err);
  process.exit(1);
});
