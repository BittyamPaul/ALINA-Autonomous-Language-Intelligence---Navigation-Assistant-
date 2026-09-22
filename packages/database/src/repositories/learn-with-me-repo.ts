import { BaseRepository } from './base-repository';
import {
  KnowledgeWorkspaceEntity,
  KnowledgeWorkspaceSchema,
  LearningTopicEntity,
  LearningTopicSchema,
  LearningProgressEntity,
  LearningProgressSchema,
  ConceptRelationshipEntity,
  ConceptRelationshipSchema,
  LearningQuestionEntity,
  LearningQuestionSchema,
  LearningDiscoveryEntity,
  LearningDiscoverySchema,
  PracticeTaskEntity,
  PracticeTaskSchema,
  LearningSessionEntity,
  LearningSessionSchema,
  KnowledgeSourceEntity,
  KnowledgeSourceSchema,
} from '../models/entities';
import { AlinaDatabaseClient } from '../client';
import { GraphRepository, GraphEdge } from './graph-repo';

export interface ConceptGraphNode {
  name: string;
  topicId?: string;
  masteryLevel: string;
  timesReviewed: number;
  confidenceScore: number;
}

export interface ConceptGraphEdgeView {
  from: string;
  to: string;
  relationType: string;
  description?: string;
}

export interface CompleteWorkspaceView {
  workspace: KnowledgeWorkspaceEntity;
  topics: LearningTopicEntity[];
  progress: LearningProgressEntity[];
  conceptChain: ConceptGraphEdgeView[];
  sources: KnowledgeSourceEntity[];
  questions: LearningQuestionEntity[];
  discoveries: LearningDiscoveryEntity[];
  practiceTasks: PracticeTaskEntity[];
}

export class LearnWithMeRepository extends BaseRepository<KnowledgeWorkspaceEntity> {
  private graphRepo: GraphRepository;

  // Secondary in-memory stores for offline & testing operations
  private get topicStore(): Map<string, LearningTopicEntity> {
    return this.client.getInMemoryTable<LearningTopicEntity>('learning_topics');
  }

  private get progressStore(): Map<string, LearningProgressEntity> {
    return this.client.getInMemoryTable<LearningProgressEntity>('learning_progress');
  }

  private get relationshipStore(): Map<string, ConceptRelationshipEntity> {
    return this.client.getInMemoryTable<ConceptRelationshipEntity>('concept_relationships');
  }

  private get questionStore(): Map<string, LearningQuestionEntity> {
    return this.client.getInMemoryTable<LearningQuestionEntity>('learning_questions');
  }

  private get discoveryStore(): Map<string, LearningDiscoveryEntity> {
    return this.client.getInMemoryTable<LearningDiscoveryEntity>('learning_discoveries');
  }

  private get taskStore(): Map<string, PracticeTaskEntity> {
    return this.client.getInMemoryTable<PracticeTaskEntity>('practice_tasks');
  }

  private get sessionStore(): Map<string, LearningSessionEntity> {
    return this.client.getInMemoryTable<LearningSessionEntity>('learning_sessions');
  }

  private get sourceStore(): Map<string, KnowledgeSourceEntity> {
    return this.client.getInMemoryTable<KnowledgeSourceEntity>('knowledge_sources');
  }

  // Directional graph edge memory store: fromThing -> relation -> Set<toThing>
  private graphEdges = new Map<string, Set<string>>();

  constructor(client: AlinaDatabaseClient, graphRepo?: GraphRepository) {
    super(client, 'knowledge_workspaces', KnowledgeWorkspaceSchema);
    this.graphRepo = graphRepo || new GraphRepository(client);
  }

  private addEdge(from: string, relation: string, to: string): void {
    const key = `${from}->${relation}`;
    let set = this.graphEdges.get(key);
    if (!set) {
      set = new Set<string>();
      this.graphEdges.set(key, set);
    }
    set.add(to);
  }

  private getEdges(from: string, relation: string): string[] {
    const key = `${from}->${relation}`;
    return Array.from(this.graphEdges.get(key) || []);
  }

  private removeEdgesForNode(nodeId: string): void {
    for (const [key, set] of this.graphEdges.entries()) {
      if (key.startsWith(`${nodeId}->`)) {
        this.graphEdges.delete(key);
        continue;
      }
      for (const target of Array.from(set)) {
        if (target === nodeId) {
          set.delete(target);
        }
      }
      if (set.size === 0) {
        this.graphEdges.delete(key);
      }
    }
  }

