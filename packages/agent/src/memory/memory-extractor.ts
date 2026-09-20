import { MemoryCategory, MemoryLayer, MemoryEntity } from '@alina/database';

export interface ExtractionEvaluation {
  shouldRemember: boolean;
  reason: string;
  sanitizedContent: string;
  category: MemoryCategory;
  layer: MemoryLayer;
  importance: number;
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

const FORBIDDEN_SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9-_]{20,}/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/i,
  /password\s*[:=]\s*[^\s]+/i,
  /api[_-]?key\s*[:=]\s*[^\s]+/i,
  /private[_-]?key\s*[:=]\s*[^\s]+/i,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
];

export class MemoryExtractor {
  /**
   * Sanitizes text and verifies it does not contain forbidden credentials.
   */
  public static sanitizeAndValidate(text: string): { valid: boolean; sanitized: string; error?: string } {
    if (!text || text.trim().length === 0) {
      return { valid: false, sanitized: '', error: 'Text cannot be empty' };
    }

    for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
      if (pattern.test(text)) {
        return {
          valid: false,
          sanitized: '',
          error: 'Security policy violation: text contains sensitive secrets or authentication tokens.',
        };
      }
    }

    return { valid: true, sanitized: text.trim() };
  }

  /**
   * Evaluates text against extraction rules to determine what is worth remembering.
   */
  public static evaluate(
    text: string,
    existingMemories: MemoryEntity[] = [],
    forcedLayer?: MemoryLayer
  ): ExtractionEvaluation {
    const { valid, sanitized, error } = this.sanitizeAndValidate(text);
    if (!valid) {
      return {
        shouldRemember: false,
        reason: error || 'Invalid content',
        sanitizedContent: '',
        category: 'fact',
        layer: 'conversation',
        importance: 0.1,
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
          category: 'fact',
          layer: 'conversation',
          importance: 0.1,
          tags: ['chit-chat'],
        };
      }
    }

    if (sanitized.length < 3) {
      return {
        shouldRemember: false,
        reason: 'Transient conversational chit-chat or text too short to be meaningful.',
        sanitizedContent: sanitized,
        category: 'fact',
        layer: 'conversation',
        importance: 0.1,
        tags: ['chit-chat'],
      };
    }

    const lower = sanitized.toLowerCase();

    // 2. Identify Category & Importance
    let category: MemoryCategory = 'fact';
    let layer: MemoryLayer = forcedLayer || 'semantic';
    let importance = 0.6;
    const tags: Set<string> = new Set();

    // Rule detection
    if (lower.includes('must always') || lower.includes('never execute') || lower.includes('rule:') || lower.includes('strictly')) {
      category = 'rule';
      layer = 'semantic';
      importance = 1.0;
      tags.add('rule');
      tags.add('directive');
    }
    // User Preference detection
    else if (
      lower.includes('prefer') ||
      lower.includes('i like') ||
      lower.includes('my preference') ||
      lower.includes('default to') ||
      lower.includes('always use') ||
      lower.startsWith('remember that i')
    ) {
      category = 'preference';
      layer = 'semantic';
      importance = 0.9;
      tags.add('user_preference');
    }
    // Frequent location / path detection
    else if (
      /[a-zA-Z]:\\[a-zA-Z0-9_\-\\]+/.test(sanitized) ||
      /\/(Users|home|var|etc)\/[a-zA-Z0-9_\-/]+/.test(sanitized) ||
      lower.includes('path is') ||
      lower.includes('located at') ||
      lower.includes('directory')
    ) {
      category = 'location';
      layer = 'semantic';
      importance = 0.85;
      tags.add('location');
      tags.add('filesystem');
    }
    // Project info / architecture detection
    else if (
      lower.includes('architecture') ||
      lower.includes('monorepo') ||
      lower.includes('tech stack') ||
      lower.includes('we use') ||
      lower.includes('package manager') ||
      lower.includes('project uses')
    ) {
      category = 'project_info';
      layer = 'semantic';
      importance = 0.85;
      tags.add('project');
      tags.add('architecture');
    }
    // Recurring task detection
    else if (
      lower.includes('recurring') ||
      lower.includes('every day') ||
      lower.includes('routine') ||
      lower.includes('scheduled task') ||
      lower.includes('periodic')
    ) {
      category = 'recurring_task';
      layer = 'semantic';
      importance = 0.8;
      tags.add('recurring_task');
      tags.add('workflow');
    }
    // Task outcome / Episodic learning detection
    else if (
      lower.includes('task completed') ||
      lower.includes('task failed') ||
      lower.includes('resolved by') ||
      lower.includes('outcome:') ||
      lower.includes('learned that')
    ) {
      category = 'task_outcome';
      layer = 'episodic';
      importance = 0.75;
      tags.add('episode');
      tags.add('task_outcome');
    }

    // 3. TTL / Expiration Rules
    let expiresAt: string | null = null;
    if (layer === 'conversation') {
      // 24 hours TTL
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (layer === 'episodic') {
      // 60 days TTL unless high importance
      if (importance < 0.85) {
        expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      }
    }
    // Semantic layer has expiresAt = null (permanent)

    // 4. Superseding / Conflict Detection (e.g. updated user preference or path)
    let supersedesId: string | undefined;
    if (category === 'preference' || category === 'location') {
      for (const existing of existingMemories) {
        if (existing.category === category && !existing.supersededBy) {
          // Check for topical collision (e.g. both talking about theme, editor, package manager, or port)
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
      reason: `Classified as ${category} in ${layer} memory layer (importance: ${importance}).`,
      sanitizedContent: sanitized,
      category,
      layer,
      importance,
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
      reason: `Recorded episodic memory of task outcome for ${task.id}.`,
      sanitizedContent: content,
      category: 'task_outcome',
      layer: 'episodic',
      importance: isSuccess ? 0.75 : 0.85, // Failures have high learning value
      tags: ['task_outcome', isSuccess ? 'success' : 'failure', `task:${task.id}`],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
