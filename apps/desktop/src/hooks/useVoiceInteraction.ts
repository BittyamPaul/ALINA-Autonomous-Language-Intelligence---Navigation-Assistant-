'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceOption,
  TranscriptQualityTier,
  VoiceConversationMode,
  VoiceActivityState,
  VoiceConversationSession,
} from '@alina/shared';
import {
  WebNeuralSpeechProvider,
  EnhancedSpeechRecognitionCoordinator,
  AlinaWakeWordDetector,
  isTerminationPhrase,
  extractCommandAfterWakeWord,
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
  inactivityPromptMs?: number;
  inactivityCloseMs?: number;
  onTranscriptQuality?: (quality: TranscriptQualityTier) => void;
  onModeChange?: (mode: VoiceConversationMode) => void;
  onActivityStateChange?: (activityState: VoiceActivityState) => void;
  onSessionChange?: (session: VoiceConversationSession | null) => void;
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

  public isCurrentlyListening(): boolean {
    return this.listening;
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
  const [mode, setMode] = useState<VoiceConversationMode>('wake_mode');
  const [activityState, setActivityState] = useState<VoiceActivityState>('idle');
  const [session, setSession] = useState<VoiceConversationSession | null>(null);
  const [inactivityWarning, setInactivityWarning] = useState<string | null>(null);

  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | undefined>();
  const [isWakeWordListening, setIsWakeWordListening] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption | null>(null);
  const [transcriptQuality, setTranscriptQuality] = useState<TranscriptQualityTier | null>(null);

  const modeRef = useRef<VoiceConversationMode>('wake_mode');
  modeRef.current = mode;

  const sessionRef = useRef<VoiceConversationSession | null>(null);
  sessionRef.current = session;

  const sttRef = useRef<ClientSpeechRecognition | null>(null);
  const ttsRef = useRef<WebNeuralSpeechProvider | null>(null);
  const wakeWordRef = useRef<AlinaWakeWordDetector | null>(null);
  const coordinatorRef = useRef<EnhancedSpeechRecognitionCoordinator | null>(null);

  const inactivityPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCommandTranscribedRef = useRef(options?.onCommandTranscribed);
  onCommandTranscribedRef.current = options?.onCommandTranscribed;

  const onTranscriptQualityRef = useRef(options?.onTranscriptQuality);
  onTranscriptQualityRef.current = options?.onTranscriptQuality;

  const onModeChangeRef = useRef(options?.onModeChange);
  onModeChangeRef.current = options?.onModeChange;

  const onActivityStateChangeRef = useRef(options?.onActivityStateChange);
  onActivityStateChangeRef.current = options?.onActivityStateChange;

  const onSessionChangeRef = useRef(options?.onSessionChange);
  onSessionChangeRef.current = options?.onSessionChange;

  const updateActivityState = useCallback((nextState: VoiceActivityState) => {
    setActivityState(nextState);
    if (onActivityStateChangeRef.current) {
      onActivityStateChangeRef.current(nextState);
    }
  }, []);

  const clearInactivityTimers = useCallback(() => {
    if (inactivityPromptTimerRef.current) {
      clearTimeout(inactivityPromptTimerRef.current);
      inactivityPromptTimerRef.current = null;
    }
    if (inactivityCloseTimerRef.current) {
      clearTimeout(inactivityCloseTimerRef.current);
      inactivityCloseTimerRef.current = null;
    }
    setInactivityWarning(null);
  }, []);

  // End conversation session and return cleanly to Wake Mode
  const endConversation = useCallback(() => {
    clearInactivityTimers();
    setMode('wake_mode');
    modeRef.current = 'wake_mode';

    setSession((prev) => (prev ? { ...prev, state: 'ended', last_activity: new Date().toISOString() } : null));
    if (onSessionChangeRef.current) {
      onSessionChangeRef.current(null);
    }
    if (onModeChangeRef.current) {
      onModeChangeRef.current('wake_mode');
    }

    setVoiceState('idle');
    updateActivityState('idle');
    setInterimTranscript('');
    setInactivityWarning(null);

    if (sttRef.current) {
      sttRef.current.stop();
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.reset('idle');
    }

    if (options?.wakeWordEnabled && wakeWordRef.current) {
      wakeWordRef.current.start();
      setIsWakeWordListening(true);
    }
  }, [options?.wakeWordEnabled, clearInactivityTimers, updateActivityState]);

  // Start continuous conversation session
  const startConversation = useCallback((conversationId?: string) => {
    clearInactivityTimers();
    const newSession: VoiceConversationSession = {
      session_id: `vcs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      state: 'conversation_mode',
      conversation_id: conversationId || `conv_${Date.now()}`,
      voice_enabled: true,
      wake_word_enabled: options?.wakeWordEnabled ?? true,
      timeout_policy: {
        utteranceSilenceMs: options?.silenceTimeoutMs ?? 1500,
        inactivityPromptMs: options?.inactivityPromptMs ?? 20000,
        inactivityCloseMs: options?.inactivityCloseMs ?? 10000,
        maxSessionDurationMs: 1800000,
      },
    };

    setSession(newSession);
    setMode('conversation_mode');
    modeRef.current = 'conversation_mode';

    if (onModeChangeRef.current) {
      onModeChangeRef.current('conversation_mode');
    }
    if (onSessionChangeRef.current) {
      onSessionChangeRef.current(newSession);
    }

    if (wakeWordRef.current) {
      wakeWordRef.current.stop();
      setIsWakeWordListening(false);
    }

    return newSession;
  }, [options?.wakeWordEnabled, options?.silenceTimeoutMs, options?.inactivityPromptMs, options?.inactivityCloseMs, clearInactivityTimers]);

  // Speak text summary via TTS
  const speakSummary = useCallback(
    async (text: string): Promise<void> => {
      if (options?.ttsEnabled === false) {
        return;
      }
      if (!ttsRef.current || !ttsRef.current.isAvailable() || !text.trim()) {
        return;
      }

      setVoiceState('speaking');
      updateActivityState('speaking');

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
        if (modeRef.current === 'conversation_mode') {
          // Automatic multi-turn loop: resume listening after speaking without repeated button taps!
          setTimeout(() => {
            if (modeRef.current === 'conversation_mode') {
              void startListening();
            }
          }, 200);
        } else {
          setVoiceState('idle');
          updateActivityState('idle');
          if (options?.wakeWordEnabled && wakeWordRef.current) {
            wakeWordRef.current.start();
            setIsWakeWordListening(true);
          }
        }
      }
    },
    [options?.ttsEnabled, options?.voiceRate, options?.voicePitch, options?.voiceVolume, options?.language, options?.voiceId, options?.wakeWordEnabled, updateActivityState]
  );

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimers();
    if (modeRef.current !== 'conversation_mode') return;

    const promptMs = options?.inactivityPromptMs ?? 20000;
    const closeMs = options?.inactivityCloseMs ?? 10000;

    inactivityPromptTimerRef.current = setTimeout(() => {
      if (modeRef.current === 'conversation_mode') {
        const prompt = 'Are you still there?';
        setInactivityWarning(prompt);
        updateActivityState('silence');

        void speakSummary(prompt);

        inactivityCloseTimerRef.current = setTimeout(() => {
          if (modeRef.current === 'conversation_mode') {
            endConversation();
          }
        }, closeMs);
      }
    }, promptMs);
  }, [options?.inactivityPromptMs, options?.inactivityCloseMs, clearInactivityTimers, speakSummary, endConversation, updateActivityState]);

  const commitCommand = useCallback((quality: TranscriptQualityTier) => {
    clearInactivityTimers();
    setTranscriptQuality(quality);
    if (onTranscriptQualityRef.current) {
      onTranscriptQualityRef.current(quality);
    }

    const command = quality.normalizedInput.trim();
    if (!command) {
      if (modeRef.current === 'conversation_mode') {
        resetInactivityTimer();
      } else {
        setVoiceState('idle');
        updateActivityState('idle');
      }
      return;
    }

    // Natural conversation exit detection ("That's all, Alina", "Goodbye Alina", "Stop listening", "End conversation")
    if (isTerminationPhrase(command)) {
      void speakSummary('Goodbye! Let me know whenever you need me.');
      endConversation();
      return;
    }

    // Standard command submission
    setVoiceState('processing');
    updateActivityState('thinking');

    if (onCommandTranscribedRef.current) {
      onCommandTranscribedRef.current(command);
    } else {
      setVoiceState('idle');
      updateActivityState('idle');
    }
  }, [clearInactivityTimers, endConversation, resetInactivityTimer, speakSummary, updateActivityState]);

  const startListening = useCallback(async () => {
    setVoiceErrorMessage(undefined);
    setInterimTranscript('');
    clearInactivityTimers();

    // If starting listening in wake_mode, transition to conversation_mode
    if (modeRef.current === 'wake_mode' || !sessionRef.current) {
      startConversation();
    }

    // Pause wake-word detector while actively recording
    if (wakeWordRef.current) {
      wakeWordRef.current.stop();
      setIsWakeWordListening(false);
    }

    if (ttsRef.current?.isSpeaking()) {
      ttsRef.current.stop();
    }

    if (!sttRef.current || !sttRef.current.isAvailable()) {
      setVoiceState('error');
      updateActivityState('error');
      setVoiceErrorMessage('Speech recognition is not supported in this browser. Please use text composer.');
      setTimeout(() => {
        setVoiceState('idle');
        updateActivityState('idle');
      }, 3000);
      return;
    }

    if (coordinatorRef.current) {
      coordinatorRef.current.reset('listening');
    }

    setVoiceState('listening');
    updateActivityState('listening');
    resetInactivityTimer();

    sttRef.current.start(
      (t: VoiceTranscript) => {
        if (!coordinatorRef.current) return;
        clearInactivityTimers();

        // Pass to Smart Endpointing Coordinator
        coordinatorRef.current.handleTranscriptEvent(
          t,
          (quality: TranscriptQualityTier) => {
            // Triggered when natural silence threshold is reached (end of utterance)
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
        updateActivityState('error');
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
          updateActivityState('idle');
          if (modeRef.current === 'wake_mode' && options?.wakeWordEnabled && wakeWordRef.current) {
            wakeWordRef.current.start();
            setIsWakeWordListening(true);
          }
        }, 3000);
      },
      () => {
        // Recognition ended
        if (coordinatorRef.current) {
          coordinatorRef.current.finalize((quality) => {
            if (quality.normalizedInput.trim()) {
              commitCommand(quality);
            } else {
              if (modeRef.current === 'conversation_mode') {
                resetInactivityTimer();
              } else {
                setVoiceState('idle');
                updateActivityState('idle');
                if (options?.wakeWordEnabled && wakeWordRef.current) {
                  wakeWordRef.current.start();
                  setIsWakeWordListening(true);
                }
              }
            }
          });
        }
      },
      options?.language || 'en-US'
    );
  }, [clearInactivityTimers, startConversation, updateActivityState, resetInactivityTimer, commitCommand, options?.language, options?.wakeWordEnabled]);

  const stopListening = useCallback(async () => {
    clearInactivityTimers();
    if (sttRef.current) {
      sttRef.current.stop();
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.finalize((quality) => {
        setInterimTranscript('');
        commitCommand(quality);
      });
    }
  }, [clearInactivityTimers, commitCommand]);

  const interrupt = useCallback(() => {
    clearInactivityTimers();
    if (ttsRef.current) {
      ttsRef.current.stop();
    }
    if (sttRef.current) {
      sttRef.current.abort();
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.reset('idle');
    }
    setVoiceState('interrupted');
    updateActivityState('interrupted');
    setInterimTranscript('');
    setTimeout(() => {
      if (modeRef.current === 'conversation_mode') {
        setVoiceState('idle');
        updateActivityState('idle');
      } else {
        setVoiceState('idle');
        updateActivityState('idle');
        if (options?.wakeWordEnabled && wakeWordRef.current) {
          wakeWordRef.current.start();
          setIsWakeWordListening(true);
        }
      }
    }, 150);
  }, [clearInactivityTimers, updateActivityState, options?.wakeWordEnabled]);

  // Initialize Speech Coordinator & TTS Provider
  useEffect(() => {
    sttRef.current = new ClientSpeechRecognition();
    const tts = new WebNeuralSpeechProvider(options?.voiceId);
    ttsRef.current = tts;

    // Load available voices
    tts.getAvailableVoices().then((voices) => {
      setAvailableVoices(voices);
      const chosen = tts.getSelectedVoice();
      if (chosen) {
        setSelectedVoice(chosen);
      }
    });

    const coordinator = new EnhancedSpeechRecognitionCoordinator({
      silenceTimeoutMs: options?.silenceTimeoutMs ?? 1500,
      onActivityStateChange: (state) => {
        updateActivityState(state);
      },
    });
    coordinatorRef.current = coordinator;

    // Keyboard shortcut: Escape halts active speech or exits conversation mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modeRef.current === 'conversation_mode') {
          endConversation();
        } else {
          interrupt();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearInactivityTimers();
      ttsRef.current?.stop();
      sttRef.current?.abort();
      wakeWordRef.current?.stop();
    };
  }, [options?.voiceId, options?.silenceTimeoutMs, updateActivityState, endConversation, interrupt, clearInactivityTimers]);

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
      onDetected: (evt) => {
        // "Hey Alina" trigger confirmed locally on-device
        wakeWord.stop();
        setIsWakeWordListening(false);

        // Transition: WAKE MODE -> CONVERSATION MODE
        startConversation();

        // Check if wake utterance already included a command
        const parsed = extractCommandAfterWakeWord(evt.detectedPhrase);
        if (parsed.isWake && parsed.command) {
          commitCommand({
            rawTranscript: parsed.command,
            finalTranscript: parsed.command,
            normalizedInput: parsed.command,
            confidence: 0.95,
            substitutionsCount: 0,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Listen for the first utterance
          void startListening();
        }
      },
      onError: (err) => {
        console.warn('[WakeWord] Local detector notice:', err.message);
      },
    });

    wakeWordRef.current = wakeWord;
    if (modeRef.current === 'wake_mode') {
      wakeWord.start();
      setIsWakeWordListening(true);
    }

    return () => {
      wakeWord.stop();
      setIsWakeWordListening(false);
    };
  }, [options?.wakeWordEnabled, options?.wakeWordSensitivity, startConversation, commitCommand, startListening]);

  const toggleWakeWord = useCallback((enabled: boolean) => {
    if (wakeWordRef.current) {
      if (enabled && modeRef.current === 'wake_mode') {
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
    mode,
    activityState,
    session,
    isConversationActive: mode === 'conversation_mode',
    inactivityWarning,
    interimTranscript,
    voiceErrorMessage,
    isWakeWordListening,
    availableVoices,
    selectedVoice,
    transcriptQuality,
    startListening,
    stopListening,
    startConversation,
    endConversation,
    interrupt,
    speakSummary,
    clearVoiceError,
    toggleWakeWord,
    selectVoice,
  };
}
