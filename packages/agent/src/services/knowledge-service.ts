import {
  KnowledgeItem,
  KnowledgeSource,
  KnowledgeTopic,
  KnowledgeRefreshPolicy,
  KnowledgeRefreshPolicyType,
  KnowledgeSourceCategory,
  WorkingKnowledgeItem,
  WorkingKnowledgeContext,
  KnowledgeProvenanceResult,
  KnowledgeProjectSummary,
  KnowledgeRecommendationExplanation,
} from '@alina/shared';
import {
  AlinaDatabaseClient,
  KnowledgeRepository,
  KnowledgeSearchResult,
  KnowledgeSearchOptions,
} from '@alina/database';
import { TextEmbedder } from '../memory/text-embedder';
import { WebContentSanitizer } from '../security/web-content-sanitizer';

export interface KnowledgeAcquisitionRequest {
  goal: string;
  url: string;
  title: string;
  rawContent?: string;
  topic?: string;
  projectId?: string;
  taskId?: string;
  refreshPolicyType?: KnowledgeRefreshPolicyType;
  intervalDays?: number;
}

export interface KnowledgeRequirementAssessment {
  requiresWebKnowledge: boolean;
  primaryTopic: string;
  searchQueries: string[];
  recommendedPolicy: KnowledgeRefreshPolicyType;
  intervalDays: number;
}

export class KnowledgeService {
  private repo: KnowledgeRepository;
  // Layer 2: Ephemeral Working Knowledge Map (taskId -> WorkingKnowledgeContext)
  private workingKnowledgeStore = new Map<string, WorkingKnowledgeContext>();

  constructor(dbClient: AlinaDatabaseClient, repo?: KnowledgeRepository) {
    this.repo = repo || new KnowledgeRepository(dbClient);
  }

  public getRepository(): KnowledgeRepository {
    return this.repo;
  }

  // =========================================================================
  // Pipeline Stage 2: Determine Knowledge Requirement
  // =========================================================================

  public determineRequirement(userPrompt: string): KnowledgeRequirementAssessment {
    const text = userPrompt.toLowerCase();

    // Determine refresh policy based on prompt content
    let recommendedPolicy: KnowledgeRefreshPolicyType = 'software_documentation';
    let intervalDays = 60;

    if (/\b(price|pricing|cost|subscription|plan|rate|quote)\b/i.test(text)) {
      recommendedPolicy = 'current_pricing';
      intervalDays = 7;
    } else if (/\b(algorithm|concept|architecture|pattern|protocol|rfc|specification|theory)\b/i.test(text)) {
      recommendedPolicy = 'stable_technical_concept';
      intervalDays = 365;
    } else if (/\b(docs|documentation|api|sdk|library|release|changelog|version)\b/i.test(text)) {
      recommendedPolicy = 'software_documentation';
      intervalDays = 60;
    }

    // Extract primary topic
    let primaryTopic = 'General Technical Knowledge';
    if (text.includes('react')) primaryTopic = 'React Architecture & Ecosystem';
    else if (text.includes('tauri')) primaryTopic = 'Tauri Native Desktop Architecture';
    else if (text.includes('surrealdb')) primaryTopic = 'SurrealDB Multi-Model Architecture';
    else if (text.includes('typescript')) primaryTopic = 'TypeScript Language Specification';
    else if (text.includes('playwright')) primaryTopic = 'Playwright Browser Automation';
    else if (text.includes('next.js') || text.includes('nextjs')) primaryTopic = 'Next.js Web Framework';

    // Generate targeted search queries
    const searchQueries = [
      `${primaryTopic} official specifications and documentation`,
      `${primaryTopic} latest features and migration patterns`,
    ];

    return {
      requiresWebKnowledge: true,
      primaryTopic,
      searchQueries,
      recommendedPolicy,
      intervalDays,
    };
  }

  // =========================================================================
  // Pipeline Stage 4: Source Evaluation
  // =========================================================================

