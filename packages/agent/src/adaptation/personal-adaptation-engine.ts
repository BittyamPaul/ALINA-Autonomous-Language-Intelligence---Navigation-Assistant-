import {
  PersonalContextModel,
  PersonalContextModelSchema,
  InteractionEvent,
  CandidatePreference,
  PersonalConfirmationProposal,
  PersonalAdaptationConfig,
  PersonalAdaptationConfigSchema,
} from '@alina/shared';
import { PrivacySanitizer } from '../memory/privacy-sanitizer';
import { MemoryService } from '../services/memory-service';
import { PatternExtractor } from './pattern-extractor';
import { ConfidenceAssessor } from './confidence-assessor';

export interface AdaptationEvaluationResult {
  evaluatedEventsCount: number;
  extractedPatternsCount: number;
  candidatesCount: number;
  candidates: CandidatePreference[];
  newProposalsCount: number;
  newProposals: PersonalConfirmationProposal[];
  proposals: PersonalConfirmationProposal[];
  updatedContext: PersonalContextModel;
}

/**
 * AlinaPersonalAdaptationEngine
 * 
 * Orchestrates ALINA's 7-Stage Personal Adaptation Lifecycle:
 * Recent interactions
 *        ↓
 * Pattern extraction
 *        ↓
 * Candidate preference
 *        ↓
 * Confidence assessment (occurrence >= 3, recency, consistency)
 *        ↓
 * Memory reinforcement (tempered phrasing, memory service integration)
 *        ↓
 * Optional user confirmation ("Should I remember that?" → Yes / No / Not now)
 *        ↓
 * Personal context update
 * 
 * Invariants:
 * - Does NOT automatically turn one-time behavior into permanent preferences.
 * - Does NOT modify security policies, PathJail restrictions, or HITL approval gates.
 * - Filters all extractions against sensitive attributes (credentials, health, finance, religion, politics, surveillance).
 * - Maintains an internal adaptation score without exposing arbitrary "intelligence" metrics to the user.
 */
export class AlinaPersonalAdaptationEngine {
  private config: PersonalAdaptationConfig;
  private memoryService?: MemoryService;
  private assessor: ConfidenceAssessor;
  private personalContext: PersonalContextModel;

  private recentInteractions: InteractionEvent[] = [];
  private candidatePreferences: Map<string, CandidatePreference> = new Map();
  private pendingProposals: Map<string, PersonalConfirmationProposal> = new Map();
  private rejectedPatterns: Set<string> = new Set();
  private snoozedProposals: Map<string, number> = new Map();

  private onProposalGenerated?: (proposal: PersonalConfirmationProposal) => void;
  private onContextUpdated?: (context: PersonalContextModel) => void;

  constructor(options?: {
    memoryService?: MemoryService;
    config?: Partial<PersonalAdaptationConfig>;
    minRecurrenceThreshold?: number;
    minConfidenceForProposal?: number;
    initialContext?: Partial<PersonalContextModel>;
    onProposalGenerated?: (proposal: PersonalConfirmationProposal) => void;
    onContextUpdated?: (context: PersonalContextModel) => void;
  }) {
    this.memoryService = options?.memoryService;
    const cfg = { ...(options?.config ?? {}) };
    if (options?.minRecurrenceThreshold !== undefined) {
      cfg.minOccurrencesForCandidate = options.minRecurrenceThreshold;
    }
    if (options?.minConfidenceForProposal !== undefined) {
      cfg.minConfidenceForProposal = options.minConfidenceForProposal;
    }
    this.config = PersonalAdaptationConfigSchema.parse(cfg);
    this.assessor = new ConfidenceAssessor({
      minOccurrencesForCandidate: this.config.minOccurrencesForCandidate,
      minConfidenceForProposal: this.config.minConfidenceForProposal,
    });
    this.personalContext = PersonalContextModelSchema.parse(options?.initialContext ?? {});
    this.onProposalGenerated = options?.onProposalGenerated;
    this.onContextUpdated = options?.onContextUpdated;
  }

  public getConfig(): PersonalAdaptationConfig {
    return { ...this.config };
  }

