import {
  VoiceTranscript,
  TranscriptQualityTier,
  VoiceActivityState,
} from '@alina/shared';

/**
 * Technical & Domain Vocabulary Disambiguation Dictionary
 * Disambiguates common acoustic confusion in developer and Hinglish commands
 * without destroying meaningful colloquial phrases.
 */
export const DOMAIN_PHONETIC_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(cereal\s*db|surreal\s*d\s*b)\b/gi, replacement: 'SurrealDB' },
  { pattern: /\b(pack\s*jail|pass\s*jail|pat\s*jail)\b/gi, replacement: 'PathJail' },
  { pattern: /\b(n\s*p\s*m)\b/gi, replacement: 'npm' },
  { pattern: /\b(p\s*and\s*p\s*m|p\s*n\s*p\s*m|b\s*p\s*m)\b/gi, replacement: 'pnpm' },
  { pattern: /\b(type\s*script|type\s*scripts)\b/gi, replacement: 'TypeScript' },
  { pattern: /\b(v\s*test|y\s*test|vai\s*test)\b/gi, replacement: 'Vitest' },
  { pattern: /\b(tori|towry|tawry)\b/gi, replacement: 'Tauri' },
  { pattern: /\b(mast\s*ra|mastera)\b/gi, replacement: 'Mastra' },
  { pattern: /\b(hey\s+elena|hey\s+aleena|elena)\b/gi, replacement: 'Hey Alina' },
  { pattern: /\b(git\s+stats|get\s+status)\b/gi, replacement: 'git status' },
  { pattern: /\b(git\s+chekout|get\s+checkout)\b/gi, replacement: 'git checkout' },
  { pattern: /\b(next\s*j\s*s)\b/gi, replacement: 'next.js' },
];

/**
 * Normalizes speech transcript using technical context while preserving actual recognized text.
 */
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

  // Normalize duplicate whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return { normalized, substitutions };
}

export const applyPhoneticNormalization = normalizeSpeechTranscript;

/**
 * Safely merges streaming partial transcript chunks while eliminating word/phrase duplication.
 * Solves common speech-recognition streaming artifacts where interim and final results
 * overlap or re-emit the trailing suffix.
 * 
 * Example 1: existing "open the backend", incoming "open the backend folder" -> "open the backend folder"
 * Example 2: existing "open my project", incoming "project and run tests" -> "open my project and run tests"
 * Example 3: existing "create a new", incoming "new file" -> "create a new file"
 */
export function mergeTranscriptSegmentsSafely(existing: string, incoming: string): string {
  const eClean = existing.trim();
  const iClean = incoming.trim();

  if (!eClean) return iClean;
  if (!iClean) return eClean;

  const eLower = eClean.toLowerCase();
  const iLower = iClean.toLowerCase();

  // 1. Direct duplicate
  if (eLower === iLower) {
    return eClean;
  }

  // 2. Incoming subsumes existing (common when interim accumulates from beginning)
  if (iLower.startsWith(eLower)) {
    return iClean;
  }

  // 3. Existing already ends with incoming
  if (eLower.endsWith(iLower)) {
    return eClean;
  }

  // 4. Token-level suffix-to-prefix overlap detection
  const eWords = eClean.split(/\s+/);
  const iWords = iClean.split(/\s+/);
  const maxOverlap = Math.min(eWords.length, iWords.length);

  for (let k = maxOverlap; k > 0; k--) {
    const eSuffix = eWords.slice(eWords.length - k).map((w) => w.toLowerCase()).join(' ');
    const iPrefix = iWords.slice(0, k).map((w) => w.toLowerCase()).join(' ');

    if (eSuffix === iPrefix) {
      // Suffix of existing matches prefix of incoming: merge seamlessly
      const mergedWords = [...eWords, ...iWords.slice(k)];
      return mergedWords.join(' ');
    }
  }

  // 5. No overlap: append with single space
  return `${eClean} ${iClean}`;
}

/**
 * EnhancedSpeechRecognitionCoordinator
 * 
 * Manages multi-clause speech transcription with:
 * - Silence endpoint detection (prevents premature cutoffs on natural pauses)
 * - Safe partial-result merging and overlap deduplication
 * - Fine-grained VAD state tracking: user_speaking -> silence -> end_of_utterance
 * - Configurable language/locale support
 * - Clean resource disposal
 */
export class EnhancedSpeechRecognitionCoordinator {
  private rawBuffer = '';
  private interimBuffer = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimeoutMs = 1500;
  private debugMode = false;
  private language = 'en-US';
  private currentActivityState: VoiceActivityState = 'idle';
  private lastQualityRecord?: TranscriptQualityTier;
  private onActivityStateChange?: (state: VoiceActivityState) => void;

  constructor(options?: {
    silenceTimeoutMs?: number;
    debugMode?: boolean;
    language?: string;
    onActivityStateChange?: (state: VoiceActivityState) => void;
  }) {
    if (options?.silenceTimeoutMs) {
      this.silenceTimeoutMs = options.silenceTimeoutMs;
    }
    if (options?.debugMode) {
      this.debugMode = options.debugMode;
    }
    if (options?.language) {
      this.language = options.language;
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

  public getSilenceTimeout(): number {
    return this.silenceTimeoutMs;
  }

  public setLanguage(language: string): void {
    this.language = language;
  }

  public getLanguage(): string {
    return this.language;
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

  public getRawBuffer(): string {
    return this.rawBuffer;
  }

  public getInterimBuffer(): string {
    return this.interimBuffer;
  }

  /**
   * Resets internal accumulation buffers and sets activity state.
   */
  public reset(nextState: VoiceActivityState = 'listening'): void {
    this.clearSilenceTimer();
    this.rawBuffer = '';
    this.interimBuffer = '';
    this.setActivityState(nextState);
  }

  /**
   * Processes an incoming partial or final transcript event.
   * Emits finalized quality payload when silence timeout elapses.
   */
  public handleTranscriptEvent(
    event: VoiceTranscript,
    onFinalized: (quality: TranscriptQualityTier) => void,
    onInterimUpdate?: (interimText: string) => void
  ): void {
    this.clearSilenceTimer();

    // User is actively speaking
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

    // Enter short silence state while timer is running after finalized segment
    if (this.rawBuffer.trim()) {
      this.setActivityState('silence');
      this.silenceTimer = setTimeout(() => {
        this.setActivityState('end_of_utterance');
        this.finalize(onFinalized);
      }, this.silenceTimeoutMs);
    }
  }

  /**
   * Immediately commits accumulated buffers and produces the final normalized transcript.
   */
  public finalize(onFinalized: (quality: TranscriptQualityTier) => void): void {
    this.clearSilenceTimer();

    const raw = mergeTranscriptSegmentsSafely(this.rawBuffer, this.interimBuffer).trim();
    if (!raw) {
      this.setActivityState('idle');
      return;
    }

    const { normalized, substitutions } = normalizeSpeechTranscript(raw);

    const record: TranscriptQualityTier = {
      rawTranscript: raw,
      finalTranscript: raw,
      normalizedInput: normalized,
      confidence: 0.95,
      substitutionsCount: substitutions,
      timestamp: new Date().toISOString(),
    };

    this.lastQualityRecord = record;
    this.reset('idle');
    onFinalized(record);
  }

  public cleanup(): void {
    this.clearSilenceTimer();
    this.rawBuffer = '';
    this.interimBuffer = '';
    this.setActivityState('idle');
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