  // =========================================================================
  // 1. Knowledge Workspaces
  // =========================================================================

  public async createWorkspace(workspace: KnowledgeWorkspaceEntity): Promise<KnowledgeWorkspaceEntity> {
    return this.create(workspace);
  }

  public async getWorkspace(id: string): Promise<KnowledgeWorkspaceEntity | null> {
    return this.findById(id);
  }

  public async listWorkspaces(): Promise<KnowledgeWorkspaceEntity[]> {
    return this.list(100);
  }

  public async updateWorkspace(
    id: string,
    patch: Partial<KnowledgeWorkspaceEntity>
  ): Promise<KnowledgeWorkspaceEntity> {
    const updated = await this.update(id, patch);
    if (!updated) {
      throw new Error(`Knowledge workspace "${id}" not found`);
    }
    return updated;
  }

  /**
   * Complete cascading deletion of the knowledge workspace.
   * Completely removes the workspace, topics, progress, relationships,
   * questions, discoveries, tasks, and all graph relationships.
   */
  public async deleteWorkspace(workspaceId: string): Promise<void> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;

    // 1. Delete associated topics
    for (const [id, topic] of this.topicStore.entries()) {
      if (topic.workspaceId === wsKey || topic.workspaceId === workspaceId) {
        this.topicStore.delete(id);
        this.removeEdgesForNode(`learning_topics:${id}`);
      }
    }

    // 2. Delete associated progress
    for (const [id, prog] of this.progressStore.entries()) {
      if (prog.workspaceId === wsKey || prog.workspaceId === workspaceId) {
        this.progressStore.delete(id);
      }
    }

    // 3. Delete concept relationships
    for (const [id, rel] of this.relationshipStore.entries()) {
      if (rel.workspaceId === wsKey || rel.workspaceId === workspaceId) {
        this.relationshipStore.delete(id);
      }
    }

    // 4. Delete questions
    for (const [id, q] of this.questionStore.entries()) {
      if (q.workspaceId === wsKey || q.workspaceId === workspaceId) {
        this.questionStore.delete(id);
      }
    }

    // 5. Delete discoveries
    for (const [id, disc] of this.discoveryStore.entries()) {
      if (disc.workspaceId === wsKey || disc.workspaceId === workspaceId) {
        this.discoveryStore.delete(id);
      }
    }

    // 6. Delete practice tasks
    for (const [id, task] of this.taskStore.entries()) {
      if (task.workspaceId === wsKey || task.workspaceId === workspaceId) {
        this.taskStore.delete(id);
      }
    }

    // 7. Delete sessions
    for (const [id, sess] of this.sessionStore.entries()) {
      if (sess.workspaceId === wsKey || sess.workspaceId === workspaceId) {
        this.sessionStore.delete(id);
      }
    }

    // 8. Remove all graph edges touching workspace
    this.removeEdgesForNode(`knowledge_workspaces:${wsKey}`);
    this.removeEdgesForNode(`knowledge_workspaces:${workspaceId}`);

    // 9. If SurrealDB is connected, execute cascading query
    if (this.client.isConnected()) {
      try {
        await this.client.query(`
          BEGIN TRANSACTION;
          DELETE FROM learning_topics WHERE workspaceId = $id;
          DELETE FROM learning_progress WHERE workspaceId = $id;
          DELETE FROM concept_relationships WHERE workspaceId = $id;
          DELETE FROM learning_questions WHERE workspaceId = $id;
          DELETE FROM learning_discoveries WHERE workspaceId = $id;
          DELETE FROM practice_tasks WHERE workspaceId = $id;
          DELETE FROM learning_sessions WHERE workspaceId = $id;
          DELETE type::record("knowledge_workspaces", $id);
          COMMIT TRANSACTION;
        `, { id: wsKey });
      } catch (err) {
        console.error('[LearnWithMeRepository.deleteWorkspace Error in SurrealDB]', err);
      }
    }

