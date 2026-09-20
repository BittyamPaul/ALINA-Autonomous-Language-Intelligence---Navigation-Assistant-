import {
  VoiceState,
  VoiceErrorReason,
  VoiceSessionConfig,
  VoiceSessionConfigSchema,
  TranscriptQualityTier,
  WakeWordEvent,
  VoiceOption,
  VoiceProfile,
  VoiceConversationMode,
  VoiceActivityState,
  VoiceConversationSession,
  VoiceDiagnosticTelemetry,
  isTerminationPhrase,
  extractCommandAfterWakeWord,
} from '@alina/shared';
import {
  SpeechRecognitionProvider,
  VoiceProvider,
  WakeWordProvider,
  VoiceInteractionResult,
  VoiceCoordinatorEvents,
} from './types';
import {
  WebSpeechRecognitionAdapter,
} from './speech-adapters';
import { WebNeuralSpeechProvider } from './tts-provider';
import { EnhancedSpeechRecognitionCoordinator } from './speech-recognition-service';
import { AlinaWakeWordDetector } from './wake-word-detector';
import { AlinaVoiceTelemetryTracker } from './voice-telemetry';
import { AlinaConversationalPersona } from '../personality/alina-personality';
import { AlinaSupervisorAgent } from '../supervisor-agent';

export interface EnhancedVoiceCoordinatorEvents extends VoiceCoordinatorEvents {
  onWakeWordDetected?: (event: WakeWordEvent) => void;
  onTranscriptQuality?: (record: TranscriptQualityTier) => void;
  onModeChange?: (mode: VoiceConversationMode) => void;
  onActivityStateChange?: (activityState: VoiceActivityState) => void;
  onSessionChange?: (session: VoiceConversationSession | null) => void;
  onInactivityWarning?: (prompt: string) => void;
  onTelemetryUpdate?: (telemetry: VoiceDiagnosticTelemetry) => void;
}

export interface VoiceCoordinatorOptions {
  supervisorAgent: AlinaSupervisorAgent;
  sttAdapter?: SpeechRecognitionProvider;
  ttsAdapter?: VoiceProvider;
  wakeWordDetector?: WakeWordProvider;
  speechCoordinator?: EnhancedSpeechRecognitionCoordinator;
  persona?: AlinaConversationalPersona;
  config?: Partial<VoiceSessionConfig>;
  events?: EnhancedVoiceCoordinatorEvents;
  jailRoot?: string;
  workspaceId?: string;
}

/**
 * AlinaVoiceCoordinator
 * 
 * Central coordinator managing ALINA's modular voice lifecycle across 5 decoupled layers:
 * 1. Wake-word detection (WakeWordProvider)
 * 2. Speech-to-text (SpeechRecognitionProvider)
 * 3. Natural-language processing (AlinaConversationalPersona)
 * 4. Task execution (AlinaSupervisorAgent)
 * 5. Text-to-speech (VoiceProvider - natural female persona)
 * 
 * Guarantees:
 * - Hands-free continuous multi-turn dialogue in Conversation Mode
 * - Immediate barge-in / interruption handling (halts TTS output when user speaks)
 * - Word-level deduplication and safe interim/final transcript merging
 * - Warm, calm, intelligent, natural, conversational female voice persona
 * - Strict ephemeral processing: zero raw audio storage without explicit user permission
 * - Full diagnostic telemetry tracking latencies, errors, wake activations, and durations
 */
export class AlinaVoiceCoordinator {
  private supervisorAgent: AlinaSupervisorAgent;
  private sttAdapter: SpeechRecognitionProvider;
  private ttsAdapter: VoiceProvider;
  private persona: AlinaConversationalPersona;
  private speechCoordinator: EnhancedSpeechRecognitionCoordinator;
  private wakeWordDetector?: WakeWordProvider;
  private telemetry = new AlinaVoiceTelemetryTracker();
  private config: VoiceSessionConfig;
  private events?: EnhancedVoiceCoordinatorEvents;
  private jailRoot?: string;
  private workspaceId?: string;