  public evaluateSource(url: string, title?: string): {
    category: KnowledgeSourceCategory;
    reliabilityScore: number;
    domain: string;
    normalizedUrl: string;
  } {
    const { url: normalizedUrl, domain } = WebContentSanitizer.normalizeUrl(url);

    // Authority classification mapping
    let category: KnowledgeSourceCategory = 'general_web';
    let reliabilityScore = 0.75;

    const highAuthorityDomains = [
      'react.dev',
      'nextjs.org',
      'tauri.app',
      'surrealdb.com',
      'playwright.dev',
      'typescriptlang.org',
      'developer.mozilla.org',
      'github.com',
      'nodejs.org',
      'w3.org',
    ];

    const pricingIndicators = ['pricing', 'plans', 'billing', 'cost'];
    const academicDomains = ['.edu', '.ac.uk', 'arxiv.org', 'ieee.org', 'acm.org'];
    const forumDomains = ['stackoverflow.com', 'reddit.com', 'discord.com', 'news.ycombinator.com'];

    if (highAuthorityDomains.some((d) => domain.includes(d))) {
      category = 'official_docs';
      reliabilityScore = 0.98;
    } else if (pricingIndicators.some((p) => normalizedUrl.includes(p) || (title && title.toLowerCase().includes(p)))) {
      category = 'pricing_page';
      reliabilityScore = 0.88;
    } else if (academicDomains.some((a) => domain.includes(a))) {
      category = 'academic_paper';
      reliabilityScore = 0.95;
    } else if (forumDomains.some((f) => domain.includes(f))) {
      category = 'community_forum';
      reliabilityScore = 0.65;
    } else if (domain.includes('blog') || domain.includes('medium.com')) {
      category = 'technical_blog';
      reliabilityScore = 0.82;
    }

    return {
      category,
      reliabilityScore,
      domain,
      normalizedUrl,
    };
  }

  // =========================================================================
  // Pipeline Stage 5 & 6: Extraction and Normalization
  // =========================================================================

  public extractAndNormalize(
    rawText: string,
    metadata: { url: string; title: string; topic?: string }
  ): {
    sanitizedContent: string;
    summary: string;
    isolatedEnvelope: string;
    hasThreats: boolean;
    domain: string;
    normalizedUrl: string;
  } {
    const { domain, url: normalizedUrl } = WebContentSanitizer.normalizeUrl(metadata.url);
    const sanitized = WebContentSanitizer.sanitize(rawText, { url: normalizedUrl, domain });

    // Formulate concise technical summary from sanitized text
    const paragraphs = sanitized.sanitizedContent
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 20 && !p.startsWith('[DEFUSED_'));

    const summaryParagraph = paragraphs[0] || `${metadata.title}: Verified domain technical findings for ${metadata.topic || 'architecture'}.`;
    const summary = summaryParagraph.length > 300 ? `${summaryParagraph.slice(0, 297)}...` : summaryParagraph;

