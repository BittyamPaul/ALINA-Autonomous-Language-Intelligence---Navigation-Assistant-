import {
  VoiceOption,
  VoiceProfile,
  TextToSpeechOptions,
} from '@alina/shared';
import { VoiceProvider } from './types';

/**
 * Preferred natural female voice priority identifiers across modern platforms:
 * Windows / Edge Natural voices, Google Chrome Natural voices, Apple macOS/iOS Enhanced voices.
 */
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

/**
 * Default Natural Female Voice Persona Profile
 * Emphasizes warm, calm, intelligent, natural, conversational, professional acoustic characteristics.
 */
export const DEFAULT_NATURAL_FEMALE_PROFILE: VoiceProfile = {
  name: 'Alina Natural Female',
  gender: 'female',
  tone: 'warm',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  preferredVoices: PREFERRED_NATURAL_FEMALE_VOICES,
  description: 'Warm, calm, intelligent, natural, conversational, professional female voice persona (non-robotic)',
};

/**
 * WebNeuralSpeechProvider
 * 
 * Production VoiceProvider utilizing high-fidelity neural/natural female voices
 * available in browser, WebView, and Tauri desktop environments.
 */
export class WebNeuralSpeechProvider implements VoiceProvider {
  public readonly providerName = 'web_neural_speech';
  private selectedVoiceId?: string;
  private speed = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private profile: VoiceProfile = { ...DEFAULT_NATURAL_FEMALE_PROFILE };
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private cachedVoices: VoiceOption[] = [];

  constructor(defaultVoiceId?: string, profile?: Partial<VoiceProfile>) {
    this.selectedVoiceId = defaultVoiceId;
    if (profile) {
      this.profile = { ...DEFAULT_NATURAL_FEMALE_PROFILE, ...profile };
      this.speed = this.profile.rate;
      this.pitch = this.profile.pitch;
      this.volume = this.profile.volume;
    }
  }

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public getVoiceProfile(): VoiceProfile {
    return {
      ...this.profile,
      rate: this.speed,
      pitch: this.pitch,
      volume: this.volume,
    };
  }

  public setVoiceProfile(profile: Partial<VoiceProfile>): void {
    this.profile = { ...this.profile, ...profile };
    if (profile.rate !== undefined) this.setSpeed(profile.rate);
    if (profile.pitch !== undefined) this.setPitch(profile.pitch);
    if (profile.volume !== undefined) this.setVolume(profile.volume);
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    if (!this.isAvailable()) {
      return [];
    }

    if (this.cachedVoices.length > 0) {
      return [...this.cachedVoices];
    }

    return new Promise((resolve) => {
      const fetchAndMap = () => {
        const rawVoices = window.speechSynthesis.getVoices();
        if (rawVoices.length === 0) {
          return [];
        }

        const mapped: VoiceOption[] = rawVoices.map((v) => {
          const lowerName = v.name.toLowerCase();
          const isFemale =
            lowerName.includes('female') ||
            lowerName.includes('jenny') ||
            lowerName.includes('aria') ||
            lowerName.includes('zira') ||
            lowerName.includes('samantha') ||
            lowerName.includes('karen') ||
            lowerName.includes('victoria') ||
            lowerName.includes('fiona') ||
            lowerName.includes('tessa') ||
            lowerName.includes('woman');

          const isNatural =
            lowerName.includes('natural') ||
            lowerName.includes('enhanced') ||
            lowerName.includes('neural') ||
            lowerName.includes('premium') ||
            lowerName.includes('online');

          return {
            id: v.voiceURI || v.name,
            name: v.name,
            lang: v.lang,
            gender: isFemale ? 'female' : 'male',
            isNatural,
            isDefault: v.default,
          };
        });

        this.cachedVoices = mapped;
        return mapped;
      };

      const initial = fetchAndMap();
      if (initial.length > 0) {
        resolve(initial);
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          resolve(fetchAndMap());
        };
        setTimeout(() => resolve(fetchAndMap()), 300);
      }
    });
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

  public getBestNaturalFemaleVoice(voices?: VoiceOption[]): VoiceOption | undefined {
    const pool = voices || this.cachedVoices;
    if (pool.length === 0) return undefined;

    const prefs = this.profile.preferredVoices.length > 0
      ? this.profile.preferredVoices
      : PREFERRED_NATURAL_FEMALE_VOICES;

    // 1. Try explicit preferred names
    for (const pref of prefs) {
      const match = pool.find(
        (v) => v.name.toLowerCase().includes(pref) || v.id.toLowerCase().includes(pref)
      );
      if (match) return match;
    }

    // 2. Try any neural female voice
    const neuralFemale = pool.find((v) => v.isNatural && v.gender === 'female');
    if (neuralFemale) return neuralFemale;

    // 3. Try any female voice
    const anyFemale = pool.find((v) => v.gender === 'female');
    if (anyFemale) return anyFemale;

    return pool[0];
  }

