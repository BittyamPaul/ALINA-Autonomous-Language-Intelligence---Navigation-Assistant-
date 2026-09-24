import {
  VoiceOption,
  TextToSpeechOptions,
  VoiceTranscript,
  TranscriptQualityTier,
  WakeWordEvent,
  VoiceActivityState,
} from '@alina/shared';

// ============================================================================
// 1. Preferred Natural Female Voice Priority & Web Neural Speech Provider
// ============================================================================

export const PREFERRED_NATURAL_FEMALE_VOICES = [
  'microsoft jenny online (natural)',
  'microsoft aria online (natural)',
  'microsoft michelle online (natural)',
  'microsoft zira',
  'google uk english female',
  'google us english female',
  'samantha (enhanced)',
  'samantha',
  'karen (enhanced)',
  'karen',
  'victoria',
  'fiona',
  'moira',
  'tessa',
];

export class WebNeuralSpeechProvider {
  private selectedVoiceId?: string;
  private speed = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private cachedVoices: VoiceOption[] = [];

  constructor(defaultVoiceId?: string) {
    this.selectedVoiceId = defaultVoiceId;
  }

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    if (!this.isAvailable()) {
      return [];
    }

    if (this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    return new Promise((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.cachedVoices = this.mapVoices(voices);
        resolve(this.cachedVoices);
        return;
      }

      const handler = () => {
        voices = window.speechSynthesis.getVoices();
        this.cachedVoices = this.mapVoices(voices);
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        resolve(this.cachedVoices);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);

      // Timeout fallback for platforms where voiceschanged event does not fire
      setTimeout(() => {
        if (this.cachedVoices.length === 0) {
          voices = window.speechSynthesis.getVoices();
          this.cachedVoices = this.mapVoices(voices);
          resolve(this.cachedVoices);
        }
      }, 500);
    });
  }

  private mapVoices(nativeVoices: SpeechSynthesisVoice[]): VoiceOption[] {
    return nativeVoices.map((v) => {
      const lower = v.name.toLowerCase();
      let gender: 'female' | 'male' | 'neutral' = 'neutral';
      if (
        lower.includes('female') ||
        lower.includes('jenny') ||
        lower.includes('aria') ||
        lower.includes('samantha') ||
        lower.includes('karen') ||
        lower.includes('victoria') ||
        lower.includes('zira')
      ) {
        gender = 'female';
      } else if (
        lower.includes('male') ||
        lower.includes('david') ||
        lower.includes('mark') ||
        lower.includes('guy') ||
        lower.includes('george')
      ) {
        gender = 'male';
      }

      return {
        id: v.voiceURI || v.name,
        name: v.name,
        lang: v.lang,
        gender,
        isNatural:
          lower.includes('natural') ||
          lower.includes('online') ||
          lower.includes('enhanced') ||
          lower.includes('neural'),
        isDefault: v.default,
      };
    });
  }

  public getBestNaturalFemaleVoice(voices?: VoiceOption[]): VoiceOption | undefined {
    const pool = voices || this.cachedVoices;
    if (pool.length === 0) return undefined;

    // 1. Try explicit preferred names
    for (const pref of PREFERRED_NATURAL_FEMALE_VOICES) {
      const match = pool.find(
        (v) => v.name.toLowerCase().includes(pref) || v.id.toLowerCase().includes(pref)
      );
      if (match) return match;
    }

    // 2. Try any neural female voice
    const neuralFemale = pool.find((v) => v.isNatural && v.gender === 'female');
    if (neuralFemale) return neuralFemale;

    // 3. Try any female voice
    const female = pool.find((v) => v.gender === 'female');
    if (female) return female;

    // 4. Default voice
    return pool.find((v) => v.isDefault) || pool[0];
  }

  public setVoice(voiceId: string): void {
    this.selectedVoiceId = voiceId;
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(0.5, Math.min(2.0, speed));
  }

  public setPitch(pitch: number): void {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0.0, Math.min(1.0, volume));
  }

  public getSelectedVoice(): VoiceOption | undefined {
    if (this.selectedVoiceId && this.cachedVoices.length > 0) {
      const found = this.cachedVoices.find(
        (v) => v.id === this.selectedVoiceId || v.name === this.selectedVoiceId
      );
      if (found) return found;
    }
    return this.getBestNaturalFemaleVoice();
  }

  public async speak(text: string, options?: TextToSpeechOptions): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    this.stop();

    if (!this.cachedVoices || this.cachedVoices.length === 0) {
      await this.getAvailableVoices();
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.activeUtterance = utterance;

      const rate = options?.rate ?? this.speed;
      const pitch = options?.pitch ?? this.pitch;
      const volume = options?.volume ?? this.volume;
      const targetVoiceId = options?.voiceId ?? this.selectedVoiceId;

      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      const allNative = window.speechSynthesis.getVoices();
      let chosenVoice: SpeechSynthesisVoice | undefined;

      if (targetVoiceId) {
        chosenVoice = allNative.find(
          (v) => v.voiceURI === targetVoiceId || v.name === targetVoiceId
        );
      }

      if (!chosenVoice) {
        const best = this.getBestNaturalFemaleVoice();
        if (best) {
          chosenVoice = allNative.find((v) => v.voiceURI === best.id || v.name === best.name);
        }
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      } else if (options?.language) {
        utterance.lang = options.language;
      }

      utterance.onend = () => {
        this.activeUtterance = null;
        resolve();
      };

      utterance.onerror = (err) => {
        this.activeUtterance = null;
        reject(new Error(`[WebNeuralSpeechProvider] Synthesis error: ${err.error}`));
      };

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
    return this.isAvailable() && window.speechSynthesis.speaking;
  }

  public getActiveUtterance(): SpeechSynthesisUtterance | null {
    return this.activeUtterance;
  }
}

