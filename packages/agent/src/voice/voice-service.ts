import {
  VoiceState,
  VoiceErrorReason,
  VoiceSessionConfig,
  VoiceSessionConfigSchema,
} from '@alina/shared';
import {
  SpeechToTextAdapter,
  TextToSpeechAdapter,
  VoiceInteractionResult,
  VoiceCoordinatorEvents,
} from './types';
import {
  WebSpeechRecognitionAdapter,
  WebSpeechSynthesisAdapter,
} from './speech-adapters';
import { AlinaSupervisorAgent } from '../supervisor-agent';

export interface VoiceCoordinatorOptions {
  supervisorAgent: AlinaSupervisorAgent;
  sttAdapter?: SpeechToTextAdapter;
  ttsAdapter?: TextToSpeechAdapter;
  config?: Partial<VoiceSessionConfig>;
  events?: VoiceCoordinatorEvents;
  jailRoot?: string;
  workspaceId?: string;
}

/**
 * AlinaVoiceCoordinator
 * 
 * Central coordinator managing ALINA's first-class voice interaction lifecycle:
 * Microphone -> Speech-to-Text -> Supervisor Agent -> Tool Execution -> 
 * Response Summary -> Text-to-Speech -> Speaker.
 * 
 * Guarantees:
 * - Clean state transitions: idle -> listening -> processing -> speaking -> idle
 * - Instant interruption support: cuts off audio synthesis immediately
 * - Full parity with text tasks: routes through identical supervisor & authorization gates
 * - Zero security bypass: voice commands never circumvent PathJail or Approval gates
 * - Seamless fallback: degrades gracefully to text input if speech services fail
 */
export class AlinaVoiceCoordinator {
  private supervisorAgent: AlinaSupervisorAgent;
  private sttAdapter: SpeechToTextAdapter;
  private ttsAdapter: TextToSpeechAdapter;
  private config: VoiceSessionConfig;
  private events?: VoiceCoordinatorEvents;
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
    this.ttsAdapter = options.ttsAdapter ?? new WebSpeechSynthesisAdapter();
    this.config = VoiceSessionConfigSchema.parse(options.config ?? {});
    this.events = options.events;
    this.jailRoot = options.jailRoot;
    this.workspaceId = options.workspaceId;

    this.setupListeners();
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

  public updateConfig(newConfig: Partial<VoiceSessionConfig>): void {
    this.config = VoiceSessionConfigSchema.parse({ ...this.config, ...newConfig });
  }

  public setEvents(events: VoiceCoordinatorEvents): void {
    this.events = events;
  }

  /**
   * Begins listening for voice input via microphone.
   */
  public async startListening(): Promise<void> {
    // If ALINA or TTS is currently speaking, interrupt playback first
    if (this.currentState === 'speaking' || this.ttsAdapter.isSpeaking()) {
      this.interrupt();
    }

    if (!this.sttAdapter.isAvailable()) {
      this.handleError(
        'speech_service_unavailable',
        'Speech recognition service is unavailable. Falling back to text composer.'
      );
      return;
    }

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
    const finalGoal = (this.currentTranscript || this.currentInterimText).trim();

    if (!finalGoal) {
      this.transitionState('idle');
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

    this.transitionState('interrupted');
    setTimeout(() => {
      if (this.currentState === 'interrupted') {
        this.transitionState('idle');
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

      let responseSummary = execResult.resultSummary;
      if (execResult.status === 'waiting_for_approval') {
        responseSummary = `Action requires operator authorization for tool: ${execResult.approvalRequest?.toolName ?? 'mutation'}.`;
      } else if (execResult.status === 'failed') {
        responseSummary = `Task failed: ${execResult.error || execResult.resultSummary}`;
      }

      let spoken = false;
      let interrupted = false;

      // Text-to-Speech playback if enabled
      if (this.config.ttsEnabled && responseSummary && this.ttsAdapter.isAvailable()) {
        this.transitionState('speaking');
        if (this.events?.onSpokenSummary) {
          this.events.onSpokenSummary(responseSummary);
        }

        try {
          await this.ttsAdapter.speak(responseSummary, this.config);
          spoken = true;
        } catch {
          // Gracefully continue even if audio output device encounters error
          spoken = false;
        }

        if (this.currentState === 'interrupted') {
          interrupted = true;
        }
      }

      this.transitionState('idle');

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
    this.ttsAdapter.stop();
    this.sttAdapter.abort();
  }

  private setupListeners(): void {
    this.unsubscribeSttTranscript = this.sttAdapter.onTranscript((transcript) => {
      if (transcript.isFinal) {
        this.currentTranscript = transcript.text;
        this.currentInterimText = '';
      } else {
        this.currentInterimText = transcript.interimText || transcript.text;
      }

      if (this.events?.onTranscript) {
        this.events.onTranscript(transcript);
      }
    });

    this.unsubscribeSttError = this.sttAdapter.onError((reason, message) => {
      this.handleError(reason, message);
    });
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
      }
    }, 1500);
  }
}
