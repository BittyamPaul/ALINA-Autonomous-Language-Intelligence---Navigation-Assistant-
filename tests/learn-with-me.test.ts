import { describe, it, expect, beforeEach } from 'vitest';
import { AlinaDatabaseClient, LearnWithMeRepository } from '@alina/database';
import { LearnWithMeService } from '@alina/agent';

describe('ALINA "Learn With Me" Collaborative Learning System', () => {
  let dbClient: AlinaDatabaseClient;
  let repo: LearnWithMeRepository;
  let service: LearnWithMeService;

  beforeEach(() => {
    dbClient = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:59999/rpc',
      namespace: 'alina',
      database: 'main',
    });
    repo = new LearnWithMeRepository(dbClient);
    service = new LearnWithMeService(dbClient, repo);
  });

  describe('1. Knowledge Workspace & Official Documentation Ingestion', () => {
    it('creates a structured knowledge workspace from official documentation', async () => {
      const result = await service.startLearningSubject({
        subject: 'Rust',
        workspaceName: 'Rust Systems Mastery',
        projectId: 'alina-desktop',
      });

      expect(result.workspace).toBeDefined();
      expect(result.workspace.subject).toBe('Rust');
      expect(result.workspace.status).toBe('active');
      expect(result.workspace.linkedProjectId).toBe('alina-desktop');

      // Sources must include official documentation
      expect(result.sources.length).toBeGreaterThanOrEqual(2);
      const bookSource = result.sources.find((s) => s.domain === 'doc.rust-lang.org');
      expect(bookSource).toBeDefined();
      expect(bookSource?.reliabilityScore).toBeGreaterThanOrEqual(0.98);

      // Topics must be organized into curriculum
      expect(result.topics.length).toBeGreaterThanOrEqual(5);
      expect(result.topics.some((t) => t.name.includes('Ownership'))).toBe(true);
      expect(result.topics.some((t) => t.name.includes('Borrowing'))).toBe(true);
      expect(result.topics.some((t) => t.name.includes('Lifetimes'))).toBe(true);
    });
  });

  describe('2. SurrealDB Graph Relationships for Concepts', () => {
    it('models the exact concept chain in SurrealDB graph edges', async () => {
      const { workspace, conceptRelationships } = await service.startLearningSubject({
        subject: 'Rust',
      });

      // Chain requirement: Rust -> ownership -> borrowing -> lifetimes -> traits -> async -> tokio
      expect(conceptRelationships.length).toBeGreaterThanOrEqual(6);

      const rustToOwnership = conceptRelationships.find(
        (r) => r.fromConcept === 'Rust' && r.toConcept === 'ownership'
      );
      expect(rustToOwnership).toBeDefined();
      expect(rustToOwnership?.relationType).toBe('prerequisite_of');

      const ownershipToBorrowing = conceptRelationships.find(
        (r) => r.fromConcept === 'ownership' && r.toConcept === 'borrowing'
      );
      expect(ownershipToBorrowing).toBeDefined();
      expect(ownershipToBorrowing?.relationType).toBe('builds_on');

      const borrowingToLifetimes = conceptRelationships.find(
        (r) => r.fromConcept === 'borrowing' && r.toConcept === 'lifetimes'
      );
      expect(borrowingToLifetimes).toBeDefined();
      expect(borrowingToLifetimes?.relationType).toBe('builds_on');

      const lifetimesToTraits = conceptRelationships.find(
        (r) => r.fromConcept === 'lifetimes' && r.toConcept === 'traits'
      );
      expect(lifetimesToTraits).toBeDefined();

      const traitsToAsync = conceptRelationships.find(
        (r) => r.fromConcept === 'traits' && r.toConcept === 'async'
      );
      expect(traitsToAsync).toBeDefined();

      const asyncToTokio = conceptRelationships.find(
        (r) => r.fromConcept === 'async' && r.toConcept === 'tokio'
      );
      expect(asyncToTokio).toBeDefined();
      expect(asyncToTokio?.relationType).toBe('extends');

      // Verify repository view returns complete graph chain
      const view = await repo.getCompleteWorkspaceView(workspace.id);
      expect(view?.conceptChain.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('3. Avoiding Repeated Teaching of Already-Understood Concepts', () => {
    it('retrieves learning context and explicitly instructs agent to avoid repeating understood concepts', async () => {
      const { workspace } = await service.startLearningSubject({
        subject: 'Rust',
        initialUnderstoodConcepts: ['ownership', 'borrowing'],
      });

      // Retrieve learning context before answering
      const context = await service.getLearningContext(workspace.id);

      expect(context.understoodConcepts.length).toBe(2);
      expect(context.understoodConcepts.some((c) => c.conceptName === 'ownership')).toBe(true);
      expect(context.understoodConcepts.some((c) => c.conceptName === 'borrowing')).toBe(true);

      // Verify prompt injection strictly instructs NOT to repeat understood definitions
      expect(context.promptInjection).toContain('DO NOT explain them from scratch');
      expect(context.promptInjection).toContain('ownership');
      expect(context.promptInjection).toContain('borrowing');

      // Now answer an inquiry with pre-flight context
      const response = await service.answerInquiry(
        workspace.id,
        'How do lifetimes connect to what we learned?'
      );

      // Verify that the answer used the context and noted avoided concepts
      expect(response.contextUsed.avoidedRetrackingConcepts).toContain('ownership');
      expect(response.answer).toBeDefined();
    });

    it('advances concept progression when user confirms understanding', async () => {
      const { workspace } = await service.startLearningSubject({
        subject: 'Rust',
      });

      // User says they understand borrowing
      const result = await service.answerInquiry(
        workspace.id,
        'I understand borrowing and references now, that makes sense.'
      );

      expect(result.updatedProgress.length).toBeGreaterThan(0);
      const borrowingProg = result.updatedProgress.find((p) => p.conceptName.toLowerCase() === 'borrowing');
      expect(borrowingProg?.masteryLevel).toBe('understood');

      // Verify that subsequent context flags borrowing as already understood
      const nextContext = await service.getLearningContext(workspace.id);
      expect(nextContext.understoodConcepts.some((c) => c.conceptName.toLowerCase() === 'borrowing')).toBe(true);
    });
  });

  describe('4. Connecting Knowledge to User Projects', () => {
    it('connects learned concepts to the local project workspace', async () => {
      const { workspace } = await service.startLearningSubject({
        subject: 'Rust',
        projectId: 'alina-desktop',
      });

      const context = await service.getLearningContext(workspace.id);
      expect(context.promptInjection).toContain('LOCAL PROJECT CONTEXT: Connected to "alina-desktop"');

      // Verify response references the connected project
      const response = await service.answerInquiry(workspace.id, 'Tell me about tokio');
      expect(response.answer).toContain('alina-desktop');
    });
  });

  describe('5. Tracking Questions & Discoveries', () => {
    it('captures open questions and records collaborative discoveries', async () => {
      const { workspace } = await service.startLearningSubject({ subject: 'Rust' });

      // 1. User asks a new question
      const questionRes = await service.answerInquiry(
        workspace.id,
        'Why do struct fields holding references require explicit lifetime annotations?'
      );

      expect(questionRes.newQuestions.length).toBe(1);
      expect(questionRes.newQuestions[0]?.question).toContain('lifetime annotations');
      expect(questionRes.newQuestions[0]?.status).toBe('open');

      // 2. Resolve the question
      const resolved = await repo.updateQuestion(questionRes.newQuestions[0]!.id, {
        status: 'answered',
        answer: 'Because the compiler needs to verify the struct does not outlive the referenced data.',
      });
      expect(resolved.status).toBe('answered');
      expect(resolved.resolvedAt).toBeDefined();

      // 3. Add a new discovery
      const discovery = await repo.createDiscovery({
        id: 'disc-rpitit-test',
        workspaceId: workspace.id,
        discovery: 'RPITIT allows traits to return impl Trait without heap allocation',
        connectedConcept: 'traits',
        discoveredAt: new Date().toISOString(),
      });
      expect(discovery.discovery).toContain('RPITIT');

      const allDiscoveries = await repo.listDiscoveriesByWorkspace(workspace.id);
      expect(allDiscoveries.some((d) => d.id === 'disc-rpitit-test')).toBe(true);
    });
  });

  describe('6. Interactive Practice Tasks & Verification', () => {
    it('creates and evaluates interactive practice tasks', async () => {
      const { workspace } = await service.startLearningSubject({ subject: 'Rust' });

      // Generate task
      const task = await service.createPracticeTask(workspace.id);
      expect(task.title).toBeDefined();
      expect(task.evaluationCriteria.length).toBeGreaterThan(0);
      expect(task.status).toBe('pending');

      // Submit valid solution
      const submission = await service.evaluatePracticeSubmission(
        task.id,
        'pub fn process_record(mut data: String) -> String { data.insert_str(0, "[PROCESSED] "); data }'
      );

      expect(submission.passed).toBe(true);
      expect(submission.score).toBe(1.0);
      expect(submission.task.status).toBe('completed');
    });
  });

  describe('7. Complete Cascading Workspace Deletion', () => {
    it('allows the user to completely delete the knowledge workspace and all associated data', async () => {
      const { workspace } = await service.startLearningSubject({
        subject: 'Rust',
        workspaceName: 'Temporary Rust Workspace',
      });

      // Add a practice task and a discovery to ensure cascading cleanup
      await service.createPracticeTask(workspace.id);
      await repo.createDiscovery({
        id: 'temp-disc',
        workspaceId: workspace.id,
        discovery: 'Temporary discovery note',
        discoveredAt: new Date().toISOString(),
      });

      // Verify items exist prior to deletion
      const preView = await repo.getCompleteWorkspaceView(workspace.id);
      expect(preView).not.toBeNull();
      expect(preView?.topics.length).toBeGreaterThan(0);
      expect(preView?.progress.length).toBeGreaterThan(0);
      expect(preView?.conceptChain.length).toBeGreaterThan(0);

      // Perform complete cascading deletion
      await service.deleteWorkspace(workspace.id);

      // Verify workspace and all associated child items are purged
      const postWorkspace = await repo.getWorkspace(workspace.id);
      expect(postWorkspace).toBeNull();

      const postTopics = await repo.listTopicsByWorkspace(workspace.id);
      expect(postTopics.length).toBe(0);

      const postProgress = await repo.listProgressByWorkspace(workspace.id);
      expect(postProgress.length).toBe(0);

      const postRelationships = await repo.listConceptRelationships(workspace.id);
      expect(postRelationships.length).toBe(0);

      const postQuestions = await repo.listQuestionsByWorkspace(workspace.id);
      expect(postQuestions.length).toBe(0);

      const postDiscoveries = await repo.listDiscoveriesByWorkspace(workspace.id);
      expect(postDiscoveries.length).toBe(0);

      const postTasks = await repo.listPracticeTasksByWorkspace(workspace.id);
      expect(postTasks.length).toBe(0);

      const postView = await repo.getCompleteWorkspaceView(workspace.id);
      expect(postView).toBeNull();
    });
  });
});