// ============================================================================
// 2. Technical Vocabulary Disambiguation & Speech Recognition Coordinator
// ============================================================================

export const DOMAIN_PHONETIC_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(cereal\s*db|surreal\s*d\s*b)\b/gi, replacement: 'SurrealDB' },
  { pattern: /\b(pack\s*jail|pass\s*jail|pat\s*jail)\b/gi, replacement: 'PathJail' },
  { pattern: /\b(p\s*and\s*p\s*m|p\s*n\s*p\s*m|b\s*p\s*m)\b/gi, replacement: 'pnpm' },
  { pattern: /\b(type\s*script|type\s*scripts)\b/gi, replacement: 'TypeScript' },
  { pattern: /\b(v\s*test|y\s*test|vai\s*test)\b/gi, replacement: 'Vitest' },
  { pattern: /\b(tori|towry|tawry)\b/gi, replacement: 'Tauri' },
  { pattern: /\b(mast\s*ra|mastera)\b/gi, replacement: 'Mastra' },
  { pattern: /\b(hey\s+elena|hey\s+aleena|elena)\b/gi, replacement: 'Hey Alina' },
  { pattern: /\b(git\s+stats|get\s+status)\b/gi, replacement: 'git status' },
  { pattern: /\b(git\s+chekout|get\s+checkout)\b/gi, replacement: 'git checkout' },
];

export function normalizeSpeechTranscript(rawText: string): { normalized: string; substitutions: number } {
  let normalized = rawText;
  let substitutions = 0;

  for (const { pattern, replacement } of DOMAIN_PHONETIC_REPLACEMENTS) {
    if (pattern.test(normalized)) {
      normalized = normalized.replace(pattern, () => {
        substitutions++;
        return replacement;
      });
    }
  }

  return { normalized, substitutions };
}

export function mergeTranscriptSegmentsSafely(existing: string, incoming: string): string {
  const eClean = existing.trim();
  const iClean = incoming.trim();

  if (!eClean) return iClean;
  if (!iClean) return eClean;

  const eLower = eClean.toLowerCase();
  const iLower = iClean.toLowerCase();

  if (eLower === iLower) return eClean;
  if (iLower.startsWith(eLower)) return iClean;
  if (eLower.endsWith(iLower)) return eClean;

  const eWords = eClean.split(/\s+/);
  const iWords = iClean.split(/\s+/);
  const maxOverlap = Math.min(eWords.length, iWords.length);

  for (let k = maxOverlap; k > 0; k--) {
    const eSuffix = eWords.slice(eWords.length - k).map((w) => w.toLowerCase()).join(' ');
    const iPrefix = iWords.slice(0, k).map((w) => w.toLowerCase()).join(' ');

    if (eSuffix === iPrefix) {
      const mergedWords = [...eWords, ...iWords.slice(k)];
      return mergedWords.join(' ');
    }
  }

  return `${eClean} ${iClean}`;
}

export const applyPhoneticNormalization = normalizeSpeechTranscript;

interface ISpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

interface ISpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: ISpeechRecognitionResultItem;
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: ISpeechRecognitionResult;
  };
}

interface ISpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: new () => ISpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => ISpeechRecognitionInstance;
}

export class EnhancedSpeechRecognitionCoordinator {
  private rawBuffer = '';
  private interimBuffer = '';
  private silenceTimeoutMs = 1500;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private debugMode = false;
  private currentActivityState: VoiceActivityState = 'idle';
  private lastQualityRecord?: TranscriptQualityTier;
  private onActivityStateChange?: (state: VoiceActivityState) => void;