  public getSelectedVoice(): VoiceOption | undefined {
    if (!this.selectedVoiceId) {
      return this.getBestNaturalFemaleVoice();
    }
    return this.cachedVoices.find((v) => v.id === this.selectedVoiceId);
  }

  public async speak(text: string, options?: TextToSpeechOptions): Promise<void> {
    if (!this.isAvailable() || !text.trim()) {
      return;
    }

    this.stop();

    await this.getAvailableVoices();
    const rawVoices = window.speechSynthesis.getVoices();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? this.speed;
      utterance.pitch = options?.pitch ?? this.pitch;
      utterance.volume = options?.volume ?? this.volume;
      utterance.lang = options?.language ?? 'en-US';

      let chosenRawVoice: SpeechSynthesisVoice | undefined;

      const targetId = options?.voiceId ?? this.selectedVoiceId;
      if (targetId) {
        chosenRawVoice = rawVoices.find((v) => v.voiceURI === targetId || v.name === targetId);
      }

      if (!chosenRawVoice) {
        const prefs = this.profile.preferredVoices.length > 0
          ? this.profile.preferredVoices
          : PREFERRED_NATURAL_FEMALE_VOICES;

        for (const pref of prefs) {
          chosenRawVoice = rawVoices.find((v) => v.name.toLowerCase().includes(pref));
          if (chosenRawVoice) break;
        }
      }

      if (!chosenRawVoice) {
        chosenRawVoice = rawVoices.find((v) => {
          const lower = v.name.toLowerCase();
          return lower.includes('female') || lower.includes('woman');
        });
      }

      if (chosenRawVoice) {
        utterance.voice = chosenRawVoice;
      }

      utterance.onend = () => {
        this.activeUtterance = null;
        resolve();
      };

      utterance.onerror = (err) => {
        this.activeUtterance = null;
        if (err.error === 'interrupted' || err.error === 'canceled') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis failed: ${err.error}`));
        }
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
    this.cachedVoices = [];
  }
}

/**
 * MockTextToSpeechProvider / MockVoiceProvider
 * 
 * Deterministic in-memory implementation of VoiceProvider for unit tests and headless environments.
 */
export class MockTextToSpeechProvider implements VoiceProvider {
  public readonly providerName = 'mock_voice_provider';
  private speaking = false;
  private selectedVoiceId?: string;
  private speed = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private profile: VoiceProfile = { ...DEFAULT_NATURAL_FEMALE_PROFILE };
  public spokenHistory: string[] = [];
  public interrupted = false;
  private resolveSpeak?: () => void;

  public isAvailable(): boolean {
    return true;
  }

  public getVoiceProfile(): VoiceProfile {
    return {
      ...this.profile,
      rate: this.speed,
      pitch: this.pitch,
      volume: this.volume,
    };
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
      {
        id: 'mock_natural_aria',
        name: 'Microsoft Aria (Natural) - English (United States)',
        lang: 'en-US',
        gender: 'female',
        isNatural: true,
        isDefault: false,
      },
      {
        id: 'mock_system_david',
        name: 'Microsoft David - English (United States)',
        lang: 'en-US',
        gender: 'male',
        isNatural: false,
        isDefault: false,
      },
    ];
  }

  public setVoice(voiceId: string): void {
    this.selectedVoiceId = voiceId;
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  public getSpeed(): number {
    return this.speed;
  }

  public setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public setVolume(volume: number): void {
    this.volume = volume;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getSelectedVoice(): VoiceOption | undefined {
    return {
      id: this.selectedVoiceId || 'mock_natural_jenny',
      name: 'Microsoft Jenny (Natural) - English (United States)',
      lang: 'en-US',
      gender: 'female',
      isNatural: true,
      isDefault: true,
    };
  }

  public async speak(text: string, options?: TextToSpeechOptions): Promise<void> {
    this.interrupted = false;
    this.speaking = true;
    this.spokenHistory.push(text);

    if (options?.rate !== undefined) this.speed = options.rate;
    if (options?.pitch !== undefined) this.pitch = options.pitch;
    if (options?.volume !== undefined) this.volume = options.volume;
    if (options?.voiceId !== undefined) this.selectedVoiceId = options.voiceId;

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
      }, 20);
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
    this.spokenHistory = [];
  }
}

export const MockVoiceProvider = MockTextToSpeechProvider;
export type MockVoiceProvider = MockTextToSpeechProvider;
