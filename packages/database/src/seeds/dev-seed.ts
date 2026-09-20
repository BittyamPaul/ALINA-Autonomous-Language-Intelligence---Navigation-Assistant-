import { AlinaDatabaseClient } from '../client';
import {
  UserRepository,
  WorkspaceRepository,
  TaskRepository,
  MemoryRepository,
  AuditEventRepository,
  GraphRepository,
} from '../repositories';
import type { TaskEntity, TaskStepEntity, ApprovalEntity, MemoryEntity } from '../models/entities';

// Helper to generate a 384-d normalized mock vector
function generateMockEmbedding(seed: number): number[] {
  const vector: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < 384; i++) {
    const val = Math.sin(seed * (i + 1));
    vector.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vector.map((v) => v / norm);
}

export async function seedDevelopmentDatabase(client: AlinaDatabaseClient): Promise<{
  user: string;
  workspace: string;
  task: string;
  memoryCount: number;
}> {
  console.info('[Seed] Seeding development database...');

  const userRepo = new UserRepository(client);
  const workspaceRepo = new WorkspaceRepository(client);
  const taskRepo = new TaskRepository(client);
  const memoryRepo = new MemoryRepository(client);
  const auditRepo = new AuditEventRepository(client);
  const graphRepo = new GraphRepository(client);

  // 1. Seed User
  const user = await userRepo.getOrCreateDefaultUser();

  // 2. Seed Workspace
  const workspace = await workspaceRepo.create({
    id: 'ws_alina_main',
    name: 'ALINA Core Workspace',
    rootPath: 'C:\\Users\\bitty\\Desktop\\ALINA',
    allowedPaths: ['C:\\Users\\bitty\\Desktop\\ALINA'],
    isActive: true,
    settings: { pathJailStrict: true, autoApproval: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Relate: user -> owns -> workspace
  await graphRepo.relate(`user:${user.id}`, 'owns', `workspace:${workspace.id}`, { role: 'owner' });

  // 3. Seed Task & Steps
  const task: TaskEntity = {
    id: 'task_audit_arch',
    goal: 'Audit repository architecture, PathJail boundaries & strict TypeScript types',
    workspaceId: workspace.id,
    status: 'awaiting_approval',
    riskLevel: 'HIGH_DESTRUCTIVE',
    plan: { totalSteps: 3, strategy: 'sequential_verify' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const steps: TaskStepEntity[] = [
    {
      id: 'step_validate_jail',
      taskId: task.id,
      index: 0,
      title: 'Assert PathJail sandbox on current workspace root',
      toolName: 'fs_validate_jail',
      parameters: { path: '.' },
      status: 'completed',
      riskLevel: 'LOW',
      output: 'Path strictly within registered project root.',
    },
    {
      id: 'step_read_config',
      taskId: task.id,
      index: 1,
      title: 'Extract workspace package declarations',
      toolName: 'fs_read_file',
      parameters: { path: 'pnpm-workspace.yaml' },
      status: 'completed',
      riskLevel: 'LOW',
      output: 'Loaded packages: apps/*, packages/*, infrastructure/*',
    },
    {
      id: 'step_mutate_pkg',
      taskId: task.id,
      index: 2,
      title: 'Update package manager metadata in package.json',
      toolName: 'fs_write_file',
      parameters: { file: 'package.json', version: '0.2.0' },
      status: 'awaiting_approval',
      riskLevel: 'HIGH_DESTRUCTIVE',
    },
  ];

  await taskRepo.createTaskWithSteps(task, steps);
  await graphRepo.relate(`user:${user.id}`, 'created', `task:${task.id}`);

  // 4. Seed Approval for High-Risk Step
  const approval: ApprovalEntity = {
    id: 'app_pkg_update',
    taskId: task.id,
    taskStepId: 'step_mutate_pkg',
    action: 'overwrite',
    target: 'package.json',
    reason: 'Autonomous agent requested file overwrite of root package.json. Requires human authorization.',
    tool: 'fs_write_file',
    riskLevel: 'HIGH_DESTRUCTIVE',
    description: 'Autonomous agent requested file overwrite of root package.json. Requires human authorization.',
    diffPreview: '--- a/package.json\n+++ b/package.json\n@@ -3,1 +3,1 @@\n- "version": "0.1.0"\n+ "version": "0.2.0"',
    parameters: { path: 'package.json', content: '{\n  "name": "alina-monorepo",\n  "version": "0.2.0"\n}' },
    parametersSummary: 'Write 0.2.0 version to root package.json',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await taskRepo.createApprovalGate(approval);

  // 5. Seed Semantic Memories with 384-d Vector Embeddings
  const sampleMemories: MemoryEntity[] = [
    {
      id: 'mem_sec_rule',
      content: 'ALINA must NEVER execute destructive operations without explicit human authorization.',
      category: 'rule',
      layer: 'semantic',
      importance: 1.0,
      tags: ['security', 'hitl', 'pathjail'],
      embedding: generateMockEmbedding(1.1),
      workspaceId: workspace.id,
      source: 'user_explicit',
      accessCount: 1,
      metadata: {},
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mem_design_pref',
      content: 'User prefers warm minimalism, light mode as primary, editorial serif typography, no cyberpunk neon or robot avatars.',
      category: 'preference',
      layer: 'semantic',
      importance: 0.95,
      tags: ['design', 'editorial', 'typography'],
      embedding: generateMockEmbedding(2.2),
      workspaceId: workspace.id,
      source: 'user_explicit',
      accessCount: 1,
      metadata: {},
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mem_arch_context',
      content: 'ALINA is a local-first monorepo using Turborepo, pnpm, Next.js 15, React 19, Tauri 2, and SurrealDB.',
      category: 'project_context',
      layer: 'semantic',
      importance: 0.9,
      tags: ['architecture', 'monorepo', 'tauri'],
      embedding: generateMockEmbedding(3.3),
      workspaceId: workspace.id,
      source: 'user_explicit',
      accessCount: 1,
      metadata: {},
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  for (const mem of sampleMemories) {
    await memoryRepo.remember(user.id, mem);
  }

  // 6. Log Initial Audit Event
  await auditRepo.logEvent(
    'schema_migrated',
    'system_initializer',
    'surreal_main_db',
    'info',
    { seededRecords: sampleMemories.length + 3 }
  );

  console.info('[Seed] Successfully populated development database.');

  return {
    user: user.id,
    workspace: workspace.id,
    task: task.id,
    memoryCount: sampleMemories.length,
  };
}