  constructor(options?: {
    silenceTimeoutMs?: number;
    debugMode?: boolean;
    onActivityStateChange?: (state: VoiceActivityState) => void;
  }) {
    if (options?.silenceTimeoutMs) {
      this.silenceTimeoutMs = options.silenceTimeoutMs;
    }
    if (options?.debugMode) {
      this.debugMode = options.debugMode;
    }
    this.onActivityStateChange = options?.onActivityStateChange;
  }

  public setActivityStateListener(listener: (state: VoiceActivityState) => void): void {
    this.onActivityStateChange = listener;
  }

  public getActivityState(): VoiceActivityState {
    return this.currentActivityState;
  }

  private setActivityState(state: VoiceActivityState): void {
    if (this.currentActivityState !== state) {
      this.currentActivityState = state;
      if (this.onActivityStateChange) {
        this.onActivityStateChange(state);
      }
    }
  }

  public setSilenceTimeout(timeoutMs: number): void {
    this.silenceTimeoutMs = timeoutMs;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public isDebugMode(): boolean {
    return this.debugMode;
  }

  public getLastQualityRecord(): TranscriptQualityTier | undefined {
    return this.lastQualityRecord;
  }

  public handleResult(event: ISpeechRecognitionEvent): {
    finalized: boolean;
    transcript?: VoiceTranscript;
  } {
    let currentInterim = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const result = event.results[i];
      if (result && result[0]) {
        if (result.isFinal) {
          const part = result[0].transcript.trim();
          if (part) {
            this.rawBuffer = mergeTranscriptSegmentsSafely(this.rawBuffer, part);
          }
        } else {
          currentInterim = `${currentInterim} ${result[0].transcript}`;
        }
      }
    }

    this.interimBuffer = currentInterim.trim();

    return {
      finalized: false,
    };
  }

  public scheduleEndpointing(
    onFinalize: (transcript: VoiceTranscript) => void,
    timeoutOverrideMs?: number
  ): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    const wait = timeoutOverrideMs ?? this.silenceTimeoutMs;

    this.silenceTimer = setTimeout(() => {
      const finalized = this.flush();
      if (finalized) {
        onFinalize(finalized);
      }
    }, wait);
  }

  public handleTranscriptEvent(
    event: VoiceTranscript,
    onFinalized: (quality: TranscriptQualityTier) => void,
    onInterimUpdate?: (interimText: string) => void
  ): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.setActivityState('user_speaking');

    if (event.isFinal) {
      if (event.text.trim()) {
        this.rawBuffer = mergeTranscriptSegmentsSafely(this.rawBuffer, event.text);
      }
      this.interimBuffer = '';
    } else {
      this.interimBuffer = event.interimText || event.text;
    }

    const currentCombined = mergeTranscriptSegmentsSafely(this.rawBuffer, this.interimBuffer);
    if (onInterimUpdate) {
      onInterimUpdate(currentCombined);
    }

    if (this.rawBuffer.trim() || this.interimBuffer.trim()) {
      this.setActivityState('silence');
      this.silenceTimer = setTimeout(() => {
        this.setActivityState('end_of_utterance');
        this.finalize(onFinalized);
      }, this.silenceTimeoutMs);
    }
  }

  public finalize(onFinalized: (quality: TranscriptQualityTier) => void): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const flushed = this.flush();
    if (flushed && this.lastQualityRecord) {
      onFinalized(this.lastQualityRecord);
    }
  }

  public flush(): VoiceTranscript | null {
    const raw = mergeTranscriptSegmentsSafely(this.rawBuffer, this.interimBuffer).trim();
    if (!raw) {
      this.reset('idle');
      return null;
    }

    const { normalized, substitutions } = applyPhoneticNormalization(raw);
    const confidence = substitutions > 0 ? 0.95 : 0.88;

    this.lastQualityRecord = {
      rawTranscript: raw,
      finalTranscript: raw,
      normalizedInput: normalized,
      confidence,
      substitutionsCount: substitutions,
      timestamp: new Date().toISOString(),
    };

    const result: VoiceTranscript = {
      text: normalized,
      confidence,
      isFinal: true,
    };

    this.reset('idle');
    return result;
  }

  public reset(nextState: VoiceActivityState = 'idle'): void {
    this.rawBuffer = '';
    this.interimBuffer = '';
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.setActivityState(nextState);
  }
}

// ============================================================================
// 3. Local "Hey Alina" Wake-Word Engine
// ============================================================================

export interface WakeWordDetectorOptions {
  triggerPhrase?: string;
  sensitivity?: number;
  onDetected?: (event: WakeWordEvent) => void;
  onError?: (err: Error) => void;
}

