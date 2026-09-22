import {
  PersonalContextNodeEntity,
  PersonalContextNodeType,
  ContextUsageRecordEntity,
  PersonalContextExplanation,
  UnifiedPersonalContextGraph,
} from '@alina/shared';
import { PersonalContextRepository, RelevantContextOptions } from '@alina/database';

export interface PersonalOsPlanningInput {
  goal: string;
  workspaceId?: string;
  projectId?: string;
  conversationId?: string;
  isMemoryDisabled?: boolean;
}

export interface ResolvedContextItem {
  nodeId: string;
  nodeType: PersonalContextNodeType;
  name: string;
  description?: string;
  justification: string;
  confidence: number;
  isOverridden: boolean;
  overrideReason?: string;
}

export interface PersonalOsContextBrief {
  isMemoryDisabled: boolean;
  activeContextItems: ResolvedContextItem[];
  overriddenItems: ResolvedContextItem[];
  promptSection: string;
  usageRecords: ContextUsageRecordEntity[];
}

export type PersonalContextPreparationResult = PersonalOsContextBrief;

/**
 * PersonalOsEngine
 *
 * Implements ALINA's Personal Operating System layer.
 * Unifies Memory, Knowledge, Tasks, Projects, Conversations, Preferences, Workflows,
 * Voice sessions, and Learning into a coherent, privacy-respecting personal context.
 *
 * Invariants Enforced:
 * 1. Zero New Surveillance: Only aggregates approved existing data.
 * 2. Relevance Filtering: Strict token and score budgeting; never dumps entire database.
 * 3. Prompt Precedence: Explicit current user instructions ALWAYS strictly override old preferences.
 * 4. Safety Inviolability: Memory can NEVER bypass system safety, permissions, or PathJail.
 * 5. Full Operator Agency: Per-conversation killswitch, "Why do you remember this?", and "Forget this".
 */
export class PersonalOsEngine {
  private repository: PersonalContextRepository;

  constructor(repository: PersonalContextRepository = new PersonalContextRepository()) {
    this.repository = repository;
  }

  public getRepository(): PersonalContextRepository {
    return this.repository;
  }

  /**
   * Evaluates request and retrieves relevant personal & project context.
   * Resolves conflicts, enforces safety bounds, and records provenance.
   */
  public async preparePlanningContext(
    input: PersonalOsPlanningInput,
    options?: { limit?: number; threshold?: number }
  ): Promise<PersonalOsContextBrief> {
    const taskId = `plan_ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Invariant 5: If memory is disabled for this conversation, completely bypass retrieval
    if (input.isMemoryDisabled) {
      return {
        isMemoryDisabled: true,
        activeContextItems: [],
        overriddenItems: [],
        promptSection: '',
        usageRecords: [],
      };
    }

    const retrieveOptions: RelevantContextOptions = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      limit: options?.limit ?? 5,
      threshold: options?.threshold ?? 0.15,
    };

    // Step 2 & 3 & 4: Retrieve relevant personal, project, and knowledge context
    const candidates = await this.repository.getRelevantContext(input.goal, retrieveOptions);

    const activeContextItems: ResolvedContextItem[] = [];
    const overriddenItems: ResolvedContextItem[] = [];
    const usageRecords: ContextUsageRecordEntity[] = [];

    const lowerGoal = input.goal.toLowerCase();

    for (const node of candidates) {
      const conflict = this.detectConflictWithUserGoal(node, lowerGoal);
      const isSafe = this.assertSafetyInvariants(node);

      if (!isSafe) {
        // Discard unsafe context that attempts to tamper with system policies
        continue;
      }

      const justification = this.generateJustification(node, input);

      const resolved: ResolvedContextItem = {
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        description: node.description,
        justification,
        confidence: node.confidence ?? 1.0,
        isOverridden: conflict.hasConflict,
        overrideReason: conflict.reason,
      };

      if (conflict.hasConflict) {
        overriddenItems.push(resolved);
        usageRecords.push({
          id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          taskId,
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          justification: `Retrieved but overridden: ${conflict.reason}`,
          overriddenByPrompt: true,
          usedAt: new Date().toISOString(),
        });
      } else {
        activeContextItems.push(resolved);
        const usage: ContextUsageRecordEntity = {
          id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          taskId,
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          justification,
          overriddenByPrompt: false,
          usedAt: new Date().toISOString(),
        };
        usageRecords.push(usage);
        await this.repository.recordUsage(usage);
      }
    }

    const promptSection = this.synthesizePromptSection(activeContextItems, overriddenItems);

    return {
      isMemoryDisabled: false,
      activeContextItems,
      overriddenItems,
      promptSection,
      usageRecords,
    };
  }

  /**
   * Conflict Detection: Current user request always takes precedence over old preferences.
   */
  private detectConflictWithUserGoal(
    node: PersonalContextNodeEntity,
    lowerGoal: string
  ): { hasConflict: boolean; reason?: string } {
    const nodeName = node.name.toLowerCase();
    const nodeDesc = (node.description || '').toLowerCase();

    // Check for explicit contradiction prefixes in user goal
    const negations = [
      `not ${nodeName}`,
      `don't use ${nodeName}`,
      `do not use ${nodeName}`,
      `without ${nodeName}`,
      `instead of ${nodeName}`,
      `avoid ${nodeName}`,
      `no ${nodeName}`,
    ];