  public getPersonalContext(): PersonalContextModel {
    return { ...this.personalContext };
  }

  public getContext(): PersonalContextModel {
    return this.getPersonalContext();
  }

  public getRecentEvents(): InteractionEvent[] {
    return [...this.recentInteractions];
  }

  public getPendingProposals(): PersonalConfirmationProposal[] {
    return Array.from(this.pendingProposals.values()).filter((p) => p.status === 'pending');
  }

  public getCandidatePreferences(): CandidatePreference[] {
    return Array.from(this.candidatePreferences.values());
  }

  public getInternalAdaptationScore(): number {
    return this.personalContext.internalAdaptationScore;
  }

  /**
   * Records a user interaction or task event into the recent interactions ring buffer.
   */
  public recordInteraction(
    eventInput: (
      | (Omit<InteractionEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string })
      | {
          id?: string;
          taskId?: string;
          timestamp?: string;
          goal?: string;
          toolsUsed?: string[];
          modality?: 'text' | 'voice';
          status?: 'completed' | 'failed' | 'cancelled';
          communicationStyleObserved?: any;
          projectId?: string;
          technologies?: string[];
          durationMs?: number;
          payload?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
          type?: 'task_execution' | 'user_message' | 'tool_invocation' | 'ui_interaction' | 'voice_turn';
        }
    )
  ): void {
    if (!this.config.enabled) return;

    const event: InteractionEvent = {
      id: eventInput.id || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      taskId: (eventInput as any).taskId,
      timestamp: eventInput.timestamp || new Date().toISOString(),
      type: eventInput.type || (eventInput.modality === 'voice' ? 'voice_turn' : 'task_execution'),
      goal: (eventInput as any).goal,
      toolsUsed: (eventInput as any).toolsUsed || [],
      modality: (eventInput as any).modality || 'text',
      status: (eventInput as any).status || 'completed',
      communicationStyleObserved: (eventInput as any).communicationStyleObserved,
      projectId: (eventInput as any).projectId,
      technologies: (eventInput as any).technologies,
      payload: (eventInput as any).payload || {
        goal: (eventInput as any).goal,
        toolsUsed: (eventInput as any).toolsUsed,
        modality: (eventInput as any).modality,
        status: (eventInput as any).status,
        communicationStyleObserved: (eventInput as any).communicationStyleObserved,
        projectId: (eventInput as any).projectId,
        technologies: (eventInput as any).technologies,
        durationMs: (eventInput as any).durationMs,
      },
      metadata: (eventInput as any).metadata || {
        projectId: (eventInput as any).projectId,
      },
    };

    this.recentInteractions.push(event);

    // Keep ring buffer bounded
    if (this.recentInteractions.length > this.config.maxRecentInteractions) {
      this.recentInteractions.shift();
    }
  }

  /**
   * Executes the 7-stage periodic evaluation pipeline over recent interactions.
   */
  public async evaluateRecentInteractions(): Promise<AdaptationEvaluationResult> {
    if (!this.config.enabled || this.recentInteractions.length === 0) {
      return {
        evaluatedEventsCount: 0,
        extractedPatternsCount: 0,
        candidatesCount: this.candidatePreferences.size,
        candidates: this.getCandidatePreferences(),
        newProposalsCount: 0,
        newProposals: [],
        proposals: [],
        updatedContext: this.getPersonalContext(),
      };
    }

    const eventsToProcess = [...this.recentInteractions];

    // Stage 1 & 2: Pattern Extraction
    const extractedPatterns = PatternExtractor.extract(eventsToProcess);

    const newProposals: PersonalConfirmationProposal[] = [];

    // Stage 3: Candidate Preference Processing with Privacy Sanitization
    for (const pattern of extractedPatterns) {
      // 1. Fail-closed privacy boundary check
      const privacyCheck = PrivacySanitizer.sanitize(pattern.statement);
      if (!privacyCheck.valid) {
        // Drop any sensitive personal attributes immediately
        continue;
      }

      // Check if user previously rejected this pattern
      if (this.rejectedPatterns.has(pattern.patternKey)) {
        continue;
      }

      // Stage 4: Confidence Assessment & Recurrence Rules
      const assessment = this.assessor.assess(pattern);

      const existingCandidate = this.candidatePreferences.get(pattern.patternKey);
      const firstObservedAt = existingCandidate ? existingCandidate.firstObservedAt : pattern.lastObservedAt;

      const candidate: CandidatePreference = {
        id: existingCandidate ? existingCandidate.id : `cand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        dimension: pattern.dimension,
        patternKey: pattern.patternKey,
        statement: privacyCheck.sanitizedContent || pattern.statement,
        inferredValue: pattern.inferredValue,
        occurrenceCount: pattern.evidenceCount,
        confidence: assessment.confidence,
        status: existingCandidate?.status === 'confirmed' ? 'confirmed' : assessment.status,
        isEligibleForProposal: assessment.isEligibleForProposal,
        firstObservedAt,
        lastObservedAt: pattern.lastObservedAt,
        confirmationPrompt: assessment.confirmationPrompt,
      };

      this.candidatePreferences.set(pattern.patternKey, candidate);

      // Recurrence rule enforcement:
      // If observed only once, NEVER store as permanent preference or promote to memory
      if (candidate.occurrenceCount <= 1 || assessment.status === 'observed_once') {
        continue;
      }

      // Stage 5: Memory Reinforcement
      if (this.config.autoReinforceMemory && this.memoryService && candidate.confidence >= 0.65) {
        try {
          await this.memoryService.remember({
            content: candidate.statement,
            category: candidate.dimension === 'work_patterns' ? 'TOOL_PREFERENCE' : 'PERSONAL_PREFERENCE',
            epistemicTier: 'INFERRED',
            confidence: candidate.confidence,
            source: 'adaptation_engine',
          });
        } catch {}
      }

      // Stage 6: Optional User Confirmation Proposal
      if (assessment.isEligibleForProposal && candidate.status !== 'confirmed') {
        // Check if snoozed
        const snoozeTime = this.snoozedProposals.get(candidate.patternKey);
        const isSnoozed = snoozeTime && Date.now() - snoozeTime < this.config.snoozeDurationHours * 3600000;

        if (!isSnoozed && assessment.confirmationPrompt && !this.hasPendingProposalFor(candidate.patternKey)) {
          const propId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const proposal: PersonalConfirmationProposal = {
            id: propId,
            proposalId: propId,
            candidateId: candidate.id,
            patternKey: candidate.patternKey,
            prompt: assessment.confirmationPrompt,
            dimension: candidate.dimension,
            detectedPattern: candidate.statement,
            confidence: candidate.confidence,
            options: ['Yes', 'No', 'Not now'],
            createdAt: new Date().toISOString(),
            status: 'pending',
          };

          this.pendingProposals.set(proposal.proposalId, proposal);
          newProposals.push(proposal);

          if (this.onProposalGenerated) {
            this.onProposalGenerated(proposal);
          }
        }
      }
    }

    // Stage 7: Personal Context Update & Score Calculation
    this.updateContextFromObservations();
    this.recalculateAdaptationScore();

    return {
      evaluatedEventsCount: eventsToProcess.length,
      extractedPatternsCount: extractedPatterns.length,
      candidatesCount: this.candidatePreferences.size,
      candidates: this.getCandidatePreferences(),
      newProposalsCount: newProposals.length,
      newProposals,
      proposals: newProposals,
      updatedContext: this.getPersonalContext(),
    };
  }

  /**
   * Responds to an interactive confirmation proposal ("Yes", "No", "Not now").
   */
  public async respondToProposal(
    proposalId: string,
    response: 'Yes' | 'No' | 'Not now'
  ): Promise<{
    success: boolean;
    proposal: PersonalConfirmationProposal;
    context: PersonalContextModel;
    memoryId?: string;
  }> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Confirmation proposal not found: ${proposalId}`);
    }

    let memoryId: string | undefined;

    if (response === 'Yes') {
      proposal.status = 'accepted';

      // Find matching candidate
      for (const candidate of this.candidatePreferences.values()) {
        if (candidate.id === proposal.candidateId) {
          candidate.status = 'confirmed';
          candidate.confidence = 1.0;
          this.applyConfirmedPreference(candidate);
          break;
        }
      }

      // Reinforce in memory service as EXPLICIT confirmed fact
      if (this.memoryService) {
        try {
          const mem = await this.memoryService.remember({
            content: proposal.detectedPattern,
            category: proposal.dimension === 'work_patterns' ? 'TOOL_PREFERENCE' : 'PERSONAL_PREFERENCE',
            epistemicTier: 'EXPLICIT',
            confidence: 1.0,
            source: 'explicit_user',
          });
          memoryId = mem.id;
        } catch {}
      }

      this.pendingProposals.delete(proposalId);
      this.recalculateAdaptationScore();

      if (this.onContextUpdated) {
        this.onContextUpdated(this.personalContext);
      }
    } else if (response === 'No') {
      proposal.status = 'rejected';

      // Suppress future candidate creation for this pattern
      for (const candidate of this.candidatePreferences.values()) {
        if (candidate.id === proposal.candidateId) {
          candidate.status = 'rejected';
          this.rejectedPatterns.add(candidate.patternKey);
          break;
        }
      }

      this.pendingProposals.delete(proposalId);
    } else if (response === 'Not now') {
      proposal.status = 'snoozed';

      for (const candidate of this.candidatePreferences.values()) {
        if (candidate.id === proposal.candidateId) {
          candidate.status = 'snoozed';
          this.snoozedProposals.set(candidate.patternKey, Date.now());
          break;
        }
      }

      this.pendingProposals.delete(proposalId);
    }

    return {
      success: true,
      proposal,
      context: this.getPersonalContext(),
      memoryId,
    };
  }

  /**
   * Applies a confirmed preference directly to the PersonalContextModel.
   */
  private applyConfirmedPreference(candidate: CandidatePreference): void {
    const time = new Date().toISOString();

    if (candidate.dimension === 'work_patterns') {
      const val = candidate.inferredValue as any;
      if (val?.toolName) {
        const existingTool = this.personalContext.workPatterns.frequentlyUsedTools.find(
          (t) => t.toolName.toLowerCase() === val.toolName.toLowerCase()
        );
        if (existingTool) {
          existingTool.frequency += val.frequency || 1;
          existingTool.userConfirmed = true;
          existingTool.lastUsed = time;
        } else {
          this.personalContext.workPatterns.frequentlyUsedTools.push({
            toolName: val.toolName,
            frequency: val.frequency || candidate.occurrenceCount,
            userConfirmed: true,
            lastUsed: time,
          });
        }
      } else if (val?.sequence) {
        this.personalContext.workPatterns.recurringTaskSequences.push({
          sequence: val.sequence,
          frequency: val.frequency || candidate.occurrenceCount,
          confidence: candidate.confidence,
          lastUsed: time,
        });
      }
      this.personalContext.workPatterns.lastUpdated = time;
    } else if (candidate.dimension === 'communication_style') {
      const val = candidate.inferredValue as any;
      if (val?.conciseness) {
        this.personalContext.communicationStyle.conciseness = val.conciseness;
      }
      if (val?.formality) {
        this.personalContext.communicationStyle.formality = val.formality;
      }
      if (val?.preferredStructure || val?.preferredResponseStructure) {
        const struct = val.preferredStructure || val.preferredResponseStructure;
        this.personalContext.communicationStyle.preferredStructure = struct;
        this.personalContext.communicationStyle.preferredResponseStructure = struct;
      }
      this.personalContext.communicationStyle.lastUpdated = time;
    } else if (candidate.dimension === 'interaction_preferences') {
      const val = candidate.inferredValue as any;
      if (val?.preferredInputModality || val?.preferredModality) {
        const mod = val.preferredModality || val.preferredInputModality;
        this.personalContext.interactionPreferences.preferredInputModality = mod;
        this.personalContext.interactionPreferences.preferredModality = mod;
      }
      this.personalContext.interactionPreferences.lastUpdated = time;
    } else if (candidate.dimension === 'project_context') {
      const val = candidate.inferredValue as any;
      if (val?.name || val?.projectId) {
        const pId = val.projectId || val.name;
        const pName = val.name || val.projectId;
        const existingProj = this.personalContext.projectContext.projects.find(
          (p) => (p.projectId && p.projectId.toLowerCase() === pId.toLowerCase()) || p.name.toLowerCase() === pName.toLowerCase()
        );
        if (existingProj) {
          existingProj.technologies = Array.from(new Set([...existingProj.technologies, ...(val.technologies || [])]));
          existingProj.lastAccessed = time;
        } else {
          const tracked = {
            projectId: pId,
            name: pName,
            path: val.path,
            technologies: val.technologies || [],
            recurringGoals: [],
            frequency: val.frequency || candidate.occurrenceCount,
            lastAccessed: time,
          };
          this.personalContext.projectContext.projects.push(tracked);
          this.personalContext.projectContext.frequentlyUsedProjects.push(tracked);
        }
        this.personalContext.projectContext.activeProject = pName;
        this.personalContext.projectContext.lastUpdated = time;
      }
    }
  }

  /**
   * Updates non-intrusive frequency tallies in PersonalContextModel.
   */
  private updateContextFromObservations(): void {
    const time = new Date().toISOString();

    for (const candidate of this.candidatePreferences.values()) {
      if (candidate.occurrenceCount >= this.config.minOccurrencesForCandidate && candidate.status === 'confirmed') {
        this.applyConfirmedPreference(candidate);
      }
    }

    this.personalContext.lastEvaluatedAt = time;
  }

  /**
   * Re-evaluates the internal adaptation score (0 to 100).
   * Note: This score is strictly internal for prioritization; it is never exposed as an arbitrary intelligence score.
   */
  private recalculateAdaptationScore(): void {
    let score = 10; // Baseline base score

    // Confirmed preferences weight (up to 40 pts)
    const confirmedCount = Array.from(this.candidatePreferences.values()).filter((c) => c.status === 'confirmed').length;
    score += Math.min(40, confirmedCount * 10);

    // Tracked projects weight (up to 20 pts)
    score += Math.min(20, this.personalContext.projectContext.projects.length * 5);

    // Frequently used tools weight (up to 20 pts)
    score += Math.min(20, this.personalContext.workPatterns.frequentlyUsedTools.length * 5);

    // Interaction history depth (up to 10 pts)
    score += Math.min(10, Math.floor(this.recentInteractions.length / 5));

    this.personalContext.internalAdaptationScore = Math.min(100, score);
  }

  private hasPendingProposalFor(patternKey: string): boolean {
    for (const prop of this.pendingProposals.values()) {
      if (prop.status === 'pending') {
        const cand = this.candidatePreferences.get(patternKey);
        if (cand && cand.id === prop.candidateId) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Invariant Assertion: Verifies that learned preferences NEVER modify security policies.
   */
  public assertSecurityInvariance(contextToCheck?: PersonalContextModel): boolean {
    const ctx = contextToCheck || this.personalContext;
    // 1. Personal context must only contain non-sensitive operational dimensions
    const keys = Object.keys(ctx);
    const allowedKeys = [
      'userId',
      'communicationStyle',
      'workPatterns',
      'interactionPreferences',
      'projectContext',
      'internalAdaptationScore',
      'lastEvaluatedAt',
      'version',
    ];

    const hasForbiddenKeys = keys.some((k) => !allowedKeys.includes(k));
    if (hasForbiddenKeys) {
      throw new Error('Security invariant violation: Personal context model contains illegal non-operational dimensions');
    }

    // 2. Personal preferences cannot contain permission overrides or bypass tokens
    const serialized = JSON.stringify(ctx).toLowerCase();
    const forbiddenSecurityDirectives = [
      'bypass_pathjail',
      'skip_approval',
      'disable_hitl',
      'grant_all_permissions',
      'root_shell',
      'unrestricted_filesystem',
    ];

    for (const directive of forbiddenSecurityDirectives) {
      if (serialized.includes(directive)) {
        throw new Error(`Security invariant violation: Illegal security policy tampering detected (${directive})`);
      }
    }

    return true;
  }
}
