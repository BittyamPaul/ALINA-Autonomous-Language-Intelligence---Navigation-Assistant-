import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  mergeTranscriptSegmentsSafely,
  VoiceSessionConfigSchema,
} from '../packages/shared/src';
import {
  AlinaVoiceCoordinator,
  MockSpeechRecognitionAdapter,
  MockSpeechSynthesisAdapter,
  MockWakeWordProvider,
  AlinaSupervisorAgent,
  MockModelAdapter,
  AuthorizationManager,
  AlinaVoiceTelemetryTracker,
} from '../packages/agent/src';
import { createAlinaMcpToolRegistry } from '../packages/tools/src';

describe('ALINA Voice Architecture: Decoupled Providers, Female TTS, Telemetry & Privacy', () => {
  const testDir = path.resolve(process.cwd(), 'scratch', 'voice_pipeline_test');
  let sttAdapter: MockSpeechRecognitionAdapter;
  let ttsAdapter: MockSpeechSynthesisAdapter;
  let wakeDetector: MockWakeWordProvider;
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
          text: 'Opening backend folder and listing contents.',
          toolCalls: [
            {
              toolName: 'list_files',
              parameters: { path: testDir, recursive: false },
            },
          ],
        };
      } else if (lower.includes('create') || lower.includes('new file')) {
        return {
          text: 'File created successfully.',
          toolCalls: [
            {
              toolName: 'create_file',
              parameters: {
                path: path.join(testDir, 'script.ts'),
                content: 'console.log("Voice created script");',
              },
            },
          ],
        };
      } else if (lower.includes('project')) {
        return {
          text: 'Project opened and initialized.',
          toolCalls: [
            {
              toolName: 'list_files',
              parameters: { path: testDir, recursive: false },
            },
          ],
        };
      }
      return {
        text: 'Command processed cleanly.',
        toolCalls: [],
      };
    });

    supervisorAgent = new AlinaSupervisorAgent({
      mcpRegistry,
      modelAdapter: mockModel,
      authorizationManager: authManager,
    });

    sttAdapter = new MockSpeechRecognitionAdapter();
    ttsAdapter = new MockSpeechSynthesisAdapter();
    wakeDetector = new MockWakeWordProvider();

    voiceCoordinator = new AlinaVoiceCoordinator({
      supervisorAgent,
      sttAdapter,
      ttsAdapter,
      wakeWordDetector: wakeDetector,
      jailRoot: testDir,
      config: {
        ttsEnabled: true,
        voiceRate: 1.0,
        voicePitch: 1.0,
        voiceVolume: 1.0,
        silenceTimeoutMs: 30, // fast endpointing for unit tests
        wakeWordEnabled: true,
        wakeWordPhrase: 'Hey Alina',
        language: 'en-US',
      },
    });
  });

  afterEach(async () => {
    voiceCoordinator.destroy();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('1. Architecture test: wake word -> conversation -> task -> response -> follow-up -> another task -> end conversation', async () => {
    expect(voiceCoordinator.getMode()).toBe('wake_mode');
    expect(voiceCoordinator.getSession()).toBeNull();

    // Step 1: Wake word detected ("Hey Alina")
    wakeDetector.simulateWakeWord('Hey Alina');
    expect(voiceCoordinator.getMode()).toBe('conversation_mode');
    expect(voiceCoordinator.getSession()).not.toBeNull();
    expect(voiceCoordinator.getState()).toBe('listening');

    // Step 2: Task 1 ("open my project")
    sttAdapter.simulateTranscript('open my project', true);
    await new Promise((r) => setTimeout(r, 90));

    // ALINA executed task 1, synthesized female TTS response, and stayed in conversation mode hands-free
    expect(ttsAdapter.spokenUtterances.length).toBeGreaterThanOrEqual(1);
    expect(ttsAdapter.spokenUtterances[0]).toContain('Listed 0 file(s)');
    expect(voiceCoordinator.getMode()).toBe('conversation_mode');
    expect(voiceCoordinator.getState()).toBe('listening');

    // Step 3: Follow-up request ("now open the backend folder") without pressing microphone
    sttAdapter.simulateTranscript('now open the backend folder', true);
    await new Promise((r) => setTimeout(r, 90));

    expect(ttsAdapter.spokenUtterances.length).toBeGreaterThanOrEqual(2);
    expect(ttsAdapter.spokenUtterances[1]).toContain('Listed 0 file(s)');
    expect(voiceCoordinator.getMode()).toBe('conversation_mode');
    expect(voiceCoordinator.getState()).toBe('listening');

    // Step 4: Another task ("create a new file")
    sttAdapter.simulateTranscript('create a new file', true);
    await new Promise((r) => setTimeout(r, 90));

    expect(ttsAdapter.spokenUtterances.length).toBeGreaterThanOrEqual(3);
    expect(ttsAdapter.spokenUtterances[2]).toContain('authorization');
    expect(voiceCoordinator.getMode()).toBe('conversation_mode');
    expect(voiceCoordinator.getState()).toBe('listening');

    const createdPath = path.join(testDir, 'script.ts');
    const fileExists = await fs.stat(createdPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(false); // Security Rule 1: No destructive modification without operator approval

    // Step 5: Natural end conversation ("That's all, Alina")
    sttAdapter.simulateTranscript("That's all, Alina", true);
    await new Promise((r) => setTimeout(r, 90));

    // ALINA acknowledges with closing farewell and returns to wake_mode
    expect(voiceCoordinator.getMode()).toBe('wake_mode');
    expect(voiceCoordinator.getSession()).toBeNull();
    expect(voiceCoordinator.getState()).toBe('idle');
    expect(ttsAdapter.spokenUtterances[ttsAdapter.spokenUtterances.length - 1]).toContain('Goodbye');
  });

  it('2. Natural female voice profile characteristics and configurability', async () => {
    const profile = voiceCoordinator.getVoiceProfile();
    expect(profile.gender).toBe('female');
    expect(profile.tone).toBe('warm');
    expect(profile.description).toContain('Warm, calm, intelligent, natural, conversational, professional');

    // Configurable voice parameters: speed, volume, pitch, voice
    voiceCoordinator.setSpeed(1.25);
    voiceCoordinator.setPitch(1.1);
    voiceCoordinator.setVolume(0.85);
    voiceCoordinator.setVoice('mock_natural_aria');

    const updatedConfig = voiceCoordinator.getConfig();
    expect(updatedConfig.voiceRate).toBe(1.25);
    expect(updatedConfig.voicePitch).toBe(1.1);
    expect(updatedConfig.voiceVolume).toBe(0.85);
    expect(updatedConfig.voiceId).toBe('mock_natural_aria');

    const updatedProfile = voiceCoordinator.getVoiceProfile();
    expect(updatedProfile.rate).toBe(1.25);
    expect(updatedProfile.pitch).toBe(1.1);
    expect(updatedProfile.volume).toBe(0.85);
  });

  it('3. Interruption / Barge-in: stops TTS when user speaks and resumes listening naturally', async () => {
    voiceCoordinator.startConversationSession();
    expect(voiceCoordinator.getMode()).toBe('conversation_mode');

    // Make ALINA start speaking a longer response
    const speakPromise = voiceCoordinator.submitVoiceCommand('open my project', false);
    await new Promise((r) => setTimeout(r, 10)); // let execution reach speaking

    expect(voiceCoordinator.getState()).toBe('speaking');
    expect(ttsAdapter.isSpeaking()).toBe(true);

    // User interrupts by speaking while ALINA is speaking
    sttAdapter.simulateTranscript('Actually stop that', false);

    // TTS must be halted immediately!
    expect(ttsAdapter.isSpeaking()).toBe(false);
    expect(ttsAdapter.interrupted).toBe(true);

    const result = await speakPromise;
    expect(result.interrupted).toBe(true);

    // Telemetry recorded the interruption
    const telemetry = voiceCoordinator.getTelemetry();
    expect(telemetry.interruptionsCount).toBeGreaterThanOrEqual(1);
  });

  it('4. Safe partial transcript merging and overlap deduplication', () => {
    // Exact duplicate
    expect(mergeTranscriptSegmentsSafely('open project', 'open project')).toBe('open project');

    // Trailing overlap
    expect(mergeTranscriptSegmentsSafely('open my project', 'project and run tests')).toBe('open my project and run tests');

    // Multi-word suffix-to-prefix overlap
    expect(mergeTranscriptSegmentsSafely('navigate to the backend', 'the backend directory')).toBe('navigate to the backend directory');

    // Subsumed incoming
    expect(mergeTranscriptSegmentsSafely('create a new file', 'create a new file in workspace')).toBe('create a new file in workspace');

    // Disjoint phrases
    expect(mergeTranscriptSegmentsSafely('first step', 'second step')).toBe('first step second step');
  });

  it('5. Diagnostic Telemetry: latencies, counts, errors, false activations, duration', async () => {
    const telemetryTracker = new AlinaVoiceTelemetryTracker();
    telemetryTracker.startSession();
    telemetryTracker.recordWakeWordDetection();
    telemetryTracker.recordSpeechStart();

    await new Promise((r) => setTimeout(r, 15));
    telemetryTracker.recordInterimTranscript();
    telemetryTracker.recordInterimTranscript();

    telemetryTracker.recordSilenceOnset();
    await new Promise((r) => setTimeout(r, 15));
    telemetryTracker.recordFinalTranscript();
    telemetryTracker.recordRecognitionError('network_timeout');
    telemetryTracker.markCommandReceived();
    telemetryTracker.endSession();

    const stats = telemetryTracker.getTelemetry();
    expect(stats.wakeWordDetectionCount).toBe(1);
    expect(stats.interimTranscriptCount).toBe(2);
    expect(stats.recognitionErrors).toBe(1);
    expect(stats.recognitionLatencyMs).toBeGreaterThan(0);
    expect(stats.finalTranscriptLatencyMs).toBeGreaterThan(0);
    expect(stats.conversationDurationMs).toBeGreaterThan(0);
    expect(stats.falseActivations).toBe(0);
  });

  it('6. False activation tracking in telemetry', () => {
    const tracker = new AlinaVoiceTelemetryTracker();
    tracker.startSession();
    tracker.recordWakeWordDetection();
    // No command received before session closed!
    tracker.endSession();

    const stats = tracker.getTelemetry();
    expect(stats.wakeWordDetectionCount).toBe(1);
    expect(stats.falseActivations).toBe(1);
  });

  it('7. Privacy setting: raw audio recording is disabled by default & transient audio only', () => {
    const defaultConfig = VoiceSessionConfigSchema.parse({});
    expect(defaultConfig.privacy.allowRawAudioRecording).toBe(false);
    expect(defaultConfig.privacy.ephemeralProcessingOnly).toBe(true);
    expect(defaultConfig.privacy.retainAudioDataOnDisk).toBe(false);

    expect(voiceCoordinator.isRawAudioRecordingAllowed()).toBe(false);
    expect(voiceCoordinator.isEphemeralProcessingOnly()).toBe(true);

    // Enabling explicitly
    voiceCoordinator.updateConfig({
      privacy: {
        allowRawAudioRecording: true,
        ephemeralProcessingOnly: false,
        enableTelemetry: true,
        anonymizeTranscripts: false,
        retainAudioDataOnDisk: false,
      },
    });
    expect(voiceCoordinator.isRawAudioRecordingAllowed()).toBe(true);
  });

  it('8. Replaceable provider contracts: decoupled implementations can be swapped without touching agent', () => {
    const stt = voiceCoordinator.getSttProvider();
    const tts = voiceCoordinator.getVoiceProvider();
    const wake = voiceCoordinator.getWakeWordDetector();

    expect(stt.providerName).toBe('mock_speech_recognition');
    expect(tts.providerName).toBe('mock_speech_synthesis');
    expect(wake?.providerName).toBe('mock_wake_word_provider');
  });
});
