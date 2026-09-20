'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceState, VoiceTranscript, VoiceErrorReason } from '@alina/shared';

export interface UseVoiceInteractionOptions {
  onCommandTranscribed?: (transcript: string) => void;
  language?: string;
  voiceRate?: number;
  voicePitch?: number;
  ttsEnabled?: boolean;
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

/**
 * Client-safe Web Speech Synthesis helper.
 */
class ClientSpeechSynthesis {
  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public async speak(
    text: string,
    options?: { rate?: number; pitch?: number; language?: string }
  ): Promise<void> {
    if (!this.isAvailable()) return;

    this.stop();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.lang = options?.language ?? 'en-US';

      utterance.onend = () => resolve();
      utterance.onerror = (err) => reject(new Error(`Speech synthesis error: ${err.error}`));

      window.speechSynthesis.speak(utterance);
    });
  }

  public stop(): void {
    if (this.isAvailable()) {
      window.speechSynthesis.cancel();
    }
  }

  public isSpeaking(): boolean {
    return this.isAvailable() && window.speechSynthesis.speaking;
  }
}

export function useVoiceInteraction(options?: UseVoiceInteractionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | undefined>();

  const sttRef = useRef<ClientSpeechRecognition | null>(null);
  const ttsRef = useRef<ClientSpeechSynthesis | null>(null);
  const onCommandTranscribedRef = useRef(options?.onCommandTranscribed);
  onCommandTranscribedRef.current = options?.onCommandTranscribed;

  useEffect(() => {
    sttRef.current = new ClientSpeechRecognition();
    ttsRef.current = new ClientSpeechSynthesis();

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
    };
  }, []);

  const interrupt = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
    }
    if (sttRef.current) {
      sttRef.current.abort();
    }
    setVoiceState('interrupted');
    setInterimTranscript('');
    setTimeout(() => {
      setVoiceState('idle');
    }, 150);
  }, []);

  const startListening = useCallback(async () => {
    setVoiceErrorMessage(undefined);
    setInterimTranscript('');

    if (ttsRef.current?.isSpeaking()) {
      ttsRef.current.stop();
    }

    if (!sttRef.current || !sttRef.current.isAvailable()) {
      setVoiceState('error');
      setVoiceErrorMessage('Speech recognition is not supported in this browser. Please use text input.');
      setTimeout(() => setVoiceState('idle'), 3000);
      return;
    }

    setVoiceState('listening');

    sttRef.current.start(
      (t: VoiceTranscript) => {
        if (t.isFinal) {
          setInterimTranscript('');
          setVoiceState('processing');
          if (onCommandTranscribedRef.current && t.text.trim()) {
            onCommandTranscribedRef.current(t.text.trim());
          }
        } else {
          setInterimTranscript(t.interimText || t.text);
        }
      },
      (reason: VoiceErrorReason, _message: string) => {
        setVoiceState('error');
        let friendly = 'Voice recognition error. Falling back to text composer.';
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
        }, 3000);
      },
      () => {
        setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
      },
      options?.language || 'en-US'
    );
  }, [options?.language]);

  const stopListening = useCallback(async () => {
    if (sttRef.current) {
      sttRef.current.stop();
    }
  }, []);

  const speakSummary = useCallback(
    async (text: string) => {
      if (!options?.ttsEnabled && options?.ttsEnabled !== undefined) {
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
          language: options?.language ?? 'en-US',
        });
      } catch {
        // Audio output error is non-fatal
      } finally {
        setVoiceState('idle');
      }
    },
    [options?.ttsEnabled, options?.voiceRate, options?.voicePitch, options?.language]
  );

  const clearVoiceError = useCallback(() => {
    setVoiceErrorMessage(undefined);
  }, []);

  return {
    voiceState,
    setVoiceState,
    interimTranscript,
    voiceErrorMessage,
    startListening,
    stopListening,
    interrupt,
    speakSummary,
    clearVoiceError,
  };
}
