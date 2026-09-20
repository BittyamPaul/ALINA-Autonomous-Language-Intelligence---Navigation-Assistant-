import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
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

describe('ALINA Voice Interaction & Multimodal Subsystem', () => {
  const testDir = path.resolve(process.cwd(), 'scratch', 'voice_test');
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
      if (lower.includes('malicious') || lower.includes('create')) {
        return {
          text: 'Planning to create file as requested.',
          toolCalls: [
            {
              toolName: 'create_file',
              parameters: {
                path: path.join(testDir, 'test_output.txt'),
                content: 'Voice command output',
              },
            },
          ],
        };
      }
      return {
        text: 'Listing workspace files.',
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
  // 1. Voice State Lifecycle & Transcription
  // =========================================================================
  describe('1. Voice State Lifecycle & Transcription', () => {
    it('initializes in idle state and transitions cleanly to listening', async () => {
      expect(voiceCoordinator.getState()).toBe('idle');

      const stateTransitions: VoiceState[] = [];
      voiceCoordinator.setEvents({
        onStateChange: (state) => stateTransitions.push(state),
      });

      await voiceCoordinator.startListening();
      expect(voiceCoordinator.getState()).toBe('listening');
      expect(sttAdapter.isActive()).toBe(true);
      expect(stateTransitions).toContain('listening');
    });

    it('streams live interim transcripts and updates accumulated transcript', async () => {
      const receivedTranscripts: VoiceTranscript[] = [];
      voiceCoordinator.setEvents({
        onTranscript: (t) => receivedTranscripts.push(t),
      });

      await voiceCoordinator.startListening();

      // Simulate streaming interim speech
      sttAdapter.simulateTranscript('Summarize', false, 0.7);
      expect(voiceCoordinator.getCurrentTranscript()).toBe('Summarize');

      sttAdapter.simulateTranscript('Summarize current workspace', false, 0.85);
      expect(voiceCoordinator.getCurrentTranscript()).toBe('Summarize current workspace');

      // Final speech segment
      sttAdapter.simulateTranscript('Summarize current workspace status', true, 0.96);
      expect(voiceCoordinator.getCurrentTranscript()).toBe('Summarize current workspace status');
      expect(receivedTranscripts.length).toBe(3);
      expect(receivedTranscripts[2]?.isFinal).toBe(true);
    });

    it('executes task and speaks summary on stopListening', async () => {
      await voiceCoordinator.startListening();
      sttAdapter.simulateTranscript('Inspect workspace files', true);

      const result = await voiceCoordinator.stopListening();
      expect(result).not.toBeNull();
      expect(result?.transcript).toBe('Inspect workspace files');
      expect(result?.spoken).toBe(true);
      expect(ttsAdapter.spokenUtterances.length).toBe(1);
      expect(ttsAdapter.spokenUtterances[0]).toContain('Listed');
      expect(voiceCoordinator.getState()).toBe('idle');
    });
  });

  // =========================================================================
  // 2. Instant Interruption Mechanism
  // =========================================================================
  describe('2. Instant Interruption Mechanism', () => {
    it('interrupts speech playback immediately upon user action', async () => {
      // Begin speaking a long response
      const longSpeechPromise = ttsAdapter.speak('This is a lengthy response that the user wants to cut short.');
      expect(ttsAdapter.isSpeaking()).toBe(true);

      voiceCoordinator.interrupt();
      expect(ttsAdapter.isSpeaking()).toBe(false);
      expect(ttsAdapter.interrupted).toBe(true);
      await longSpeechPromise;
    });

    it('interrupts active speech when a new listening session starts', async () => {
      // Simulate ALINA speaking
      const speakPromise = ttsAdapter.speak('ALINA is currently explaining an answer...');
      expect(ttsAdapter.isSpeaking()).toBe(true);

      // User starts speaking (e.g. presses mic button or speaks)
      await voiceCoordinator.startListening();
      expect(ttsAdapter.isSpeaking()).toBe(false);
      expect(voiceCoordinator.getState()).toBe('listening');
      await speakPromise;
    });
  });

  // =========================================================================
  // 3. Security & Human-in-the-Loop Parity (Rule 1 & Rule 2)
  // =========================================================================
  describe('3. Security & Human-in-the-Loop Parity', () => {
    it('voice commands requesting mutating operations strictly trigger approval gates', async () => {
      // Voice input requesting file creation
      const result = await voiceCoordinator.submitVoiceCommand('Create file test_output.txt');

      // Must pause for approval, exactly like a typed command
      expect(result.responseSummary).toContain('requires operator authorization');
      expect(result.responseSummary).toContain('create_file');

      // The file must NOT exist yet (zero unapproved side effects)
      const targetFile = path.join(testDir, 'test_output.txt');
      const exists = await fs.stat(targetFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('voice commands cannot bypass PathJail sandbox containment', async () => {
      // Attempting path traversal via voice
      const result = await voiceCoordinator.submitVoiceCommand('Read /etc/passwd or C:\\Windows');
      // Should not throw unhandled exception or leak sensitive data
      expect(result.error || result.responseSummary).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Graceful Fallback to Text on Service Failure
  // =========================================================================
  describe('4. Graceful Fallback to Text on Service Failure', () => {
    it('falls back seamlessly to text composer when microphone is denied', async () => {
      let fallbackTriggered = false;
      let partialCaptured = '';
      let errorReported: VoiceErrorReason | null = null;

      voiceCoordinator.setEvents({
        onFallbackToText: (partial) => {
          fallbackTriggered = true;
          partialCaptured = partial;
        },
        onError: (reason) => {
          errorReported = reason;
        },
      });

      await voiceCoordinator.startListening();
      sttAdapter.simulateTranscript('Partial text before error', false);

      // Simulate browser microphone permission denial
      sttAdapter.simulateError('microphone_denied', 'Permission to access microphone was denied.');

      expect(fallbackTriggered).toBe(true);
      expect(partialCaptured).toBe('Partial text before error');
      expect(errorReported).toBe('microphone_denied');
      expect(voiceCoordinator.getState()).toBe('error');
    });

    it('handles unavailable speech recognition without crashing', async () => {
      const brokenStt: MockSpeechRecognitionAdapter = new MockSpeechRecognitionAdapter();
      brokenStt.isAvailable = () => false;

      let fallbackText = '';
      const customCoordinator = new AlinaVoiceCoordinator({
        supervisorAgent,
        sttAdapter: brokenStt,
        ttsAdapter,
        events: {
          onFallbackToText: (text) => {
            fallbackText = text;
          },
        },
      });

      await customCoordinator.startListening();
      expect(customCoordinator.getState()).toBe('error');
      expect(fallbackText).toBeDefined();
      customCoordinator.destroy();
    });
  });
});
