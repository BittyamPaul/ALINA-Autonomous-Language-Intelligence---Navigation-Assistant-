import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');
const apiDir = path.join(desktopRoot, 'src', 'app', 'api');
const stashDir = path.join(desktopRoot, '.api_stash');

console.log('[build-export] Preparing Next.js static export for Tauri desktop companion...');

let stashed = false;
function restoreApi() {
  if (stashed && fs.existsSync(stashDir)) {
    try {
      if (fs.existsSync(apiDir)) {
        fs.rmSync(apiDir, { recursive: true, force: true });
      }
      fs.renameSync(stashDir, apiDir);
      console.log('[build-export] Restored server API routes successfully.');
      stashed = false;
    } catch (err) {
      console.error('[build-export] Failed to restore API routes:', err);
    }
  }
}

process.on('SIGINT', () => { restoreApi(); process.exit(1); });
process.on('SIGTERM', () => { restoreApi(); process.exit(1); });
process.on('exit', () => { restoreApi(); });

try {
  if (fs.existsSync(apiDir)) {
    console.log('[build-export] Stashing server API routes during static export generation...');
    fs.renameSync(apiDir, stashDir);
    stashed = true;
  }

  const isWindows = process.platform === 'win32';
  const nextCmd = isWindows ? 'next.cmd' : 'next';

  const result = spawnSync(nextCmd, ['build'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      TAURI_EXPORT: 'true',
      NEXT_PUBLIC_APP_ENV: 'production',
    },
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`[build-export] Static export failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }

  console.log('[build-export] Static UI export successfully generated in out/');
} finally {
  restoreApi();
}
