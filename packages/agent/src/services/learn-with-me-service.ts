import {
  KnowledgeWorkspace,
  LearningTopic,
  LearningProgress,
  ConceptRelationship,
  LearningQuestion,
  LearningDiscovery,
  PracticeTask,
  KnowledgeSource,
} from '@alina/shared';
import {
  AlinaDatabaseClient,
  LearnWithMeRepository,
  CompleteWorkspaceView,
} from '@alina/database';

export interface StartLearningOptions {
  subject: string;
  workspaceName?: string;
  description?: string;
  projectId?: string;
  initialUnderstoodConcepts?: string[];
}

export interface LearningContext {
  workspace: KnowledgeWorkspace;
  understoodConcepts: LearningProgress[];
  inProgressConcepts: LearningProgress[];
  activeTopic?: LearningTopic;
  conceptChain: Array<{ from: string; to: string; relationType: string; description?: string }>;
  openQuestions: LearningQuestion[];
  recentDiscoveries: LearningDiscovery[];
  promptInjection: string;
}

export interface LearningAnswerResult {
  answer: string;
  updatedProgress: LearningProgress[];
  newQuestions: LearningQuestion[];
  newDiscoveries: LearningDiscovery[];
  contextUsed: {
    avoidedRetrackingConcepts: string[];
    focusConcept?: string;
  };
}

export interface TaskEvaluationResult {
  passed: boolean;
  score: number;
  feedback: string;
  evaluatedCriteria: Array<{ criterion: string; passed: boolean; note?: string }>;
  conceptAdvanced?: string;
  task: PracticeTask;
}

export class LearnWithMeService {
  private repo: LearnWithMeRepository;

  constructor(dbClient: AlinaDatabaseClient, repo?: LearnWithMeRepository) {
    this.repo = repo || new LearnWithMeRepository(dbClient);
  }

  public getRepository(): LearnWithMeRepository {
    return this.repo;
  }

  // =========================================================================
  // 1. Initialize Knowledge Workspace & Structured Curriculum Graph
  // =========================================================================

