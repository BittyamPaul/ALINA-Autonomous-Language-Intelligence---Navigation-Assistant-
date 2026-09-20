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
  createSuccessResponse,
  createErrorResponse,
} from '@alina/agent';

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
} | null = null;

export async function getServerServices() {
  if (!globalClient) {
    globalClient = new AlinaDatabaseClient();
  }

  if (!globalClient.isConnected()) {
    await globalClient.connect();
  }

  if (!services) {
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
    };
  }

  return services;
}

export function handleApiSuccess<T>(data: T, startTime = Date.now()) {
  const body = createSuccessResponse(data, startTime);
  return NextResponse.json(body, { status: 200 });
}

export function handleApiError(err: unknown, startTime = Date.now()) {
  const { response, statusCode } = createErrorResponse(err, startTime);
  return NextResponse.json(response, { status: statusCode });
}
