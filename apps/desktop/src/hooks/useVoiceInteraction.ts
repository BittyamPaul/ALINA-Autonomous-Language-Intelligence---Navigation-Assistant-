'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceOption,
  TranscriptQualityTier,
} from '@alina/shared';
import {
  WebNeuralSpeechProvider,
  EnhancedSpeechRecognitionCoordinator,
  AlinaWakeWordDetector,
} from '@/lib/voice-client';

export interface UseVoiceInteractionOptions {
  onCommandTranscribed?: (transcript: string) => void;
  language?: string;
  voiceRate?: number;
  voicePitch?: number;
  voiceVolume?: number;
  voiceId?: string;
  ttsEnabled?: boolean;
  wakeWordEnabled?: boolean;
  wakeWordSensitivity?: number;
  silenceTimeoutMs?: number;
  onTranscriptQuality?: (quality: TranscriptQualityTier) => void;
}

interface ISpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: ISpeechRecognitionResultItem;
}

interface ISpeechRecognitionResultList {
  length: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognitionInstance;

/**
 * Client-safe Web Speech Recognition helper avoiding server-side Node dependencies.
 */
class ClientSpeechRecognition {
  private recognition: ISpeechRecognitionInstance | null = null;
  private listening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const win = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
      }
    }
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public start(
    onTranscript: (t: VoiceTranscript) => void,
    onError: (reason: VoiceErrorReason, message: string) => void,
    onEnd: () => void,
    language = 'en-US'
  ): void {
    if (!this.recognition || this.listening) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;

    this.recognition.onstart = () => {
      this.listening = true;
    };

    this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (!item) continue;
        const subItem = item[0];
        if (item.isFinal) {
          final += subItem?.transcript ?? '';
        } else {
          interim += subItem?.transcript ?? '';
        }
      }

      if (final.trim()) {
        onTranscript({
          text: final.trim(),
          isFinal: true,
          confidence: event.results[0]?.[0]?.confidence ?? 1.0,
          interimText: interim.trim() || undefined,
        });
      } else if (interim.trim()) {
        onTranscript({
          text: interim.trim(),
          isFinal: false,
          confidence: 0.8,
          interimText: interim.trim(),
        });
      }
    };

    this.recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      let reason: VoiceErrorReason = 'unknown';
      if (event.error === 'not-allowed') reason = 'microphone_denied';
      else if (event.error === 'network') reason = 'network_timeout';
      else if (event.error === 'no-speech') reason = 'speech_service_unavailable';
      else if (event.error === 'aborted') reason = 'aborted';

      onError(reason, `Speech recognition error: ${event.error}`);
    };

    this.recognition.onend = () => {
      this.listening = false;
      onEnd();
    };

    try {
      this.recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError('speech_service_unavailable', msg);
    }
  }

  public stop(): void {
    if (this.recognition && this.listening) {
      this.recognition.stop();
      this.listening = false;
    }
  }

  public abort(): void {
    if (this.recognition && this.listening) {
      this.recognition.abort();
      this.listening = false;
    }
  }
}

