import {
  VoiceState,
  VoiceErrorReason,
  VoiceSessionConfig,
  VoiceSessionConfigSchema,
  TranscriptQualityTier,
  WakeWordEvent,
  VoiceOption,
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
 * Central coordinator managing ALINA's multimodal voice lifecycle:
 * Background Wake-Word ("Hey Alina") -> Microphone -> Enhanced STT & Disambiguation ->
 * Supervisor Agent Execution -> Conversational Persona Formatting -> Natural Female Neural TTS.
 * 
 * Guarantees:
 * - Clean state transitions: idle -> listening -> transcribing -> planning -> executing -> verifying -> speaking -> idle
 * - Instant interruption support: cuts off audio synthesis immediately on Escape or user interruption
 * - Full parity with text tasks: routes through identical supervisor & authorization gates
 * - Zero security bypass: voice commands never circumvent PathJail or Approval gates
 * - High-accuracy speech recognition with silence endpointing and phonetic domain disambiguation
 * - Natural female neural voice output with calm, professional familiarity
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
  private currentTranscript = '';
  private currentInterimText = '';
  private activeTaskId?: string;
  private unsubscribeSttTranscript?: () => void;
  private unsubscribeSttError?: () => void;

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
      if (newConfig.wakeWordEnabled && this.wakeWordDetector?.isAvailable()) {
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
   * Begins listening for voice input via microphone.
   */
  public async startListening(): Promise<void> {
    // If ALINA or TTS is currently speaking, interrupt playback first
    if (this.currentState === 'speaking' || this.ttsAdapter.isSpeaking()) {
      this.interrupt();
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

    this.speechCoordinator.reset();
    this.currentTranscript = '';
    this.currentInterimText = '';
    this.transitionState('listening');

    try {
      await this.sttAdapter.startListening(this.config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleError('speech_service_unavailable', msg);
    }
  }

  /**
   * Stops listening and immediately dispatches the accumulated voice transcription.
   */
  public async stopListening(): Promise<VoiceInteractionResult | null> {
    if (this.currentState !== 'listening') {
      return null;
    }

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
      this.transitionState('idle');
      this.resumeWakeWordIfNeeded();
      return null;
    }

    return this.submitVoiceCommand(finalGoal);
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

    this.speechCoordinator.reset();
    this.transitionState('interrupted');
    setTimeout(() => {
      if (this.currentState === 'interrupted') {
        this.transitionState('idle');
        this.resumeWakeWordIfNeeded();
      }
    }, 150);
  }

  /**
   * Submits a transcribed voice command to the supervisor agent.
   * Enforces exact same authorization, sandbox, and safety checks as text.
   */
  public async submitVoiceCommand(goal: string): Promise<VoiceInteractionResult> {
    const startTime = Date.now();
    this.transitionState('processing');

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

      // Format response through AlinaConversationalPersona for calm, familiar presentation
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

      this.transitionState('idle');
      this.resumeWakeWordIfNeeded();

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
    if (this.unsubscribeSttTranscript) this.unsubscribeSttTranscript();
    if (this.unsubscribeSttError) this.unsubscribeSttError();
    this.wakeWordDetector?.stop();
    this.ttsAdapter.stop();
    this.sttAdapter.abort();
    this.speechCoordinator.reset();
  }

  private setupListeners(): void {
    this.unsubscribeSttTranscript = this.sttAdapter.onTranscript((transcript) => {
      this.speechCoordinator.handleTranscriptEvent(
        transcript,
        (quality) => {
          this.currentTranscript = quality.normalizedInput;
          if (this.events?.onTranscriptQuality) {
            this.events.onTranscriptQuality(quality);
          }
          if (this.config.autoSubmitOnSilence && this.currentState === 'listening') {
            void this.stopListening();
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
    if (this.currentState !== 'idle') return;

    if (this.events?.onWakeWordDetected) {
      this.events.onWakeWordDetected(event);
    }

    // Automatically transition to active listening
    void this.startListening();
  }

  private resumeWakeWordIfNeeded(): void {
    if (this.config.wakeWordEnabled && this.wakeWordDetector?.isAvailable() && !this.wakeWordDetector.isActive()) {
      this.wakeWordDetector.start();
    }
  }

  private transitionState(newState: VoiceState): void {
    this.currentState = newState;
    if (this.events?.onStateChange) {
      this.events.onStateChange(newState);
    }
  }

  private handleError(reason: VoiceErrorReason, message: string): void {
    this.transitionState('error');
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
        this.transitionState('idle');
        this.resumeWakeWordIfNeeded();
      }
    }, 1500);
  }
}
