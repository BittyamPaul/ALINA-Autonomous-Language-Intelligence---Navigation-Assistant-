import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  VoiceState,
  VoiceActivityState,
  VoiceConversationMode,
  VoiceConversationSession,
  isTerminationPhrase,
  extractCommandAfterWakeWord,
} from '../packages/shared/src';
import {
  AlinaVoiceCoordinator,
  MockSpeechRecognitionAdapter,
  MockSpeechSynthesisAdapter,
  AlinaSupervisorAgent,
  MockModelAdapter,
  AuthorizationManager,
} from '../packages/agent/src';
import { createAlinaMcpToolRegistry } from '../packages/tools/src';

describe('ALINA Voice Conversation Lifecycle: Wake Mode & Continuous Conversation Mode', () => {
  const testDir = path.resolve(process.cwd(), 'scratch', 'voice_lifecycle_test');
  let sttAdapter: MockSpeechRecognitionAdapter;
  let ttsAdapter: MockSpeechSynthesisAdapter;
  let supervisorAgent: AlinaSupervisorAgent;
  let voiceCoordinator: AlinaVoiceCoordinator;
  let authManager: AuthorizationManager;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });

    authManager = AuthorizationManager.getInstance();
    const mcpRegistry = createAlinaMcpToolRegistry();

    const mockModel = new MockModelAdapter(async (prompt) => {
      const lower = prompt.toLowerCase();
      if (lower.includes('backend')) {
        return {
          text: 'Opening backend folder as requested.',
          toolCalls: [
            {
              toolName: 'list_files',
              parameters: { path: testDir, recursive: false },
            },
          ],
        };
      } else if (lower.includes('create') || lower.includes('new file')) {
        return {
          text: 'Creating requested workspace file.',
          toolCalls: [
            {
              toolName: 'create_file',
              parameters: {
                path: path.join(testDir, 'sample.txt'),
                content: 'Sample content created via multi-turn voice turn.',
              },
            },
          ],
        };
      } else if (lower.includes('back')) {
        return {
          text: 'Returned to root folder.',
          toolCalls: [],
        };
      }
      return {
        text: 'Project opened and ready.',
        toolCalls: [
          {
            toolName: 'list_files',
            parameters: { path: testDir, recursive: false },
          },
        ],
      };
    });

    supervisorAgent = new AlinaSupervisorAgent({
      mcpRegistry,
      modelAdapter: mockModel,
      authorizationManager: authManager,
    });

    sttAdapter = new MockSpeechRecognitionAdapter();
    ttsAdapter = new MockSpeechSynthesisAdapter();

    voiceCoordinator = new AlinaVoiceCoordinator({
      supervisorAgent,
      sttAdapter,
      ttsAdapter,
      jailRoot: testDir,
      config: {
        ttsEnabled: true,
        voiceRate: 1.0,
        voicePitch: 1.0,
        silenceTimeoutMs: 50, // fast silence endpoint for unit testing
        wakeWordEnabled: true,
      },
    });
  });

  afterEach(async () => {
    voiceCoordinator.destroy();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Two Distinct Modes & Transition Lifecycle
  // =========================================================================
  describe('1. Distinct Voice Modes (Wake Mode vs Conversation Mode)', () => {
    it('initializes in WAKE MODE by default with idle activity state', () => {
      expect(voiceCoordinator.getMode()).toBe('wake_mode');
      expect(voiceCoordinator.getState()).toBe('idle');
      expect(voiceCoordinator.getActivityState()).toBe('idle');
      expect(voiceCoordinator.getSession()).toBeNull();
    });

    it('transitions WAKE MODE -> CONVERSATION MODE when session starts', () => {
      const modeTransitions: VoiceConversationMode[] = [];
      let sessionCreated: VoiceConversationSession | null = null;

      voiceCoordinator.setEvents({
        onModeChange: (m) => modeTransitions.push(m),
        onSessionChange: (s) => { sessionCreated = s; },
      });

      const session = voiceCoordinator.startConversationSession('test_conv_123');

      expect(voiceCoordinator.getMode()).toBe('conversation_mode');
      expect(session.state).toBe('conversation_mode');
      expect(session.conversation_id).toBe('test_conv_123');
      expect(session.timeout_policy.inactivityPromptMs).toBe(20000);
      expect(modeTransitions).toContain('conversation_mode');
      expect(sessionCreated).not.toBeNull();
    });

    it('transitions CONVERSATION MODE -> WAKE MODE when explicitly ended', () => {
      voiceCoordinator.startConversationSession();
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');

      const modeTransitions: VoiceConversationMode[] = [];
      voiceCoordinator.setEvents({
        onModeChange: (m) => modeTransitions.push(m),
      });

      voiceCoordinator.endConversationSession('user_closed');

      expect(voiceCoordinator.getMode()).toBe('wake_mode');
      expect(voiceCoordinator.getState()).toBe('idle');
      expect(voiceCoordinator.getSession()).toBeNull();
      expect(modeTransitions).toContain('wake_mode');
    });
  });

  // =========================================================================
  // 2. Continuous Hands-Free Multi-Turn Conversation
  // =========================================================================
  describe('2. Continuous Hands-Free Multi-Turn Conversation Loop', () => {
    it('executes consecutive turns hands-free without requiring repeated mic taps', async () => {
      voiceCoordinator.startConversationSession('hands_free_session');
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');

      // Turn 1: "open my project"
      await voiceCoordinator.startListening();
      sttAdapter.simulateTranscript('open my project', true);
      const res1 = await voiceCoordinator.submitVoiceCommand('open my project');

      expect(res1.transcript).toBe('open my project');
      expect(res1.spoken).toBe(true);
      // Coordinator remains in conversation mode and automatically resumed listening!
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');
      expect(voiceCoordinator.getState()).toBe('listening');

      // Turn 2: "Now open the backend folder" without any button tap
      sttAdapter.simulateTranscript('Now open the backend folder', true);
      const res2 = await voiceCoordinator.submitVoiceCommand('Now open the backend folder');

      expect(res2.transcript).toBe('Now open the backend folder');
      expect(res2.spoken).toBe(true);
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');
      expect(voiceCoordinator.getState()).toBe('listening');

      // Turn 3: "Actually, go back"
      sttAdapter.simulateTranscript('Actually, go back', true);
      const res3 = await voiceCoordinator.submitVoiceCommand('Actually, go back');

      expect(res3.transcript).toBe('Actually, go back');
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');
      expect(voiceCoordinator.getState()).toBe('listening');

      // Turn 4: "Create a new file"
      sttAdapter.simulateTranscript('Create a new file', true);
      const res4 = await voiceCoordinator.submitVoiceCommand('Create a new file');

      expect(res4.transcript).toBe('Create a new file');
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');
      expect(voiceCoordinator.getState()).toBe('listening');

      // Verify all 4 turns were spoken by ALINA TTS
      expect(ttsAdapter.spokenUtterances.length).toBe(4);
    });
  });

  // =========================================================================
  // 3. Natural Termination Command Phrasing
  // =========================================================================
  describe('3. Natural Termination Phrasing', () => {
    it('recognizes standard natural termination phrases accurately', () => {
      const exitPhrases = [
        "That's all, Alina.",
        "That's all, Alina",
        "That's all alina",
        "That's all",
        "That is all, Alina.",
        "Goodbye Alina",
        "Goodbye Alina.",
        "Goodbye",
        "Bye Alina",
        "Stop listening",
        "Stop listening, Alina",
        "End conversation",
        "Close conversation",
        "Exit conversation",
      ];

      for (const phrase of exitPhrases) {
        expect(isTerminationPhrase(phrase)).toBe(true);
      }

      // Negative checks: normal commands must not be flagged as termination
      const nonExitPhrases = [
        'Open my project',
        'Now open the backend folder',
        'Create a new file called goodbye.txt',
        'Tell me about all features',
        'Actually go back',
      ];

      for (const phrase of nonExitPhrases) {
        expect(isTerminationPhrase(phrase)).toBe(false);
      }
    });

    it('submitting "That\'s all, Alina" speaks closing and returns CONVERSATION MODE -> WAKE MODE', async () => {
      voiceCoordinator.startConversationSession();
      await voiceCoordinator.startListening();
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');

      const result = await voiceCoordinator.submitVoiceCommand("That's all, Alina.");

      expect(result.terminatedSession).toBe(true);
      expect(result.spoken).toBe(true);
      expect(ttsAdapter.spokenUtterances[ttsAdapter.spokenUtterances.length - 1]).toContain('Goodbye');

      // Cleanly returned to Wake Mode!
      expect(voiceCoordinator.getMode()).toBe('wake_mode');
      expect(voiceCoordinator.getState()).toBe('idle');
      expect(voiceCoordinator.getSession()).toBeNull();
    });

    it('submitting "Stop listening" cleanly ends conversation mode', async () => {
      voiceCoordinator.startConversationSession();
      await voiceCoordinator.startListening();

      const result = await voiceCoordinator.submitVoiceCommand('Stop listening');

      expect(result.terminatedSession).toBe(true);
      expect(voiceCoordinator.getMode()).toBe('wake_mode');
    });
  });

  // =========================================================================
  // 4. Wake-Word Extraction & Immediate Command Handling
  // =========================================================================
  describe('4. Wake-Word Extraction & Immediate Command Handling', () => {
    it('extracts command when user speaks "Hey Alina, open my project"', () => {
      const singleUtterance = 'Hey Alina, open my project';
      const parsed = extractCommandAfterWakeWord(singleUtterance);

      expect(parsed.isWake).toBe(true);
      expect(parsed.command).toBe('open my project');
    });

    it('handles standalone "Hey Alina" wake invocation', () => {
      const standalone = 'Hey Alina';
      const parsed = extractCommandAfterWakeWord(standalone);

      expect(parsed.isWake).toBe(true);
      expect(parsed.command).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Voice Activity Detection & Activity States
  // =========================================================================
  describe('5. Voice Activity Detection (VAD) & Granular States', () => {
    it('distinguishes user_speaking, silence, end_of_utterance, thinking, and speaking', async () => {
      const activityStates: VoiceActivityState[] = [];
      voiceCoordinator.setEvents({
        onActivityStateChange: (state) => activityStates.push(state),
      });

      voiceCoordinator.startConversationSession();
      await voiceCoordinator.startListening();
      expect(activityStates).toContain('listening');

      // User speaks interim speech
      sttAdapter.simulateTranscript('Opening project', false);
      expect(voiceCoordinator.getActivityState()).toBe('user_speaking');

      // User pauses: short silence detected
      sttAdapter.simulateTranscript('Opening project files', true);

      // Execute command: transitions through thinking -> speaking -> back to listening
      const res = await voiceCoordinator.submitVoiceCommand('Opening project files');
      expect(res.spoken).toBe(true);
      expect(activityStates).toContain('thinking');
      expect(activityStates).toContain('speaking');
    });

    it('short silence does not terminate the continuous conversation session', async () => {
      voiceCoordinator.startConversationSession();
      await voiceCoordinator.startListening();

      // Simulate short pause / silence
      sttAdapter.simulateTranscript('Short pause', false);
      expect(voiceCoordinator.getMode()).toBe('conversation_mode');

      // Session remains active
      expect(voiceCoordinator.getSession()?.state).toBe('conversation_mode');
    });
  });

  // =========================================================================
  // 6. Inactivity Handling ("Are you still there?")
  // =========================================================================
  describe('6. Inactivity Warning & Standby Timeout', () => {
    it('prompts "Are you still there?" after configurable inactivity period', async () => {
      let warningReceived = '';
      voiceCoordinator.setEvents({
        onInactivityWarning: (prompt) => { warningReceived = prompt; },
      });

      const session = voiceCoordinator.startConversationSession();
      // Configure quick inactivity for test
      session.timeout_policy.inactivityPromptMs = 30;
      session.timeout_policy.inactivityCloseMs = 50;

      await voiceCoordinator.startListening();

      // Wait for inactivity prompt to fire
      await new Promise((resolve) => setTimeout(resolve, 45));

      expect(warningReceived).toBe('Are you still there?');
      expect(voiceCoordinator.getSession()?.state).toBe('awaiting_confirmation');

      // Wait for secondary timeout to return to Wake Mode
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(voiceCoordinator.getMode()).toBe('wake_mode');
      expect(voiceCoordinator.getState()).toBe('idle');
    });
  });

  // =========================================================================
  // 7. Security & Human-In-The-Loop Governance
  // =========================================================================
  describe('7. Security & Sandbox Boundary Parity', () => {
    it('voice commands requesting mutating operations respect approval gates during conversation mode', async () => {
      voiceCoordinator.startConversationSession();
      await voiceCoordinator.startListening();

      const result = await voiceCoordinator.submitVoiceCommand('Create a new file sample.txt');
      expect(result.responseSummary).toContain('requires operator authorization');
      expect(result.responseSummary).toContain('create_file');

      // Zero unauthorized side effects: file does not exist until approved
      const targetPath = path.join(testDir, 'sample.txt');
      const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
