import { AlinaMcpToolRegistry } from '@alina/mcp';
import { filesystemTools } from './filesystem';
import { systemTools } from './system';
import { browserTools } from './browser';
import { computerTools } from './computer';

export * from './filesystem';
export * from './system';
export * from './browser';
export * from './computer';

/**
 * Creates and initializes ALINA's central MCP Tool Registry with all registered safe & approval-gated tools.
 */
export function createAlinaMcpToolRegistry(): AlinaMcpToolRegistry {
  const registry = new AlinaMcpToolRegistry();

  // 1. Filesystem Group (SAFE & APPROVAL)
  for (const tool of filesystemTools) {
    registry.register(tool);
  }

  // 2. System Group (SAFE)
  for (const tool of systemTools) {
    registry.register(tool);
  }

  // 3. Browser Group (Extensible SAFE & APPROVAL)
  for (const tool of browserTools) {
    registry.register(tool);
  }

  // 4. Computer & Native Desktop Group (SAFE & APPROVAL)
  for (const tool of computerTools) {
    registry.register(tool);
  }

  return registry;
}
