import {
  VoiceState,
  VoiceErrorReason,
  VoiceSessionConfig,
  VoiceSessionConfigSchema,
  TranscriptQualityTier,
  WakeWordEvent,
  VoiceOption,
  VoiceConversationMode,
  VoiceActivityState,
  VoiceConversationSession,
  isTerminationPhrase,
  extractCommandAfterWakeWord,
} from '@alina/shared';
import {
  SpeechToTextAdapter,
  TextToSpeechAdapter,
  VoiceInteractionResult,
  VoiceCoordinatorEvents,
} from './types';
import {
  WebSpeechRecognitionAdapter,
} from './speech-adapters';
import { TextToSpeechProvider, WebNeuralSpeechProvider } from './tts-provider';
import { EnhancedSpeechRecognitionCoordinator } from './speech-recognition-service';
import { AlinaWakeWordDetector } from './wake-word-detector';
import { AlinaConversationalPersona } from '../personality/alina-personality';
import { AlinaSupervisorAgent } from '../supervisor-agent';

export interface EnhancedVoiceCoordinatorEvents extends VoiceCoordinatorEvents {
  onWakeWordDetected?: (event: WakeWordEvent) => void;
  onTranscriptQuality?: (record: TranscriptQualityTier) => void;
  onModeChange?: (mode: VoiceConversationMode) => void;
  onActivityStateChange?: (activityState: VoiceActivityState) => void;
  onSessionChange?: (session: VoiceConversationSession | null) => void;
  onInactivityWarning?: (prompt: string) => void;
}

export interface VoiceCoordinatorOptions {
  supervisorAgent: AlinaSupervisorAgent;
  sttAdapter?: SpeechToTextAdapter;
  ttsAdapter?: TextToSpeechAdapter | TextToSpeechProvider;
  persona?: AlinaConversationalPersona;
  wakeWordDetector?: AlinaWakeWordDetector;
  speechCoordinator?: EnhancedSpeechRecognitionCoordinator;
  config?: Partial<VoiceSessionConfig>;
  events?: EnhancedVoiceCoordinatorEvents;
  jailRoot?: string;
  workspaceId?: string;
}

/**
 * AlinaVoiceCoordinator
 * 
 * Central coordinator managing ALINA's multimodal voice lifecycle with two distinct modes:
 * - MODE 1: WAKE MODE (listens only for "Hey Alina")
 * - MODE 2: CONVERSATION MODE (continuous hands-free multi-turn conversation)
 * 
 * Guarantees:
 * - Hands-free continuous interaction: does NOT require repeated button taps between sentences
 * - Voice Activity Detection (VAD): distinguishes thinking, speaking, user speaking, silence, end_of_utterance
 * - Natural conversation termination: supports "That's all, Alina", "Goodbye Alina", "Stop listening", "End conversation"
 * - Inactivity safety guards: prompts "Are you still there?" after inactivity, then returns cleanly to Wake Mode
 * - Instant interruption support: cuts off audio synthesis immediately on Escape or user action
 * - Full parity with text tasks: routes through identical supervisor & authorization gates
 */
