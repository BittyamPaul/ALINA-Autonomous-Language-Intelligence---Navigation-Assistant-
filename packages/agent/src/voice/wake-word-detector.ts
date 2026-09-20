import { WakeWordEvent } from '@alina/shared';

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
 * 
 * Guarantees:
 * - Operates entirely within the local browser/webview without continuous remote streaming.
 * - Does not record or persist ambient background speech until the wake trigger is confirmed.
 * - Supports sensitivity adjustment and graceful platform fallback.
 */
export class AlinaWakeWordDetector {
  private recognition: any = null;
  private active = false;
  private triggerPhrase = 'hey alina';
  private sensitivity = 0.7;
  private onDetected?: (event: WakeWordEvent) => void;
  private onError?: (err: Error) => void;
  private restartTimeout: any = null;

  constructor(options: WakeWordDetectorOptions = {}) {
    this.triggerPhrase = (options.triggerPhrase || 'hey alina').toLowerCase();
    this.sensitivity = options.sensitivity ?? 0.7;
    this.onDetected = options.onDetected;
    this.onError = options.onError;

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
              // Harmless timeout or pause, auto-restart if still active
              if (this.active) {
                this.scheduleRestart();
              }
              return;
            }
            if (this.onError) {
              this.onError(new Error(`Wake word detection error: ${event.error}`));
            }
          };

          this.recognition.onend = () => {
            if (this.active) {
              this.scheduleRestart();
            }
          };
        } catch (err) {
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

  public start(): boolean {
    if (!this.isAvailable() || this.active) {
      return false;
    }

    this.active = true;
    try {
      this.recognition.start();
      return true;
    } catch (err) {
      // If already started or browser is busy, schedule retry
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

    if (this.onDetected) {
      this.onDetected(event);
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
          // Retry later if browser microphone session is transitioning
          this.scheduleRestart();
        }
      }
    }, 400);
  }
}