  private currentState: VoiceState = 'idle';
  private currentMode: VoiceConversationMode = 'wake_mode';
  private currentActivityState: VoiceActivityState = 'idle';
  private currentSession: VoiceConversationSession | null = null;
  private currentTranscript = '';
  private currentInterimText = '';
  private activeTaskId?: string;
  private unsubscribeSttTranscript?: () => void;
  private unsubscribeSttError?: () => void;
  private unsubscribeWakeDetected?: () => void;
  private inactivityPromptTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: VoiceCoordinatorOptions) {
    this.supervisorAgent = options.supervisorAgent;
    this.sttAdapter = options.sttAdapter ?? new WebSpeechRecognitionAdapter();
    this.ttsAdapter = options.ttsAdapter ?? new WebNeuralSpeechProvider();
    this.persona = options.persona ?? new AlinaConversationalPersona();
    this.speechCoordinator =
      options.speechCoordinator ??
      new EnhancedSpeechRecognitionCoordinator({
        silenceTimeoutMs: options.config?.silenceTimeoutMs ?? 1500,
        debugMode: options.config?.transcriptDebugMode ?? false,
        language: options.config?.language ?? 'en-US',
      });
    this.config = VoiceSessionConfigSchema.parse(options.config ?? {});
    this.events = options.events;
    this.jailRoot = options.jailRoot;
    this.workspaceId = options.workspaceId;

    if (options.wakeWordDetector) {
      this.wakeWordDetector = options.wakeWordDetector;
    } else if (typeof window !== 'undefined') {
      this.wakeWordDetector = new AlinaWakeWordDetector({
        triggerPhrase: this.config.wakeWordPhrase,
        sensitivity: this.config.wakeWordSensitivity,
      });
    }

    // Configure language and voice characteristics
    if (this.sttAdapter.setLanguage) {
      this.sttAdapter.setLanguage(this.config.language);
    }
    this.ttsAdapter.setSpeed(this.config.voiceRate);
    this.ttsAdapter.setPitch(this.config.voicePitch);
    this.ttsAdapter.setVolume(this.config.voiceVolume);
    if (this.config.voiceId) {
      this.ttsAdapter.setVoice(this.config.voiceId);
    }

    this.setupListeners();

    // Auto-start wake-word listener if enabled
    if (this.config.wakeWordEnabled && this.wakeWordDetector?.isAvailable()) {
      this.wakeWordDetector.start();
    }
  }

  public getState(): VoiceState {
    return this.currentState;
  }

  public getMode(): VoiceConversationMode {
    return this.currentMode;
  }

  public getActivityState(): VoiceActivityState {
    return this.currentActivityState;
  }

  public getSession(): VoiceConversationSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  public getActiveTaskId(): string | undefined {
    return this.activeTaskId;
  }

  public getCurrentTranscript(): string {
    return this.currentTranscript || this.currentInterimText;
  }

  public getConfig(): VoiceSessionConfig {
    return { ...this.config };
  }

  public getPersona(): AlinaConversationalPersona {
    return this.persona;
  }

  public getSpeechCoordinator(): EnhancedSpeechRecognitionCoordinator {
    return this.speechCoordinator;
  }

  public getWakeWordDetector(): WakeWordProvider | undefined {
    return this.wakeWordDetector;
  }

  public getSttProvider(): SpeechRecognitionProvider {
    return this.sttAdapter;
  }

  public getVoiceProvider(): VoiceProvider {
    return this.ttsAdapter;
  }

  public getTelemetry(): VoiceDiagnosticTelemetry {
    return this.telemetry.getTelemetry();
  }

  public isRawAudioRecordingAllowed(): boolean {
    return Boolean(this.config.privacy?.allowRawAudioRecording);
  }

  public isEphemeralProcessingOnly(): boolean {
    return this.config.privacy?.ephemeralProcessingOnly !== false;
  }

  public updateConfig(newConfig: Partial<VoiceSessionConfig>): void {
    this.config = VoiceSessionConfigSchema.parse({ ...this.config, ...newConfig });
    if (newConfig.silenceTimeoutMs) {
      this.speechCoordinator.setSilenceTimeout(newConfig.silenceTimeoutMs);
    }
    if (newConfig.language) {
      this.speechCoordinator.setLanguage(newConfig.language);
      if (this.sttAdapter.setLanguage) {
        this.sttAdapter.setLanguage(newConfig.language);
      }
    }
    if (newConfig.voiceRate !== undefined) {
      this.ttsAdapter.setSpeed(newConfig.voiceRate);
    }
    if (newConfig.voicePitch !== undefined) {
      this.ttsAdapter.setPitch(newConfig.voicePitch);
    }
    if (newConfig.voiceVolume !== undefined) {
      this.ttsAdapter.setVolume(newConfig.voiceVolume);
    }
    if (newConfig.voiceId !== undefined) {
      this.ttsAdapter.setVoice(newConfig.voiceId);
    }
    if (newConfig.transcriptDebugMode !== undefined) {
      this.speechCoordinator.setDebugMode(newConfig.transcriptDebugMode);
    }
    if (newConfig.wakeWordEnabled !== undefined) {
      if (newConfig.wakeWordEnabled && this.wakeWordDetector?.isAvailable() && this.currentMode === 'wake_mode') {
        this.wakeWordDetector.start();
      } else if (!newConfig.wakeWordEnabled) {
        this.wakeWordDetector?.stop();
      }
    }
  }

  public setEvents(events: EnhancedVoiceCoordinatorEvents): void {
    this.events = events;
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    return this.ttsAdapter.getAvailableVoices();
  }

  public setVoice(voiceId: string): void {
    this.config.voiceId = voiceId;
    this.ttsAdapter.setVoice(voiceId);
  }

  public setSpeed(speed: number): void {
    this.config.voiceRate = speed;
    this.ttsAdapter.setSpeed(speed);
  }

  public setPitch(pitch: number): void {
    this.config.voicePitch = pitch;
    this.ttsAdapter.setPitch(pitch);
  }

  public setVolume(volume: number): void {
    this.config.voiceVolume = volume;
    this.ttsAdapter.setVolume(volume);
  }

  public getVoiceProfile(): VoiceProfile {
    return this.ttsAdapter.getVoiceProfile();
  }

  /**
   * Initializes or activates a persistent VoiceConversationSession.
   * Transitions from WAKE MODE -> CONVERSATION MODE.
   */
  public startConversationSession(conversationId?: string): VoiceConversationSession {
    this.clearInactivityTimers();
    this.telemetry.startSession();

    const session: VoiceConversationSession = {
      session_id: `vcs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      state: 'conversation_mode',
      conversation_id: conversationId || `conv_${Date.now()}`,
      voice_enabled: true,
      wake_word_enabled: this.config.wakeWordEnabled,
      timeout_policy: {
        utteranceSilenceMs: this.config.silenceTimeoutMs ?? 1500,
        inactivityPromptMs: 20000,
        inactivityCloseMs: 10000,
        maxSessionDurationMs: 1800000,
      },
    };

    this.currentSession = session;
    this.currentMode = 'conversation_mode';
    this.wakeWordDetector?.stop();

    if (this.events?.onModeChange) {
      this.events.onModeChange('conversation_mode');
    }
    if (this.events?.onSessionChange) {
      this.events.onSessionChange(session);
    }
    this.emitTelemetry();

    return session;
  }

  /**
   * Explicitly terminates active Conversation Mode and returns cleanly to Wake Mode.
   */
  public endConversationSession(_closingReason = 'user_requested'): void {
    this.clearInactivityTimers();
    this.telemetry.endSession();

    if (this.currentSession) {
      this.currentSession.state = 'ended';
      this.currentSession.last_activity = new Date().toISOString();
    }
    this.currentSession = null;
    this.currentMode = 'wake_mode';
    this.transitionActivityState('idle');
    this.transitionState('idle');

    if (this.events?.onModeChange) {
      this.events.onModeChange('wake_mode');
    }
    if (this.events?.onSessionChange) {
      this.events.onSessionChange(null);
    }

    void this.sttAdapter.stopListening();
    this.resumeWakeWordIfNeeded();
    this.emitTelemetry();
  }

  /**
   * Begins listening for voice input via microphone.
   * If currently in Wake Mode, starts Conversation Mode.
   */
  public async startListening(): Promise<void> {
    // If ALINA or TTS is currently speaking, interrupt playback first
    if (this.currentState === 'speaking' || this.ttsAdapter.isSpeaking()) {
      this.interrupt();
    }

    // Ensure session is started for conversation mode
    if (this.currentMode === 'wake_mode' || !this.currentSession) {
      this.startConversationSession();
    }

    // Temporarily pause wake-word detector while actively recording
    this.wakeWordDetector?.stop();

    if (!this.sttAdapter.isAvailable()) {
      this.handleError(
        'speech_service_unavailable',
        'Speech recognition service is unavailable. Falling back to text composer.'
      );
      return;
    }

    this.speechCoordinator.reset('listening');
    this.currentTranscript = '';
    this.currentInterimText = '';
    this.transitionState('listening');
    this.transitionActivityState('listening');

    this.telemetry.recordSpeechStart();
    this.resetInactivityTimers();

    try {
      await this.sttAdapter.startListening(this.config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleError('speech_service_unavailable', msg);
    }
  }

  /**
   * Stops listening and dispatches accumulated speech or cleanly ends conversation.
   */
  public async stopListening(): Promise<VoiceInteractionResult | null> {
    if (this.currentState !== 'listening') {
      return null;
    }

    this.clearInactivityTimers();
    await this.sttAdapter.stopListening();

    let committedGoal = '';
    this.speechCoordinator.finalize((quality) => {
      committedGoal = quality.normalizedInput;
      this.telemetry.recordFinalTranscript();
      if (this.events?.onTranscriptQuality) {
        this.events.onTranscriptQuality(quality);
      }
    });

    const finalGoal = (committedGoal || this.currentTranscript || this.currentInterimText).trim();

    if (!finalGoal) {
      this.endConversationSession('manual_stop');
      return null;
    }

    return this.submitVoiceCommand(finalGoal, false);
  }

  /**
   * Immediately halts active speech synthesis or speech recognition.
   */
  public interrupt(): void {
    const wasSpeaking = this.currentState === 'speaking' || this.ttsAdapter.isSpeaking();
    const wasListening = this.currentState === 'listening';

    if (wasSpeaking) {
      this.ttsAdapter.stop();
      this.telemetry.recordInterruption();
    }

    if (wasListening) {
      this.sttAdapter.abort();
    }

    this.clearInactivityTimers();
    this.speechCoordinator.reset('idle');
    this.transitionState('interrupted');
    this.transitionActivityState('interrupted');
    this.emitTelemetry();

    setTimeout(() => {
      if (this.currentState === 'interrupted') {
        if (this.currentMode === 'conversation_mode') {
          this.transitionState('idle');
          this.transitionActivityState('idle');
        } else {
          this.transitionState('idle');
          this.transitionActivityState('idle');
          this.resumeWakeWordIfNeeded();
        }
      }
    }, 150);
  }

  /**
   * Submits a transcribed voice command to the supervisor agent.
   * Handles natural termination phrases, persona summaries, natural female TTS synthesis,
   * and automatically loops back to listening when in Conversation Mode.
   */
  public async submitVoiceCommand(goal: string, autoResumeInConversation = true): Promise<VoiceInteractionResult> {
    const startTime = Date.now();
    this.clearInactivityTimers();
    this.telemetry.markCommandReceived();

    // 1. Natural Termination Check: e.g. "That's all, Alina", "Goodbye Alina", "Stop listening", "End conversation"
    if (isTerminationPhrase(goal)) {
      const closingSummary = 'Goodbye! Let me know whenever you need me.';
      this.transitionState('speaking');
      this.transitionActivityState('speaking');

      if (this.events?.onSpokenSummary) {
        this.events.onSpokenSummary(closingSummary);
      }

      if (this.config.ttsEnabled && this.ttsAdapter.isAvailable()) {
        try {
          await this.ttsAdapter.speak(closingSummary, {
            rate: this.config.voiceRate,
            pitch: this.config.voicePitch,
            volume: this.config.voiceVolume,
            language: this.config.language,
            voiceId: this.config.voiceId,
          });
        } catch {}
      }

      this.endConversationSession('user_terminated');

      return {
        transcript: goal,
        responseSummary: closingSummary,
        spoken: true,
        interrupted: false,
        durationMs: Date.now() - startTime,
        terminatedSession: true,
        telemetry: this.getTelemetry(),
      };
    }

    // 2. Standard Command Execution
    if (this.currentSession) {
      this.currentSession.last_activity = new Date().toISOString();
    }
    this.transitionState('processing');
    this.transitionActivityState('thinking');

    const taskId = `voice_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.activeTaskId = taskId;

    if (this.events?.onTaskDispatched) {
      this.events.onTaskDispatched(taskId, goal);
    }

    try {
      // Execute through standard Supervisor Agent pipeline
      const execResult = await this.supervisorAgent.execute({
        taskId,
        goal,
        jailRoot: this.jailRoot,
        workspaceId: this.workspaceId,
      });

      // Format response through AlinaConversationalPersona
      let rawSummary = execResult.resultSummary;
      if (execResult.status === 'waiting_for_approval') {
        rawSummary = `tool: ${execResult.approvalRequest?.toolName ?? 'system operation'}`;
      } else if (execResult.status === 'failed') {
        rawSummary = execResult.error || execResult.resultSummary;
      }

      const responseSummary = this.persona.formatSpokenSummary(
        rawSummary,
        execResult.status as 'completed' | 'failed' | 'waiting_for_approval'
      );

      let spoken = false;
      let interrupted = false;

      // Natural Female TTS playback if enabled
      if (this.config.ttsEnabled && responseSummary && this.ttsAdapter.isAvailable()) {
        this.transitionState('speaking');
        this.transitionActivityState('speaking');
        if (this.events?.onSpokenSummary) {
          this.events.onSpokenSummary(responseSummary);
        }

        try {
          await this.ttsAdapter.speak(responseSummary, {
            rate: this.config.voiceRate,
            pitch: this.config.voicePitch,
            volume: this.config.voiceVolume,
            language: this.config.language,
            voiceId: this.config.voiceId,
          });
          spoken = true;
        } catch {
          spoken = false;
        }

        if (this.currentState === 'interrupted') {
          interrupted = true;
        }
      }

      // Hands-free continuous multi-turn loop:
      // If we are in Conversation Mode and not interrupted, automatically resume listening for the next command!
      if (this.currentMode === 'conversation_mode' && !interrupted && autoResumeInConversation) {
        void this.startListening();
      } else {
        this.transitionState('idle');
        this.transitionActivityState('idle');
        this.resumeWakeWordIfNeeded();
      }

      this.emitTelemetry();

      return {
        transcript: goal,
        responseSummary,
        spoken,
        interrupted,
        durationMs: Date.now() - startTime,
        taskId,
        telemetry: this.getTelemetry(),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.transitionState('error');
      this.transitionActivityState('error');
      this.handleError('unknown', errorMsg);
      this.resumeWakeWordIfNeeded();

      return {
        transcript: goal,
        responseSummary: `Error executing voice command: ${errorMsg}`,
        spoken: false,
        interrupted: false,
        durationMs: Date.now() - startTime,
        taskId,
        error: errorMsg,
        telemetry: this.getTelemetry(),
      };
    }
  }

  public destroy(): void {
    this.clearInactivityTimers();
    if (this.unsubscribeSttTranscript) this.unsubscribeSttTranscript();
    if (this.unsubscribeSttError) this.unsubscribeSttError();
    if (this.unsubscribeWakeDetected) this.unsubscribeWakeDetected();
    this.wakeWordDetector?.cleanup?.();
    this.sttAdapter.cleanup?.();
    this.ttsAdapter.cleanup?.();
    this.speechCoordinator.cleanup();
    this.telemetry.reset();
  }

  private setupListeners(): void {
    this.speechCoordinator.setActivityStateListener((activityState) => {
      this.transitionActivityState(activityState);
      if (activityState === 'silence') {
        this.telemetry.recordSilenceOnset();
      }
    });

    if (this.wakeWordDetector) {
      this.unsubscribeWakeDetected = this.wakeWordDetector.onDetected((event) => {
        this.handleWakeWordTriggered(event);
      });
    }

    this.unsubscribeSttTranscript = this.sttAdapter.onTranscript((transcript) => {
      // Barge-in check: if ALINA is speaking when user speech arrives, halt TTS immediately
      if (this.currentState === 'speaking' || this.ttsAdapter.isSpeaking()) {
        this.ttsAdapter.stop();
        this.telemetry.recordInterruption();
        this.transitionState('interrupted');
      }

      // User speech activity detected: reset inactivity timers
      this.clearInactivityTimers();

      if (!transcript.isFinal) {
        this.telemetry.recordInterimTranscript();
      }

      this.speechCoordinator.handleTranscriptEvent(
        transcript,
        (quality) => {
          this.currentTranscript = quality.normalizedInput;
          this.telemetry.recordFinalTranscript();
          if (this.events?.onTranscriptQuality) {
            this.events.onTranscriptQuality(quality);
          }
          if (this.config.autoSubmitOnSilence && (this.currentState === 'listening' || this.currentState === 'interrupted')) {
            const goal = quality.normalizedInput.trim();
            if (goal) {
              void this.submitVoiceCommand(goal);
            }
          }
        },
        (interimCombined) => {
          this.currentInterimText = interimCombined;
          if (this.events?.onTranscript) {
            this.events.onTranscript({
              text: interimCombined,
              isFinal: transcript.isFinal,
              confidence: transcript.confidence,
              interimText: interimCombined,
            });
          }
        }
      );
    });

    this.unsubscribeSttError = this.sttAdapter.onError((reason, message) => {
      this.telemetry.recordRecognitionError(reason);
      this.handleError(reason, message);
    });
  }

  private handleWakeWordTriggered(event: WakeWordEvent): void {
    if (this.currentMode === 'conversation_mode' && this.currentState !== 'idle') return;

    this.telemetry.recordWakeWordDetection();

    if (this.events?.onWakeWordDetected) {
      this.events.onWakeWordDetected(event);
    }

    // WAKE MODE -> CONVERSATION MODE transition
    this.startConversationSession();

    // Check if user spoke "Hey Alina, <command>" in one continuous utterance
    const parsed = extractCommandAfterWakeWord(event.detectedPhrase, this.config.wakeWordPhrase);
    if (parsed.isWake && parsed.command) {
      void this.submitVoiceCommand(parsed.command);
    } else {
      // Begin listening for the first command
      void this.startListening();
    }
  }

  private resetInactivityTimers(): void {
    this.clearInactivityTimers();
    if (this.currentMode !== 'conversation_mode' || !this.currentSession) {
      return;
    }

    const promptDelay = this.currentSession.timeout_policy.inactivityPromptMs ?? 20000;
    const closeDelay = this.currentSession.timeout_policy.inactivityCloseMs ?? 10000;

    this.inactivityPromptTimer = setTimeout(() => {
      this.handleInactivityPrompt(closeDelay);
    }, promptDelay);
  }

  private handleInactivityPrompt(closeDelay: number): void {
    if (this.currentMode !== 'conversation_mode' || this.currentState === 'processing' || this.currentState === 'speaking') {
      return;
    }

    const promptText = 'Are you still there?';
    this.transitionActivityState('silence');
    if (this.currentSession) {
      this.currentSession.state = 'awaiting_confirmation';
    }

    if (this.events?.onInactivityWarning) {
      this.events.onInactivityWarning(promptText);
    }

    if (this.config.ttsEnabled && this.ttsAdapter.isAvailable()) {
      void this.ttsAdapter.speak(promptText, {
        rate: this.config.voiceRate,
        pitch: this.config.voicePitch,
        volume: this.config.voiceVolume,
        language: this.config.language,
        voiceId: this.config.voiceId,
      });
    }

    this.inactivityCloseTimer = setTimeout(() => {
      if (this.currentMode === 'conversation_mode' && this.currentState !== 'processing') {
        this.endConversationSession('inactivity_timeout');
      }
    }, closeDelay);
  }

  private clearInactivityTimers(): void {
    if (this.inactivityPromptTimer) {
      clearTimeout(this.inactivityPromptTimer);
      this.inactivityPromptTimer = null;
    }
    if (this.inactivityCloseTimer) {
      clearTimeout(this.inactivityCloseTimer);
      this.inactivityCloseTimer = null;
    }
  }

  private resumeWakeWordIfNeeded(): void {
    if (this.currentMode === 'wake_mode' && this.config.wakeWordEnabled && this.wakeWordDetector?.isAvailable() && !this.wakeWordDetector.isActive()) {
      this.wakeWordDetector.start();
    }
  }

  private transitionState(newState: VoiceState): void {
    this.currentState = newState;
    if (this.events?.onStateChange) {
      this.events.onStateChange(newState);
    }
  }

  private transitionActivityState(newState: VoiceActivityState): void {
    this.currentActivityState = newState;
    if (this.events?.onActivityStateChange) {
      this.events.onActivityStateChange(newState);
    }
  }

  private emitTelemetry(): void {
    if (this.events?.onTelemetryUpdate) {
      this.events.onTelemetryUpdate(this.getTelemetry());
    }
  }

  private handleError(reason: VoiceErrorReason, message: string): void {
    this.transitionState('error');
    this.transitionActivityState('error');
    if (this.events?.onError) {
      this.events.onError(reason, message);
    }
    if (this.events?.onFallbackToText) {
      const partial = this.currentTranscript || this.currentInterimText;
      this.events.onFallbackToText(partial);
    }
    this.emitTelemetry();

    setTimeout(() => {
      if (this.currentState === 'error') {
        if (this.currentMode === 'conversation_mode') {
          this.transitionState('idle');
          this.transitionActivityState('idle');
        } else {
          this.transitionState('idle');
          this.transitionActivityState('idle');
          this.resumeWakeWordIfNeeded();
        }
      }
    }, 1500);
  }
}
