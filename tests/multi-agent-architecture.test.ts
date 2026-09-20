import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  PathJail,
  DelegationRequest,
  StructuredTaskResult,
} from '../packages/shared/src';
import {
  AlinaDatabaseClient,
} from '../packages/database/src';
import {
  AlinaSupervisorAgent,
  AlinaFilesystemAgent,
  AlinaComputerAgent,
  AlinaResearchAgent,
  AlinaDocumentAgent,
  AlinaBrowserAgent,
  TaskDelegator,
  AgentRunService,
  TaskService,
  MockModelAdapter,
} from '../packages/agent/src';
import { AlinaMcpToolRegistry } from '../packages/mcp/src';

describe('ALINA Controlled Multi-Agent Architecture', () => {
  const testDir = path.resolve(process.cwd(), 'scratch', 'multi_agent_test');
  let dbClient: AlinaDatabaseClient;
  let runService: AgentRunService;
  let taskService: TaskService;
  let mcpRegistry: AlinaMcpToolRegistry;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });

    dbClient = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:8000/rpc',
      timeoutMs: 2000,
    });
    await dbClient.connect();

    runService = new AgentRunService(dbClient);
    taskService = new TaskService(dbClient);
    mcpRegistry = new AlinaMcpToolRegistry();
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Specialized Agent Responsibilities & Isolation
  // =========================================================================
  describe('1. Specialized Subagents & State Isolation', () => {
    it('FilesystemAgent performs jailed file operations and returns structured results', async () => {
      const fsAgent = new AlinaFilesystemAgent({ jailRoot: testDir });
      const testFilePath = 'notes/subagent_test.txt';
      const fileContent = 'Multi-agent architecture test content.';

      // Write operation
      const writeRequest: DelegationRequest = {
        delegationId: 'del_fs_1',
        taskId: 'task_fs_test',
        targetAgent: 'filesystem',
        goal: `Save notes to ${testFilePath}`,
        context: {
          operation: 'write',
          filePath: testFilePath,
          content: fileContent,
          jailRoot: testDir,
        },
      };

      const writeResult = await fsAgent.execute(writeRequest);
      expect(writeResult.status).toBe('succeeded');
      expect(writeResult.targetAgent).toBe('filesystem');
      expect(writeResult.artifactsProduced.length).toBe(1);
      expect(writeResult.artifactsProduced[0]?.name).toBe('subagent_test.txt');

      // Read operation
      const readRequest: DelegationRequest = {
        delegationId: 'del_fs_2',
        taskId: 'task_fs_test',
        targetAgent: 'filesystem',
        goal: `Read file ${testFilePath}`,
        context: {
          operation: 'read',
          filePath: testFilePath,
          jailRoot: testDir,
        },
      };

      const readResult = await fsAgent.execute(readRequest);
      expect(readResult.status).toBe('succeeded');
      const data = readResult.data as { content: string; sizeBytes: number };
      expect(data.content).toBe(fileContent);
    });

    it('FilesystemAgent enforces PathJail boundary and rejects traversal', async () => {
      const fsAgent = new AlinaFilesystemAgent({ jailRoot: testDir });
      const request: DelegationRequest = {
        delegationId: 'del_fs_jail',
        taskId: 'task_jail_test',
        targetAgent: 'filesystem',
        goal: 'Read /etc/passwd outside the jail',
        context: {
          operation: 'read',
          filePath: '../../../../../../../../../../etc/passwd',
          jailRoot: testDir,
        },
      };

      const result = await fsAgent.execute(request);
      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('permission_denied');
    });

    it('ComputerAgent executes system diagnostics and process inspection', async () => {
      const compAgent = new AlinaComputerAgent();
      const request: DelegationRequest = {
        delegationId: 'del_comp_1',
        taskId: 'task_comp_test',
        targetAgent: 'computer',
        goal: 'Inspect system memory and platform',
        context: { command: 'get_system_info' },
      };

      const result = await compAgent.execute(request);
      expect(result.status).toBe('succeeded');
      expect(result.targetAgent).toBe('computer');
      const data = result.data as { platform: string; totalMemoryMB: number };
      expect(data.platform).toBeDefined();
      expect(data.totalMemoryMB).toBeGreaterThan(0);
    });

    it('ResearchAgent formulates insights, extracts key findings, and cites sources', async () => {
      const researchAgent = new AlinaResearchAgent();
      const request: DelegationRequest = {
        delegationId: 'del_res_1',
        taskId: 'task_res_test',
        targetAgent: 'research',
        goal: 'Research the latest React changes',
        context: { topic: 'React 19 Core Architectural Changes & Features' },
      };

      const result = await researchAgent.execute(request);
      expect(result.status).toBe('succeeded');
      expect(result.targetAgent).toBe('research');
      const data = result.data as {
        topic: string;
        executiveSummary: string;
        keyFindings: string[];
        sources: Array<{ title: string; url: string }>;
      };
      expect(data.keyFindings.length).toBeGreaterThanOrEqual(4);
      expect(data.sources.some((s) => s.url.includes('react.dev'))).toBe(true);
      expect(data.keyFindings.some((k) => k.includes('Actions') || k.includes('ref'))).toBe(true);
    });

    it('DocumentAgent authors publication-grade Markdown report with executive sections', async () => {
      const docAgent = new AlinaDocumentAgent();
      const request: DelegationRequest = {
        delegationId: 'del_doc_1',
        taskId: 'task_doc_test',
        targetAgent: 'document',
        goal: 'Author concise report on React 19',
        context: {
          title: 'React 19 Intelligence Report',
          format: 'markdown',
          researchBrief: {
            topic: 'React 19 Changes',
            executiveSummary: 'React 19 introduces native Actions and Server Components.',
            keyFindings: ['Actions: async transitions', 'ref as prop: forwardRef deprecated'],
            sources: [{ title: 'React Blog', url: 'https://react.dev/blog' }],
            confidence: 0.98,
            recommendedNextAction: 'Publish document',
          },
        },
      };

      const result = await docAgent.execute(request);
      expect(result.status).toBe('succeeded');
      expect(result.targetAgent).toBe('document');
      const data = result.data as { content: string; wordCount: number; headings: string[] };
      expect(data.content).toContain('# React 19 Intelligence Report');
      expect(data.content).toContain('## 1. Executive Summary');
      expect(data.content).toContain('## 2. Key Technical Enhancements');
      expect(data.content).toContain('## 4. Verified Authoritative Sources');
      expect(data.wordCount).toBeGreaterThan(30);
    });

    it('BrowserAgent implements BaseSpecializedAgent interface and returns structured results', async () => {
      const browserAgent = new AlinaBrowserAgent({ mcpRegistry });
      const request: DelegationRequest = {
        delegationId: 'del_browser_1',
        taskId: 'task_browser_test',
        targetAgent: 'browser',
        goal: 'Search TypeScript documentation',
        context: {},
      };

      const result = await browserAgent.execute(request);
      expect(result.targetAgent).toBe('browser');
      expect(result.status).toBe('succeeded');
      expect(result.summary).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Controlled Delegation Discipline (Selective Delegation)
  // =========================================================================
  describe('2. Selective Delegation Discipline', () => {
    it('delegates only when multi-disciplinary specialization provides real benefit', () => {
      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
      });

      // Composite multi-disciplinary task -> MUST delegate
      const compositeGoal = 'Research the latest React changes and save a concise report to my Desktop.';
      const decision1 = supervisor.shouldDelegate(compositeGoal);
      expect(decision1.delegate).toBe(true);
      expect(decision1.pipeline).toContain('research');
      expect(decision1.pipeline).toContain('document');
      expect(decision1.pipeline).toContain('filesystem');

      // Atomic single-tool task -> MUST NOT delegate (executed directly by supervisor)
      const atomicGoal1 = 'What is the system info?';
      const decision2 = supervisor.shouldDelegate(atomicGoal1);
      expect(decision2.delegate).toBe(false);

      const atomicGoal2 = 'Read README.md';
      const decision3 = supervisor.shouldDelegate(atomicGoal2);
      expect(decision3.delegate).toBe(false);
    });
  });

  // =========================================================================
  // 3. SurrealDB Persistence of Delegated Agent Runs & Graph Edges
  // =========================================================================
  describe('3. SurrealDB Multi-Agent Persistence & Graph Relationships', () => {
    it('persists child agent runs and links parent-child delegated_to graph edge', async () => {
      const parentRun = await runService.startRun('task_graph_test', 'supervisor_agent');
      expect(parentRun.id).toMatch(/^run_/);

      // Create a test delegator with registered agent
      const testDelegator = new TaskDelegator({ agentRunService: runService });
      testDelegator.register(new AlinaResearchAgent());

      const request: DelegationRequest = {
        delegationId: 'del_graph_1',
        taskId: 'task_graph_test',
        parentRunId: parentRun.id,
        targetAgent: 'research',
        goal: 'Research compiler optimizations',
        context: { topic: 'Compiler Optimizations' },
      };

      const result = await testDelegator.delegate(request);
      expect(result.status).toBe('succeeded');

      // Verify runs associated with task
      const runs = await runService.listForTask('task_graph_test');
      expect(runs.length).toBeGreaterThanOrEqual(2);

      const childRun = runs.find((r) => r.parentRunId === parentRun.id);
      expect(childRun).toBeDefined();
      expect(childRun?.agentId).toBe('research_agent');
      expect(childRun?.status).toBe('succeeded');
    });
  });

  // =========================================================================
  // 4. End-to-End Multi-Agent Pipeline Execution & Final Verification
  // =========================================================================
  describe('4. End-to-End Multi-Agent Pipeline & Verification', () => {
    it('executes full pipeline: Research -> Browser -> Document -> Filesystem, and verifies deliverable', async () => {
      const desktopDir = path.join(testDir, 'Desktop');
      await fs.mkdir(desktopDir, { recursive: true });

      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
        mcpRegistry,
        modelAdapter: new MockModelAdapter(),
      });

      const goal = 'Research the latest React changes and save a concise report to my Desktop.';
      const result = await supervisor.execute({
        goal,
        jailRoot: testDir,
        forceDelegate: true,
      });

      expect(result.status).toBe('completed');
      expect(result.delegated).toBe(true);
      expect(result.subagentResults?.length).toBe(4);

      // Verify the sequence of agents executed
      const agentsExecuted = result.subagentResults?.map((r) => r.targetAgent);
      expect(agentsExecuted).toEqual(['research', 'browser', 'document', 'filesystem']);

      // Verify report was written to Desktop path
      const reportPath = path.join(desktopDir, 'react_changes_report.md');
      const fileExists = await fs.stat(reportPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(reportPath, 'utf8');
      expect(content).toContain('# React 19');
      expect(content).toContain('Executive Summary');
      expect(content).toContain('Actions');
      expect(content).toContain('react.dev');

      // Verify supervisor result summary
      expect(result.resultSummary).toContain('Multi-agent pipeline completed successfully');
    });

    it('Supervisor verification catches and rejects empty deliverables', async () => {
      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
      });

      const emptyFilePath = path.join(testDir, 'empty_report.md');
      await fs.writeFile(emptyFilePath, '', 'utf8');

      const mockResults: StructuredTaskResult[] = [
        {
          delegationId: 'd1',
          targetAgent: 'filesystem',
          status: 'succeeded',
          summary: 'Created file',
          data: { path: emptyFilePath, sizeBytes: 0 },
          artifactsProduced: [],
          stepsExecuted: 1,
          durationMs: 10,
        },
      ];

      const check = await supervisor.verifyFinalResult(
        't1',
        'Save report',
        mockResults,
        new PathJail({ allowedRoots: [testDir] })
      );

      expect(check.verified).toBe(false);
      expect(check.error).toBe('EMPTY_DELIVERABLE');
    });
  });

  // =========================================================================
  // 5. Failure Recovery Engine (Retry, Re-plan, Report Failure)
  // =========================================================================
  describe('5. Failure Recovery Engine', () => {
    it('evaluates transient timeout error and formulates retry decision', () => {
      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
      });

      const failedResult: StructuredTaskResult = {
        delegationId: 'del_timeout',
        targetAgent: 'browser',
        status: 'failed',
        summary: 'Browser timed out',
        error: 'Timeout after 60000ms',
        failureReason: 'timeout',
        artifactsProduced: [],
        stepsExecuted: 0,
        durationMs: 60000,
      };

      const decision = supervisor.evaluateRecovery(failedResult, 1);
      expect(decision.action).toBe('retry');
      expect(decision.retryParameters?.timeoutMs).toBe(90000);
    });

    it('evaluates persistent failure after max retries and triggers re-plan', () => {
      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
      });

      const failedResult: StructuredTaskResult = {
        delegationId: 'del_retry_exhausted',
        targetAgent: 'browser',
        status: 'failed',
        summary: 'Repeated network failure',
        error: 'Network unreachable',
        failureReason: 'tool_error',
        artifactsProduced: [],
        stepsExecuted: 0,
        durationMs: 2000,
      };

      const decision = supervisor.evaluateRecovery(failedResult, 2);
      expect(decision.action).toBe('replan');
      expect(decision.alternatePlan).toBe('fallback_synthesis');
    });

    it('evaluates security permission denied and halts with fail action immediately', () => {
      const supervisor = new AlinaSupervisorAgent({
        taskService,
        agentRunService: runService,
      });

      const deniedResult: StructuredTaskResult = {
        delegationId: 'del_denied',
        targetAgent: 'filesystem',
        status: 'failed',
        summary: 'Permission denied by PathJail',
        error: 'Security Sandbox Error: Escape detected',
        failureReason: 'permission_denied',
        artifactsProduced: [],
        stepsExecuted: 0,
        durationMs: 5,
      };

      const decision = supervisor.evaluateRecovery(deniedResult, 1);
      expect(decision.action).toBe('fail');
      expect(decision.reason).toContain('denied');
    });
  });
});
