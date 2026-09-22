import {
  CandidatePreference,
} from '@alina/shared';
import { ExtractedPattern } from './pattern-extractor';

export interface ConfidenceAssessmentResult {
  confidence: number;
  status: 'observed_once' | 'candidate' | 'awaiting_confirmation';
  isEligibleForProposal: boolean;
  confirmationPrompt?: string;
}

/**
 * ConfidenceAssessor
 * 
 * Enforces ALINA's recurrence and confidence rules:
 * - Single observation (e.g. "User used VS Code once") is strictly classified as OBSERVED_ONCE
 *   with confidence <= 0.35 and is NEVER turned into a permanent preference or memory.
 * - Recurrence (>= 3 observations) is required to graduate to high confidence (>= 0.70)
 *   and qualify for user confirmation.
 */
export class ConfidenceAssessor {
  private minOccurrencesForCandidate: number;
  private minConfidenceForProposal: number;

  constructor(options?: {
    minOccurrencesForCandidate?: number;
    minConfidenceForProposal?: number;
    minRecurrenceThreshold?: number;
  }) {
    this.minOccurrencesForCandidate = options?.minOccurrencesForCandidate ?? options?.minRecurrenceThreshold ?? 3;
    this.minConfidenceForProposal = options?.minConfidenceForProposal ?? 0.7;
  }

  /**
   * Assesses an extracted pattern or existing candidate preference.
   */
  public assess(pattern: ExtractedPattern | CandidatePreference): ConfidenceAssessmentResult {
    const occurrences = 'evidenceCount' in pattern ? pattern.evidenceCount : pattern.occurrenceCount;

    // 1. Single observation: NEVER store as preference
    if (occurrences <= 1) {
      return {
        confidence: 0.25,
        status: 'observed_once',
        isEligibleForProposal: false,
      };
    }

    // 2. Emerging observation (2 occurrences)
    if (occurrences === 2) {
      return {
        confidence: 0.50,
        status: 'candidate',
        isEligibleForProposal: false,
      };
    }

    // 3. Repeated observation (>= 3 occurrences)
    const baseConfidence = 0.70;
    const additionalBoost = Math.min(0.25, (occurrences - this.minOccurrencesForCandidate) * 0.08);
    const confidence = Math.min(0.95, baseConfidence + additionalBoost);

    const isEligible = occurrences >= this.minOccurrencesForCandidate && confidence >= this.minConfidenceForProposal;

    const confirmationPrompt = isEligible
      ? this.generateConfirmationPrompt(pattern)
      : undefined;

    return {
      confidence,
      status: isEligible ? 'awaiting_confirmation' : 'candidate',
      isEligibleForProposal: isEligible,
      confirmationPrompt,
    };
  }

  /**
   * Formulates natural, editorial confirmation phrasing ("Should I remember that?").
   */
  public generateConfirmationPrompt(pattern: ExtractedPattern | CandidatePreference): string {
    const key = 'patternKey' in pattern ? pattern.patternKey : (pattern as any).key || '';

    if (key.startsWith('tool:')) {
      const toolName = key.replace('tool:', '');
      const capitalized = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      const displayTool = (toolName.toLowerCase() === 'vscode' || toolName.toLowerCase() === 'vs code') ? 'VS Code' : capitalized;
      return `I've noticed you usually use ${displayTool} for development. Should I remember that?`;
    }

    if (key.startsWith('project:')) {
      const projName = key.replace('project:', '');
      return `I've noticed you frequently work on project "${projName}". Should I keep that in your active project context?`;
    }

    if (key.startsWith('comm:')) {
      return `I've noticed you prefer concise, brief responses. Should I remember that as your default style?`;
    }

    if (key === 'interaction:voice' || key === 'modality:voice') {
      return `I've noticed you prefer hands-free voice interaction. Should I remember that preference?`;
    }

    if (key === 'interaction:text' || key === 'modality:text') {
      return `I've noticed you prefer direct text terminal interaction. Should I remember that preference?`;
    }

    if (key.startsWith('sequence:')) {
      const seq = key.replace('sequence:', '');
      return `I've noticed you frequently run the workflow sequence "${seq}". Should I remember that shortcut?`;
    }

    return `I've noticed that ${pattern.statement.toLowerCase()}. Should I remember that?`;
  }
}
