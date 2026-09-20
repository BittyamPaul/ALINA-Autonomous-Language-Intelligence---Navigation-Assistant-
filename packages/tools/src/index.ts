import { ToolRegistry } from './registry';
import {
  FsReadFileTool,
  FsWriteFileTool,
  FsListDirTool,
  FsDeleteFileTool,
  FsSearchGlobTool,
} from './fs-tools';
import { OsGetSystemInfoTool, OsRunCommandTool } from './os-tools';

export * from './registry';
export * from './fs-tools';
export * from './os-tools';
export * from './mcp-tools';
export * from './tauri/tauri-bridge';
export * from './browser/browser-manager';
export * from '@alina/mcp';
export type { RiskLevel } from '@alina/shared';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Filesystem tools
  registry.register(FsReadFileTool);
  registry.register(FsWriteFileTool);
  registry.register(FsListDirTool);
  registry.register(FsDeleteFileTool);
  registry.register(FsSearchGlobTool);

  // OS & system tools
  registry.register(OsGetSystemInfoTool);
  registry.register(OsRunCommandTool);

  return registry;
}
