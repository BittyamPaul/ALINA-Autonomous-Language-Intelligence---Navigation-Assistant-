import {
  VoiceTranscript,
  TranscriptQualityTier,
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
 * EnhancedSpeechRecognitionCoordinator
 * 
 * Manages reliable, multi-clause speech transcription with:
 * - Silence endpoint detection (prevents premature cutoffs on natural pauses)
 * - Partial-result accumulation buffer across continuous recognition turns
 * - Phonetic disambiguation for technical terms & Indian English / Hinglish
 * - Multi-tier transcript debug records (RAW, FINAL, NORMALIZED)
 */
export class EnhancedSpeechRecognitionCoordinator {
  private rawBuffer = '';
  private interimBuffer = '';
  private silenceTimer: any = null;
  private silenceTimeoutMs = 1500;
  private debugMode = false;
  private lastQualityRecord?: TranscriptQualityTier;

  constructor(options?: { silenceTimeoutMs?: number; debugMode?: boolean }) {
    if (options?.silenceTimeoutMs) {
      this.silenceTimeoutMs = options.silenceTimeoutMs;
    }
    if (options?.debugMode) {
      this.debugMode = options.debugMode;
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

  /**
   * Resets internal accumulation buffers.
   */
  public reset(): void {
    this.clearSilenceTimer();
    this.rawBuffer = '';
    this.interimBuffer = '';
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

    if (event.isFinal) {
      if (event.text.trim()) {
        if (this.rawBuffer) {
          this.rawBuffer += ' ' + event.text.trim();
        } else {
          this.rawBuffer = event.text.trim();
        }
      }
      this.interimBuffer = '';
    } else {
      this.interimBuffer = event.interimText || event.text;
    }

    const currentCombined = (this.rawBuffer + (this.interimBuffer ? ' ' + this.interimBuffer : '')).trim();
    if (onInterimUpdate) {
      onInterimUpdate(currentCombined);
    }

    // Schedule silence endpoint timer
    if (this.rawBuffer.trim()) {
      this.silenceTimer = setTimeout(() => {
        this.finalize(onFinalized);
      }, this.silenceTimeoutMs);
    }
  }

  /**
   * Immediately commits accumulated buffers and produces the final normalized transcript.
   */
  public finalize(onFinalized: (quality: TranscriptQualityTier) => void): void {
    this.clearSilenceTimer();

    const raw = (this.rawBuffer + (this.interimBuffer ? ' ' + this.interimBuffer : '')).trim();
    if (!raw) {
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
    this.reset();
    onFinalized(record);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