export class AlinaWakeWordDetector {
  private recognition: ISpeechRecognitionInstance | null = null;
  private active = false;
  private triggerPhrase = 'hey alina';
  private sensitivity = 0.7;
  private onDetected?: (event: WakeWordEvent) => void;
  private onError?: (err: Error) => void;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: WakeWordDetectorOptions = {}) {
    this.triggerPhrase = (options.triggerPhrase || 'hey alina').toLowerCase();
    this.sensitivity = options.sensitivity ?? 0.7;
    this.onDetected = options.onDetected;
    this.onError = options.onError;

    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window !== 'undefined') {
      const win = window as WindowWithSpeechRecognition;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        return;
      }

      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
          if (!this.active) return;

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i]?.[0]?.transcript?.trim().toLowerCase() || '';
            const confidence = event.results[i]?.[0]?.confidence ?? 0.85;

            if (this.matchesWakePhrase(transcript)) {
              if (this.onDetected) {
                this.onDetected({
                  detectedPhrase: this.triggerPhrase,
                  confidence,
                  timestamp: new Date().toISOString(),
                });
              }
              break;
            }
          }
        };

        this.recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
          if (event.error === 'not-allowed') {
            this.active = false;
            if (this.onError) {
              this.onError(new Error('Microphone permission denied for wake-word detector'));
            }
          }
        };

        this.recognition.onend = () => {
          if (this.active) {
            this.restartTimeout = setTimeout(() => {
              if (this.active && this.recognition) {
                try {
                  this.recognition.start();
                } catch {
                  // Ignore restart race condition
                }
              }
            }, 300);
          }
        };

        // Resume speech recognition when returning to the tab or window focus
        this.visibilityHandler = () => {
          if (this.active && this.recognition) {
            try {
              this.recognition.start();
            } catch {
              // Recognition already active
            }
          }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
        window.addEventListener('focus', this.visibilityHandler);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.onError) {
          this.onError(error);
        }
      }
    }
  }

  /**
   * Acquire a background MediaStream and zero-gain AudioContext destination.
   * This signals the browser to keep the audio subsystem active across tab switching.
   */
  private async acquireBackgroundKeepAlive(): Promise<void> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      if (!this.audioStream) {
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const AudioCtx = win.AudioContext || win.webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          const source = this.audioContext.createMediaStreamSource(this.audioStream);
          const silentGain = this.audioContext.createGain();
          silentGain.gain.value = 0.0;
          source.connect(silentGain);
          silentGain.connect(this.audioContext.destination);
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume().catch(() => {});
          }
        }
      }
    } catch {
      // Graceful fallback if getUserMedia not granted yet
    }
  }

  private matchesWakePhrase(text: string): boolean {
    if (!text) return false;

    if (text.includes(this.triggerPhrase)) {
      return true;
    }

    const phoneticVariants = [
      'hey alina',
      'hey elena',
      'hey aleena',
      'hi alina',
      'hello alina',
      'ok alina',
      'okay alina',
      'alina',
    ];

    return phoneticVariants.some((variant) => text.includes(variant));
  }

  public start(): void {
    if (!this.recognition || this.active) return;
    this.active = true;
    void this.acquireBackgroundKeepAlive();
    try {
      this.recognition.start();
    } catch {
      // Ignore if already active
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
      } catch {
        // Ignore
      }
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      window.removeEventListener('focus', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  public isListening(): boolean {
    return this.active;
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = Math.max(0.1, Math.min(1.0, sensitivity));
  }
}

// ============================================================================
// 4. Conversation Lifecycle Phrasing Helpers
// ============================================================================

export const NATURAL_TERMINATION_PATTERNS: RegExp[] = [
  /^\s*(that'?s\s+all|that\s+is\s+all)(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*(good\s*bye|bye|bye\s*bye)(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*stop\s+listening(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
  /^\s*(end|close|stop|exit)\s+conversation(\s*[,.]?\s*alina)?\s*[.!?]?\s*$/i,
];

export function isTerminationPhrase(phrase: string): boolean {
  const clean = phrase.trim().toLowerCase();
  if (!clean) return false;
  return NATURAL_TERMINATION_PATTERNS.some((pattern) => pattern.test(clean));
}

export function extractCommandAfterWakeWord(
  transcript: string,
  wakePhrase = 'hey alina'
): { isWake: boolean; command?: string } {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();
  const wakeVariants = [wakePhrase.toLowerCase(), 'hey alina', 'alina', 'hey aleena', 'hey elena', 'hi alina'];

  for (const variant of wakeVariants) {
    if (lower.startsWith(variant)) {
      const rest = clean.slice(variant.length).replace(/^[,.:;\s]+/, '').trim();
      return {
        isWake: true,
        command: rest.length > 0 ? rest : undefined,
      };
    }
  }

  for (const variant of wakeVariants) {
    const idx = lower.indexOf(variant);
    if (idx !== -1 && idx <= 5) {
      const rest = clean.slice(idx + variant.length).replace(/^[,.:;\s]+/, '').trim();
      return {
        isWake: true,
        command: rest.length > 0 ? rest : undefined,
      };
    }
  }

  return { isWake: false };
}

