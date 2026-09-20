import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
  createAlinaMcpToolRegistry,
  listDirectoryTool,
  recursiveSearchTool,
  getFileMetadataTool,
  readTextFileTool,
} from '@alina/tools';
import {
  AlinaSupervisorAgent,
  MockModelAdapter,
} from '@alina/agent';
import {
  PathJail,
  AuditLogger,
} from '@alina/shared';
import { McpToolContext } from '@alina/mcp';

describe('ALINA Filesystem Capabilities & Security Sandbox', () => {
  const testRoot = path.resolve(__dirname, '..', 'scratch', 'fs-test-' + Date.now());
  let jail: PathJail;
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    await fs.mkdir(testRoot, { recursive: true });
    jail = new PathJail({
      allowedRoots: [testRoot],
      maxReadSizeBytes: 64 * 1024, // 64 KB for test
      maxWriteSizeBytes: 128 * 1024, // 128 KB for test
    });
    auditLogger = new AuditLogger();
  });

  afterEach(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  // =========================================================================
  // 1. Filesystem Boundaries & Security Sandboxing
  // =========================================================================
  describe('1. Filesystem Boundaries & Sandboxing', () => {
    it('strictly rejects path traversal escaping allowed roots', () => {
      const escapeAttempts = [
        path.join(testRoot, '..', '..', 'etc', 'passwd'),
        path.join(testRoot, '..', '..', 'Windows', 'System32'),
        '../../package.json',
        '../../../sensitive.key',
      ];

      for (const attempt of escapeAttempts) {
        const check = jail.isPathAllowed(attempt);
        expect(check.allowed).toBe(false);
        expect(check.reason).toBeDefined();
      }
    });

    it('strictly rejects null-byte injection attacks', () => {
      const nullByteAttempt = path.join(testRoot, 'normal.txt\0.exe');
      const check = jail.isPathAllowed(nullByteAttempt);
      expect(check.allowed).toBe(false);
      expect(check.reason?.toLowerCase()).toContain('null bytes');
    });

    it('strictly denies sensitive system files and hidden configuration files', () => {
      const sensitiveFiles = [
        path.join(testRoot, '.env'),
        path.join(testRoot, '.env.production'),
        path.join(testRoot, 'id_rsa'),
        path.join(testRoot, 'secrets.key'),
      ];

      for (const file of sensitiveFiles) {
        const check = jail.isPathAllowed(file);
        expect(check.allowed).toBe(false);
        expect(check.reason).toContain('sensitive system path');
      }
    });

    it('enforces maximum read and write file size limits', () => {
      const validRead = jail.validateFileSize(32 * 1024, 'read');
      expect(validRead.allowed).toBe(true);

      const oversizedRead = jail.validateFileSize(100 * 1024, 'read');
      expect(oversizedRead.allowed).toBe(false);
      expect(oversizedRead.reason).toContain('exceeds maximum permitted');

      const validWrite = jail.validateFileSize(64 * 1024, 'write');
      expect(validWrite.allowed).toBe(true);

      const oversizedWrite = jail.validateFileSize(200 * 1024, 'write');
      expect(oversizedWrite.allowed).toBe(false);
      expect(oversizedWrite.reason).toContain('exceeds maximum permitted');
    });

    it('prevents symlink traversal pointing outside the jail', async () => {
      const outsideDir = path.resolve(__dirname, '..', 'scratch', 'outside-' + Date.now());
      await fs.mkdir(outsideDir, { recursive: true });
      const outsideFile = path.join(outsideDir, 'secret.txt');
      await fs.writeFile(outsideFile, 'secret data', 'utf-8');

      const symlinkPath = path.join(testRoot, 'symlink_to_outside');
      try {
        fsSync.symlinkSync(outsideFile, symlinkPath);

        const check = jail.isPathAllowed(symlinkPath);
        expect(check.allowed).toBe(false);
        expect(check.reason).toContain('outside allowed workspace roots');
      } catch (err: any) {
        // In some Windows environments without dev privileges, symlink creation may require admin
        // If symlink creation fails due to OS privilege, skip gracefully
        if (err.code !== 'EPERM') {
          throw err;
        }
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  // =========================================================================
  // 2. Safe Filesystem Operations (Independent Tool Tests)
  // =========================================================================
  describe('2. Safe Filesystem Operations (list, search, metadata, read)', () => {
    beforeEach(async () => {
      // Create test structure
      await fs.mkdir(path.join(testRoot, 'docs', 'subdir'), { recursive: true });
      await fs.writeFile(path.join(testRoot, 'file1.txt'), 'Hello Alina 1', 'utf-8');
      await fs.writeFile(path.join(testRoot, 'docs', 'guide.md'), '# Guide Content', 'utf-8');
      await fs.writeFile(path.join(testRoot, 'docs', 'subdir', 'notes.txt'), 'Deep Notes', 'utf-8');
    });

    it('list_directory safely lists directory entries with metadata', async () => {
      const context: McpToolContext = { jail, auditLogger };
      const res = await listDirectoryTool.execute(
        { path: testRoot, recursive: false, maxDepth: 1, maxItems: 100 },
        context
      );

      expect(res.targetDirectory).toBe(testRoot);
      expect(res.totalCount).toBeGreaterThanOrEqual(2);
      const names = res.items.map((i) => i.name);
      expect(names).toContain('file1.txt');
      expect(names).toContain('docs');

      const fileItem = res.items.find((i) => i.name === 'file1.txt');
      expect(fileItem?.isDirectory).toBe(false);
      expect(fileItem?.sizeBytes).toBeGreaterThan(0);
      expect(fileItem?.modifiedAt).toBeDefined();
    });

    it('recursive_search accurately matches files and orders newest first', async () => {
      const context: McpToolContext = { jail, auditLogger };
      const res = await recursiveSearchTool.execute(
        { path: testRoot, pattern: '**/*.txt', maxResults: 100 },
        context
      );

      expect(res.totalMatches).toBe(2);
      const matchedNames = res.matches.map((m) => m.name);
      expect(matchedNames).toContain('file1.txt');
      expect(matchedNames).toContain('notes.txt');

      // Verify descending timestamp order
      for (let i = 0; i < res.matches.length - 1; i++) {
        const t1 = new Date(res.matches[i]!.modifiedAt).getTime();
        const t2 = new Date(res.matches[i + 1]!.modifiedAt).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }
    });

    it('get_file_metadata returns complete structural inspection', async () => {
      const context: McpToolContext = { jail, auditLogger };
      const filePath = path.join(testRoot, 'file1.txt');
      const meta = await getFileMetadataTool.execute({ path: filePath }, context);

      expect(meta.name).toBe('file1.txt');
      expect(meta.isFile).toBe(true);
      expect(meta.isDirectory).toBe(false);
      expect(meta.sizeBytes).toBe(Buffer.byteLength('Hello Alina 1'));
      expect(meta.extension).toBe('.txt');
      expect(meta.createdAt).toBeDefined();
      expect(meta.modifiedAt).toBeDefined();
    });

    it('read_text_file reads content and enforces bounds', async () => {
      const context: McpToolContext = { jail, auditLogger };
      const filePath = path.join(testRoot, 'docs', 'guide.md');
      const res = await readTextFileTool.execute(
        { path: filePath, maxBytes: 1024 * 1024, encoding: 'utf-8' },
        context
      );

      expect(res.content).toBe('# Guide Content');
      expect(res.sizeBytes).toBe(Buffer.byteLength('# Guide Content'));
      expect(res.truncated).toBe(false);
    });
  });

  // =========================================================================
  // 3. Approval-Gated Filesystem Operations (create, copy, move, rename)
  // =========================================================================
  describe('3. Approval-Gated Filesystem Operations', () => {
    let registry: ReturnType<typeof createAlinaMcpToolRegistry>;

    beforeEach(() => {
      registry = createAlinaMcpToolRegistry();
    });

    it('create_directory requires approval and creates folders when granted', async () => {
      const targetDir = path.join(testRoot, 'new-folder');

      // 1. Unapproved call through registry is blocked
      const unapprovedContext: McpToolContext = { jail, auditLogger, isApprovalGranted: false };
      const blocked = await registry.execute('create_directory', { path: targetDir }, unapprovedContext);
      expect(blocked.success).toBe(false);
      expect(blocked.error).toContain('requires explicit user approval');
      expect(fsSync.existsSync(targetDir)).toBe(false);

      // 2. Approved call succeeds
      const approvedContext: McpToolContext = { jail, auditLogger, isApprovalGranted: true };
      const approved = await registry.execute('create_directory', { path: targetDir }, approvedContext);
      expect(approved.success).toBe(true);
      expect(fsSync.existsSync(targetDir)).toBe(true);
    });

    it('create_file requires approval, writes content, and guards against unapproved overwrite', async () => {
      const targetFile = path.join(testRoot, 'sample.txt');

      // 1. Unapproved
      const unapproved = await registry.execute(
        'create_file',
        { path: targetFile, content: 'Initial Content' },
        { jail, auditLogger, isApprovalGranted: false }
      );
      expect(unapproved.success).toBe(false);
      expect(fsSync.existsSync(targetFile)).toBe(false);

      // 2. Approved
      const approved = await registry.execute(
        'create_file',
        { path: targetFile, content: 'Initial Content' },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(approved.success).toBe(true);
      expect(await fs.readFile(targetFile, 'utf-8')).toBe('Initial Content');

      // 3. Prevent overwrite without explicit overwrite: true
      const duplicateWithoutOverwrite = await registry.execute(
        'create_file',
        { path: targetFile, content: 'Overwritten', overwrite: false },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(duplicateWithoutOverwrite.success).toBe(false);
      expect(duplicateWithoutOverwrite.error).toContain('already exists');
    });

    it('copy_file requires approval, copies file, and preserves source', async () => {
      const src = path.join(testRoot, 'source.txt');
      const dest = path.join(testRoot, 'destination.txt');
      await fs.writeFile(src, 'Source Data to Copy', 'utf-8');

      // 1. Blocked when unapproved
      const blocked = await registry.execute(
        'copy_file',
        { sourcePath: src, destinationPath: dest },
        { jail, auditLogger, isApprovalGranted: false }
      );
      expect(blocked.success).toBe(false);
      expect(fsSync.existsSync(dest)).toBe(false);

      // 2. Allowed when approved
      const success = await registry.execute(
        'copy_file',
        { sourcePath: src, destinationPath: dest },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(success.success).toBe(true);
      expect(fsSync.existsSync(dest)).toBe(true);
      expect(await fs.readFile(dest, 'utf-8')).toBe('Source Data to Copy');
      // Source remains intact
      expect(fsSync.existsSync(src)).toBe(true);
    });

    it('move_file requires approval, relocates file to destination', async () => {
      const src = path.join(testRoot, 'to_move.txt');
      const dest = path.join(testRoot, 'moved', 'target.txt');
      await fs.writeFile(src, 'Move Me', 'utf-8');

      const success = await registry.execute(
        'move_file',
        { sourcePath: src, destinationPath: dest },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(success.success).toBe(true);
      expect(fsSync.existsSync(src)).toBe(false);
      expect(fsSync.existsSync(dest)).toBe(true);
      expect(await fs.readFile(dest, 'utf-8')).toBe('Move Me');
    });

    it('rename_file requires approval, renames file, and rejects directory traversal in newName', async () => {
      const original = path.join(testRoot, 'before.txt');
      await fs.writeFile(original, 'Rename Data', 'utf-8');

      // Reject path separators in newName
      const traversalAttempt = await registry.execute(
        'rename_file',
        { path: original, newName: '../escaped.txt' },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(traversalAttempt.success).toBe(false);
      expect(traversalAttempt.error).toContain('path separators or directory traversal');

      // Successful rename
      const success = await registry.execute(
        'rename_file',
        { path: original, newName: 'after.txt' },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(success.success).toBe(true);
      expect(fsSync.existsSync(original)).toBe(false);
      expect(fsSync.existsSync(path.join(testRoot, 'after.txt'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. Guarded High-Risk Operations
  // =========================================================================
  describe('4. Guarded High-Risk Operations (delete_file)', () => {
    it('delete_file is classified as HIGH_RISK and unrestricted deletion is strictly disabled', async () => {
      const registry = createAlinaMcpToolRegistry();
      const deleteDef = registry.get('delete_file');
      expect(deleteDef).toBeDefined();
      expect(deleteDef?.permission).toBe('HIGH_RISK');

      const file = path.join(testRoot, 'to_delete.txt');
      await fs.writeFile(file, 'Test', 'utf-8');

      // Even if approval flag was passed, tool execution strictly refuses unrestricted delete
      const result = await registry.execute(
        'delete_file',
        { path: file },
        { jail, auditLogger, isApprovalGranted: true }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unrestricted deletion is currently disabled');
      expect(fsSync.existsSync(file)).toBe(true);
    });
  });

  // =========================================================================
  // 5. Supervisor Agent End-to-End Workflow:
  //    "Find my most recently modified PDF."
  //    Then: "Create a copy of it." (triggers approval mechanism)
  // =========================================================================
  describe('5. End-to-End PDF Workflow with Approval Gate', () => {
    const pdfDir = path.join(testRoot, 'pdf_workspace');
    let oldPdfPath: string;
    let newPdfPath: string;
    let registry: ReturnType<typeof createAlinaMcpToolRegistry>;

    beforeEach(async () => {
      await fs.mkdir(pdfDir, { recursive: true });
      registry = createAlinaMcpToolRegistry();

      oldPdfPath = path.join(pdfDir, 'annual_report_2024.pdf');
      newPdfPath = path.join(pdfDir, 'q3_contract_2026.pdf');

      // Create two PDF files
      await fs.writeFile(oldPdfPath, '%PDF-1.4 Old Annual Report Content', 'utf-8');
      await fs.writeFile(newPdfPath, '%PDF-1.4 New Q3 Contract Content', 'utf-8');

      // Set old file modified date to yesterday, new file to now
      const now = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      fsSync.utimesSync(oldPdfPath, yesterday, yesterday);
      fsSync.utimesSync(newPdfPath, now, now);
    });

    it('Step 1: finds the most recently modified PDF safely without requiring approval', async () => {
      // Mock model plans a recursive_search for PDF files
      const mockModel = new MockModelAdapter(async (goal) => {
        expect(goal).toContain('Find my most recently modified PDF');
        return {
          text: 'Searching for PDF documents to locate the most recently modified file.',
          toolCalls: [
            {
              toolName: 'recursive_search',
              parameters: {
                path: pdfDir,
                extension: 'pdf',
              },
            },
          ],
        };
      });

      const agent = new AlinaSupervisorAgent({
        modelAdapter: mockModel,
        mcpRegistry: registry,
      });

      const progressEvents: string[] = [];
      const result = await agent.execute({
        goal: 'Find my most recently modified PDF.',
        jailRoot: testRoot,
        onProgress: (event) => {
          const payload = event.payload as { message?: string } | undefined;
          if (payload?.message) {
            progressEvents.push(payload.message);
          }
        },
      });

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.toolCallsCount).toBe(1);
      expect(result.resultSummary).toContain('Found 2 match(es)');
      // Verify safe tool was executed without approval prompts
      expect(progressEvents.some((p) => p.includes('Action requires human operator approval'))).toBe(false);
    });

    it('Step 2: attempting to copy the PDF halts in waiting_for_approval without mutating disk', async () => {
      const copyDestPath = path.join(pdfDir, 'q3_contract_2026_copy.pdf');

      // Mock model plans a copy_file operation
      const mockModel = new MockModelAdapter(async (goal) => {
        expect(goal).toContain('Create a copy of it');
        return {
          text: 'Planning to duplicate the most recently modified PDF.',
          toolCalls: [
            {
              toolName: 'copy_file',
              parameters: {
                sourcePath: newPdfPath,
                destinationPath: copyDestPath,
              },
            },
          ],
        };
      });

      const agent = new AlinaSupervisorAgent({
        modelAdapter: mockModel,
        mcpRegistry: registry,
      });

      const progressEvents: Array<{ type: string; message: string }> = [];
      
      // Execute WITHOUT approval
      const unapprovedResult = await agent.execute({
        goal: 'Create a copy of it.',
        jailRoot: testRoot,
        isApprovalGranted: false,
        onProgress: (event) => {
          const payload = event.payload as { message?: string } | undefined;
          progressEvents.push({ type: event.type, message: payload?.message || '' });
        },
      });

      // The task MUST be paused in waiting_for_approval
      expect(unapprovedResult.status).toBe('waiting_for_approval');
      expect(unapprovedResult.resultSummary).toContain('Execution paused awaiting approval for tool "copy_file"');
      
      // Verify awaiting_approval event was emitted
      const approvalEvent = progressEvents.find((e) => e.type === 'step:awaiting_approval');
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent?.message).toContain('Action requires human operator approval');

      // STRICT SAFETY ASSERTION: Destination file must NOT exist on disk!
      expect(fsSync.existsSync(copyDestPath)).toBe(false);
    });

    it('Step 3: resumes with approval granted, completes copy, and verifies file on disk', async () => {
      const copyDestPath = path.join(pdfDir, 'q3_contract_2026_copy.pdf');

      const mockModel = new MockModelAdapter(async () => ({
        text: 'Executing copy operation after operator authorization.',
        toolCalls: [
          {
            toolName: 'copy_file',
            parameters: {
              sourcePath: newPdfPath,
              destinationPath: copyDestPath,
            },
          },
        ],
      }));

      const agent = new AlinaSupervisorAgent({
        modelAdapter: mockModel,
        mcpRegistry: registry,
      });

      // Execute WITH approval granted
      const approvedResult = await agent.execute({
        goal: 'Create a copy of it.',
        jailRoot: testRoot,
        isApprovalGranted: true,
      });

      // Verify completion
      expect(approvedResult.status).toBe('completed');
      expect(approvedResult.stepsCompleted).toBe(1);
      expect(approvedResult.resultSummary).toContain('Copied file from');

      // Verify file exists on disk and has identical content
      expect(fsSync.existsSync(copyDestPath)).toBe(true);
      const originalContent = await fs.readFile(newPdfPath, 'utf-8');
      const copyContent = await fs.readFile(copyDestPath, 'utf-8');
      expect(copyContent).toBe(originalContent);
      expect(copyContent).toBe('%PDF-1.4 New Q3 Contract Content');
    });
  });
});