export function useVoiceInteraction(options?: UseVoiceInteractionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | undefined>();
  const [isWakeWordListening, setIsWakeWordListening] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption | null>(null);
  const [transcriptQuality, setTranscriptQuality] = useState<TranscriptQualityTier | null>(null);

  const sttRef = useRef<ClientSpeechRecognition | null>(null);
  const ttsRef = useRef<WebNeuralSpeechProvider | null>(null);
  const wakeWordRef = useRef<AlinaWakeWordDetector | null>(null);
  const coordinatorRef = useRef<EnhancedSpeechRecognitionCoordinator | null>(null);

  const onCommandTranscribedRef = useRef(options?.onCommandTranscribed);
  onCommandTranscribedRef.current = options?.onCommandTranscribed;

  const onTranscriptQualityRef = useRef(options?.onTranscriptQuality);
  onTranscriptQualityRef.current = options?.onTranscriptQuality;

  // Initialize Speech Coordinator & TTS Provider
  useEffect(() => {
    sttRef.current = new ClientSpeechRecognition();
    const tts = new WebNeuralSpeechProvider(options?.voiceId);
    ttsRef.current = tts;

    // Load and select natural female voices
    tts.getAvailableVoices().then((voices) => {
      setAvailableVoices(voices);
      const chosen = tts.getSelectedVoice();
      if (chosen) {
        setSelectedVoice(chosen);
      }
    });

    // Enhanced STT Coordinator with configurable silence endpointing
    const coordinator = new EnhancedSpeechRecognitionCoordinator({
      silenceTimeoutMs: options?.silenceTimeoutMs ?? 1500,
    });
    coordinatorRef.current = coordinator;

    // Keyboard shortcut: Escape halts active speech or listening
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        interrupt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      ttsRef.current?.stop();
      sttRef.current?.abort();
      wakeWordRef.current?.stop();
    };
  }, [options?.voiceId, options?.silenceTimeoutMs]);

  const interrupt = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
    }
    if (sttRef.current) {
      sttRef.current.abort();
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.reset();
    }
    setVoiceState('interrupted');
    setInterimTranscript('');
    setTimeout(() => {
      setVoiceState('idle');
      if (options?.wakeWordEnabled && wakeWordRef.current) {
        wakeWordRef.current.start();
        setIsWakeWordListening(true);
      }
    }, 150);
  }, [options?.wakeWordEnabled]);

  const commitCommand = useCallback((quality: TranscriptQualityTier) => {
    setTranscriptQuality(quality);
    if (onTranscriptQualityRef.current) {
      onTranscriptQualityRef.current(quality);
    }

    const command = quality.normalizedInput.trim();
    if (command && onCommandTranscribedRef.current) {
      setVoiceState('processing');
      onCommandTranscribedRef.current(command);
    } else {
      setVoiceState('idle');
    }
  }, []);

  const startListening = useCallback(async () => {
    setVoiceErrorMessage(undefined);
    setInterimTranscript('');

    // Pause wake-word detector while actively listening for command
    if (wakeWordRef.current) {
      wakeWordRef.current.stop();
      setIsWakeWordListening(false);
    }

    if (ttsRef.current?.isSpeaking()) {
      ttsRef.current.stop();
    }

    if (!sttRef.current || !sttRef.current.isAvailable()) {
      setVoiceState('error');
      setVoiceErrorMessage('Speech recognition is not supported in this browser. Please use text composer.');
      setTimeout(() => setVoiceState('idle'), 3000);
      return;
    }

    if (coordinatorRef.current) {
      coordinatorRef.current.reset();
    }

    setVoiceState('listening');

    sttRef.current.start(
      (t: VoiceTranscript) => {
        if (!coordinatorRef.current) return;

        // Process through Smart Endpointing Coordinator
        coordinatorRef.current.handleTranscriptEvent(
          t,
          (quality: TranscriptQualityTier) => {
            // Triggered when natural silence endpoint is reached
            sttRef.current?.stop();
            setInterimTranscript('');
            commitCommand(quality);
          },
          (currentCombined: string) => {
            setInterimTranscript(currentCombined);
          }
        );
      },
      (reason: VoiceErrorReason, _message: string) => {
        setVoiceState('error');
        let friendly = 'Voice recognition error. Switched to text composer.';
        if (reason === 'microphone_denied') {
          friendly = 'Microphone permission denied. Switched to text composer.';
        } else if (reason === 'speech_service_unavailable') {
          friendly = 'Speech recognition service is unavailable in this environment.';
        } else if (reason === 'network_timeout') {
          friendly = 'Network timeout during speech recognition.';
        }
        setVoiceErrorMessage(friendly);
        setTimeout(() => {
          setVoiceState('idle');
          if (options?.wakeWordEnabled && wakeWordRef.current) {
            wakeWordRef.current.start();
            setIsWakeWordListening(true);
          }
        }, 3000);
      },
      () => {
        // Recognition ended: flush any uncommitted accumulated text
        if (coordinatorRef.current) {
          coordinatorRef.current.finalize((quality) => {
            if (quality.normalizedInput.trim()) {
              commitCommand(quality);
            } else {
              setVoiceState('idle');
              if (options?.wakeWordEnabled && wakeWordRef.current) {
                wakeWordRef.current.start();
                setIsWakeWordListening(true);
              }
            }
          });
        } else {
          setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
        }
      },
      options?.language || 'en-US'
    );
  }, [options?.language, options?.wakeWordEnabled, commitCommand]);

  const stopListening = useCallback(async () => {
    if (sttRef.current) {
      sttRef.current.stop();
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.finalize((quality) => {
        setInterimTranscript('');
        commitCommand(quality);
      });
    }
  }, [commitCommand]);

  const speakSummary = useCallback(
    async (text: string) => {
      if (options?.ttsEnabled === false) {
        return;
      }
      if (!ttsRef.current || !ttsRef.current.isAvailable() || !text.trim()) {
        return;
      }

      setVoiceState('speaking');
      try {
        await ttsRef.current.speak(text, {
          rate: options?.voiceRate ?? 1.0,
          pitch: options?.voicePitch ?? 1.0,
          volume: options?.voiceVolume ?? 1.0,
          language: options?.language ?? 'en-US',
          voiceId: options?.voiceId,
        });
      } catch {
        // Audio output error is non-fatal
      } finally {
        setVoiceState('idle');
        if (options?.wakeWordEnabled && wakeWordRef.current) {
          wakeWordRef.current.start();
          setIsWakeWordListening(true);
        }
      }
    },
    [options?.ttsEnabled, options?.voiceRate, options?.voicePitch, options?.voiceVolume, options?.language, options?.voiceId, options?.wakeWordEnabled]
  );

  // Wake-word ("Hey Alina") initialization & background listener
  useEffect(() => {
    if (!options?.wakeWordEnabled) {
      if (wakeWordRef.current) {
        wakeWordRef.current.stop();
        setIsWakeWordListening(false);
      }
      return;
    }

    const wakeWord = new AlinaWakeWordDetector({
      sensitivity: options?.wakeWordSensitivity ?? 0.7,
      onDetected: (_evt) => {
        // "Hey Alina" trigger confirmed locally on-device
        wakeWord.stop();
        setIsWakeWordListening(false);
        // Transition straight to listening
        startListening();
      },
      onError: (err) => {
        console.warn('[WakeWord] Local detector notice:', err.message);
      },
    });

    wakeWordRef.current = wakeWord;
    wakeWord.start();
    setIsWakeWordListening(true);

    return () => {
      wakeWord.stop();
      setIsWakeWordListening(false);
    };
  }, [options?.wakeWordEnabled, options?.wakeWordSensitivity, startListening]);

  const toggleWakeWord = useCallback((enabled: boolean) => {
    if (wakeWordRef.current) {
      if (enabled) {
        wakeWordRef.current.start();
        setIsWakeWordListening(true);
      } else {
        wakeWordRef.current.stop();
        setIsWakeWordListening(false);
      }
    }
  }, []);

  const selectVoice = useCallback((voiceId: string) => {
    if (ttsRef.current) {
      ttsRef.current.setVoice(voiceId);
      const chosen = ttsRef.current.getSelectedVoice();
      if (chosen) {
        setSelectedVoice(chosen);
      }
    }
  }, []);

  const clearVoiceError = useCallback(() => {
    setVoiceErrorMessage(undefined);
  }, []);

  return {
    voiceState,
    setVoiceState,
    interimTranscript,
    voiceErrorMessage,
    isWakeWordListening,
    availableVoices,
    selectedVoice,
    transcriptQuality,
    startListening,
    stopListening,
    interrupt,
    speakSummary,
    clearVoiceError,
    toggleWakeWord,
    selectVoice,
  };
}
