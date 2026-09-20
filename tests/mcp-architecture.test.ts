import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  AlinaMcpToolRegistry,
  AlinaMcpServer,
  AlinaMcpClient,
  InMemoryTransport,
  McpToolDefinition,
} from '@alina/mcp';
import {
  createAlinaMcpToolRegistry,
  listFilesTool,
  searchFilesTool,
  readTextFileTool,
  getFileMetadataTool,
  getSystemInfoTool,
  listProcessesTool,
  browserGetStatusTool,
  computerGetDisplayInfoTool,
} from '@alina/tools';
import {
  AlinaSupervisorAgent,
  MockModelAdapter,
  TaskService,
  AgentRunService,
} from '@alina/agent';
import {
  PathJail,
  AuditLogger,
  z,
} from '@alina/shared';
import { AlinaDatabaseClient } from '@alina/database';

describe('ALINA Model Context Protocol (MCP) Architecture', () => {
  const workspaceRoot = path.resolve(__dirname, '..');
  let jail: PathJail;
  let auditLogger: AuditLogger;
  let registry: AlinaMcpToolRegistry;

  beforeEach(() => {
    jail = new PathJail({ allowedRoots: [workspaceRoot] });
    auditLogger = new AuditLogger();
    registry = createAlinaMcpToolRegistry();
  });

  // =========================================================================
  // 1. Central Tool Registry & Permissions Architecture
  // =========================================================================
  describe('1. Central Tool Registry & Permissions Architecture', () => {
    it('populates registry with all canonical safe tools across all groups', () => {
      const tools = registry.list();
      expect(tools.length).toBeGreaterThanOrEqual(8);

      const names = tools.map((t) => t.name);
      expect(names).toContain('list_files');
      expect(names).toContain('search_files');
      expect(names).toContain('read_text_file');
      expect(names).toContain('get_file_metadata');
      expect(names).toContain('get_system_info');
      expect(names).toContain('list_processes');
      expect(names).toContain('browser_get_status');
      expect(names).toContain('computer_get_display_info');

      // Check group segmentation
      expect(registry.listByGroup('filesystem').length).toBeGreaterThanOrEqual(4);
      expect(registry.listByGroup('system').length).toBe(2);
      expect(registry.listByGroup('browser').length).toBeGreaterThanOrEqual(1);
      expect(registry.listByGroup('computer').length).toBeGreaterThanOrEqual(1);
    });

    it('strictly prevents duplicate tool registrations', () => {
      expect(() => {
        registry.register(listFilesTool);
      }).toThrow(/already registered/i);
    });

    it('validates tool permission classification and metadata on registration', () => {
      for (const tool of registry.list()) {
        expect(['SAFE', 'REQUIRES_APPROVAL', 'HIGH_RISK']).toContain(tool.permission);
        expect(tool.description).toBeTruthy();
        expect(tool.auditMetadata).toBeDefined();
        expect(tool.timeoutMs).toBeGreaterThan(0);
      }
    });

    it('blocks tools requiring approval when approval is not granted', async () => {
      const approvalTool: McpToolDefinition = {
        name: 'test_modify_config',
        group: 'system',
        description: 'Test mutating tool',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ success: z.boolean() }),
        permission: 'REQUIRES_APPROVAL',
        timeoutMs: 5000,
        auditMetadata: {
          category: 'system',
          description: 'Mutating test',
          isReadOnly: false,
        },
        execute: async () => ({ success: true }),
      };

      const customRegistry = new AlinaMcpToolRegistry();
      customRegistry.register(approvalTool);

      const result = await customRegistry.execute('test_modify_config', { value: 'test' }, {
        auditLogger,
        isApprovalGranted: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires explicit user approval');
      expect(auditLogger.getRecent().some((l) => l.actionType === 'sandbox_violation')).toBe(true);
    });

    it('enforces execution timeout on long-running tools', async () => {
      const slowTool: McpToolDefinition = {
        name: 'test_slow_operation',
        group: 'system',
        description: 'Slow hanging tool',
        inputSchema: z.object({}),
        outputSchema: z.object({ done: z.boolean() }),
        permission: 'SAFE',
        timeoutMs: 50, // 50ms timeout
        auditMetadata: {
          category: 'system',
          description: 'Hanging test',
          isReadOnly: true,
        },
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { done: true };
        },
      };

      const customRegistry = new AlinaMcpToolRegistry();
      customRegistry.register(slowTool);

      const result = await customRegistry.execute('test_slow_operation', {}, { auditLogger });
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('handles invalid input schema parameters gracefully with structured error', async () => {
      const result = await registry.execute('read_text_file', { invalidKey: 123 }, { jail, auditLogger });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });
  });

  // =========================================================================
  // 2. Independent Tool Verification
  // =========================================================================
  describe('2. Independent Tool Verification', () => {
    it('executes list_files safely within workspace and supports metadata', async () => {
      const context = { jail, auditLogger };
      const output = await listFilesTool.execute({ path: '.', recursive: false, maxDepth: 1, maxItems: 50 }, context);

      expect(output.totalCount).toBeGreaterThan(0);
      expect(output.items.length).toBeLessThanOrEqual(50);
      expect(output.items.some((i) => i.name === 'package.json')).toBe(true);

      const pkg = output.items.find((i) => i.name === 'package.json');
      expect(pkg?.isDirectory).toBe(false);
      expect(pkg?.sizeBytes).toBeGreaterThan(0);
      expect(pkg?.modifiedAt).toBeDefined();
    });

    it('strictly rejects list_files path traversal outside PathJail', async () => {
      const context = { jail, auditLogger };
      await expect(
        listFilesTool.execute({ path: '../../../..', recursive: false, maxDepth: 1, maxItems: 50 }, context)
      ).rejects.toThrow(/outside.*workspace/i);
    });

    it('executes search_files with glob patterns', async () => {
      const context = { jail, auditLogger };
      const output = await searchFilesTool.execute({ path: '.', pattern: '*.json', maxResults: 10 }, context);

      expect(output.totalMatches).toBeGreaterThan(0);
      expect(output.matches.some((m) => m.name === 'package.json')).toBe(true);
    });

    it('executes read_text_file and handles size bounds', async () => {
      const context = { jail, auditLogger };
      const output = await readTextFileTool.execute({ path: 'package.json', maxBytes: 1024, encoding: 'utf-8' }, context);

      expect(output.sizeBytes).toBeGreaterThan(0);
      expect(output.content).toContain('alina-monorepo');
      expect(typeof output.truncated).toBe('boolean');
    });

    it('executes get_file_metadata and returns complete structural details', async () => {
      const context = { jail, auditLogger };
      const output = await getFileMetadataTool.execute({ path: 'package.json' }, context);

      expect(output.name).toBe('package.json');
      expect(output.isFile).toBe(true);
      expect(output.isDirectory).toBe(false);
      expect(output.sizeBytes).toBeGreaterThan(0);
      expect(output.extension).toBe('.json');
      expect(output.createdAt).toBeDefined();
      expect(output.modifiedAt).toBeDefined();
    });

    it('executes get_system_info and retrieves non-mutating system telemetry', async () => {
      const output = await getSystemInfoTool.execute({ includeMemory: true, includeCpu: true }, {});

      expect(output.platform).toBeDefined();
      expect(output.arch).toBeDefined();
      expect(output.cpuCount).toBeGreaterThan(0);
      expect(output.totalMemoryBytes).toBeGreaterThan(0);
      expect(output.nodeVersion).toBe(process.version);
    });

    it('executes list_processes safely without mutating operating system state', async () => {
      const output = await listProcessesTool.execute({ maxProcesses: 10 }, {});

      expect(output.totalCount).toBeGreaterThan(0);
      expect(output.processes.length).toBeLessThanOrEqual(10);
      expect(output.processes[0]?.pid).toBeDefined();
      expect(output.processes[0]?.name).toBeDefined();
    });

    it('executes browser and computer safe query tools', async () => {
      const browserRes = await browserGetStatusTool.execute({}, {});
      expect(browserRes.isAvailable).toBe(true);
      expect(browserRes.driver).toBe('playwright');

      const computerRes = await computerGetDisplayInfoTool.execute({}, {});
      expect(computerRes.supported).toBe(true);
      expect(computerRes.primaryDisplay.width).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3. Official MCP Protocol: Client & Server Transports
  // =========================================================================
  describe('3. Official MCP Protocol: Client & Server Transports', () => {
    it('exposes registry tools via AlinaMcpServer and queries them via AlinaMcpClient', async () => {
      const server = new AlinaMcpServer(registry, {
        name: 'alina-test-mcp-server',
        version: '1.0.0',
        getContext: () => ({ jail, auditLogger }),
      });

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new AlinaMcpClient({ name: 'alina-test-client' });
      await client.connect(clientTransport);

      expect(client.isConnected()).toBe(true);

      // 1. Discover tools over MCP protocol
      const mcpTools = await client.listTools();
      expect(mcpTools.length).toBeGreaterThanOrEqual(8);

      const toolNames = mcpTools.map((t) => t.name);
      expect(toolNames).toContain('list_files');
      expect(toolNames).toContain('get_system_info');
      expect(toolNames).toContain('read_text_file');

      // 2. Call tool over MCP protocol: get_system_info
      const sysCall = await client.callTool('get_system_info', {});
      expect(sysCall.isError).toBe(false);
      const sysData = sysCall.parsed as { platform: string; cpuCount: number };
      expect(sysData.platform).toBeDefined();
      expect(sysData.cpuCount).toBeGreaterThan(0);

      // 3. Call tool over MCP protocol: list_files
      const fsCall = await client.callTool('list_files', { path: '.', maxItems: 5 });
      expect(fsCall.isError).toBe(false);
      const fsData = fsCall.parsed as { totalCount: number; items: any[] };
      expect(fsData.totalCount).toBeGreaterThan(0);
      expect(fsData.items.length).toBeLessThanOrEqual(5);

      await client.close();
      await server.close();
    });

    it('interactively elicits operator approval for REQUIRES_APPROVAL tools over MCP protocol', async () => {
      // Register a tool that requires approval
      const approvalTool: McpToolDefinition = {
        name: 'test_mutating_mcp_action',
        group: 'system',
        description: 'Action requiring explicit operator approval',
        inputSchema: z.object({ payload: z.string() }),
        outputSchema: z.object({ success: z.boolean(), echoed: z.string().optional() }),
        permission: 'REQUIRES_APPROVAL',
        timeoutMs: 5000,
        auditMetadata: {
          category: 'system',
          description: 'Approval action',
          isReadOnly: false,
        },
        execute: async (input) => ({ success: true, echoed: input.payload }),
      };

      const customRegistry = new AlinaMcpToolRegistry();
      customRegistry.register(approvalTool);

      let approvalPromptTriggered = false;
      const server = new AlinaMcpServer(customRegistry, {
        name: 'approval-mcp-server',
        version: '1.0.0',
        requestApproval: async (req) => {
          approvalPromptTriggered = true;
          expect(req.toolName).toBe('test_mutating_mcp_action');
          expect(req.permission).toBe('REQUIRES_APPROVAL');
          return { approved: true, grantToken: 'grant_mcp_test_token' };
        },
      });

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new AlinaMcpClient({ name: 'approval-test-client' });
      await client.connect(clientTransport);

      const result = await client.callTool('test_mutating_mcp_action', { payload: 'execute_safely' });
      expect(approvalPromptTriggered).toBe(true);
      expect(result.isError).toBe(false);

      await client.close();
      await server.close();
    });
  });

  // =========================================================================
  // 4. Decoupled Supervisor Agent Integration
  // =========================================================================
  describe('4. Decoupled Supervisor Agent Integration', () => {
    it('executes user goal by dynamically discovering and dispatching MCP list_files', async () => {
      const mockAdapter = new MockModelAdapter(async (prompt) => ({
        text: `Executing objective: ${prompt}`,
        toolCalls: [
          {
            toolName: 'list_files',
            parameters: { path: '.', maxItems: 10 },
          },
        ],
      }));

      const agent = new AlinaSupervisorAgent({
        mcpRegistry: registry,
        modelAdapter: mockAdapter,
      });

      const result = await agent.execute({
        goal: 'List repository files using MCP architecture',
        jailRoot: workspaceRoot,
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('Listed');
    });

    it('executes user goal by dynamically discovering and dispatching MCP get_system_info', async () => {
      const mockAdapter = new MockModelAdapter(async () => ({
        text: 'Checking system parameters',
        toolCalls: [
          {
            toolName: 'get_system_info',
            parameters: {},
          },
        ],
      }));

      const agent = new AlinaSupervisorAgent({
        mcpRegistry: registry,
        modelAdapter: mockAdapter,
      });

      const result = await agent.execute({
        goal: 'Check host system parameters and hardware',
        jailRoot: workspaceRoot,
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('System info');
    });

    it('persists MCP task execution state and agent run metrics in SurrealDB', async () => {
      const dbClient = new AlinaDatabaseClient();
      await dbClient.connect();

      const taskService = new TaskService(dbClient);
      const agentRunService = new AgentRunService(dbClient);

      const mockAdapter = new MockModelAdapter(async () => ({
        text: 'Searching config files',
        toolCalls: [
          {
            toolName: 'search_files',
            parameters: { pattern: '*.json' },
          },
        ],
      }));

      const agent = new AlinaSupervisorAgent({
        mcpRegistry: registry,
        modelAdapter: mockAdapter,
        taskService,
        agentRunService,
      });

      const taskId = `task_mcp_e2e_${Date.now()}`;
      const result = await agent.execute({
        taskId,
        goal: 'Search JSON configuration files across repository',
        workspaceId: 'ws_mcp_test',
        jailRoot: workspaceRoot,
      });

      expect(result.status).toBe('completed');
      expect(result.resultSummary).toContain('Found');

      // Verify task in SurrealDB
      const persisted = await taskService.getById(taskId);
      expect(persisted.task.id).toBe(taskId);
      expect(persisted.task.status).toBe('completed');
      expect(persisted.task.resultSummary).toContain('Found');

      // Verify agent run telemetry in SurrealDB
      const runs = await agentRunService.listForTask(taskId);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs[0]?.status).toBe('succeeded');
      expect(runs[0]?.stepCount).toBe(1);

      await dbClient.close();
    });
  });
});
