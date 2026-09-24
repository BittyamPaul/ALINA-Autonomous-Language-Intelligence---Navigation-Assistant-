import { NextResponse } from 'next/server';
import { AlinaDatabaseClient } from '@alina/database';
import {
  ConversationService,
  MessageService,
  TaskService,
  ApprovalService,
  MemoryService,
  ToolService,
  AgentRunService,
  AuditService,
  KnowledgeService,
  AlinaSupervisorAgent,
  AuthorizationManager,
  AlinaObservabilityService,
  createSuccessResponse,
  createErrorResponse,
  PersonalOsEngine,
  NetworkReadinessService,
} from '@alina/agent';
import { PersonalContextRepository } from '@alina/database';
import { createDefaultToolRegistry, createAlinaMcpToolRegistry } from '@alina/tools';

let globalClient: AlinaDatabaseClient | null = null;
let services: {
  db: AlinaDatabaseClient;
  conversations: ConversationService;
  messages: MessageService;
  tasks: TaskService;
  approvals: ApprovalService;
  memories: MemoryService;
  tools: ToolService;
  agentRuns: AgentRunService;
  audit: AuditService;
  knowledge: KnowledgeService;
  personalContextRepo: PersonalContextRepository;
  personalOs: PersonalOsEngine;
} | null = null;
let supervisorAgent: AlinaSupervisorAgent | null = null;

export async function getServerServices() {
  if (!globalClient) {
    globalClient = new AlinaDatabaseClient();
  }

  if (!globalClient.isConnected()) {
    await globalClient.connect();
  }

  if (!services) {
    const personalContextRepo = new PersonalContextRepository(globalClient);
    const personalOs = new PersonalOsEngine(personalContextRepo);

    services = {
      db: globalClient,
      conversations: new ConversationService(globalClient),
      messages: new MessageService(globalClient),
      tasks: new TaskService(globalClient),
      approvals: new ApprovalService(globalClient),
      memories: new MemoryService(globalClient),
      tools: new ToolService(globalClient),
      agentRuns: new AgentRunService(globalClient),
      audit: new AuditService(globalClient),
      knowledge: new KnowledgeService(globalClient),
      personalContextRepo,
      personalOs,
    };
  }

  return services;
}

export async function getSupervisorAgent(): Promise<AlinaSupervisorAgent> {
  const { db, tasks, agentRuns, memories, personalOs } = await getServerServices();
  if (!supervisorAgent) {
    const toolRegistry = createDefaultToolRegistry();
    const mcpRegistry = createAlinaMcpToolRegistry();
    const authManager = new AuthorizationManager({ client: db });

    supervisorAgent = new AlinaSupervisorAgent({
      toolRegistry,
      mcpRegistry,
      taskService: tasks,
      agentRunService: agentRuns,
      memoryService: memories,
      authorizationManager: authManager,
      observabilityService: AlinaObservabilityService.getInstance(),
      personalOsEngine: personalOs,
    });
  }
  return supervisorAgent;
}

let networkReadinessService: NetworkReadinessService | null = null;

export async function getNetworkReadinessService(): Promise<NetworkReadinessService> {
  if (!networkReadinessService) {
    const { db } = await getServerServices();
    networkReadinessService = new NetworkReadinessService({ dbClient: db });
  }
  return networkReadinessService;
}

export function handleApiSuccess<T>(data: T, startTime = Date.now()) {
  const body = createSuccessResponse(data, startTime);
  return NextResponse.json(body, { status: 200 });
}

export function handleApiError(err: unknown, startTime = Date.now()) {
  const { response, statusCode } = createErrorResponse(err, startTime);
  return NextResponse.json(response, { status: statusCode });
}
