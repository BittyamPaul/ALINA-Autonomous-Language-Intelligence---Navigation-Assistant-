import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceSessionConfig,
  VoiceConversationMode,
  VoiceActivityState,
  VoiceConversationSession,
  VoiceOption,
  VoiceProfile,
  TextToSpeechOptions,
  WakeWordEvent,
  TranscriptQualityTier,
  VoiceDiagnosticTelemetry,
} from '@alina/shared';

/**
 * WakeWordProvider
 * 
 * Modular interface for local on-device wake-word detection ("Hey Alina").
 * Implementations remain completely replaceable (WebSpeech, Porcupine, OpenWakeWord, Rust native).
 */
export interface WakeWordProvider {
  readonly providerName: string;
  isAvailable(): boolean;
  isActive(): boolean;
  start(): boolean;
  stop(): void;
  cleanup?(): void;
  setTriggerPhrase(phrase: string): void;
  getTriggerPhrase(): string;
  setSensitivity(sensitivity: number): void;
  getSensitivity(): number;
  onDetected(callback: (event: WakeWordEvent) => void): () => void;
  onError?(callback: (err: Error) => void): () => void;
}

/**
 * SpeechRecognitionConfig
 */
export interface SpeechRecognitionConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  silenceTimeoutMs?: number;
}

/**
 * SpeechRecognitionProvider
 * 
 * Contract for speech-to-text recognition engines (Web Speech API, Whisper, Headless Mock).
 */
export interface SpeechRecognitionProvider {
  readonly providerName: string;
  isAvailable(): boolean;
  startListening(config?: Partial<VoiceSessionConfig> | SpeechRecognitionConfig): Promise<void>;
  stopListening(): Promise<void>;
  abort(): void;
  cleanup?(): void;
  setLanguage?(lang: string): void;
  getLanguage?(): string;
  onTranscript(callback: (transcript: VoiceTranscript) => void): () => void;
  onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void;
  onStateChange(callback: (state: VoiceState) => void): () => void;
  onInterruption?(callback: () => void): () => void;
}

/**
 * VoiceProvider
 * 
 * Contract for speech synthesis engines (Web Neural, Edge Neural, Cloud, Headless Mock).
 * Exposes configurable voice, speed, volume, and pitch with natural female voice profile.
 */
export interface VoiceProvider {
  readonly providerName: string;
  isAvailable(): boolean;
  getAvailableVoices(): Promise<VoiceOption[]>;
  getSelectedVoice(): VoiceOption | undefined;
  setVoice(voiceId: string): void;
  setSpeed(speed: number): void;
  setPitch(pitch: number): void;
  setVolume(volume: number): void;
  getVoiceProfile(): VoiceProfile;
  setVoiceProfile?(profile: Partial<VoiceProfile>): void;
  speak(text: string, options?: TextToSpeechOptions | Partial<VoiceSessionConfig>): Promise<void>;
  stop(): void;
  pause?(): void;
  resume?(): void;
  isSpeaking(): boolean;
  cleanup?(): void;
}

// Backward-compatible aliases for legacy imports across the workspace
export type SpeechToTextAdapter = SpeechRecognitionProvider;
export type TextToSpeechProvider = VoiceProvider;
export type TextToSpeechAdapter = VoiceProvider;

/**
 * Final outcome of a voice interaction turn.
 */
export interface VoiceInteractionResult {
  transcript: string;
  responseSummary: string;
  spoken: boolean;
  interrupted: boolean;
  durationMs: number;
  taskId?: string;
  error?: string;
  terminatedSession?: boolean;
  telemetry?: VoiceDiagnosticTelemetry;
}

/**
 * Event callbacks emitted by the Voice Coordinator.
 */
export interface VoiceCoordinatorEvents {
  onStateChange?: (state: VoiceState) => void;
  onModeChange?: (mode: VoiceConversationMode) => void;
  onActivityStateChange?: (activityState: VoiceActivityState) => void;
  onSessionChange?: (session: VoiceConversationSession | null) => void;
  onInactivityWarning?: (prompt: string) => void;
  onTranscript?: (transcript: VoiceTranscript) => void;
  onTaskDispatched?: (taskId: string, goal: string) => void;
  onSpokenSummary?: (text: string) => void;
  onError?: (reason: VoiceErrorReason, message: string) => void;
  onFallbackToText?: (partialTranscript: string) => void;
  onWakeWordDetected?: (event: WakeWordEvent) => void;
  onTranscriptQuality?: (record: TranscriptQualityTier) => void;
  onTelemetryUpdate?: (telemetry: VoiceDiagnosticTelemetry) => void;
}
