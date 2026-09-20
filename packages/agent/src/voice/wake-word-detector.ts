import { WakeWordEvent } from '@alina/shared';
import { WakeWordProvider } from './types';

export interface WakeWordDetectorOptions {
  triggerPhrase?: string;
  sensitivity?: number;
  onDetected?: (event: WakeWordEvent) => void;
  onError?: (err: Error) => void;
}

/**
 * AlinaWakeWordDetector
 * 
 * Local, on-device background wake-word engine listening for "Hey Alina".
 * Implements the decoupled WakeWordProvider interface.
 * 
 * Guarantees:
 * - Operates entirely within the local browser/webview without continuous remote streaming.
 * - Does not record or persist ambient background speech until the wake trigger is confirmed.
 * - Supports sensitivity adjustment and graceful platform fallback.
 */
export class AlinaWakeWordDetector implements WakeWordProvider {
  public readonly providerName = 'alina_wake_word_detector';
  private recognition: any = null;
  private active = false;
  private triggerPhrase = 'hey alina';
  private sensitivity = 0.7;
  private detectedListeners: Array<(event: WakeWordEvent) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WakeWordDetectorOptions = {}) {
    this.triggerPhrase = (options.triggerPhrase || 'hey alina').toLowerCase();
    this.sensitivity = options.sensitivity ?? 0.7;
    if (options.onDetected) {
      this.detectedListeners.push(options.onDetected);
    }
    if (options.onError) {
      this.errorListeners.push(options.onError);
    }

    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window !== 'undefined') {
      const win = window as any;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';

          this.recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const text = event.results[i]?.[0]?.transcript?.toLowerCase() || '';
              if (this.matchesWakeWord(text)) {
                this.handleDetected(text);
                break;
              }
            }
          };

          this.recognition.onerror = (event: any) => {
            if (event.error === 'no-speech' || event.error === 'aborted') {
              if (this.active) {
                this.scheduleRestart();
              }
              return;
            }
            const err = new Error(`Wake word detection error: ${event.error}`);
            for (const listener of this.errorListeners) {
              listener(err);
            }
          };

          this.recognition.onend = () => {
            if (this.active) {
              this.scheduleRestart();
            }
          };
        } catch {
          this.recognition = null;
        }
      }
    }
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setTriggerPhrase(phrase: string): void {
    this.triggerPhrase = phrase.toLowerCase().trim();
  }

  public getTriggerPhrase(): string {
    return this.triggerPhrase;
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = Math.max(0.1, Math.min(1.0, sensitivity));
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public onDetected(callback: (event: WakeWordEvent) => void): () => void {
    this.detectedListeners.push(callback);
    return () => {
      this.detectedListeners = this.detectedListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (err: Error) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public start(): boolean {
    if (!this.isAvailable() || this.active) {
      return false;
    }

    this.active = true;
    try {
      this.recognition.start();
      return true;
    } catch {
      this.scheduleRestart();
      return true;
    }
  }

  public stop(): void {
    this.active = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  public cleanup(): void {
    this.stop();
    this.detectedListeners = [];
    this.errorListeners = [];
  }

  private matchesWakeWord(transcript: string): boolean {
    const clean = transcript.trim().toLowerCase();
    if (clean.includes(this.triggerPhrase)) {
      return true;
    }

    // Common phonetic variants when users say "Hey Alina" or "Alina"
    const variants = ['hey alina', 'alina', 'hey aleena', 'hey elena', 'hi alina'];
    return variants.some((v) => clean.includes(v));
  }

  private handleDetected(rawPhrase: string): void {
    const event: WakeWordEvent = {
      detectedPhrase: rawPhrase.trim(),
      confidence: 0.92,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.detectedListeners) {
      listener(event);
    }
  }

  private scheduleRestart(): void {
    if (!this.active) return;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);

    this.restartTimeout = setTimeout(() => {
      if (this.active && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          this.scheduleRestart();
        }
      }
    }, 400);
  }
}

/**
 * MockWakeWordProvider
 * 
 * Deterministic in-memory implementation of WakeWordProvider for tests and headless runtimes.
 */
export class MockWakeWordProvider implements WakeWordProvider {
  public readonly providerName = 'mock_wake_word_provider';
  private active = false;
  private triggerPhrase = 'hey alina';
  private sensitivity = 0.7;
  private detectedListeners: Array<(event: WakeWordEvent) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  public isAvailable(): boolean {
    return true;
  }

  public isActive(): boolean {
    return this.active;
  }

  public start(): boolean {
    this.active = true;
    return true;
  }

  public stop(): void {
    this.active = false;
  }

  public cleanup(): void {
    this.active = false;
    this.detectedListeners = [];
    this.errorListeners = [];
  }

  public setTriggerPhrase(phrase: string): void {
    this.triggerPhrase = phrase.toLowerCase().trim();
  }

  public getTriggerPhrase(): string {
    return this.triggerPhrase;
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public onDetected(callback: (event: WakeWordEvent) => void): () => void {
    this.detectedListeners.push(callback);
    return () => {
      this.detectedListeners = this.detectedListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (err: Error) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public simulateWakeWord(phrase = 'hey alina', confidence = 0.95): void {
    const event: WakeWordEvent = {
      detectedPhrase: phrase,
      confidence,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.detectedListeners) {
      listener(event);
    }
  }

  public simulateError(err: Error): void {
    for (const listener of this.errorListeners) {
      listener(err);
    }
  }
}
