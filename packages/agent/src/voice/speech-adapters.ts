import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceSessionConfig,
} from '@alina/shared';
import { SpeechToTextAdapter, TextToSpeechAdapter } from './types';

// ============================================================================
// Web Speech Recognition Adapter (Browser / WebView / Tauri)
// ============================================================================

export class WebSpeechRecognitionAdapter implements SpeechToTextAdapter {
  private recognition: any = null;
  private isListening = false;
  private transcriptListeners: Array<(transcript: VoiceTranscript) => void> = [];
  private errorListeners: Array<(reason: VoiceErrorReason, message: string) => void> = [];
  private stateListeners: Array<(state: VoiceState) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
      }
    }
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public async startListening(config?: Partial<VoiceSessionConfig>): Promise<void> {
    if (!this.recognition) {
      this.notifyError('speech_service_unavailable', 'SpeechRecognition API is not supported in this environment.');
      return;
    }

    if (this.isListening) {
      return;
    }

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = config?.language || 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.notifyState('listening');
    };

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (final.trim()) {
        this.notifyTranscript({
          text: final.trim(),
          isFinal: true,
          confidence: event.results[0]?.[0]?.confidence ?? 1.0,
          interimText: interim.trim() || undefined,
        });
      } else if (interim.trim()) {
        this.notifyTranscript({
          text: interim.trim(),
          isFinal: false,
          confidence: 0.8,
          interimText: interim.trim(),
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      let reason: VoiceErrorReason = 'unknown';
      if (event.error === 'not-allowed') reason = 'microphone_denied';
      else if (event.error === 'network') reason = 'network_timeout';
      else if (event.error === 'no-speech') reason = 'speech_service_unavailable';
      else if (event.error === 'aborted') reason = 'aborted';

      this.notifyError(reason, `Speech recognition error: ${event.error}`);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.notifyState('idle');
    };

    try {
      this.recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifyError('speech_service_unavailable', `Failed to start recognition: ${msg}`);
    }
  }

  public async stopListening(): Promise<void> {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      this.notifyState('idle');
    }
  }

  public abort(): void {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
      this.isListening = false;
      this.notifyState('idle');
    }
  }

  public onTranscript(callback: (transcript: VoiceTranscript) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: VoiceState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyTranscript(transcript: VoiceTranscript): void {
    for (const cb of this.transcriptListeners) {
      cb(transcript);
    }
  }

  private notifyError(reason: VoiceErrorReason, message: string): void {
    this.notifyState('error');
    for (const cb of this.errorListeners) {
      cb(reason, message);
    }
  }

  private notifyState(state: VoiceState): void {
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }
}

// ============================================================================
// Web Speech Synthesis Adapter (Browser / WebView / Tauri)
// ============================================================================

export class WebSpeechSynthesisAdapter implements TextToSpeechAdapter {
  private activeUtterance: any = null;

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public async speak(text: string, config?: Partial<VoiceSessionConfig>): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    this.stop();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = config?.voiceRate ?? 1.0;
      utterance.pitch = config?.voicePitch ?? 1.0;
      utterance.lang = config?.language ?? 'en-US';

      utterance.onend = () => {
        this.activeUtterance = null;
        resolve();
      };

      utterance.onerror = (err) => {
        this.activeUtterance = null;
        reject(new Error(`Speech synthesis failed: ${err.error}`));
      };

      this.activeUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  public stop(): void {
    if (this.isAvailable()) {
      window.speechSynthesis.cancel();
      this.activeUtterance = null;
    }
  }

  public pause(): void {
    if (this.isAvailable()) {
      window.speechSynthesis.pause();
    }
  }

  public resume(): void {
    if (this.isAvailable()) {
      window.speechSynthesis.resume();
    }
  }

  public isSpeaking(): boolean {
    return this.isAvailable() && (window.speechSynthesis.speaking || this.activeUtterance !== null);
  }
}

// ============================================================================
// Mock Speech Recognition Adapter (Deterministic Headless Testing)
// ============================================================================

export class MockSpeechRecognitionAdapter implements SpeechToTextAdapter {
  private active = false;
  private transcriptListeners: Array<(transcript: VoiceTranscript) => void> = [];
  private errorListeners: Array<(reason: VoiceErrorReason, message: string) => void> = [];
  private stateListeners: Array<(state: VoiceState) => void> = [];

  public isAvailable(): boolean {
    return true;
  }

  public async startListening(_config?: Partial<VoiceSessionConfig>): Promise<void> {
    this.active = true;
    this.notifyState('listening');
  }

  public async stopListening(): Promise<void> {
    this.active = false;
    this.notifyState('idle');
  }

  public abort(): void {
    this.active = false;
    this.notifyState('idle');
  }

  public isActive(): boolean {
    return this.active;
  }

  public simulateTranscript(text: string, isFinal = true, confidence = 0.95): void {
    const transcript: VoiceTranscript = {
      text,
      isFinal,
      confidence,
      interimText: isFinal ? undefined : text,
    };
    for (const cb of this.transcriptListeners) {
      cb(transcript);
    }
  }

  public simulateError(reason: VoiceErrorReason, message: string): void {
    this.notifyState('error');
    for (const cb of this.errorListeners) {
      cb(reason, message);
    }
  }

  public onTranscript(callback: (transcript: VoiceTranscript) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: VoiceState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyState(state: VoiceState): void {
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }
}

// ============================================================================
// Mock Speech Synthesis Adapter (Deterministic Headless Testing)
// ============================================================================

export class MockSpeechSynthesisAdapter implements TextToSpeechAdapter {
  public spokenUtterances: string[] = [];
  public interrupted = false;
  private speaking = false;
  private resolveSpeak?: () => void;

  public isAvailable(): boolean {
    return true;
  }

  public async speak(text: string, _config?: Partial<VoiceSessionConfig>): Promise<void> {
    this.interrupted = false;
    this.speaking = true;
    this.spokenUtterances.push(text);

    return new Promise((resolve) => {
      this.resolveSpeak = () => {
        this.speaking = false;
        resolve();
      };
      // Simulate quick natural speech delay (50ms in tests)
      setTimeout(() => {
        if (this.speaking) {
          this.speaking = false;
          resolve();
        }
      }, 50);
    });
  }

  public stop(): void {
    if (this.speaking) {
      this.interrupted = true;
      this.speaking = false;
      if (this.resolveSpeak) {
        this.resolveSpeak();
      }
    }
  }

  public pause(): void {
    this.speaking = false;
  }

  public resume(): void {
    this.speaking = true;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }
}
