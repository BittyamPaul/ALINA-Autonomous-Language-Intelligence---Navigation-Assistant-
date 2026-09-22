import { describe, it, expect, beforeEach } from 'vitest';
import { AlinaDatabaseClient } from '@alina/database';
import {
  MemoryService,
  AlinaPersonalAdaptationEngine,
  AlinaConversationalPersona,
  AlinaSupervisorAgent,
  MockModelAdapter,
  SafeWorkspaceInspectorTool,
} from '@alina/agent';
import { ToolRegistry } from '@alina/tools';
import {
  PersonalContextModel,
  PersonalContextModelSchema,
} from '@alina/shared';

describe('ALINA Personal Adaptation Engine', () => {
  let dbClient: AlinaDatabaseClient;
  let memoryService: MemoryService;
  let adaptationEngine: AlinaPersonalAdaptationEngine;

  beforeEach(async () => {
    dbClient = new AlinaDatabaseClient({
      endpoint: 'http://127.0.0.1:59999/rpc',
      namespace: 'alina',
      database: 'main',
    });
    memoryService = new MemoryService(dbClient);
    adaptationEngine = new AlinaPersonalAdaptationEngine({
      memoryService,
      minRecurrenceThreshold: 3,
      minConfidenceForProposal: 0.70,
    });
  });

  describe('1. Recurrence Invariant: Never Store One-Time Behavior as Preference', () => {
    it('treats a single tool usage as OBSERVED_ONCE (confidence <= 0.35), never storing as preference or proposing', async () => {
      // 1 single interaction using VS Code
      adaptationEngine.recordInteraction({
        goal: 'Edit app configuration',
        toolsUsed: ['vscode'],
        modality: 'text',
      });

      const result = await adaptationEngine.evaluateRecentInteractions();

      // Check candidate preferences
      const vscodeCandidate = result.candidates.find((c) => c.patternKey === 'tool:vscode');
      expect(vscodeCandidate).toBeDefined();
      expect(vscodeCandidate?.occurrenceCount).toBe(1);
      expect(vscodeCandidate?.confidence).toBeLessThanOrEqual(0.35);
      expect(vscodeCandidate?.isEligibleForProposal).toBe(false);

      // Verify NO confirmation proposal generated
      const pendingProposals = adaptationEngine.getPendingProposals();
      expect(pendingProposals.length).toBe(0);

      // Verify PersonalContextModel was NOT modified
      const context = adaptationEngine.getContext();
      expect(context.workPatterns.frequentlyUsedTools).toEqual([]);
    });

    it('promotes recurring behavior (>= 3 times) to candidate with confidence >= 0.70 and creates proposal', async () => {
      // 3 interactions using VS Code
      adaptationEngine.recordInteraction({ goal: 'Fix backend endpoint', toolsUsed: ['vscode'] });
      adaptationEngine.recordInteraction({ goal: 'Refactor auth controller', toolsUsed: ['vscode'] });
      adaptationEngine.recordInteraction({ goal: 'Add unit tests for API', toolsUsed: ['vscode'] });

      const result = await adaptationEngine.evaluateRecentInteractions();

      // Check candidate formed
      const vscodeCandidate = result.candidates.find((c) => c.patternKey === 'tool:vscode');
      expect(vscodeCandidate).toBeDefined();
      expect(vscodeCandidate?.occurrenceCount).toBe(3);
      expect(vscodeCandidate?.confidence).toBeGreaterThanOrEqual(0.70);
      expect(vscodeCandidate?.isEligibleForProposal).toBe(true);

      // Confirmation proposal generated with natural wording
      expect(result.newProposals.length).toBe(1);
      const proposal = result.newProposals[0]!;
      expect(proposal.prompt).toBe("I've noticed you usually use VS Code for development. Should I remember that?");
      expect(proposal.options).toEqual(['Yes', 'No', 'Not now']);
      expect(proposal.status).toBe('pending');
    });
  });

  describe('2. Interactive Confirmation Protocol (Yes, No, Not now)', () => {
    let proposalId: string;

    beforeEach(async () => {
      // Create a candidate proposal by recording 3 tool interactions
      adaptationEngine.recordInteraction({ goal: 'Inspect codebase', toolsUsed: ['vscode'] });
      adaptationEngine.recordInteraction({ goal: 'Build project', toolsUsed: ['vscode'] });
      adaptationEngine.recordInteraction({ goal: 'Run tests', toolsUsed: ['vscode'] });

      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      expect(evalResult.newProposals.length).toBe(1);
      proposalId = evalResult.newProposals[0]!.id;
    });

    it('Option "Yes": updates personalContext.workPatterns and reinforces memory to EXPLICIT tier', async () => {
      const responseResult = await adaptationEngine.respondToProposal(proposalId, 'Yes');

      expect(responseResult.success).toBe(true);
      expect(responseResult.proposal.status).toBe('accepted');

      // Personal Context updated
      const context = adaptationEngine.getContext();
      expect(context.workPatterns.frequentlyUsedTools.map((t) => t.toolName)).toContain('vscode');
      const toolStat = context.workPatterns.frequentlyUsedTools.find((t) => t.toolName === 'vscode');
      expect(toolStat?.userConfirmed).toBe(true);

      // Reinforced into MemoryService under epistemic tier EXPLICIT with confidence 1.0
      const memories = await memoryService.recall('VS Code', { minScore: 0.2 });
      const toolMemory = memories.find((m) => m.memory.content.includes('VS Code'));
      expect(toolMemory).toBeDefined();
      expect(toolMemory?.memory.epistemicTier).toBe('EXPLICIT');
      expect(toolMemory?.memory.confidence).toBe(1.0);
    });

    it('Option "No": rejects proposal, adds to rejectedPatterns, and suppresses future proposals', async () => {
      const responseResult = await adaptationEngine.respondToProposal(proposalId, 'No');

      expect(responseResult.success).toBe(true);
      expect(responseResult.proposal.status).toBe('rejected');

      // Personal Context was NOT updated
      const context = adaptationEngine.getContext();
      expect(context.workPatterns.frequentlyUsedTools).toEqual([]);

      // Future evaluations do NOT generate proposals for this pattern
      adaptationEngine.recordInteraction({ goal: 'Another task', toolsUsed: ['vscode'] });
      const nextEval = await adaptationEngine.evaluateRecentInteractions();
      expect(nextEval.newProposals.length).toBe(0);
    });

    it('Option "Not now": snoozes proposal without updating context or permanently suppressing', async () => {
      const responseResult = await adaptationEngine.respondToProposal(proposalId, 'Not now');

      expect(responseResult.success).toBe(true);
      expect(responseResult.proposal.status).toBe('snoozed');

      // Context is unchanged
      const context = adaptationEngine.getContext();
      expect(context.workPatterns.frequentlyUsedTools).toEqual([]);
    });
  });

  describe('3. All 4 Non-Sensitive Allowed Dimensions', () => {
    it('evaluates Communication Style (concise vs detailed, formal vs casual, response structure)', async () => {
      for (let i = 0; i < 3; i++) {
        adaptationEngine.recordInteraction({
          goal: `Task ${i}`,
          communicationStyleObserved: {
            conciseness: 'concise',
            formality: 'formal',
            preferredStructure: 'bullet_points',
          },
        });
      }

      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      const styleCandidate = evalResult.candidates.find((c) => c.dimension === 'communication_style');
      expect(styleCandidate).toBeDefined();
      expect(styleCandidate?.confidence).toBeGreaterThanOrEqual(0.70);

      // Find proposal and accept
      const styleProposal = evalResult.newProposals.find((p) => p.dimension === 'communication_style');
      expect(styleProposal).toBeDefined();
      expect(styleProposal?.prompt).toContain('concise');

      await adaptationEngine.respondToProposal(styleProposal!.id, 'Yes');
      const updatedContext = adaptationEngine.getContext();
      expect(updatedContext.communicationStyle.conciseness).toBe('concise');
      expect(updatedContext.communicationStyle.formality).toBe('formal');
      expect(updatedContext.communicationStyle.preferredStructure).toBe('bullet_points');
    });

    it('evaluates Interaction Preferences (voice vs text, preferred voice, UI mode)', async () => {
      for (let i = 0; i < 3; i++) {
        adaptationEngine.recordInteraction({
          goal: `Voice query ${i}`,
          modality: 'voice',
        });
      }

      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      const modalityCandidate = evalResult.candidates.find((c) => c.patternKey === 'modality:voice');
      expect(modalityCandidate).toBeDefined();
      expect(modalityCandidate?.confidence).toBeGreaterThanOrEqual(0.70);

      const modalityProposal = evalResult.newProposals.find((p) => p.patternKey === 'modality:voice');
      expect(modalityProposal).toBeDefined();
      expect(modalityProposal?.prompt).toContain('voice');

      await adaptationEngine.respondToProposal(modalityProposal!.id, 'Yes');
      const updatedContext = adaptationEngine.getContext();
      expect(updatedContext.interactionPreferences.preferredModality).toBe('voice');
    });

    it('evaluates Project Context (frequently used project and technologies)', async () => {
      for (let i = 0; i < 4; i++) {
        adaptationEngine.recordInteraction({
          goal: `Feature commit ${i}`,
          projectId: 'alina_desktop_app',
          technologies: ['TypeScript', 'Rust', 'Tauri'],
        });
      }

      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      const projCandidate = evalResult.candidates.find((c) => c.dimension === 'project_context');
      expect(projCandidate).toBeDefined();
      expect(projCandidate?.confidence).toBeGreaterThanOrEqual(0.70);

      const projProposal = evalResult.newProposals.find((p) => p.dimension === 'project_context');
      expect(projProposal).toBeDefined();
      expect(projProposal?.prompt).toContain('alina_desktop_app');

      await adaptationEngine.respondToProposal(projProposal!.id, 'Yes');
      const updatedContext = adaptationEngine.getContext();
      const tracked = updatedContext.projectContext.frequentlyUsedProjects.find((p) => p.projectId === 'alina_desktop_app');
      expect(tracked).toBeDefined();
      expect(tracked?.technologies).toContain('TypeScript');
    });

    it('evaluates Recurring Task Sequences in Work Patterns', async () => {
      const toolSequence = ['read_text_file', 'create_file'];
      for (let i = 0; i < 3; i++) {
        adaptationEngine.recordInteraction({
          goal: `Refactor module ${i}`,
          toolsUsed: toolSequence,
        });
      }

      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      const seqCandidate = evalResult.candidates.find((c) => c.patternKey.startsWith('sequence:'));
      expect(seqCandidate).toBeDefined();
      expect(seqCandidate?.occurrenceCount).toBe(3);
    });
  });

  describe('4. Strict Security Invariance: Cannot Modify Safety Rules or Approval Gates', () => {
    it('rejects attempt to alter security policies or bypass PathJail/approvals', () => {
      const safeContext = adaptationEngine.getContext();

      // Attempting to inject security bypass keys
      const maliciousPayload = {
        ...safeContext,
        skip_approval: true,
        bypass_pathjail: true,
        securityLevel: 'disabled',
      };

      expect(() => {
        adaptationEngine.assertSecurityInvariance(maliciousPayload as unknown as PersonalContextModel);
      }).toThrow(/Security invariant violation/);
    });

    it('rejects forbidden sensitive keys like credentials or surveillance config', () => {
      const safeContext = adaptationEngine.getContext();
      const badPayload = {
        ...safeContext,
        passwords: ['secret123'],
      };

      expect(() => {
        adaptationEngine.assertSecurityInvariance(badPayload as unknown as PersonalContextModel);
      }).toThrow(/Security invariant violation/);
    });
  });

  describe('5. Fail-Closed Privacy Sanitization', () => {
    it('drops candidates that match credentials or sensitive personal attributes', async () => {
      // Ingest interactions with sensitive content in goal
      adaptationEngine.recordInteraction({
        goal: 'Store my API key sk-abcdef12345678901234567890123456',
        toolsUsed: ['vscode'],
      });
      adaptationEngine.recordInteraction({
        goal: 'User was diagnosed with a medical condition',
        toolsUsed: ['vscode'],
      });

      const evalResult = await adaptationEngine.evaluateRecentInteractions();

      // Check that no sensitive candidate was formed
      for (const candidate of evalResult.candidates) {
        expect(candidate.statement).not.toContain('sk-');
        expect(candidate.statement).not.toContain('medical condition');
      }
    });
  });

  describe('6. Internal Adaptation Score Only (Not an Arbitrary Intelligence Metric)', () => {
    it('calculates score internally (0-100) and does not leak arbitrary scores to user proposals', async () => {
      // Initial state
      let context = adaptationEngine.getContext();
      expect(context.internalAdaptationScore).toBe(0);

      // Record several interactions and confirm a preference
      for (let i = 0; i < 3; i++) {
        adaptationEngine.recordInteraction({ goal: `Task ${i}`, toolsUsed: ['git'] });
      }
      const evalResult = await adaptationEngine.evaluateRecentInteractions();
      expect(evalResult.newProposals.length).toBe(1);

      // Check proposal text does not leak raw intelligence / internal scores
      const proposal = evalResult.newProposals[0]!;
      expect(proposal.prompt).not.toMatch(/score|adaptation\s*score|intelligence|iq/i);

      // Accept proposal
      await adaptationEngine.respondToProposal(proposal.id, 'Yes');

      // Internal score rises bounded between 0 and 100
      context = adaptationEngine.getContext();
      expect(context.internalAdaptationScore).toBeGreaterThan(0);
      expect(context.internalAdaptationScore).toBeLessThanOrEqual(100);
    });
  });

  describe('7. Integration with AlinaSupervisorAgent', () => {
    it('automatically records interaction telemetry upon supervisor task completion', async () => {
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(SafeWorkspaceInspectorTool);

      const supervisor = new AlinaSupervisorAgent({
        toolRegistry,
        modelAdapter: new MockModelAdapter(),
        adaptationEngine,
      });

      expect(supervisor.getAdaptationEngine()).toBe(adaptationEngine);

      const result = await supervisor.execute({
        goal: 'Quick status check',
        modality: 'text',
        forceDirect: true,
      });

      expect(result.status).toBe('completed');

      // The adaptation engine should now have 1 recorded interaction event
      const recentEvents = adaptationEngine.getRecentEvents();
      expect(recentEvents.length).toBe(1);
      expect(recentEvents[0]!.goal).toBe('Quick status check');
      expect(recentEvents[0]!.status).toBe('completed');
      expect(recentEvents[0]!.modality).toBe('text');
    });
  });

  describe('8. Integration with AlinaConversationalPersona', () => {
    it('adapts greeting and response styling when personal context is present', () => {
      const persona = new AlinaConversationalPersona();

      // Default greeting
      const defaultGreeting = persona.greet();
      expect(defaultGreeting).toBe('Good day. How may I assist you?');

      // Update persona with concise personal context
      persona.setPersonalContext(
        PersonalContextModelSchema.parse({
          communicationStyle: {
            conciseness: 'concise',
            formality: 'formal',
            preferredStructure: 'editorial_summary',
          },
          projectContext: {
            activeProject: 'alina_core',
          },
          internalAdaptationScore: 45,
        })
      );

      const conciseGreeting = persona.greet();
      expect(conciseGreeting).toBe('Ready.');

      // Check system prompt injection includes personalized styling instructions
      const prompt = persona.formatSystemPrompt();
      expect(prompt).toContain('Personalized User Context');
      expect(prompt).toContain('concise');
    });
  });
});
