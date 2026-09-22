import type {
  ApiResponse,
  CreateConversationInput,
  SendMessageInput,
  CreateTaskInput,
  UpdateTaskStatusInput,
  CreateApprovalGateInput,
  ResolveApprovalInput,
  CreateMemoryInput,
  SearchMemoryInput,
  SupervisorExecutionResult,
} from '@alina/agent';
import type {
  ConversationEntity,
  MessageEntity,
  TaskEntity,
  TaskStepEntity,
  ApprovalEntity,
  MemoryEntity,
  MemoryCategory,
  EpistemicTier,
  LearningSettings,
  TaskStatus,
  AgentRunEntity,
  ToolCallEntity,
} from '@alina/database';
import type { RiskLevel } from '@alina/tools';
import type {
  KnowledgeItem,
  KnowledgeSource,
  KnowledgeTopic,
  KnowledgeWorkspace,
  LearningProgress,
  ConceptRelationship,
  LearningQuestion,
  LearningDiscovery,
  PracticeTask,
  StartupHealthCheckResult,
  WifiNetwork,
  WifiConnectResult,
  AutoStartConfig,
  UnifiedPersonalContextGraph,
  PersonalContextExplanation,
  ContextUsageRecordEntity,
  PersonalContextNodeEntity,
  PersonalContextEdgeEntity,
} from '@alina/shared';

