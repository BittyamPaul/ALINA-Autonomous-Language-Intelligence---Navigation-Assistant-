import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceSessionConfig,
} from '@alina/shared';

/**
 * SpeechToTextAdapter
 * 
 * Contract for speech recognition engines (Web Speech API or Headless Mock).
 */
export interface SpeechToTextAdapter {
  isAvailable(): boolean;
  startListening(config?: Partial<VoiceSessionConfig>): Promise<void>;
  stopListening(): Promise<void>;
  abort(): void;
  onTranscript(callback: (transcript: VoiceTranscript) => void): () => void;
  onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void;
  onStateChange(callback: (state: VoiceState) => void): () => void;
}

/**
 * TextToSpeechAdapter
 * 
 * Contract for speech synthesis engines (Web Speech Synthesis or Headless Mock).
 */
export interface TextToSpeechAdapter {
  isAvailable(): boolean;
  speak(text: string, config?: Partial<VoiceSessionConfig>): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  isSpeaking(): boolean;
}

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
}

/**
 * Event callbacks emitted by the Voice Coordinator.
 */
export interface VoiceCoordinatorEvents {
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (transcript: VoiceTranscript) => void;
  onTaskDispatched?: (taskId: string, goal: string) => void;
  onSpokenSummary?: (text: string) => void;
  onError?: (reason: VoiceErrorReason, message: string) => void;
  onFallbackToText?: (partialTranscript: string) => void;
}