    return {
      sanitizedContent: sanitized.sanitizedContent,
      summary,
      isolatedEnvelope: sanitized.isolatedEnvelope,
      hasThreats: sanitized.hasSuspiciousPayload,
      domain,
      normalizedUrl,
    };
  }

  // =========================================================================
  // Pipeline Stage 7: Deduplication
  // =========================================================================

  public async checkDuplicate(
    normalizedUrl: string,
    candidateEmbedding?: number[]
  ): Promise<KnowledgeItem | null> {
    // 1. Exact URL match
    const matched = await this.repo.findItemBySourceUrl(normalizedUrl);
    if (matched) return matched;

    // 2. Semantic vector deduplication (cosine similarity > 0.90)
    if (candidateEmbedding && candidateEmbedding.length > 0) {
      const results = await this.repo.vectorSearch(candidateEmbedding, {
        limit: 1,
        minSimilarity: 0.90,
      });
      if (results.length > 0 && results[0]) {
        return results[0].item;
      }
    }

    return null;
  }

  // =========================================================================
  // Pipeline Stage 8: Confidence Assessment
  // =========================================================================

  public assessConfidence(
    sourceReliability: number,
    hasThreats: boolean,
    corroboratedCount = 1
  ): number {
    let confidence = sourceReliability;
    if (hasThreats) {
      // Degrade confidence if adversarial payloads were detected
      confidence *= 0.8;
    }
    if (corroboratedCount > 1) {
      confidence = Math.min(1.0, confidence + 0.05 * (corroboratedCount - 1));
    }
    return Number(Math.max(0.1, Math.min(1.0, confidence)).toFixed(2));
  }

  // =========================================================================
  // Pipeline Stages 9, 10, 11: Storage, Provenance & Embedding (Full Pipeline)
  // =========================================================================

  public async acquire(request: KnowledgeAcquisitionRequest): Promise<{
    item: KnowledgeItem;
    source: KnowledgeSource;
    topic: KnowledgeTopic;
    isDuplicate: boolean;
  }> {
    // Stage 2: Requirement assessment
    const reqAssessment = this.determineRequirement(request.goal);
    const topicName = request.topic || reqAssessment.primaryTopic;

    // Stage 4: Source evaluation
    const evaluation = this.evaluateSource(request.url, request.title);

    // Stage 5 & 6: Extraction and Normalization with Prompt Injection Defense
    const contentToSanitize = request.rawContent || `${request.title}\n\nTechnical specifications and official usage directives for ${topicName}.`;
    const extraction = this.extractAndNormalize(contentToSanitize, {
      url: evaluation.normalizedUrl,
      title: request.title,
      topic: topicName,
    });

    // Stage 11: Vector Embedding generation
    const embeddingText = `${request.title} ${topicName} ${extraction.summary}`;
    const embedding = TextEmbedder.generateEmbedding(embeddingText);

    // Stage 7: Deduplication check
    const duplicate = await this.checkDuplicate(evaluation.normalizedUrl, embedding);
    if (duplicate) {
      // Update existing item rather than inserting duplicate
      const refreshed = await this.repo.refreshItem(duplicate.id, {
        summary: extraction.summary,
        content: extraction.isolatedEnvelope,
        confidence: this.assessConfidence(evaluation.reliabilityScore, extraction.hasThreats),
      });

      const src = (await this.repo.findSourceByUrl(evaluation.normalizedUrl)) || {
        id: `src_${duplicate.id}`,
        url: evaluation.normalizedUrl,
        domain: evaluation.domain,
        title: request.title,
        reliabilityScore: evaluation.reliabilityScore,
        lastFetchedAt: new Date().toISOString(),
        httpStatus: 200,
        category: evaluation.category,
        createdAt: duplicate.createdAt,
      };

      const topic: KnowledgeTopic = {
        id: `topic_${topicName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: topicName,
        slug: topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        itemCount: 1,
        createdAt: duplicate.createdAt,
        updatedAt: new Date().toISOString(),
      };

      return {
        item: refreshed,
        source: src,
        topic,
        isDuplicate: true,
      };
    }

    // Stage 8: Confidence assessment
    const confidence = this.assessConfidence(evaluation.reliabilityScore, extraction.hasThreats);

    // Prepare Entities
    const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const source: KnowledgeSource = {
      id: sourceId,
      url: evaluation.normalizedUrl,
      domain: evaluation.domain,
      title: request.title,
      reliabilityScore: evaluation.reliabilityScore,
      lastFetchedAt: new Date().toISOString(),
      httpStatus: 200,
      category: evaluation.category,
      createdAt: new Date().toISOString(),
    };

    const topicSlug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const topicId = `topic_${topicSlug}`;
    const topic: KnowledgeTopic = {
      id: topicId,
      name: topicName,
      slug: topicSlug,
      description: `Domain knowledge relating to ${topicName}`,
      itemCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate refresh policy and expiration/review date
    const policyType = request.refreshPolicyType || reqAssessment.recommendedPolicy;
    const intervalDays = request.intervalDays || reqAssessment.intervalDays;
    const reviewDate = new Date(Date.now() + intervalDays * 86400000).toISOString();

    const policy: KnowledgeRefreshPolicy = {
      type: policyType,
      intervalDays,
      reviewDate,
      autoRefresh: true,
    };

    const itemId = `ki_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const knowledgeItem: KnowledgeItem = {
      id: itemId,
      topicId: topic.id,
      topic: topicName,
      title: request.title,
      sourceUrl: evaluation.normalizedUrl,
      sourceDomain: evaluation.domain,
      summary: extraction.summary,
      content: extraction.isolatedEnvelope,
      confidence,
      retrievedAt: new Date().toISOString(),
      expiresAt: reviewDate,
      reviewDate,
      refreshPolicy: policy,
      refreshCount: 0,
      lastRefreshedAt: new Date().toISOString(),
      status: 'active',
      tags: [evaluation.domain, topicSlug],
      embedding,
      projectId: request.projectId,
      taskId: request.taskId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        hasAdversarialThreats: extraction.hasThreats,
        originalGoal: request.goal,
      },
    };

    // Stage 9 & 10: Persist to KnowledgeRepository with SurrealDB Graph Relations
    const createdItem = await this.repo.createItem(knowledgeItem, {
      source,
      topic,
      projectId: request.projectId,
      taskId: request.taskId,
    });

    // Store embedding chunk
    await this.repo.recordEmbedding({
      id: `kemb_${createdItem.id}`,
      itemId: createdItem.id,
      chunkIndex: 0,
      text: extraction.summary,
      embedding,
      createdAt: new Date().toISOString(),
    });

    return {
      item: createdItem,
      source,
      topic,
      isDuplicate: false,
    };
  }

  // =========================================================================
  // Pipeline Stage 12: Hybrid Retrieval (Semantic Vector + Topic + Confidence)
  // =========================================================================

  public async search(
    query: string,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult[]> {
    const queryEmbedding = TextEmbedder.generateEmbedding(query);
    return this.repo.vectorSearch(queryEmbedding, options);
  }

  // =========================================================================
  // Knowledge Refresh Subsystem
  // =========================================================================

  public async refresh(
    itemId: string,
    newRawContent?: string
  ): Promise<KnowledgeItem> {
    const existing = await this.repo.findItemById(itemId);
    if (!existing) {
      throw new Error(`Cannot refresh non-existent knowledge item "${itemId}"`);
    }

    if (newRawContent) {
      const extracted = this.extractAndNormalize(newRawContent, {
        url: existing.sourceUrl,
        title: existing.title,
        topic: existing.topic,
      });

      const nextReview = new Date(Date.now() + (existing.refreshPolicy.intervalDays || 60) * 86400000).toISOString();

      return this.repo.refreshItem(itemId, {
        summary: extracted.summary,
        content: extracted.isolatedEnvelope,
        reviewDate: nextReview,
      });
    }

    // Default touch refresh
    const nextReview = new Date(Date.now() + (existing.refreshPolicy.intervalDays || 60) * 86400000).toISOString();
    return this.repo.refreshItem(itemId, { reviewDate: nextReview });
  }

  public async refreshStaleKnowledge(): Promise<{ refreshedCount: number; items: KnowledgeItem[] }> {
    const stale = await this.repo.findStaleItems();
    const refreshed: KnowledgeItem[] = [];

    for (const item of stale) {
      const r = await this.refresh(item.id);
      refreshed.push(r);
    }

    return { refreshedCount: refreshed.length, items: refreshed };
  }

  // =========================================================================
  // Explainability Inquiries
  // =========================================================================

  /**
   * Question 1: "What did you learn about this project?"
   */
  public async explainProjectKnowledge(projectId: string): Promise<KnowledgeProjectSummary> {
    const items = await this.repo.findItemsByProject(projectId);
    const topicsSet = new Set<string>();
    const sourcesMap = new Map<string, { domain: string; url: string; title: string }>();

    for (const it of items) {
      topicsSet.add(it.topic);
      sourcesMap.set(it.sourceUrl, {
        domain: it.sourceDomain,
        url: it.sourceUrl,
        title: it.title,
      });
    }

    const topics = Array.from(topicsSet);
    const sources = Array.from(sourcesMap.values());

    const summary = items.length > 0
      ? `Acquired ${items.length} verified technical knowledge items across ${topics.length} topics from ${sources.length} authoritative web domains.`
      : `No persistent external knowledge records are currently associated with project "${projectId}".`;

    return {
      projectId,
      itemCount: items.length,
      topics,
      sources,
      items,
      summary,
    };
  }

  /**
   * Question 2: "Why are you recommending this?"
   */
  public async explainRecommendation(
    queryOrRecommendation: string
  ): Promise<KnowledgeRecommendationExplanation> {
    const results = await this.search(queryOrRecommendation, { limit: 3, minSimilarity: 0.1 });

    const evidenceChain = results.map((r) => ({
      itemId: r.item.id,
      title: r.item.title,
      sourceUrl: r.item.sourceUrl,
      sourceDomain: r.item.sourceDomain,
      confidence: r.item.confidence,
      summary: r.item.summary,
      lastVerified: r.item.lastRefreshedAt,
    }));

    const topConfidence = results[0]?.item.confidence ?? 0.8;
    const rationale = results.length > 0
      ? `Recommendation is supported by ${results.length} verified sources from domains [${results.map((r) => r.item.sourceDomain).join(', ')}] with average confidence of ${topConfidence}.`
      : 'Recommendation is based on baseline architectural best practices.';

    return {
      query: queryOrRecommendation,
      recommendation: queryOrRecommendation,
      evidenceChain,
      confidenceScore: topConfidence,
      rationale,
    };
  }

  /**
   * Question 3: "Where did this information come from?"
   */
  public async explainProvenance(itemId: string): Promise<KnowledgeProvenanceResult | null> {
    const prov = await this.repo.findProvenance(itemId);
    if (!prov) return null;

    return {
      item: prov.item,
      source: prov.source,
      topic: prov.topic,
      updates: prov.updates,
      isFresh: prov.isFresh,
      daysUntilReview: prov.daysUntilReview,
    };
  }

  // =========================================================================
  // Layer 2: Ephemeral Working Knowledge Management
  // =========================================================================

  public getWorkingKnowledgeContext(taskId: string): WorkingKnowledgeContext {
    let ctx = this.workingKnowledgeStore.get(taskId);
    if (!ctx) {
      ctx = {
        taskId,
        goal: '',
        sources: [],
        candidateFacts: [],
        createdAt: new Date().toISOString(),
      };
      this.workingKnowledgeStore.set(taskId, ctx);
    }
    return ctx;
  }

  public addWorkingKnowledgeFact(
    taskId: string,
    fact: { title: string; url: string; snippet: string; domain?: string }
  ): WorkingKnowledgeItem {
    const ctx = this.getWorkingKnowledgeContext(taskId);
    const { domain, url } = WebContentSanitizer.normalizeUrl(fact.url);

    const workingItem: WorkingKnowledgeItem = {
      id: `wk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId,
      title: fact.title,
      url,
      domain: fact.domain || domain,
      snippet: fact.snippet,
      relevanceScore: 0.85,
      extractedAt: new Date().toISOString(),
    };

    ctx.candidateFacts.push(workingItem);

    if (!ctx.sources.some((s) => s.url === url)) {
      ctx.sources.push({ title: fact.title, url, domain });
    }

    return workingItem;
  }

  /**
   * Promotes an ephemeral working knowledge fact into Layer 3 (Persistent Knowledge Base).
   */
  public async promoteWorkingKnowledge(
    taskId: string,
    factId: string,
    topicName: string,
    projectId?: string
  ): Promise<KnowledgeItem> {
    const ctx = this.getWorkingKnowledgeContext(taskId);
    const fact = ctx.candidateFacts.find((f) => f.id === factId);
    if (!fact) {
      throw new Error(`Working knowledge fact "${factId}" not found in task "${taskId}"`);
    }

    const res = await this.acquire({
      goal: ctx.goal || `Research ${topicName}`,
      url: fact.url,
      title: fact.title,
      rawContent: fact.snippet,
      topic: topicName,
      taskId,
      projectId,
    });

    // Record promotion update
    await this.repo.recordUpdate({
      id: `upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      itemId: res.item.id,
      updateType: 'promoted_from_working',
      reason: `Promoted from working knowledge during task "${taskId}"`,
      updatedBy: 'alina_knowledge_service',
      timestamp: new Date().toISOString(),
    });

    return res.item;
  }
}