export class AlinaApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    };

    try {
      const res = await fetch(url, { ...options, headers });
      const data = (await res.json()) as ApiResponse<T>;
      return data;
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network request failed',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          durationMs: 0,
        },
      };
    }
  }

  // Health
  public readonly health = {
    check: () =>
      this.request<{
        status: string;
        database: { healthy: boolean; endpoint: string; latencyMs?: number };
        uptimeSeconds: number;
      }>('/api/health'),
  };

  // Conversations
  public readonly conversations = {
    list: (workspaceId?: string) => {
      const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return this.request<ConversationEntity[]>(`/api/conversations${q}`);
    },
    create: (input: CreateConversationInput) =>
      this.request<ConversationEntity>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getById: (id: string) => this.request<ConversationEntity>(`/api/conversations/${encodeURIComponent(id)}`),
    archive: (id: string) =>
      this.request<ConversationEntity>(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
      }),
    toggleMemory: (id: string, memoryDisabled?: boolean) =>
      this.request<ConversationEntity>(`/api/conversations/${encodeURIComponent(id)}/toggle-memory`, {
        method: 'POST',
        body: JSON.stringify({ memoryDisabled }),
      }),
  };

  // Messages
  public readonly messages = {
    list: (conversationId: string) =>
      this.request<MessageEntity[]>(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`),
    send: (input: SendMessageInput) =>
      this.request<MessageEntity>('/api/messages', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  };

  // Tasks
  public readonly tasks = {
    list: (filter?: { workspaceId?: string; status?: TaskStatus }) => {
      const params = new URLSearchParams();
      if (filter?.workspaceId) params.set('workspaceId', filter.workspaceId);
      if (filter?.status) params.set('status', filter.status);
      const q = params.toString() ? `?${params.toString()}` : '';
      return this.request<TaskEntity[]>(`/api/tasks${q}`);
    },
    create: (input: CreateTaskInput) =>
      this.request<{ task: TaskEntity; steps: TaskStepEntity[] }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getById: (id: string) =>
      this.request<{ task: TaskEntity; steps: TaskStepEntity[] }>(`/api/tasks/${encodeURIComponent(id)}`),
    updateStatus: (id: string, input: UpdateTaskStatusInput) =>
      this.request<TaskEntity>(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    execute: (
      id: string,
      options?: {
        goal?: string;
        workspaceId?: string;
        isApprovalGranted?: boolean;
        grantToken?: string;
        jailRoot?: string;
      }
    ) =>
      this.request<SupervisorExecutionResult>(`/api/tasks/${encodeURIComponent(id)}/execute`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),
  };

  // Approvals
  public readonly approvals = {
    list: (taskId?: string) => {
      const q = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
      return this.request<ApprovalEntity[]>(`/api/approvals${q}`);
    },
    create: (input: CreateApprovalGateInput) =>
      this.request<ApprovalEntity>('/api/approvals', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    resolve: (id: string, input: ResolveApprovalInput) =>
      this.request<ApprovalEntity>(`/api/approvals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  };

  // Memories & Learning Layer
  public readonly memories = {
    list: (
      params?:
        | { category?: MemoryCategory; layer?: string; query?: string; tier?: EpistemicTier }
        | MemoryCategory
    ) => {
      let queryString = '';
      if (typeof params === 'string') {
        queryString = `?category=${encodeURIComponent(params)}`;
      } else if (params) {
        const q = new URLSearchParams();
        if (params.category) q.set('category', params.category);
        if (params.layer) q.set('layer', params.layer);
        if (params.query) q.set('q', params.query);
        if (params.tier) q.set('tier', params.tier);
        queryString = q.toString() ? `?${q.toString()}` : '';
      }
      return this.request<MemoryEntity[]>(`/api/memories${queryString}`);
    },
    retrieve: (id: string) =>
      this.request<MemoryEntity>(`/api/memories/${encodeURIComponent(id)}`),
    create: (input: CreateMemoryInput) =>
      this.request<MemoryEntity>('/api/memories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, updates: Partial<CreateMemoryInput>) =>
      this.request<MemoryEntity>(`/api/memories/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    reinforce: (id: string, boost = 0.1) =>
      this.request<MemoryEntity>(`/api/memories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reinforce', boost }),
      }),
    decay: (options?: { decayFactor?: number; minConfidence?: number; purgeExpired?: boolean }) =>
      this.request<{ decayedCount: number; purgedCount: number }>('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ action: 'decay', options }),
      }),
    search: (input: SearchMemoryInput) =>
      this.request<Array<{ memory: MemoryEntity; score: number }>>('/api/memories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      this.request<{ deleted: boolean; id: string }>(`/api/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    getSettings: () =>
      this.request<LearningSettings>('/api/memories/settings'),
    updateSettings: (settings: Partial<LearningSettings>) =>
      this.request<LearningSettings>('/api/memories/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  };

  // Tools
  public readonly tools = {
    list: () =>
      this.request<Array<{ name: string; description: string; riskLevel: RiskLevel }>>('/api/tools'),
    logCall: (data: {
      agentRunId: string;
      toolId: string;
      taskStepId?: string;
      inputParameters: Record<string, unknown>;
      outputPayload?: unknown;
      durationMs: number;
      status: 'success' | 'failed' | 'rejected';
    }) =>
      this.request<ToolCallEntity>('/api/tools', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Agent Runs
  public readonly agentRuns = {
    start: (taskId: string, agentId?: string) =>
      this.request<AgentRunEntity>('/api/agent-runs', {
        method: 'POST',
        body: JSON.stringify({ taskId, agentId }),
      }),
    getById: (id: string) =>
      this.request<AgentRunEntity>(`/api/agent-runs/${encodeURIComponent(id)}`),
    update: (
      id: string,
      patch: {
        status?: AgentRunEntity['status'];
        stepCount?: number;
        tokenUsage?: Record<string, number>;
        endedAt?: string;
      }
    ) =>
      this.request<AgentRunEntity>(`/api/agent-runs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  };

  // Knowledge Acquisition & Persistence
  public readonly knowledge = {
    list: (params?: { q?: string; topic?: string; projectId?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set('q', params.q);
      if (params?.topic) sp.set('topic', params.topic);
      if (params?.projectId) sp.set('projectId', params.projectId);
      if (params?.limit) sp.set('limit', String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return this.request<KnowledgeItem[]>(`/api/knowledge/items${qs}`);
    },
    acquire: (data: {
      url: string;
      title: string;
      goal?: string;
      rawContent?: string;
      topic?: string;
      projectId?: string;
      taskId?: string;
      refreshPolicyType?: string;
      intervalDays?: number;
    }) =>
      this.request<{
        item: KnowledgeItem;
        source: KnowledgeSource;
        topic: KnowledgeTopic;
        isDuplicate: boolean;
      }>('/api/knowledge/items', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    explain: <T = Record<string, unknown>>(type: 'project' | 'recommendation' | 'provenance', targetId: string) => {
      return this.request<T>(
        `/api/knowledge/explain?type=${encodeURIComponent(type)}&targetId=${encodeURIComponent(targetId)}`
      );
    },
    refresh: (data: { itemId?: string; refreshAllStale?: boolean; rawContent?: string }) =>
      this.request<{ refreshedCount?: number; items?: KnowledgeItem[]; status?: string }>('/api/knowledge/refresh', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // "Learn With Me" Collaborative Learning Engine
  public readonly learning = {
    listWorkspaces: () =>
      this.request<KnowledgeWorkspace[]>('/api/learning/workspaces'),
    getWorkspace: (id: string) =>
      this.request<{
        workspace: KnowledgeWorkspace;
        topics: KnowledgeTopic[];
        progress: LearningProgress[];
        conceptChain: Array<{ from: string; to: string; relationType: string; description?: string }>;
        sources: KnowledgeSource[];
        questions: LearningQuestion[];
        discoveries: LearningDiscovery[];
        practiceTasks: PracticeTask[];
      }>(`/api/learning/workspaces/${encodeURIComponent(id)}`),
    start: (subject: string, options?: { projectId?: string; initialUnderstoodConcepts?: string[] }) =>
      this.request<{
        workspace: KnowledgeWorkspace;
        topics: KnowledgeTopic[];
        conceptRelationships: ConceptRelationship[];
        sources: KnowledgeSource[];
      }>('/api/learning/workspaces', {
        method: 'POST',
        body: JSON.stringify({ subject, ...options }),
      }),
    getContext: (workspaceId: string) =>
      this.request<{
        workspace: KnowledgeWorkspace;
        understoodConcepts: LearningProgress[];
        inProgressConcepts: LearningProgress[];
        openQuestions: LearningQuestion[];
        promptInjection: string;
      }>(`/api/learning/workspaces/${encodeURIComponent(workspaceId)}/context`),
    ask: (workspaceId: string, inquiry: string) =>
      this.request<{
        answer: string;
        updatedProgress: LearningProgress[];
        newQuestions: LearningQuestion[];
        newDiscoveries: LearningDiscovery[];
      }>(`/api/learning/workspaces/${encodeURIComponent(workspaceId)}/ask`, {
        method: 'POST',
        body: JSON.stringify({ inquiry }),
      }),
    addQuestion: (workspaceId: string, question: string) =>
      this.request<LearningQuestion>(`/api/learning/workspaces/${encodeURIComponent(workspaceId)}/questions`, {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    updateQuestion: (workspaceId: string, questionId: string, patch: Partial<LearningQuestion>) =>
      this.request<LearningQuestion>(
        `/api/learning/workspaces/${encodeURIComponent(workspaceId)}/questions/${encodeURIComponent(questionId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }
      ),
    advanceProgress: (workspaceId: string, conceptName: string, masteryLevel: 'understood' | 'mastered') =>
      this.request<LearningProgress>(`/api/learning/workspaces/${encodeURIComponent(workspaceId)}/progress`, {
        method: 'POST',
        body: JSON.stringify({ conceptName, masteryLevel }),
      }),
    createPracticeTask: (workspaceId: string, topicId?: string) =>
      this.request<PracticeTask>(`/api/learning/workspaces/${encodeURIComponent(workspaceId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ topicId }),
      }),
    submitPracticeTask: (taskId: string, userCode: string) =>
      this.request<{
        passed: boolean;
        score: number;
        feedback: string;
        conceptAdvanced?: string;
        task: PracticeTask;
      }>(`/api/learning/tasks/${encodeURIComponent(taskId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ userCode }),
      }),
    deleteWorkspace: (workspaceId: string) =>
      this.request<{ success: boolean; deletedId: string }>(
        `/api/learning/workspaces/${encodeURIComponent(workspaceId)}`,
        {
          method: 'DELETE',
        }
      ),
  };

  // Startup & Network Readiness
  public readonly network = {
    getStatus: () =>
      this.request<StartupHealthCheckResult>('/api/network/status'),
    reconnect: () =>
      this.request<StartupHealthCheckResult>('/api/network/reconnect', {
        method: 'POST',
      }),
    scanWifi: () =>
      this.request<WifiNetwork[]>('/api/network/wifi/scan'),
    connectWifi: (ssid: string, password?: string) =>
      this.request<WifiConnectResult>('/api/network/wifi/connect', {
        method: 'POST',
        body: JSON.stringify({ ssid, password }),
      }),
    getAutostart: () =>
      this.request<AutoStartConfig>('/api/network/autostart'),
    setAutostart: (enabled: boolean) =>
      this.request<{ success: boolean; enabled: boolean }>('/api/network/autostart', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    getAutoStartStatus: () =>
      this.request<AutoStartConfig>('/api/network/autostart'),
    setAutoStart: (enabled: boolean) =>
      this.request<{ success: boolean; enabled: boolean }>('/api/network/autostart', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
  };

  // Personal Context Graph & Operating System Layer
  public readonly personalContext = {
    getUnifiedGraph: (userId = 'user_default') =>
      this.request<UnifiedPersonalContextGraph>(`/api/personal-context?userId=${encodeURIComponent(userId)}`),
    getProjectGraph: (projectId: string) =>
      this.request<UnifiedPersonalContextGraph>(`/api/personal-context?projectId=${encodeURIComponent(projectId)}`),
    getRecentUsages: (limit = 20) =>
      this.request<ContextUsageRecordEntity[]>(`/api/personal-context?usages=true&limit=${limit}`),
    explain: (nodeId: string) =>
      this.request<PersonalContextExplanation>(`/api/personal-context/explain?nodeId=${encodeURIComponent(nodeId)}`),
    forget: (nodeId: string) =>
      this.request<{ success: boolean; edgesDeleted: number; explanation: string }>(
        `/api/personal-context?nodeId=${encodeURIComponent(nodeId)}`,
        { method: 'DELETE' }
      ),
    upsertNode: (node: PersonalContextNodeEntity) =>
      this.request<PersonalContextNodeEntity>('/api/personal-context', {
        method: 'POST',
        body: JSON.stringify({ node }),
      }),
    relate: (fromId: string, fromType: string, relation: string, toId: string, toType: string, weight?: number) =>
      this.request<PersonalContextEdgeEntity>('/api/personal-context', {
        method: 'POST',
        body: JSON.stringify({ action: 'relate', fromId, fromType, relation, toId, toType, weight }),
      }),
  };
}

export const alinaApi = new AlinaApiClient();


