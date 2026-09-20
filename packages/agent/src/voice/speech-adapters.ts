import {
  VoiceState,
  VoiceTranscript,
  VoiceErrorReason,
  VoiceSessionConfig,
  TextToSpeechOptions,
  VoiceOption,
  VoiceProfile,
} from '@alina/shared';
import {
  SpeechRecognitionProvider,
  VoiceProvider,
  SpeechRecognitionConfig,
} from './types';
import { DEFAULT_NATURAL_FEMALE_PROFILE } from './tts-provider';

// ============================================================================
// Web Speech Recognition Adapter (Browser / WebView / Tauri)
// ============================================================================

export class WebSpeechRecognitionAdapter implements SpeechRecognitionProvider {
  public readonly providerName = 'web_speech_recognition';
  private recognition: any = null;
  private isListening = false;
  private language = 'en-US';
  private transcriptListeners: Array<(transcript: VoiceTranscript) => void> = [];
  private errorListeners: Array<(reason: VoiceErrorReason, message: string) => void> = [];
  private stateListeners: Array<(state: VoiceState) => void> = [];
  private interruptionListeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
      }
    }
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public setLanguage(lang: string): void {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public getLanguage(): string {
    return this.language;
  }

  public async startListening(config?: Partial<VoiceSessionConfig> | SpeechRecognitionConfig): Promise<void> {
    if (!this.recognition) {
      this.notifyError('speech_service_unavailable', 'SpeechRecognition API is not supported in this environment.');
      return;
    }

    if (this.isListening) {
      return;
    }

    const isContinuous = (config && 'continuous' in config) ? config.continuous : true;
    const isInterim = (config && 'interimResults' in config) ? config.interimResults : true;
    this.recognition.continuous = isContinuous ?? true;
    this.recognition.interimResults = isInterim ?? true;
    this.language = config?.language || this.language;
    this.recognition.lang = this.language;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.notifyState('listening');
    };

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (final.trim()) {
        this.notifyTranscript({
          text: final.trim(),
          isFinal: true,
          confidence: event.results[0]?.[0]?.confidence ?? 1.0,
          interimText: interim.trim() || undefined,
        });
      } else if (interim.trim()) {
        this.notifyTranscript({
          text: interim.trim(),
          isFinal: false,
          confidence: 0.8,
          interimText: interim.trim(),
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      let reason: VoiceErrorReason = 'unknown';
      if (event.error === 'not-allowed') reason = 'microphone_denied';
      else if (event.error === 'network') reason = 'network_timeout';
      else if (event.error === 'no-speech') reason = 'speech_service_unavailable';
      else if (event.error === 'aborted') reason = 'aborted';

      this.notifyError(reason, `Speech recognition error: ${event.error}`);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.notifyState('idle');
    };

    try {
      this.recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifyError('speech_service_unavailable', `Failed to start recognition: ${msg}`);
    }
  }

  public async stopListening(): Promise<void> {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      this.notifyState('idle');
    }
  }

  public abort(): void {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
      this.isListening = false;
      this.notifyState('idle');
    }
  }

  public cleanup(): void {
    this.abort();
    this.transcriptListeners = [];
    this.errorListeners = [];
    this.stateListeners = [];
    this.interruptionListeners = [];
  }

  public onTranscript(callback: (transcript: VoiceTranscript) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: VoiceState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  public onInterruption(callback: () => void): () => void {
    this.interruptionListeners.push(callback);
    return () => {
      this.interruptionListeners = this.interruptionListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyTranscript(transcript: VoiceTranscript): void {
    for (const cb of this.transcriptListeners) {
      cb(transcript);
    }
  }

  private notifyError(reason: VoiceErrorReason, message: string): void {
    this.notifyState('error');
    for (const cb of this.errorListeners) {
      cb(reason, message);
    }
  }

  private notifyState(state: VoiceState): void {
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }
}

// ============================================================================
// Web Speech Synthesis Adapter (Browser / WebView / Tauri)
// ============================================================================

export class WebSpeechSynthesisAdapter implements VoiceProvider {
  public readonly providerName = 'web_speech_synthesis';
  private activeUtterance: any = null;
  private speed = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private selectedVoiceId?: string;
  private profile: VoiceProfile = { ...DEFAULT_NATURAL_FEMALE_PROFILE };

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public getVoiceProfile(): VoiceProfile {
    return { ...this.profile, rate: this.speed, pitch: this.pitch, volume: this.volume };
  }

  public setVoiceProfile(profile: Partial<VoiceProfile>): void {
    this.profile = { ...this.profile, ...profile };
    if (profile.rate !== undefined) this.speed = profile.rate;
    if (profile.pitch !== undefined) this.pitch = profile.pitch;
    if (profile.volume !== undefined) this.volume = profile.volume;
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    if (!this.isAvailable()) return [];
    const voices = window.speechSynthesis.getVoices();
    return voices.map((v) => ({
      id: v.voiceURI || v.name,
      name: v.name,
      lang: v.lang,
      gender: v.name.toLowerCase().includes('female') ? 'female' : 'male',
      isNatural: v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online'),
      isDefault: v.default,
    }));
  }

  public getSelectedVoice(): VoiceOption | undefined {
    if (this.selectedVoiceId) {
      return {
        id: this.selectedVoiceId,
        name: this.selectedVoiceId,
        lang: 'en-US',
        gender: 'female',
        isNatural: true,
        isDefault: false,
      };
    }
    return undefined;
  }

  public setVoice(voiceId: string): void {
    this.selectedVoiceId = voiceId;
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  public setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  public setVolume(volume: number): void {
    this.volume = volume;
  }

  public async speak(text: string, options?: TextToSpeechOptions | Partial<VoiceSessionConfig>): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    this.stop();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const rate = ('rate' in (options || {})) ? (options as TextToSpeechOptions).rate : (options as Partial<VoiceSessionConfig>)?.voiceRate;
      const pitch = ('pitch' in (options || {})) ? (options as TextToSpeechOptions).pitch : (options as Partial<VoiceSessionConfig>)?.voicePitch;
      const volume = ('volume' in (options || {})) ? (options as TextToSpeechOptions).volume : (options as Partial<VoiceSessionConfig>)?.voiceVolume;

      utterance.rate = rate ?? this.speed;
      utterance.pitch = pitch ?? this.pitch;
      utterance.volume = volume ?? this.volume;
      utterance.lang = options?.language ?? 'en-US';

      const targetVoiceId = ('voiceId' in (options || {}))
        ? (options as TextToSpeechOptions)?.voiceId
        : this.selectedVoiceId;

      if (targetVoiceId && typeof window !== 'undefined') {
        const voices = window.speechSynthesis.getVoices();
        const found = voices.find((v) => v.voiceURI === targetVoiceId || v.name === targetVoiceId);
        if (found) utterance.voice = found;
      }

      utterance.onend = () => {
        this.activeUtterance = null;
        resolve();
      };

      utterance.onerror = (err) => {
        this.activeUtterance = null;
        reject(new Error(`Speech synthesis failed: ${err.error}`));
      };

      this.activeUtterance = utterance;
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
    return this.isAvailable() && (window.speechSynthesis.speaking || this.activeUtterance !== null);
  }

  public cleanup(): void {
    this.stop();
  }
}

// ============================================================================
// Mock Speech Recognition Adapter (Deterministic Headless Testing)
// ============================================================================

export class MockSpeechRecognitionAdapter implements SpeechRecognitionProvider {
  public readonly providerName = 'mock_speech_recognition';
  private active = false;
  private language = 'en-US';
  private transcriptListeners: Array<(transcript: VoiceTranscript) => void> = [];
  private errorListeners: Array<(reason: VoiceErrorReason, message: string) => void> = [];
  private stateListeners: Array<(state: VoiceState) => void> = [];
  private interruptionListeners: Array<() => void> = [];

  public isAvailable(): boolean {
    return true;
  }

  public setLanguage(lang: string): void {
    this.language = lang;
  }

  public getLanguage(): string {
    return this.language;
  }

  public async startListening(config?: Partial<VoiceSessionConfig> | SpeechRecognitionConfig): Promise<void> {
    this.active = true;
    if (config?.language) {
      this.language = config.language;
    }
    this.notifyState('listening');
  }

  public async stopListening(): Promise<void> {
    this.active = false;
    this.notifyState('idle');
  }

  public abort(): void {
    this.active = false;
    this.notifyState('idle');
  }

  public cleanup(): void {
    this.active = false;
    this.transcriptListeners = [];
    this.errorListeners = [];
    this.stateListeners = [];
    this.interruptionListeners = [];
  }

  public isActive(): boolean {
    return this.active;
  }

  public simulateTranscript(text: string, isFinal = true, confidence = 0.95): void {
    const transcript: VoiceTranscript = {
      text,
      isFinal,
      confidence,
      interimText: isFinal ? undefined : text,
    };
    for (const cb of this.transcriptListeners) {
      cb(transcript);
    }
  }

  public simulateInterim(interimText: string): void {
    const transcript: VoiceTranscript = {
      text: interimText,
      isFinal: false,
      confidence: 0.85,
      interimText,
    };
    for (const cb of this.transcriptListeners) {
      cb(transcript);
    }
  }

  public simulateError(reason: VoiceErrorReason, message: string): void {
    this.notifyState('error');
    for (const cb of this.errorListeners) {
      cb(reason, message);
    }
  }

  public simulateInterruption(): void {
    for (const cb of this.interruptionListeners) {
      cb();
    }
  }

  public onTranscript(callback: (transcript: VoiceTranscript) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (reason: VoiceErrorReason, message: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: VoiceState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  public onInterruption(callback: () => void): () => void {
    this.interruptionListeners.push(callback);
    return () => {
      this.interruptionListeners = this.interruptionListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyState(state: VoiceState): void {
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }
}

// ============================================================================
// Mock Speech Synthesis Adapter (Deterministic Headless Testing)
// ============================================================================

export class MockSpeechSynthesisAdapter implements VoiceProvider {
  public readonly providerName = 'mock_speech_synthesis';
  public spokenUtterances: string[] = [];
  public interrupted = false;
  private speaking = false;
  private resolveSpeak?: () => void;
  private speed = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private profile: VoiceProfile = { ...DEFAULT_NATURAL_FEMALE_PROFILE };

  public isAvailable(): boolean {
    return true;
  }

  public getVoiceProfile(): VoiceProfile {
    return { ...this.profile, rate: this.speed, pitch: this.pitch, volume: this.volume };
  }

  public setVoiceProfile(profile: Partial<VoiceProfile>): void {
    this.profile = { ...this.profile, ...profile };
    if (profile.rate !== undefined) this.speed = profile.rate;
    if (profile.pitch !== undefined) this.pitch = profile.pitch;
    if (profile.volume !== undefined) this.volume = profile.volume;
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    return [
      {
        id: 'mock_natural_jenny',
        name: 'Microsoft Jenny (Natural) - English (United States)',
        lang: 'en-US',
        gender: 'female',
        isNatural: true,
        isDefault: true,
      },
    ];
  }

  public getSelectedVoice(): VoiceOption | undefined {
    return {
      id: 'mock_natural_jenny',
      name: 'Microsoft Jenny (Natural) - English (United States)',
      lang: 'en-US',
      gender: 'female',
      isNatural: true,
      isDefault: true,
    };
  }

  public setVoice(_voiceId: string): void {}

  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  public setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  public setVolume(volume: number): void {
    this.volume = volume;
  }

  public async speak(text: string, _options?: TextToSpeechOptions | Partial<VoiceSessionConfig>): Promise<void> {
    this.interrupted = false;
    this.speaking = true;
    this.spokenUtterances.push(text);

    return new Promise((resolve) => {
      this.resolveSpeak = () => {
        this.speaking = false;
        resolve();
      };
      setTimeout(() => {
        if (this.speaking) {
          this.speaking = false;
          resolve();
        }
      }, 10);
    });
  }

  public stop(): void {
    if (this.speaking) {
      this.interrupted = true;
      this.speaking = false;
      if (this.resolveSpeak) {
        this.resolveSpeak();
      }
    }
  }

  public pause(): void {
    this.speaking = false;
  }

  public resume(): void {
    this.speaking = true;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public cleanup(): void {
    this.stop();
    this.spokenUtterances = [];
  }
}