export class AlinaVoiceCoordinator {
  private supervisorAgent: AlinaSupervisorAgent;
  private sttAdapter: SpeechToTextAdapter;
  private ttsAdapter: TextToSpeechAdapter | TextToSpeechProvider;
  private persona: AlinaConversationalPersona;
  private speechCoordinator: EnhancedSpeechRecognitionCoordinator;
  private wakeWordDetector?: AlinaWakeWordDetector;
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
  private inactivityPromptTimer: any = null;
  private inactivityCloseTimer: any = null;

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
        onDetected: (event) => this.handleWakeWordTriggered(event),
      });
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

  public getWakeWordDetector(): AlinaWakeWordDetector | undefined {
    return this.wakeWordDetector;
  }

  public updateConfig(newConfig: Partial<VoiceSessionConfig>): void {
    this.config = VoiceSessionConfigSchema.parse({ ...this.config, ...newConfig });
    if (newConfig.silenceTimeoutMs) {
      this.speechCoordinator.setSilenceTimeout(newConfig.silenceTimeoutMs);
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
    if ('getAvailableVoices' in this.ttsAdapter) {
      return this.ttsAdapter.getAvailableVoices();
    }
    return [];
  }

  public setVoice(voiceId: string): void {
    this.config.voiceId = voiceId;
    if ('setVoice' in this.ttsAdapter) {
      this.ttsAdapter.setVoice(voiceId);
    }
  }

  /**
   * Initializes or activates a persistent VoiceConversationSession.
   * Transitions from WAKE MODE -> CONVERSATION MODE.
   */
  public startConversationSession(conversationId?: string): VoiceConversationSession {
    this.clearInactivityTimers();
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

    return session;
  }

  /**
   * Explicitly terminates active Conversation Mode and returns cleanly to Wake Mode.
   */
  public endConversationSession(_closingReason = 'user_requested'): void {
    this.clearInactivityTimers();
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
    }

    if (wasListening) {
      this.sttAdapter.abort();
    }

    this.clearInactivityTimers();
    this.speechCoordinator.reset('idle');
    this.transitionState('interrupted');
    this.transitionActivityState('interrupted');

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
   * Handles natural termination phrases, persona summaries, TTS synthesis,
   * and automatically loops back to listening when in Conversation Mode.
   */
  public async submitVoiceCommand(goal: string, autoResumeInConversation = true): Promise<VoiceInteractionResult> {
    const startTime = Date.now();
    this.clearInactivityTimers();

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
          if ('speak' in this.ttsAdapter) {
            await (this.ttsAdapter as any).speak(closingSummary, {
              rate: this.config.voiceRate,
              pitch: this.config.voicePitch,
              volume: this.config.voiceVolume,
              language: this.config.language,
              voiceId: this.config.voiceId,
            });
          }
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

      // Text-to-Speech playback if enabled
      if (this.config.ttsEnabled && responseSummary && this.ttsAdapter.isAvailable()) {
        this.transitionState('speaking');
        this.transitionActivityState('speaking');
        if (this.events?.onSpokenSummary) {
          this.events.onSpokenSummary(responseSummary);
        }

        try {
          if ('speak' in this.ttsAdapter) {
            await (this.ttsAdapter as any).speak(responseSummary, {
              rate: this.config.voiceRate,
              pitch: this.config.voicePitch,
              volume: this.config.voiceVolume,
              language: this.config.language,
              voiceId: this.config.voiceId,
            });
          }
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

      return {
        transcript: goal,
        responseSummary,
        spoken,
        interrupted,
        durationMs: Date.now() - startTime,
        taskId,
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
      };
    }
  }

  public destroy(): void {
    this.clearInactivityTimers();
    if (this.unsubscribeSttTranscript) this.unsubscribeSttTranscript();
    if (this.unsubscribeSttError) this.unsubscribeSttError();
    this.wakeWordDetector?.stop();
    this.ttsAdapter.stop();
    this.sttAdapter.abort();
    this.speechCoordinator.reset('idle');
  }

  private setupListeners(): void {
    this.speechCoordinator.setActivityStateListener((activityState) => {
      this.transitionActivityState(activityState);
    });

    this.unsubscribeSttTranscript = this.sttAdapter.onTranscript((transcript) => {
      // User speech activity detected: reset inactivity timers
      this.clearInactivityTimers();

      this.speechCoordinator.handleTranscriptEvent(
        transcript,
        (quality) => {
          this.currentTranscript = quality.normalizedInput;
          if (this.events?.onTranscriptQuality) {
            this.events.onTranscriptQuality(quality);
          }
          if (this.config.autoSubmitOnSilence && this.currentState === 'listening') {
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
      this.handleError(reason, message);
    });
  }

  private handleWakeWordTriggered(event: WakeWordEvent): void {
    if (this.currentMode === 'conversation_mode' && this.currentState !== 'idle') return;

    if (this.events?.onWakeWordDetected) {
      this.events.onWakeWordDetected(event);
    }

    // WAKE MODE -> CONVERSATION MODE transition
    this.startConversationSession();

    // Check if user spoke "Hey Alina, <command>" in one continuous breath
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
      if ('speak' in this.ttsAdapter) {
        void (this.ttsAdapter as any).speak(promptText, {
          rate: this.config.voiceRate,
          pitch: this.config.voicePitch,
          volume: this.config.voiceVolume,
          language: this.config.language,
          voiceId: this.config.voiceId,
        });
      }
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

  private handleError(reason: VoiceErrorReason, message: string): void {
    this.transitionState('error');
    this.transitionActivityState('error');
    if (this.events?.onError) {
      this.events.onError(reason, message);
    }
    // Graceful fallback to text
    if (this.events?.onFallbackToText) {
      const partial = this.currentTranscript || this.currentInterimText;
      this.events.onFallbackToText(partial);
    }
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
