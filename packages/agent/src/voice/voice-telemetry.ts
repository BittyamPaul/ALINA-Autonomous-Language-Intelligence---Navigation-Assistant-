import { VoiceDiagnosticTelemetry } from '@alina/shared';

/**
 * AlinaVoiceTelemetryTracker
 * 
 * High-precision diagnostic telemetry engine for ALINA voice operations:
 * - Recognition latency (speech start to first interim transcript)
 * - Final transcript latency (silence onset / end-of-speech to normalized output)
 * - Interim transcript count
 * - Recognition error count
 * - Wake-word detection count
 * - False activations tracking
 * - Interruption / barge-in count
 * - Active conversation duration
 */
export class AlinaVoiceTelemetryTracker {
  private sessionStartTime: number | null = null;
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;
  private firstInterimTime: number | null = null;

  private currentRecognitionLatencyMs = 0;
  private currentFinalTranscriptLatencyMs = 0;
  private currentInterimCount = 0;
  private totalInterimCount = 0;
  private recognitionErrors = 0;
  private wakeWordDetections = 0;
  private falseActivations = 0;
  private interruptionsCount = 0;
  private hadCommandInCurrentActivation = false;

  /**
   * Starts tracking a voice conversation session.
   */
  public startSession(): void {
    this.sessionStartTime = Date.now();
  }

  /**
   * Ends tracking a voice conversation session.
   */
  public endSession(): void {
    // If a wake word activation never produced a valid command before session end, record as false activation
    if (this.wakeWordDetections > 0 && !this.hadCommandInCurrentActivation) {
      this.falseActivations++;
    }
  }

  /**
   * Records a wake-word trigger event.
   */
  public recordWakeWordDetection(): void {
    this.wakeWordDetections++;
    this.hadCommandInCurrentActivation = false;
  }

  /**
   * Explicitly marks current wake activation as false activation.
   */
  public recordFalseActivation(): void {
    this.falseActivations++;
  }

  /**
   * Marks that a valid user command was submitted during the current wake activation.
   */
  public markCommandReceived(): void {
    this.hadCommandInCurrentActivation = true;
  }

  /**
   * Records the start of user speech (e.g. from VAD or speech recognition onstart/first audio).
   */
  public recordSpeechStart(): void {
    this.speechStartTime = Date.now();
    this.firstInterimTime = null;
    this.silenceStartTime = null;
    this.currentInterimCount = 0;
  }

  /**
   * Records an incoming interim transcript.
   */
  public recordInterimTranscript(): void {
    this.currentInterimCount++;
    this.totalInterimCount++;

    if (!this.firstInterimTime && this.speechStartTime) {
      this.firstInterimTime = Date.now();
      this.currentRecognitionLatencyMs = Math.max(0, this.firstInterimTime - this.speechStartTime);
    }
  }

  /**
   * Records the onset of silence / end-of-speech awaiting endpoint finalization.
   */
  public recordSilenceOnset(): void {
    if (!this.silenceStartTime) {
      this.silenceStartTime = Date.now();
    }
  }

  /**
   * Records the finalization of the transcript.
   */
  public recordFinalTranscript(): void {
    const now = Date.now();
    if (this.silenceStartTime) {
      this.currentFinalTranscriptLatencyMs = Math.max(0, now - this.silenceStartTime);
    } else if (this.speechStartTime) {
      this.currentFinalTranscriptLatencyMs = Math.max(0, now - this.speechStartTime);
    }
    this.silenceStartTime = null;
  }

  /**
   * Records a recognition error event.
   */
  public recordRecognitionError(_reason?: string): void {
    this.recognitionErrors++;
  }

  /**
   * Records an interruption (user speaking while ALINA/TTS is speaking).
   */
  public recordInterruption(): void {
    this.interruptionsCount++;
  }

  /**
   * Returns a snapshot of diagnostic telemetry.
   */
  public getTelemetry(): VoiceDiagnosticTelemetry {
    const durationMs = this.sessionStartTime ? Math.max(0, Date.now() - this.sessionStartTime) : 0;

    return {
      recognitionLatencyMs: this.currentRecognitionLatencyMs,
      finalTranscriptLatencyMs: this.currentFinalTranscriptLatencyMs,
      interimTranscriptCount: this.currentInterimCount,
      recognitionErrors: this.recognitionErrors,
      wakeWordDetectionCount: this.wakeWordDetections,
      falseActivations: this.falseActivations,
      conversationDurationMs: durationMs,
      interruptionsCount: this.interruptionsCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resets all metric counters.
   */
  public reset(): void {
    this.sessionStartTime = null;
    this.speechStartTime = null;
    this.silenceStartTime = null;
    this.firstInterimTime = null;
    this.currentRecognitionLatencyMs = 0;
    this.currentFinalTranscriptLatencyMs = 0;
    this.currentInterimCount = 0;
    this.totalInterimCount = 0;
    this.recognitionErrors = 0;
    this.wakeWordDetections = 0;
    this.falseActivations = 0;
    this.interruptionsCount = 0;
    this.hadCommandInCurrentActivation = false;
  }
}