    for (const negation of negations) {
      if (lowerGoal.includes(negation)) {
        return {
          hasConflict: true,
          reason: `Current user prompt explicitly requested to "${negation}", superseding saved context "${node.name}".`,
        };
      }
    }

    // Technology conflict detection: e.g. prompt says "write in python" vs preference "prefers typescript"
    if (node.type === 'PREFERENCE' || node.type === 'TECHNOLOGY') {
      if (nodeName.includes('typescript') && (lowerGoal.includes('javascript') || lowerGoal.includes('vanilla js'))) {
        return {
          hasConflict: true,
          reason: 'User prompt explicitly requested JavaScript, overriding saved TypeScript preference.',
        };
      }
      if (nodeName.includes('python') && lowerGoal.includes('rust')) {
        return {
          hasConflict: true,
          reason: 'User prompt explicitly requested Rust, overriding saved Python preference.',
        };
      }
      if (nodeDesc.includes('dark mode') && lowerGoal.includes('light mode')) {
        return {
          hasConflict: true,
          reason: 'User prompt explicitly requested Light mode, overriding saved Dark mode preference.',
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Safety Invariants: Memory cannot override PathJail, OS security, or require arbitrary execution.
   */
  private assertSafetyInvariants(node: PersonalContextNodeEntity): boolean {
    const serialized = JSON.stringify(node).toLowerCase();

    // Prevent memory from injecting forbidden roots or path traversal
    if (
      serialized.includes('../') ||
      serialized.includes('..\\') ||
      serialized.includes('c:\\windows') ||
      serialized.includes('/etc/passwd') ||
      serialized.includes('rm -rf /') ||
      serialized.includes('format c:')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Generates human-auditable justification for Personal Context Inspector.
   * Example: "Used because you previously told me this is your main development project."
   */
  private generateJustification(node: PersonalContextNodeEntity, input: PersonalOsPlanningInput): string {
    switch (node.type) {
      case 'PROJECT':
        return `Used because you designated "${node.name}" as an active project for workspace "${input.workspaceId || 'current'}".`;
      case 'TECHNOLOGY':
        return `Used because your active project relies on ${node.name}.`;
      case 'PREFERENCE':
        return `Used because you previously told me "${node.name}".`;
      case 'WORKFLOW':
        return `Applied because this matches your frequent workflow pattern for ${node.name}.`;
      case 'CONCEPT':
        return `Referenced from your confirmed mastery of ${node.name}.`;
      case 'KNOWLEDGE':
        return `Retrieved relevant domain documentation for ${node.name}.`;
      default:
        return `Consulted personal context node "${node.name}" based on semantic relevance to your goal.`;
    }
  }

  /**
   * Synthesizes passive, boundary-delimited prompt section.
   */
  private synthesizePromptSection(
    active: ResolvedContextItem[],
    overridden: ResolvedContextItem[]
  ): string {
    if (active.length === 0 && overridden.length === 0) {
      return '';
    }

    const lines: string[] = [
      '### Personal Context & Operating Graph (Relevance Filtered)',
      'The following user and project context was retrieved from ALINA\'s personal operating graph.',
      'RULE: Current user instructions ALWAYS strictly override previous preferences if they conflict.',
    ];

    if (active.length > 0) {
      lines.push('\n**Active Personal Context**:');
      for (const item of active) {
        lines.push(`- [${item.nodeType}] **${item.name}**: ${item.description || item.name} *(Justification: ${item.justification})*`);
      }
    }

    if (overridden.length > 0) {
      lines.push('\n**Overridden Context (Disregarded for this task - OPERATOR OVERRIDE)**:');
      for (const item of overridden) {
        lines.push(`- [${item.nodeType}] [OPERATOR OVERRIDE] ~~${item.name}~~ — *Overridden by current prompt: ${item.overrideReason}*`);
      }
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Explainability & Privacy API
  // =========================================================================

  public async explainMemory(nodeId: string): Promise<PersonalContextExplanation | null> {
    return this.repository.explainMemory(nodeId);
  }

  public async forget(nodeId: string): Promise<{ success: boolean; edgesDeleted: number; explanation: string }> {
    return this.repository.forget(nodeId);
  }

  public async getRecentUsages(limit = 20): Promise<ContextUsageRecordEntity[]> {
    return this.repository.getRecentUsages(limit);
  }

  public async getUnifiedGraph(rootUserId = 'user_default'): Promise<UnifiedPersonalContextGraph> {
    return this.repository.getUnifiedGraph(rootUserId);
  }

  // =========================================================================
  // Post-Execution Learning (Allowed Outcomes Only)
  // =========================================================================

  /**
   * Updates memory only when justified from verified, successful outcomes.
   * Stores complete provenance and never indexes failed/aborted operations.
   */
  public async learnFromSuccessfulOutcome(
    taskId: string,
    goal: string,
    outcomeSummary: string,
    context?: { projectId?: string; technologies?: string[]; conversationId?: string }
  ): Promise<PersonalContextNodeEntity | null> {
    // Only learn if outcome contains actionable workflow pattern or explicit preference
    const lower = goal.toLowerCase();
    const isWorkflow = lower.startsWith('build') || lower.startsWith('deploy') || lower.startsWith('create');

    if (!isWorkflow && !context?.technologies?.length) {
      return null;
    }

    const nodeId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const node: PersonalContextNodeEntity = {
      id: nodeId,
      type: 'WORKFLOW',
      name: goal.slice(0, 60),
      description: outcomeSummary.slice(0, 200),
      properties: {
        taskId,
        projectId: context?.projectId,
        technologies: context?.technologies || [],
      },
      confidence: 0.85,
      source: 'TASK_EXECUTION',
      provenance: {
        sourceTaskId: taskId,
        sourceConversationId: context?.conversationId,
        learnedAt: new Date().toISOString(),
        reasonRemembered: `Successfully executed workflow for: ${goal}`,
        originalStatement: goal,
      },
      isProtected: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.repository.upsertNode(node);

    // If project is associated, create graph relation
    if (context?.projectId) {
      await this.repository.relate(
        context.projectId,
        'PROJECT',
        'contains',
        node.id,
        'WORKFLOW'
      );
    }

    return saved;
  }
}
