import { AlinaPersonalityConfig } from '@alina/shared';

/**
 * Default ALINA Personality Profile
 * 
 * Calm, warm, intelligent, professional, friendly, familiar, and subtle.
 * Avoids repetitive robotic stock phrases ("Hello, how can I help you?", "I am an AI assistant").
 */
export const DEFAULT_ALINA_PERSONALITY: AlinaPersonalityConfig = {
  name: 'Alina',
  tone: 'warm_calm',
  verbosity: 'concise',
  conversationalFamiliarity: 'familiar',
  useMemoryContext: true,
};

export interface MemoryContextSnippet {
  content: string;
  category: string;
  importance?: number;
}

/**
 * AlinaConversationalPersona
 * 
 * Formats verbal and written responses into natural, familiar conversational language.
 * Subtly incorporates verified memory facts without fabrication or awkward robotic disclosures.
 */
export class AlinaConversationalPersona {
  private config: AlinaPersonalityConfig;

  constructor(config: Partial<AlinaPersonalityConfig> = {}) {
    this.config = { ...DEFAULT_ALINA_PERSONALITY, ...config };
  }

  public getConfig(): AlinaPersonalityConfig {
    return { ...this.config };
  }

  /**
   * Generates a context-aware editorial greeting based on time of day and recent user context.
   */
  public generateGreeting(recentProjectName?: string): string {
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17) {
      timeGreeting = 'Good evening';
    }

    if (recentProjectName && this.config.conversationalFamiliarity === 'familiar') {
      return `${timeGreeting}. Ready when you are on ${recentProjectName}.`;
    }

    return `${timeGreeting}.`;
  }

  /**
   * Transforms an internal task goal into a calm, natural acknowledgment before execution.
   */
  public formatTaskAcknowledgment(goal: string, memoryContext?: MemoryContextSnippet[]): string {
    const trimmed = goal.trim();

    // Check if relevant context matches
    if (memoryContext && memoryContext.length > 0 && this.config.useMemoryContext) {
      const topContext = memoryContext.find(
        (m) => m.category === 'preference' || m.category === 'project_context' || m.category === 'context'
      );
      if (topContext && topContext.content.length < 80) {
        // e.g. "Sure, working with your preference for light mode and strict types."
        return `Working on that now.`;
      }
    }

    if (trimmed.length < 40) {
      return `Working on ${trimmed}.`;
    }
    return `Working on that now.`;
  }

  /**
   * Transforms a raw execution summary into a warm, natural conversational voice response.
   */
  public formatSpokenSummary(rawSummary: string, status: 'completed' | 'failed' | 'waiting_for_approval'): string {
    if (!rawSummary || !rawSummary.trim()) {
      if (status === 'completed') return 'Done.';
      if (status === 'failed') return 'I could not complete that task.';
      if (status === 'waiting_for_approval') return 'I need your authorization before proceeding.';
    }

    const clean = rawSummary.trim().replace(/^Task (completed|finished):\s*/i, '');

    if (status === 'waiting_for_approval') {
      return `Action requires operator authorization for ${clean}`;
    }

    if (status === 'failed') {
      return `I couldn't finish that. ${clean}`;
    }

    // Ensure sentence ending is clean
    return clean.endsWith('.') ? clean : `${clean}.`;
  }

  /**
   * Builds the system prompt persona instruction injected into LLM contexts.
   */
  public getSystemPersonaPrompt(memories?: MemoryContextSnippet[]): string {
    const base = [
      `You are ${this.config.name}, a calm, local-first personal computer companion.`,
      `Tone: warm, intelligent, professional, friendly, subtle.`,
      `Verbosity: concise by default. Never use robotic canned phrases like "Hello, how can I help you today?" or "As an AI model...".`,
      `Communicate with natural familiarity, like a trusted technical peer who knows the operator's workspace.`,
    ];

    if (memories && memories.length > 0 && this.config.useMemoryContext) {
      base.push(
        `Operator Context & Preferences (use naturally without citing memory storage IDs):`,
        ...memories.map((m) => `- ${m.content}`)
      );
    }

    return base.join('\n');
  }
}