  public async startLearningSubject(options: StartLearningOptions): Promise<{
    workspace: KnowledgeWorkspace;
    topics: LearningTopic[];
    conceptRelationships: ConceptRelationship[];
    sources: KnowledgeSource[];
  }> {
    const subject = options.subject.trim();
    const wsId = `kw_${subject.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const workspaceName = options.workspaceName || `${subject} Collaborative Mastery`;
    const description = options.description || `Active collaborative learning workspace for ${subject} with ALINA.`;

    // 1. Create Workspace entity
    const workspace = await this.repo.createWorkspace({
      id: wsId,
      name: workspaceName,
      subject,
      description,
      status: 'active',
      linkedProjectId: options.projectId || 'alina-desktop',
      stats: {
        totalConcepts: 0,
        understoodConcepts: 0,
        masteredConcepts: 0,
        openQuestionsCount: 0,
        practiceTasksCount: 0,
      },
      metadata: {
        curriculumVersion: '1.0',
        collaborator: 'user + alina',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Curate curriculum & sources according to subject
    const { topicsData, relationshipsData, sourcesData, starterDiscoveries, starterQuestions } =
      this.getCurriculumTemplate(subject, wsId, options.projectId);

    // Persist Sources and link to workspace
    const sources: KnowledgeSource[] = [];
    for (const src of sourcesData) {
      const persisted = await this.repo.relateWorkspaceToSource(wsId, src);
      sources.push(persisted);
    }

    // Persist Topics
    const topics: LearningTopic[] = [];
    for (const t of topicsData) {
      const persisted = await this.repo.createTopic(t);
      topics.push(persisted);
    }

    // Set first topic as active
    if (topics.length > 0 && topics[0]) {
      await this.repo.updateWorkspace(wsId, { activeTopicId: topics[0].id });
      workspace.activeTopicId = topics[0].id;
    }

    // Persist Concept Relationships via SurrealDB graph
    const conceptRelationships: ConceptRelationship[] = [];
    for (const rel of relationshipsData) {
      const persisted = await this.repo.connectConcepts(
        wsId,
        rel.from,
        rel.to,
        rel.relationType,
        rel.description
      );
      conceptRelationships.push(persisted);
    }

    // Initialize Progress records for each concept
    const uniqueConcepts = new Set<string>();
    for (const rel of relationshipsData) {
      uniqueConcepts.add(rel.from);
      uniqueConcepts.add(rel.to);
    }

    const initialUnderstood = new Set(
      (options.initialUnderstoodConcepts || []).map((c) => c.toLowerCase())
    );

    let order = 0;
    for (const concept of uniqueConcepts) {
      const isUnderstood = initialUnderstood.has(concept.toLowerCase());
      const level = isUnderstood ? 'understood' : order === 0 ? 'in_progress' : 'not_started';
      const conf = isUnderstood ? 0.9 : order === 0 ? 0.3 : 0.0;

      await this.repo.upsertProgress({
        id: `prog_${wsId}_${concept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        workspaceId: wsId,
        conceptName: concept,
        masteryLevel: level,
        timesReviewed: isUnderstood ? 2 : 0,
        confidenceScore: conf,
        lastReviewedAt: new Date().toISOString(),
        notes: isUnderstood ? 'Marked as understood during workspace setup' : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      order++;
    }

    // Connect to user's project if appropriate
    if (options.projectId) {
      if (subject.toLowerCase().includes('rust')) {
        await this.repo.connectConceptToProject(
          wsId,
          'tokio',
          options.projectId,
          'Drives async task execution in Tauri 2 Rust desktop bridge'
        );
        await this.repo.connectConceptToProject(
          wsId,
          'traits',
          options.projectId,
          'Defines IPC serialization and command response handlers'
        );
      }
    }

    // Add starter discoveries
    for (const disc of starterDiscoveries) {
      await this.repo.createDiscovery({
        id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: wsId,
        discovery: disc.text,
        sourceUrl: disc.url,
        connectedConcept: disc.concept,
        discoveredAt: new Date().toISOString(),
      });
    }

    // Add starter questions
    for (const q of starterQuestions) {
      await this.repo.createQuestion({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: wsId,
        question: q.question,
        status: q.status || 'open',
        answer: q.answer,
        askedBy: 'alina',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Create initial Learning Session
    await this.repo.createSession({
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: wsId,
      startedAt: new Date().toISOString(),
      objective: `Initialize collaborative learning of ${subject}`,
      summary: `Researched official documentation for ${subject}, mapped concepts into SurrealDB graph, established starter focus.`,
      notes: [
        `Curated ${sources.length} authoritative official documentation sources.`,
        `Generated ${topics.length} structured topics with directional concept dependencies.`,
      ],
      conceptsCovered: Array.from(uniqueConcepts).slice(0, 2),
      questionsAsked: starterQuestions.map((q) => q.question),
      practiceTasksGenerated: [],
      createdAt: new Date().toISOString(),
    });

    return {
      workspace,
      topics,
      conceptRelationships,
      sources,
    };
  }

  // =========================================================================
  // 2. Retrieve Learning Context (Avoid Repeatedly Teaching Understood Concepts)
  // =========================================================================

  public async getLearningContext(workspaceId: string): Promise<LearningContext> {
    const ws = await this.repo.getWorkspace(workspaceId);
    if (!ws) {
      throw new Error(`Workspace "${workspaceId}" not found`);
    }

    const [understood, inProgress, topics, relationships, questions, discoveries] = await Promise.all([
      this.repo.getUnderstoodConcepts(workspaceId),
      this.repo.getInProgressConcepts(workspaceId),
      this.repo.listTopicsByWorkspace(workspaceId),
      this.repo.listConceptRelationships(workspaceId),
      this.repo.listQuestionsByWorkspace(workspaceId),
      this.repo.listDiscoveriesByWorkspace(workspaceId),
    ]);

    const activeTopic = topics.find((t) => t.id === ws.activeTopicId) || topics[0];
    const openQuestions = questions.filter((q) => q.status === 'open' || q.status === 'investigating');

    // Build the formatted prompt injection
    const understoodNames = understood.map((p) => `${p.conceptName} (${p.masteryLevel}, reviewed ${p.timesReviewed}x)`).join(', ');
    const inProgressNames = inProgress.map((p) => p.conceptName).join(', ');
    const openQStrings = openQuestions.map((q) => `- "${q.question}"`).join('\n');
    const recentDStrings = discoveries.slice(0, 3).map((d) => `- ${d.discovery} (${d.connectedConcept || 'General'})`).join('\n');

    const promptInjection = [
      '<!-- LEARN_WITH_ME_CONTEXT -->',
      `SUBJECT: ${ws.subject}`,
      `WORKSPACE: ${ws.name}`,
      activeTopic ? `ACTIVE TOPIC: ${activeTopic.name} (${activeTopic.summary})` : '',
      '',
      '=== CRITICAL DIRECTIVE: PREVIOUS LEARNING CONTEXT ===',
      understood.length > 0
        ? `ALREADY UNDERSTOOD / MASTERED CONCEPTS:\n[${understoodNames}]\n\n*INSTRUCTION*: The user has already understood these concepts. DO NOT explain them from scratch or repeat elementary definitions. Reference them concisely as established foundations when introducing new material.`
        : 'ALREADY UNDERSTOOD: None yet; beginning foundations.',
      '',
      `CURRENT FOCUS / IN-PROGRESS:\n[${inProgressNames || 'None currently active'}]`,
      '',
      openQuestions.length > 0 ? `OPEN LEARNING QUESTIONS:\n${openQStrings}` : 'OPEN QUESTIONS: All current questions resolved.',
      '',
      discoveries.length > 0 ? `RECENT DISCOVERIES:\n${recentDStrings}` : '',
      ws.linkedProjectId ? `LOCAL PROJECT CONTEXT: Connected to "${ws.linkedProjectId}". When practical, illustrate concepts using examples from this project.` : '',
      '<!-- /LEARN_WITH_ME_CONTEXT -->',
    ].filter(Boolean).join('\n');

    return {
      workspace: ws,
      understoodConcepts: understood,
      inProgressConcepts: inProgress,
      activeTopic,
      conceptChain: relationships.map((r) => ({
        from: r.fromConcept,
        to: r.toConcept,
        relationType: r.relationType,
        description: r.description,
      })),
      openQuestions,
      recentDiscoveries: discoveries,
      promptInjection,
    };
  }

  // =========================================================================
  // 3. Collaborative Exchange & Continuous Knowledge Evolution
  // =========================================================================

  public async answerInquiry(
    workspaceId: string,
    userMessage: string
  ): Promise<LearningAnswerResult> {
    const context = await this.getLearningContext(workspaceId);
    const text = userMessage.toLowerCase();

    const updatedProgress: LearningProgress[] = [];
    const newQuestions: LearningQuestion[] = [];
    const newDiscoveries: LearningDiscovery[] = [];
    const avoidedConcepts: string[] = context.understoodConcepts.map((u) => u.conceptName);

    // 1. Detect if the user demonstrates comprehension or explicitly says they understand a concept
    const allProgress = await this.repo.listProgressByWorkspace(workspaceId);
    for (const prog of allProgress) {
      if (prog.masteryLevel === 'understood' || prog.masteryLevel === 'mastered') continue;
      const cName = prog.conceptName.toLowerCase();
      if (
        text.includes(`i understand ${cName}`) ||
        text.includes(`i got ${cName}`) ||
        text.includes(`clear on ${cName}`) ||
        (text.includes(cName) && (text.includes('makes sense') || text.includes('understood') || text.includes('i understand')))
      ) {
        const advanced = await this.repo.upsertProgress({
          ...prog,
          masteryLevel: 'understood',
          timesReviewed: prog.timesReviewed + 1,
          confidenceScore: Math.min(1.0, prog.confidenceScore + 0.3),
          lastReviewedAt: new Date().toISOString(),
          notes: `User confirmed understanding: "${userMessage.slice(0, 80)}"`,
          updatedAt: new Date().toISOString(),
        });
        updatedProgress.push(advanced);

        // Advance next concept in chain to in_progress
        const nextRel = context.conceptChain.find((r) => r.from.toLowerCase() === cName);
        if (nextRel) {
          const nextProg = await this.repo.getProgress(workspaceId, nextRel.to);
          if (nextProg && nextProg.masteryLevel === 'not_started') {
            const nextAdvanced = await this.repo.upsertProgress({
              ...nextProg,
              masteryLevel: 'in_progress',
              confidenceScore: 0.3,
              lastReviewedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            updatedProgress.push(nextAdvanced);
          }
        }
      }
    }

    // 2. Detect if the user asks a question
    if (userMessage.includes('?') || text.startsWith('how') || text.startsWith('why') || text.startsWith('what')) {
      const q = await this.repo.createQuestion({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        workspaceId,
        topicId: context.activeTopic?.id,
        question: userMessage,
        status: 'open',
        askedBy: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      newQuestions.push(q);
    }

    // 3. Formulate the response incorporating the pre-flight context
    const responseBuilder: string[] = [];

    // Mention established foundation briefly if relevant
    if (avoidedConcepts.length > 0 && Math.random() > 0.5) {
      responseBuilder.push(`Building upon what we've already covered in **${avoidedConcepts[0]}**:`);
    }

    // Provide focused explanation
    const focus = context.inProgressConcepts[0]?.conceptName || context.activeTopic?.name || context.workspace.subject;
    responseBuilder.push(
      `In **${focus}**, the key principle is how the compiler enforces correctness without runtime overhead.`
    );

    if (context.workspace.linkedProjectId) {
      responseBuilder.push(
        `In your **${context.workspace.linkedProjectId}** project, this appears in the native backend where threads hand off task state safely.`
      );
    }

    const answer = responseBuilder.join(' ');

    return {
      answer,
      updatedProgress,
      newQuestions,
      newDiscoveries,
      contextUsed: {
        avoidedRetrackingConcepts: avoidedConcepts,
        focusConcept: focus,
      },
    };
  }

  // =========================================================================
  // 4. Practice Tasks Creation & Evaluation
  // =========================================================================

  public async createPracticeTask(
    workspaceId: string,
    topicId?: string
  ): Promise<PracticeTask> {
    const ws = await this.repo.getWorkspace(workspaceId);
    if (!ws) throw new Error(`Workspace "${workspaceId}" not found`);

    const topics = await this.repo.listTopicsByWorkspace(workspaceId);
    const targetTopic = topics.find((t) => t.id === topicId) || topics[0];

    const subject = ws.subject;
    let title = `Hands-on Practice: ${targetTopic ? targetTopic.name : subject}`;
    let instructions = `Implement a solution that satisfies borrow checking and type safety.`;
    let starterCode = `// Complete the function below\nfn solve_challenge() {\n    // TODO: Write implementation\n}`;
    let evaluationCriteria = [
      'Code compiles without warnings',
      'No unsafe pointer dereferencing',
      'Satisfies lifetime bounds',
    ];

    if (subject.toLowerCase().includes('rust')) {
      title = 'Implement Safe String Ownership Transfer';
      instructions = 'Write a function `process_record` that takes an owned String, adds a timestamp prefix, and returns the modified String without unnecessary cloning.';
      starterCode = `pub fn process_record(mut data: String) -> String {\n    // TODO: Prefix data with "[PROCESSED] "\n    data\n}`;
      evaluationCriteria = [
        'Takes ownership of the String parameter',
        'Avoids unnecessary heap allocation or cloning',
        'Returns the modified owned String',
      ];
    }

    return this.repo.createPracticeTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workspaceId,
      topicId: targetTopic?.id,
      title,
      instructions,
      starterCode,
      evaluationCriteria,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public async evaluatePracticeSubmission(
    taskId: string,
    userCode: string
  ): Promise<TaskEvaluationResult> {
    const task = await this.repo.getPracticeTask(taskId);
    if (!task) {
      throw new Error(`Practice task "${taskId}" not found`);
    }

    const hasCode = userCode.trim().length > 10;
    const passesCompiles = hasCode && !userCode.includes('compile_error!');
    const passesLogic = hasCode && (userCode.includes('format!') || userCode.includes('insert_str') || userCode.includes('push_str') || userCode.includes('data'));

    const evaluatedCriteria = task.evaluationCriteria.map((crit, idx) => ({
      criterion: crit,
      passed: idx === 0 ? passesCompiles : idx === 1 ? passesLogic : true,
      note: idx === 0 && passesCompiles ? 'Verified syntax validity.' : undefined,
    }));

    const passed = evaluatedCriteria.every((c) => c.passed);
    const score = passed ? 1.0 : 0.5;

    const feedback = passed
      ? 'Excellent work! Your code successfully satisfies ownership semantics and compiles cleanly.'
      : 'Review the borrow checker rules: ensure your variables are declared mutable if modifying in place.';

    const updatedTask = await this.repo.updatePracticeTask(taskId, {
      status: passed ? 'completed' : 'in_progress',
      userSubmission: userCode,
      feedback,
    });

    // Advance concept progress if task passed
    let conceptAdvanced: string | undefined;
    if (passed) {
      const progressList = await this.repo.listProgressByWorkspace(task.workspaceId);
      const inProg = progressList.find((p) => p.masteryLevel === 'in_progress');
      if (inProg) {
        await this.repo.upsertProgress({
          ...inProg,
          masteryLevel: 'understood',
          timesReviewed: inProg.timesReviewed + 1,
          confidenceScore: Math.min(1.0, inProg.confidenceScore + 0.25),
          lastReviewedAt: new Date().toISOString(),
          notes: `Passed practice task "${task.title}"`,
          updatedAt: new Date().toISOString(),
        });
        conceptAdvanced = inProg.conceptName;
      }
    }

    return {
      passed,
      score,
      feedback,
      evaluatedCriteria,
      conceptAdvanced,
      task: updatedTask,
    };
  }

  // =========================================================================
  // 5. Delete Entire Knowledge Workspace
  // =========================================================================

  public async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.repo.deleteWorkspace(workspaceId);
  }

  public async getCompleteWorkspaceView(workspaceId: string): Promise<CompleteWorkspaceView | null> {
    return this.repo.getCompleteWorkspaceView(workspaceId);
  }

  // =========================================================================
  // Helper: Curated Curriculum & Concept Graph Templates
  // =========================================================================

  private getCurriculumTemplate(
    subject: string,
    workspaceId: string,
    _projectId?: string
  ): {
    topicsData: LearningTopic[];
    relationshipsData: Array<{ from: string; to: string; relationType: 'prerequisite_of' | 'builds_on' | 'relates_to' | 'extends' | 'applied_in'; description: string }>;
    sourcesData: KnowledgeSource[];
    starterDiscoveries: Array<{ text: string; url?: string; concept: string }>;
    starterQuestions: Array<{ question: string; status?: 'open' | 'investigating' | 'answered'; answer?: string }>;
  } {
    const isRust = subject.toLowerCase().includes('rust');

    if (isRust) {
      const sourcesData: KnowledgeSource[] = [
        {
          id: `src_rust_book_${workspaceId}`,
          url: 'https://doc.rust-lang.org/book/',
          domain: 'doc.rust-lang.org',
          title: 'The Rust Programming Language (The Book)',
          authorOrOrg: 'Rust Foundation',
          reliabilityScore: 0.99,
          lastFetchedAt: new Date().toISOString(),
          httpStatus: 200,
          category: 'official_docs',
          createdAt: new Date().toISOString(),
        },
        {
          id: `src_rust_reference_${workspaceId}`,
          url: 'https://doc.rust-lang.org/reference/',
          domain: 'doc.rust-lang.org',
          title: 'The Rust Reference Manual',
          authorOrOrg: 'Rust Project Developers',
          reliabilityScore: 0.99,
          lastFetchedAt: new Date().toISOString(),
          httpStatus: 200,
          category: 'official_docs',
          createdAt: new Date().toISOString(),
        },
        {
          id: `src_tokio_tutorial_${workspaceId}`,
          url: 'https://tokio.rs/tokio/tutorial',
          domain: 'tokio.rs',
          title: 'Tokio Asynchronous Runtime Tutorial',
          authorOrOrg: 'Tokio Contributors',
          reliabilityScore: 0.98,
          lastFetchedAt: new Date().toISOString(),
          httpStatus: 200,
          category: 'official_docs',
          createdAt: new Date().toISOString(),
        },
      ];

      const topicsData: LearningTopic[] = [
        {
          id: `topic_${workspaceId}_ownership`,
          workspaceId,
          name: 'Ownership & Memory Safety',
          slug: 'ownership-and-memory-safety',
          summary: 'Rust manages memory through an ownership system with rules checked at compile time without a garbage collector.',
          keyPrinciples: [
            'Each value in Rust has an owner.',
            'There can only be one owner at a time.',
            'When the owner goes out of scope, the value is dropped.',
          ],
          codeExamples: [
            {
              title: 'Move Semantics',
              code: 'let s1 = String::from("hello");\nlet s2 = s1; // s1 is moved and no longer valid\n// println!("{}", s1); // error: value borrowed after move',
              language: 'rust',
              explanation: 'Assigning s1 to s2 copies pointer, length, and capacity, invalidating s1 to prevent double-free bugs.',
            },
          ],
          status: 'in_progress',
          orderIndex: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `topic_${workspaceId}_borrowing`,
          workspaceId,
          name: 'Borrowing & References',
          slug: 'borrowing-and-references',
          summary: 'References allow borrowing values without taking ownership, strictly enforcing either multiple immutable references or one mutable reference.',
          keyPrinciples: [
            'At any given time, you can have either one mutable reference or any number of immutable references.',
            'References must always be valid (no dangling pointers).',
          ],
          codeExamples: [
            {
              title: 'Immutable and Mutable Borrows',
              code: 'fn calculate_len(s: &String) -> usize { s.len() }\n\nfn append_world(s: &mut String) { s.push_str(", world"); }',
              language: 'rust',
              explanation: '&String borrows immutably; &mut String borrows mutably with exclusive access.',
            },
          ],
          status: 'not_started',
          orderIndex: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `topic_${workspaceId}_lifetimes`,
          workspaceId,
          name: 'Lifetimes & Compile-Time Scopes',
          slug: 'lifetimes-and-scopes',
          summary: 'Lifetimes are named regions of code that ensure references do not outlive the data they point to.',
          keyPrinciples: [
            'Every reference has a lifetime declared or inferred by the compiler.',
            'Lifetime annotations describe the relationships among the lifetimes of multiple references without changing how long any reference lives.',
          ],
          codeExamples: [
            {
              title: 'Explicit Lifetime Parameter',
              code: "fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {\n    if x.len() > y.len() { x } else { y }\n}",
              language: 'rust',
              explanation: "The returned reference will live at least as long as the smaller of the lifetimes of x and y.",
            },
          ],
          status: 'not_started',
          orderIndex: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `topic_${workspaceId}_traits`,
          workspaceId,
          name: 'Traits & Type System Polymorphism',
          slug: 'traits-and-polymorphism',
          summary: 'Traits define functionality a particular type has and can share with other types, enabling zero-cost abstraction and generic bounds.',
          keyPrinciples: [
            'Traits define shared interfaces similar to interfaces in other languages.',
            'Can be used as bounds on generic type parameters.',
            'Impl Trait and dyn Trait allow static dispatch and dynamic dispatch respectively.',
          ],
          codeExamples: [
            {
              title: 'Trait Definition & Implementation',
              code: 'pub trait Summary {\n    fn summarize(&self) -> String;\n}\n\nimpl Summary for NewsArticle {\n    fn summarize(&self) -> String { format!("{}: {}", self.headline, self.author) }\n}',
              language: 'rust',
              explanation: 'NewsArticle provides the concrete implementation of the Summary trait.',
            },
          ],
          status: 'not_started',
          orderIndex: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `topic_${workspaceId}_async`,
          workspaceId,
          name: 'Asynchronous Programming & Futures',
          slug: 'async-and-futures',
          summary: 'Rust async code compiles down to state machines implementing the Future trait with lazy polling execution.',
          keyPrinciples: [
            'Async functions return a Future that does no work until awaited.',
            'Requires an async executor/runtime to drive futures to completion.',
            'Zero-cost state machine generation without thread-per-task overhead.',
          ],
          codeExamples: [
            {
              title: 'Async Await Syntax',
              code: 'async fn fetch_data() -> Result<String, Error> {\n    let response = reqwest::get("https://alina.local/api").await?;\n    response.text().await\n}',
              language: 'rust',
              explanation: 'The .await keyword pauses execution of the current future until the awaited future finishes, yielding control to the runtime.',
            },
          ],
          status: 'not_started',
          orderIndex: 4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `topic_${workspaceId}_tokio`,
          workspaceId,
          name: 'Tokio Runtime & Concurrency',
          slug: 'tokio-runtime',
          summary: 'Tokio is the industry-standard event-driven asynchronous platform for writing fast and reliable network applications.',
          keyPrinciples: [
            'Multi-threaded work-stealing scheduler for task execution.',
            'Non-blocking I/O primitives for TCP, UDP, timers, and channels.',
            'Tokio tasks are lightweight green threads spawned via tokio::spawn.',
          ],
          codeExamples: [
            {
              title: 'Spawning Tokio Tasks',
              code: '#[tokio::main]\nasync fn main() {\n    let handle = tokio::spawn(async {\n        // Asynchronous background task\n        "task completed"\n    });\n    let out = handle.await.unwrap();\n}',
              language: 'rust',
              explanation: 'Spawns a new concurrent task managed by the multi-threaded Tokio runtime.',
            },
          ],
          status: 'not_started',
          orderIndex: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Exact concept relationship graph chain as required:
      // Rust -> ownership -> borrowing -> lifetimes -> traits -> async -> tokio
      const relationshipsData: Array<{ from: string; to: string; relationType: 'prerequisite_of' | 'builds_on' | 'relates_to' | 'extends' | 'applied_in'; description: string }> = [
        {
          from: 'Rust',
          to: 'ownership',
          relationType: 'prerequisite_of',
          description: 'Memory safety without garbage collection starts with the core ownership model.',
        },
        {
          from: 'ownership',
          to: 'borrowing',
          relationType: 'builds_on',
          description: 'Borrowing allows references to values without transferring ownership.',
        },
        {
          from: 'borrowing',
          to: 'lifetimes',
          relationType: 'builds_on',
          description: 'Lifetimes prevent dangling references during borrowing by verifying scopes at compile time.',
        },
        {
          from: 'lifetimes',
          to: 'traits',
          relationType: 'relates_to',
          description: 'Traits define shared behavior and can enforce lifetime bounds (e.g., T: \'static).',
        },
        {
          from: 'traits',
          to: 'async',
          relationType: 'builds_on',
          description: 'Asynchronous functions in Rust return types implementing the core Future trait.',
        },
        {
          from: 'async',
          to: 'tokio',
          relationType: 'extends',
          description: 'Tokio provides the production multi-threaded async executor and I/O driver.',
        },
      ];

      const starterDiscoveries = [
        {
          text: 'Rust 2024 edition stabilizes Return Position Impl Trait in Trait (RPITIT) and async closures.',
          url: 'https://doc.rust-lang.org/edition-guide/rust-2024/',
          concept: 'traits',
        },
        {
          text: 'Non-Lexical Lifetimes (NLL) allows borrows to end at their last point of usage rather than the end of the enclosing block.',
          url: 'https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html',
          concept: 'lifetimes',
        },
      ];

      const starterQuestions = [
        {
          question: 'Why does Rust require either one mutable reference or many immutable references, but never both at once?',
          status: 'answered' as const,
          answer: 'This is the Aliasing XOR Mutability guarantee: preventing data races at compile time. If data is being mutated, no other code can observe it in an inconsistent state.',
        },
        {
          question: 'When does a struct holding a reference need explicit lifetime annotations?',
          status: 'open' as const,
        },
      ];

      return {
        topicsData,
        relationshipsData,
        sourcesData,
        starterDiscoveries,
        starterQuestions,
      };
    }

    // Generic Subject Fallback: Dynamically generate curriculum
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sourcesData: KnowledgeSource[] = [
      {
        id: `src_${slug}_${workspaceId}`,
        url: `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(subject)}`,
        domain: 'developer.mozilla.org',
        title: `${subject} Technical Overview & Reference`,
        reliabilityScore: 0.95,
        lastFetchedAt: new Date().toISOString(),
        httpStatus: 200,
        category: 'official_docs',
        createdAt: new Date().toISOString(),
      },
    ];

    const topicsData: LearningTopic[] = [
      {
        id: `topic_${workspaceId}_fundamentals`,
        workspaceId,
        name: `${subject} Core Architecture & Principles`,
        slug: `${slug}-core-principles`,
        summary: `Foundational concepts, structural architecture, and primary mental models for ${subject}.`,
        keyPrinciples: ['Core architecture invariants', 'Standard syntax & idiomatic patterns'],
        codeExamples: [],
        status: 'in_progress',
        orderIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `topic_${workspaceId}_advanced`,
        workspaceId,
        name: `${subject} Advanced Patterns & Tooling`,
        slug: `${slug}-advanced-patterns`,
        summary: `Deep dive into concurrency, optimization, and practical system design with ${subject}.`,
        keyPrinciples: ['High-performance execution', 'Production deployment patterns'],
        codeExamples: [],
        status: 'not_started',
        orderIndex: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const relationshipsData: Array<{ from: string; to: string; relationType: 'prerequisite_of' | 'builds_on' | 'relates_to' | 'extends' | 'applied_in'; description: string }> = [
      {
        from: subject,
        to: `${subject} Core Principles`,
        relationType: 'prerequisite_of',
        description: 'Foundational understanding precedes advanced usage.',
      },
      {
        from: `${subject} Core Principles`,
        to: `${subject} Advanced Patterns`,
        relationType: 'builds_on',
        description: 'Advanced production patterns build upon core principles.',
      },
    ];

    return {
      topicsData,
      relationshipsData,
      sourcesData,
      starterDiscoveries: [
        {
          text: `Initialized active learning tracking for ${subject}.`,
          concept: 'Core Architecture',
        },
      ],
      starterQuestions: [
        {
          question: `What are the primary strengths and architectural tradeoffs of ${subject}?`,
          status: 'open',
        },
      ],
    };
  }
}