    // 10. Delete workspace itself from base repository
    await this.delete(wsKey);
  }

  // =========================================================================
  // 2. Learning Topics & Curriculum
  // =========================================================================

  public async createTopic(topic: LearningTopicEntity): Promise<LearningTopicEntity> {
    const validated = LearningTopicSchema.parse(topic);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record("learning_topics", $id) CONTENT $content;`,
          { id: idKey, content: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.topicStore.set(idKey, validated);

    // Relate workspace to topic
    await this.relateWorkspaceToTopic(validated.workspaceId, idKey);

    return validated;
  }

  public async getTopic(id: string): Promise<LearningTopicEntity | null> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    const mem = this.topicStore.get(idKey);
    return mem ? LearningTopicSchema.parse(mem) : null;
  }

  public async listTopicsByWorkspace(workspaceId: string): Promise<LearningTopicEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: LearningTopicEntity[] = [];
    for (const t of this.topicStore.values()) {
      if (t.workspaceId === wsKey || t.workspaceId === workspaceId) {
        list.push(t);
      }
    }
    return list.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  public async updateTopic(
    id: string,
    patch: Partial<LearningTopicEntity>
  ): Promise<LearningTopicEntity> {
    const existing = await this.getTopic(id);
    if (!existing) {
      throw new Error(`Topic "${id}" not found`);
    }
    const merged = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
    const validated = LearningTopicSchema.parse(merged);
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    this.topicStore.set(idKey, validated);
    return validated;
  }

  // =========================================================================
  // 3. SurrealDB Graph Relationships for Concepts
  // =========================================================================

  public async relateWorkspaceToTopic(workspaceId: string, topicId: string): Promise<GraphEdge> {
    const wsId = workspaceId.includes(':') ? workspaceId : `knowledge_workspaces:${workspaceId}`;
    const tId = topicId.includes(':') ? topicId : `learning_topics:${topicId}`;

    this.addEdge(wsId, 'workspace_has_topic', tId);
    return this.graphRepo.relate(wsId, 'workspace_has_topic', tId);
  }

  public async relateWorkspaceToSource(workspaceId: string, source: KnowledgeSourceEntity): Promise<KnowledgeSourceEntity> {
    const validated = KnowledgeSourceSchema.parse(source);
    const srcKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;
    this.sourceStore.set(srcKey, validated);

    const wsId = workspaceId.includes(':') ? workspaceId : `knowledge_workspaces:${workspaceId}`;
    const sId = `knowledge_sources:${srcKey}`;

    this.addEdge(wsId, 'workspace_has_source', sId);
    await this.graphRepo.relate(wsId, 'workspace_has_source', sId);
    return validated;
  }

  public async listSourcesByWorkspace(workspaceId: string): Promise<KnowledgeSourceEntity[]> {
    const wsId = workspaceId.includes(':') ? workspaceId : `knowledge_workspaces:${workspaceId}`;
    const edgeTargets = this.getEdges(wsId, 'workspace_has_source');
    const sources: KnowledgeSourceEntity[] = [];

    for (const target of edgeTargets) {
      const srcKey = target.replace('knowledge_sources:', '');
      const src = this.sourceStore.get(srcKey);
      if (src) sources.push(src);
    }

    return sources;
  }

  /**
   * Connects two concepts via directional SurrealDB graph edge.
   * Example:
   * Rust -> ownership -> borrowing -> lifetimes -> traits -> async -> tokio
   */
  public async connectConcepts(
    workspaceId: string,
    fromConcept: string,
    toConcept: string,
    relationType: 'prerequisite_of' | 'builds_on' | 'relates_to' | 'extends' | 'applied_in',
    description?: string
  ): Promise<ConceptRelationshipEntity> {
    const relationship: ConceptRelationshipEntity = {
      id: `rel_${fromConcept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_to_${toConcept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      workspaceId,
      fromConcept,
      toConcept,
      relationType,
      description,
      createdAt: new Date().toISOString(),
    };

    const validated = ConceptRelationshipSchema.parse(relationship);
    this.relationshipStore.set(validated.id, validated);

    // Relate in SurrealDB graph and in-memory edge store
    const fromId = `concept:${fromConcept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const toId = `concept:${toConcept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    this.addEdge(fromId, 'concept_relates_to', toId);
    await this.graphRepo.relate(fromId, 'concept_relates_to', toId, {
      workspaceId,
      relationType,
      description: description || '',
    });

    return validated;
  }

  public async listConceptRelationships(workspaceId: string): Promise<ConceptRelationshipEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: ConceptRelationshipEntity[] = [];
    for (const r of this.relationshipStore.values()) {
      if (r.workspaceId === wsKey || r.workspaceId === workspaceId) {
        list.push(r);
      }
    }
    return list;
  }

  /**
   * Connects a concept to a user local project.
   */
  public async connectConceptToProject(
    workspaceId: string,
    conceptName: string,
    projectId: string,
    usageNote?: string
  ): Promise<void> {
    const conceptId = `concept:${conceptName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const projId = `workspace:${projectId}`;

    this.addEdge(conceptId, 'applied_in_project', projId);
    await this.graphRepo.relate(conceptId, 'applied_in_project', projId, {
      workspaceId,
      usageNote: usageNote || '',
    });
  }

  // =========================================================================
  // 4. Learning Progress Tracking
  // =========================================================================

  public async upsertProgress(progress: LearningProgressEntity): Promise<LearningProgressEntity> {
    const validated = LearningProgressSchema.parse(progress);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;

    if (this.client.isConnected()) {
      try {
        await this.client.query(
          `UPSERT type::record("learning_progress", $id) CONTENT $content;`,
          { id: idKey, content: validated }
        );
      } catch {
        // Fallback
      }
    }

    this.progressStore.set(idKey, validated);
    await this.refreshWorkspaceStats(validated.workspaceId);
    return validated;
  }

  public async getProgress(workspaceId: string, conceptName: string): Promise<LearningProgressEntity | null> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const targetName = conceptName.toLowerCase();

    for (const p of this.progressStore.values()) {
      if ((p.workspaceId === wsKey || p.workspaceId === workspaceId) && p.conceptName.toLowerCase() === targetName) {
        return p;
      }
    }
    return null;
  }

  public async listProgressByWorkspace(workspaceId: string): Promise<LearningProgressEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: LearningProgressEntity[] = [];
    for (const p of this.progressStore.values()) {
      if (p.workspaceId === wsKey || p.workspaceId === workspaceId) {
        list.push(p);
      }
    }
    return list;
  }

  public async getUnderstoodConcepts(workspaceId: string): Promise<LearningProgressEntity[]> {
    const all = await this.listProgressByWorkspace(workspaceId);
    return all.filter((p) => p.masteryLevel === 'understood' || p.masteryLevel === 'mastered');
  }

  public async getInProgressConcepts(workspaceId: string): Promise<LearningProgressEntity[]> {
    const all = await this.listProgressByWorkspace(workspaceId);
    return all.filter((p) => p.masteryLevel === 'in_progress');
  }

  private async refreshWorkspaceStats(workspaceId: string): Promise<void> {
    const ws = await this.getWorkspace(workspaceId);
    if (!ws) return;

    const progress = await this.listProgressByWorkspace(workspaceId);
    const questions = await this.listQuestionsByWorkspace(workspaceId);
    const tasks = await this.listPracticeTasksByWorkspace(workspaceId);

    const understoodCount = progress.filter((p) => p.masteryLevel === 'understood').length;
    const masteredCount = progress.filter((p) => p.masteryLevel === 'mastered').length;
    const openQuestions = questions.filter((q) => q.status === 'open' || q.status === 'investigating').length;

    await this.update(ws.id, {
      stats: {
        totalConcepts: progress.length,
        understoodConcepts: understoodCount,
        masteredConcepts: masteredCount,
        openQuestionsCount: openQuestions,
        practiceTasksCount: tasks.length,
      },
      updatedAt: new Date().toISOString(),
    });
  }

  // =========================================================================
  // 5. Questions Tracking
  // =========================================================================

  public async createQuestion(question: LearningQuestionEntity): Promise<LearningQuestionEntity> {
    const validated = LearningQuestionSchema.parse(question);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;
    this.questionStore.set(idKey, validated);
    await this.refreshWorkspaceStats(validated.workspaceId);
    return validated;
  }

  public async listQuestionsByWorkspace(workspaceId: string): Promise<LearningQuestionEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: LearningQuestionEntity[] = [];
    for (const q of this.questionStore.values()) {
      if (q.workspaceId === wsKey || q.workspaceId === workspaceId) {
        list.push(q);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateQuestion(
    id: string,
    patch: Partial<LearningQuestionEntity>
  ): Promise<LearningQuestionEntity> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    const existing = this.questionStore.get(idKey);
    if (!existing) {
      throw new Error(`Question "${id}" not found`);
    }

    const merged = {
      ...existing,
      ...patch,
      id: existing.id,
      updatedAt: new Date().toISOString(),
      resolvedAt: patch.status === 'answered' && !patch.resolvedAt ? new Date().toISOString() : existing.resolvedAt,
    };
    const validated = LearningQuestionSchema.parse(merged);
    this.questionStore.set(idKey, validated);
    await this.refreshWorkspaceStats(validated.workspaceId);
    return validated;
  }

  // =========================================================================
  // 6. Discoveries Tracking
  // =========================================================================

  public async createDiscovery(discovery: LearningDiscoveryEntity): Promise<LearningDiscoveryEntity> {
    const validated = LearningDiscoverySchema.parse(discovery);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;
    this.discoveryStore.set(idKey, validated);
    return validated;
  }

  public async listDiscoveriesByWorkspace(workspaceId: string): Promise<LearningDiscoveryEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: LearningDiscoveryEntity[] = [];
    for (const d of this.discoveryStore.values()) {
      if (d.workspaceId === wsKey || d.workspaceId === workspaceId) {
        list.push(d);
      }
    }
    return list.sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime());
  }

  // =========================================================================
  // 7. Practice Tasks
  // =========================================================================

  public async createPracticeTask(task: PracticeTaskEntity): Promise<PracticeTaskEntity> {
    const validated = PracticeTaskSchema.parse(task);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;
    this.taskStore.set(idKey, validated);
    await this.refreshWorkspaceStats(validated.workspaceId);
    return validated;
  }

  public async getPracticeTask(id: string): Promise<PracticeTaskEntity | null> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    const item = this.taskStore.get(idKey);
    return item ? PracticeTaskSchema.parse(item) : null;
  }

  public async listPracticeTasksByWorkspace(workspaceId: string): Promise<PracticeTaskEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: PracticeTaskEntity[] = [];
    for (const t of this.taskStore.values()) {
      if (t.workspaceId === wsKey || t.workspaceId === workspaceId) {
        list.push(t);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updatePracticeTask(
    id: string,
    patch: Partial<PracticeTaskEntity>
  ): Promise<PracticeTaskEntity> {
    const idKey = (id.includes(':') ? id.split(':')[1] : id) || id;
    const existing = this.taskStore.get(idKey);
    if (!existing) {
      throw new Error(`Practice task "${id}" not found`);
    }

    const merged = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
    const validated = PracticeTaskSchema.parse(merged);
    this.taskStore.set(idKey, validated);
    return validated;
  }

  // =========================================================================
  // 8. Learning Sessions
  // =========================================================================

  public async createSession(session: LearningSessionEntity): Promise<LearningSessionEntity> {
    const validated = LearningSessionSchema.parse(session);
    const idKey = (validated.id.includes(':') ? validated.id.split(':')[1] : validated.id) || validated.id;
    this.sessionStore.set(idKey, validated);
    return validated;
  }

  public async listSessionsByWorkspace(workspaceId: string): Promise<LearningSessionEntity[]> {
    const wsKey = workspaceId.includes(':') ? workspaceId.split(':')[1] || workspaceId : workspaceId;
    const list: LearningSessionEntity[] = [];
    for (const s of this.sessionStore.values()) {
      if (s.workspaceId === wsKey || s.workspaceId === workspaceId) {
        list.push(s);
      }
    }
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // =========================================================================
  // 9. Full Aggregated Workspace View
  // =========================================================================

  public async getCompleteWorkspaceView(workspaceId: string): Promise<CompleteWorkspaceView | null> {
    const ws = await this.getWorkspace(workspaceId);
    if (!ws) return null;

    const [topics, progress, relationships, sources, questions, discoveries, practiceTasks] =
      await Promise.all([
        this.listTopicsByWorkspace(workspaceId),
        this.listProgressByWorkspace(workspaceId),
        this.listConceptRelationships(workspaceId),
        this.listSourcesByWorkspace(workspaceId),
        this.listQuestionsByWorkspace(workspaceId),
        this.listDiscoveriesByWorkspace(workspaceId),
        this.listPracticeTasksByWorkspace(workspaceId),
      ]);

    const conceptChain: ConceptGraphEdgeView[] = relationships.map((r) => ({
      from: r.fromConcept,
      to: r.toConcept,
      relationType: r.relationType,
      description: r.description,
    }));

    return {
      workspace: ws,
      topics,
      progress,
      conceptChain,
      sources,
      questions,
      discoveries,
      practiceTasks,
    };
  }
}
