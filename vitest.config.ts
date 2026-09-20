import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@alina/shared': path.resolve(__dirname, './packages/shared/src'),
      '@alina/tools': path.resolve(__dirname, './packages/tools/src'),
      '@alina/agent': path.resolve(__dirname, './packages/agent/src'),
      '@alina/database': path.resolve(__dirname, './packages/database/src'),
      '@alina/mcp': path.resolve(__dirname, './packages/mcp/src'),
      '@alina/ui': path.resolve(__dirname, './packages/ui/src'),
      '@alina/config': path.resolve(__dirname, './packages/config'),
    },
  },
});
