import { MemoryCategory, MemoryLayer, MemoryEntity, EpistemicTier } from '@alina/database';
import { PrivacySanitizer } from './privacy-sanitizer';

export interface ExtractionEvaluation {
  shouldRemember: boolean;
  reason: string;
  sanitizedContent: string;
  category: MemoryCategory;
  layer: MemoryLayer;
  importance: number;
  confidence: number;
  epistemicTier: EpistemicTier;
  source: string;
  tags: string[];
  expiresAt?: string | null;
  supersedesId?: string;
}

const CHIT_CHAT_PATTERNS = [
  /^(hi|hello|hey|sup|yo|greetings)[\s!.?]*$/i,
  /^(thanks|thank you|thx|cheers)[\s!.?]*$/i,
  /^(ok|okay|k|cool|got it|understood|sure)[\s!.?]*$/i,
  /^(bye|goodbye|see ya|cya)[\s!.?]*$/i,
  /^(good morning|good afternoon|good evening)[\s!.?]*$/i,
  /^(how are you|how is it going|what's up)[\s!.?]*$/i,
];

export class MemoryExtractor {
  /**
   * Sanitizes text and verifies it does not contain forbidden credentials or private attributes.
   */
  public static sanitizeAndValidate(text: string): { valid: boolean; sanitized: string; error?: string } {
    const res = PrivacySanitizer.sanitize(text);
    if (!res.valid) {
      return { valid: false, sanitized: '', error: res.error };
    }
    return { valid: true, sanitized: res.sanitizedContent };
  }

  /**
   * Evaluates text against extraction rules to determine what is worth remembering.
   */
  public static evaluate(
    text: string,
    existingMemories: MemoryEntity[] = [],
    forcedLayer?: MemoryLayer,
    forcedCategory?: MemoryCategory,
    source = 'user_explicit',
    explicitTier?: EpistemicTier
  ): ExtractionEvaluation {
    const { valid, sanitized, error } = this.sanitizeAndValidate(text);
    if (!valid) {
      return {
        shouldRemember: false,
        reason: error || 'Invalid content',
        sanitizedContent: '',
        category: 'EXPLICIT_FACT',
        layer: 'conversation',
        importance: 0.1,
        confidence: 0.0,
        epistemicTier: 'EXPLICIT',
        source,
        tags: [],
      };
    }

    // 1. Filter out transient chit-chat
    for (const pattern of CHIT_CHAT_PATTERNS) {
      if (pattern.test(sanitized)) {
        return {
          shouldRemember: false,
          reason: 'Transient conversational chit-chat is not persisted to memory.',
          sanitizedContent: sanitized,
          category: 'EXPLICIT_FACT',
          layer: 'conversation',
          importance: 0.1,
          confidence: 0.2,
          epistemicTier: 'EXPLICIT',
          source,
          tags: ['chit-chat'],
        };
      }
    }

    if (sanitized.length < 3) {
      return {
        shouldRemember: false,
        reason: 'Transient conversational chit-chat or text too short to be meaningful.',
        sanitizedContent: sanitized,
        category: 'EXPLICIT_FACT',
        layer: 'conversation',
        importance: 0.1,
        confidence: 0.2,
        epistemicTier: 'EXPLICIT',
        source,
        tags: ['chit-chat'],
      };
    }

    const lower = sanitized.toLowerCase();

    // Determine initial epistemic tier
    let tier: EpistemicTier = explicitTier || 'EXPLICIT';
    if (!explicitTier) {
      if (source.startsWith('task:')) {
        tier = 'OBSERVED';
      } else if (
        lower.startsWith('user appears to') ||
        lower.startsWith('user seems to') ||
        lower.startsWith('user may') ||
        lower.includes('inferred:') ||
        lower.includes('suggests that user')
      ) {
        tier = 'INFERRED';
      }
    }

    // 2. Identify Category & Importance
    let category: MemoryCategory = forcedCategory || 'EXPLICIT_FACT';
    let layer: MemoryLayer = forcedLayer || 'semantic';
    let importance = 0.6;
    let confidence = tier === 'EXPLICIT' ? 0.95 : tier === 'OBSERVED' ? 0.8 : 0.6;
    const tags: Set<string> = new Set();

    // UI Preference
    if (
      lower.includes('theme') ||
      lower.includes('dark mode') ||
      lower.includes('light mode') ||
      lower.includes('ui preference') ||
      lower.includes('font size') ||
      lower.includes('compact mode')
    ) {
      category = 'UI_PREFERENCE';
      layer = 'semantic';
      importance = 0.85;
      tags.add('ui');
      tags.add('preferences');
    }
    // Tool Preference
    else if (
      lower.includes('editor') ||
      lower.includes('vscode') ||
      lower.includes('vs code') ||
      lower.includes('cursor') ||
      lower.includes('neovim') ||
      lower.includes('package manager') ||
      lower.includes('pnpm') ||
      lower.includes('browser preference') ||
      lower.includes('tool preference')
    ) {
      category = 'TOOL_PREFERENCE';
      layer = 'semantic';
      importance = 0.85;
      tags.add('tools');
      tags.add('preferences');
    }
    // Communication Style
    else if (
      lower.includes('communication style') ||
      lower.includes('concise responses') ||
      lower.includes('brief answers') ||
      lower.includes('talk formally') ||
      lower.includes('speak casually') ||
      lower.includes('conversational style')
    ) {
      category = 'COMMUNICATION_STYLE';
      layer = 'semantic';
      importance = 0.8;
      tags.add('communication');
      tags.add('style');
    }
    // Work Style
    else if (
      lower.includes('work style') ||
      lower.includes('working style') ||
      lower.includes('pair programming') ||
      lower.includes('step-by-step') ||
      lower.includes('plan first') ||
      lower.includes('ask before')
    ) {
      category = 'WORK_STYLE';
      layer = 'semantic';
      importance = 0.85;
      tags.add('work_style');
    }
    // Recurring Workflow
    else if (
      lower.includes('recurring workflow') ||
      lower.includes('recurring') ||
      lower.includes('every day') ||
      lower.includes('routine') ||
      lower.includes('scheduled task') ||
      lower.includes('periodic')
    ) {
      category = 'RECURRING_WORKFLOW';
      layer = 'semantic';
      importance = 0.8;
      tags.add('workflow');
      tags.add('recurring');
    }
    // Task Pattern / Outcome
    else if (
      lower.includes('task completed') ||
      lower.includes('task failed') ||
      lower.includes('resolved by') ||
      lower.includes('outcome:') ||
      lower.includes('task pattern') ||
      lower.includes('learned that')
    ) {
      category = 'TASK_PATTERN';
      layer = 'episodic';
      importance = 0.8;
      tags.add('task_pattern');
      tags.add('episode');
    }
    // Project Context
    else if (
      lower.includes('architecture') ||
      lower.includes('monorepo') ||
      lower.includes('tech stack') ||
      lower.includes('we use') ||
      lower.includes('project context') ||
      lower.includes('path is') ||
      lower.includes('located at') ||
      /[a-zA-Z]:\\[a-zA-Z0-9_\-\\]+/.test(sanitized)
    ) {
      category = 'PROJECT_CONTEXT';
      layer = 'semantic';
      importance = 0.85;
      tags.add('project');
      tags.add('architecture');
      if (/[a-zA-Z]:\\[a-zA-Z0-9_\-\\]+/.test(sanitized) || lower.includes('located at') || lower.includes('path is')) {
        tags.add('location');
        tags.add('filesystem');
      }
    }
    // Temporary Context
    else if (
      lower.includes('temporary') ||
      lower.includes('for now') ||
      lower.includes('for today') ||
      lower.includes('just testing')
    ) {
      category = 'TEMPORARY_CONTEXT';
      layer = 'conversation';
      importance = 0.5;
      confidence = 0.7;
      tags.add('temporary');
    }
    // Personal Preference (General)
    else if (
      lower.includes('prefer') ||
      lower.includes('i like') ||
      lower.includes('my preference') ||
      lower.includes('default to') ||
      lower.includes('always use') ||
      lower.startsWith('remember that i')
    ) {
      category = 'PERSONAL_PREFERENCE';
      layer = 'semantic';
      importance = 0.9;
      tags.add('preference');
      tags.add('user_preference');
    }
    // Strict Rule / Fact
    else if (
      lower.includes('must always') ||
      lower.includes('never execute') ||
      lower.includes('rule:') ||
      lower.includes('strictly')
    ) {
      category = 'EXPLICIT_FACT';
      layer = 'semantic';
      importance = 1.0;
      tags.add('rule');
      tags.add('directive');
    }

    // 3. For Inferred Memories: Enforce cautious tempered wording & confidence cap
    let finalContent = sanitized;
    if (tier === 'INFERRED') {
      const temperedRes = PrivacySanitizer.temperInferredMemory(sanitized, tier);
      finalContent = temperedRes.content;
      // Inferred memories must NEVER exceed confidence of 0.65
      confidence = Math.min(0.65, confidence);
      tags.add('inferred');
    } else if (tier === 'OBSERVED') {
      confidence = Math.min(0.85, Math.max(0.7, confidence));
      tags.add('observed');
    } else {
      tags.add('explicit');
    }

    // 4. TTL / Expiration Rules
    let expiresAt: string | null = null;
    if (category === 'TEMPORARY_CONTEXT' || layer === 'conversation') {
      // 24 hours TTL
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (layer === 'episodic') {
      // 90 days TTL for episodic task patterns unless high importance
      if (importance < 0.9) {
        expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // 5. Superseding / Conflict Detection (e.g. updated user preference or tool)
    let supersedesId: string | undefined;
    if (category === 'PERSONAL_PREFERENCE' || category === 'TOOL_PREFERENCE' || category === 'UI_PREFERENCE') {
      for (const existing of existingMemories) {
        if (
          (existing.category === category || existing.category === 'preference') &&
          !existing.supersededBy
        ) {
          const topics = ['theme', 'dark mode', 'light mode', 'editor', 'browser', 'package manager', 'pnpm', 'npm', 'root path'];
          for (const topic of topics) {
            if (lower.includes(topic) && existing.content.toLowerCase().includes(topic)) {
              supersedesId = existing.id;
              break;
            }
          }
          if (supersedesId) break;
        }
      }
    }

    return {
      shouldRemember: true,
      reason: `Classified as ${category} (${tier}, confidence: ${confidence.toFixed(2)}, importance: ${importance}).`,
      sanitizedContent: finalContent,
      category,
      layer,
      importance,
      confidence,
      epistemicTier: tier,
      source: PrivacySanitizer.validateProvenanceSource(source).normalizedSource,
      tags: Array.from(tags),
      expiresAt,
      supersedesId,
    };
  }

  /**
   * Formats a structured episodic memory from a finished task outcome.
   */
  public static fromTaskOutcome(
    task: { id: string; goal: string },
    result: { status: string; resultSummary?: string; stepsCompleted: number; error?: string }
  ): ExtractionEvaluation {
    const isSuccess = result.status === 'completed';
    const content = isSuccess
      ? `Task "${task.goal}" succeeded (${result.stepsCompleted} step(s)): ${result.resultSummary || 'Completed cleanly.'}`
      : `Task "${task.goal}" failed: ${result.error || 'Execution halted.'}`;

    return {
      shouldRemember: true,
      reason: `Recorded observed task outcome for ${task.id}.`,
      sanitizedContent: content,
      category: 'TASK_PATTERN',
      layer: 'episodic',
      importance: isSuccess ? 0.75 : 0.85,
      confidence: 0.85,
      epistemicTier: 'OBSERVED',
      source: `task:${task.id}`,
      tags: ['task_pattern', isSuccess ? 'success' : 'failure', `task:${task.id}`],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
