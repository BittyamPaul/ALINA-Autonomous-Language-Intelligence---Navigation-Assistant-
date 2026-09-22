import { BaseRepository } from './base-repository';
import {
  PersonalContextNodeEntity,
  PersonalContextNodeSchema,
  PersonalContextEdgeEntity,
  PersonalContextEdgeSchema,
  PersonalContextExplanation,
  PersonalContextNodeType,
  PersonalContextRelation,
  ContextUsageRecordEntity,
  ContextUsageRecordSchema,
  UnifiedPersonalContextGraph,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';

export interface RelevantContextOptions {
  workspaceId?: string;
  projectId?: string;
  types?: PersonalContextNodeType[];
  limit?: number;
  threshold?: number;
}

export interface ProjectGraphResult {
  project: PersonalContextNodeEntity | null;
  nodes: PersonalContextNodeEntity[];
  edges: PersonalContextEdgeEntity[];
  technologies: PersonalContextNodeEntity[];
  tasks: PersonalContextNodeEntity[];
  knowledge: PersonalContextNodeEntity[];
  allEdges: PersonalContextEdgeEntity[];
}

/**
 * PersonalContextRepository
 *
 * Manages ALINA's Unified Personal Context Graph in SurrealDB with offline in-memory fallback.
 * Unifies: Memory, Knowledge, Tasks, Projects, Conversations, Preferences, Workflows,
 * Voice sessions, Learning, and Web research into an interconnected personal operating graph.
 */
export class PersonalContextRepository {
  private client: AlinaDatabaseClient;
  private nodeRepo: BaseRepository<PersonalContextNodeEntity>;
  private edgeRepo: BaseRepository<PersonalContextEdgeEntity>;
  private usageRepo: BaseRepository<ContextUsageRecordEntity>;

  constructor(client: AlinaDatabaseClient = new AlinaDatabaseClient()) {
    this.client = client;
    this.nodeRepo = new BaseRepository(client, 'personal_context_node', PersonalContextNodeSchema);
    this.edgeRepo = new BaseRepository(client, 'personal_context_edge', PersonalContextEdgeSchema);
    this.usageRepo = new BaseRepository(client, 'context_usage_record', ContextUsageRecordSchema);
  }

  public getClient(): AlinaDatabaseClient {
    return this.client;
  }

  // =========================================================================
  // Node Operations
  // =========================================================================

  public async upsertNode(node: PersonalContextNodeEntity): Promise<PersonalContextNodeEntity> {
    const validated = PersonalContextNodeSchema.parse(node);
    const existing = await this.nodeRepo.findById(validated.id);
    if (existing) {
      const updated = await this.nodeRepo.update(validated.id, {
        ...validated,
        updatedAt: new Date().toISOString(),
      });
      return updated || validated;
    }
    return this.nodeRepo.create(validated);
  }

  public async getNode(id: string): Promise<PersonalContextNodeEntity | null> {
    return this.nodeRepo.findById(id);
  }

  public async listNodes(type?: PersonalContextNodeType, limit = 100): Promise<PersonalContextNodeEntity[]> {
    const all = await this.nodeRepo.list(limit);
    if (type) {
      return all.filter((n) => n.type === type);
    }
    return all;
  }

  public async deleteNode(id: string): Promise<boolean> {
    return this.nodeRepo.delete(id);
  }

  // =========================================================================
  // Graph Edge Operations
  // =========================================================================

  public async relate(
    fromId: string,
    fromType: PersonalContextNodeType,
    relation: PersonalContextRelation,
    toId: string,
    toType: PersonalContextNodeType,
    weight = 1.0,
    metadata: Record<string, unknown> = {}
  ): Promise<PersonalContextEdgeEntity> {
    const edgeId = `edge_${fromId}_${relation}_${toId}`;
    const edge: PersonalContextEdgeEntity = {
      id: edgeId,
      fromNodeId: fromId,
      fromType,
      relation,
      toNodeId: toId,
      toType,
      weight,
      metadata,
      createdAt: new Date().toISOString(),
    };
    const validated = PersonalContextEdgeSchema.parse(edge);

    // If SurrealDB client is connected, execute canonical RELATE statement
    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `RELATE personal_context_node:${fromId}->${relation}->personal_context_node:${toId} SET weight = $weight, metadata = $metadata`,
          { weight, metadata }
        );
      } catch {
        // Fallback to table entity
      }
    }

    const existing = await this.edgeRepo.findById(edgeId);
    if (existing) {
      const updated = await this.edgeRepo.update(edgeId, validated);
      return updated || validated;
    }
    return this.edgeRepo.create(validated);
  }

  public async getEdges(nodeId: string, relation?: PersonalContextRelation): Promise<PersonalContextEdgeEntity[]> {
    const all = await this.edgeRepo.list(500);
    return all.filter((e) => {
      const touchesNode = e.fromNodeId === nodeId || e.toNodeId === nodeId;
      if (!touchesNode) return false;
      if (relation && e.relation !== relation) return false;
      return true;
    });
  }

  public async deleteEdge(edgeId: string): Promise<boolean> {
    return this.edgeRepo.delete(edgeId);
  }

  // =========================================================================
  // Relevance-Filtered Context Retrieval
  // =========================================================================

  /**
   * Retrieves relevant personal context based on semantic and keyword tokens.
   * Enforces strict relevance filtering: NEVER retrieves the entire memory database.
   */
  public async getRelevantContext(
    query: string,
    options: RelevantContextOptions = {}
  ): Promise<PersonalContextNodeEntity[]> {
    const limit = Math.min(options.limit ?? 5, 15); // bounded token budget
    const threshold = options.threshold ?? 0.15;
    const allNodes = await this.nodeRepo.list(500);

    const STOP_WORDS = new Set([
      'and', 'the', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
      'has', 'have', 'had', 'been', 'will', 'would', 'could', 'should', 'can',
      'not', 'but', 'all', 'any', 'our', 'out', 'into', 'over', 'more', 'some'
    ]);

    const queryTokens = query
      .toLowerCase()
      .split(/[\s,._-]+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

    const scoredNodes = allNodes
      .filter((node) => {
        if (options.types && options.types.length > 0 && !options.types.includes(node.type)) {
          return false;
        }
        return true;
      })
      .map((node) => {
        let score = 0;
        const nameTokens = node.name.toLowerCase();
        const descTokens = (node.description || '').toLowerCase();
        const propTokens = JSON.stringify(node.properties || {}).toLowerCase();

        for (const token of queryTokens) {
          if (nameTokens.includes(token)) score += 0.5;
          else if (descTokens.includes(token)) score += 0.3;
          else if (propTokens.includes(token)) score += 0.2;
        }

        // Add node confidence weight
        score *= (node.confidence ?? 1.0);

        // If project scope is specified and matches node or properties
        if (options.projectId && (node.properties?.projectId === options.projectId || node.id === options.projectId)) {
          score += 0.4;
        }

        return { node, score };
      })
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.node);

    return scoredNodes;
  }

  // =========================================================================
  // Project Subgraph Traversal
  // =========================================================================

  public async getProjectGraph(projectId: string): Promise<ProjectGraphResult> {
    const project = await this.nodeRepo.findById(projectId);
    const edges = await this.getEdges(projectId);

    const relatedNodeIds = new Set(edges.map((e) => (e.fromNodeId === projectId ? e.toNodeId : e.fromNodeId)));
    const allRelatedNodes = await Promise.all(Array.from(relatedNodeIds).map((id) => this.nodeRepo.findById(id)));
    const validNodes = allRelatedNodes.filter((n): n is PersonalContextNodeEntity => n !== null);

    const technologies = validNodes.filter((n) => n.type === 'TECHNOLOGY');
    const tasks = validNodes.filter((n) => n.type === 'TASK');
    const knowledge = validNodes.filter((n) => n.type === 'KNOWLEDGE');

    const nodes = project ? [project, ...validNodes] : validNodes;

    return {
      project,
      nodes,
      edges,
      technologies,
      tasks,
      knowledge,
      allEdges: edges,
    };
  }

  // =========================================================================
  // Explainability: "Why do you remember this?"
  // =========================================================================

  public async explainMemory(nodeId: string): Promise<PersonalContextExplanation | null> {
    const node = await this.nodeRepo.findById(nodeId);
    if (!node) return null;

    let why = node.provenance?.reasonRemembered;
    if (!why) {
      switch (node.type) {
        case 'PREFERENCE':
          why = `You previously indicated that you prefer "${node.name}" in your workspace.`;
          break;
        case 'PROJECT':
          why = `You designated "${node.name}" as an active project in your workspace.`;
          break;
        case 'TECHNOLOGY':
          why = `Used because your projects depend on "${node.name}".`;
          break;
        case 'WORKFLOW':
          why = `Observed recurring workflow pattern "${node.name}".`;
          break;
        case 'CONCEPT':
          why = `Synthesized from your confirmed learning sessions on "${node.name}".`;
          break;
        default:
          why = `Recorded in personal context from ${node.source || 'user interaction'}.`;
      }
    }

    return {
      nodeId: node.id,
      nodeType: node.type,
      name: node.name,
      whyRemembered: why,
      source: node.source,
      learnedAt: node.provenance?.learnedAt || node.createdAt,
      confidence: node.confidence,
      originalStatement: node.provenance?.originalStatement,
      associatedProject: typeof node.properties?.projectId === 'string' ? node.properties.projectId : undefined,
      canForget: !node.isProtected,
    };
  }

  // =========================================================================
  // Privacy Control: "Forget this" Action
  // =========================================================================

  public async forget(nodeId: string): Promise<{ success: boolean; edgesDeleted: number; explanation: string }> {
    const node = await this.nodeRepo.findById(nodeId);
    if (!node) {
      return { success: false, edgesDeleted: 0, explanation: `Node "${nodeId}" not found.` };
    }

    if (node.isProtected) {
      return {
        success: false,
        edgesDeleted: 0,
        explanation: `Node "${node.name}" is protected by system policy and cannot be deleted.`,
      };
    }

    // Cascade delete incoming and outgoing edges
    const edges = await this.getEdges(nodeId);
    let edgesDeleted = 0;
    for (const edge of edges) {
      await this.edgeRepo.delete(edge.id);
      edgesDeleted++;
    }

    // Delete node itself
    await this.nodeRepo.delete(nodeId);

    return {
      success: true,
      edgesDeleted,
      explanation: `Successfully forgot "${node.name}" and removed ${edgesDeleted} connected graph relationships.`,
    };
  }

  // =========================================================================
  // Context Usage Audit & Inspection
  // =========================================================================

  public async recordUsage(record: ContextUsageRecordEntity): Promise<ContextUsageRecordEntity> {
    const validated = ContextUsageRecordSchema.parse(record);
    return this.usageRepo.create(validated);
  }

  public async getRecentUsages(limit = 20): Promise<ContextUsageRecordEntity[]> {
    const all = await this.usageRepo.list(limit);
    return all.sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
  }

  // =========================================================================
  // Full Unified Graph Snapshot for UI Inspector
  // =========================================================================

  public async getUnifiedGraph(rootUserId = 'user_default'): Promise<UnifiedPersonalContextGraph> {
    const nodes = await this.nodeRepo.list(500);
    const edges = await this.edgeRepo.list(1000);

    return {
      nodes,
      edges,
      rootUserId,
      generatedAt: new Date().toISOString(),
    };
  }
}
