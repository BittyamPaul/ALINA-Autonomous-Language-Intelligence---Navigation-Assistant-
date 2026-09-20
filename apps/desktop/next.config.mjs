import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTauriExport = process.env.TAURI_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isTauriExport
    ? { output: 'export', distDir: 'out' }
    : process.env.STANDALONE === 'true'
      ? { output: 'standalone' }
      : {}),
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    '@alina/shared',
    '@alina/ui',
    '@alina/tools',
    '@alina/agent',
    '@alina/database',
    '@alina/mcp',
  ],
  serverExternalPackages: ['playwright', 'playwright-core', 'chromium-bidi'],
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        playwright: 'commonjs playwright',
        'playwright-core': 'commonjs playwright-core',
      });
    }
    return config;
  },
};

export default nextConfig;
