'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  X,
  Sliders,
  Shield,
  Database,
  Cpu,
  Sun,
  Moon,
  FolderLock,
  CheckCircle2,
  Mic,
  Volume2,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from './Button';

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  // Voice & Persona Settings Props
  voiceEnabled?: boolean;
  onVoiceEnabledChange?: (enabled: boolean) => void;
  wakeWordEnabled?: boolean;
  onWakeWordEnabledChange?: (enabled: boolean) => void;
  voiceSpeed?: number;
  onVoiceSpeedChange?: (speed: number) => void;
  voiceVolume?: number;
  onVoiceVolumeChange?: (volume: number) => void;
  selectedVoiceId?: string;
  onSelectedVoiceIdChange?: (voiceId: string) => void;
  availableVoices?: Array<{ id: string; name: string; lang: string; gender?: string }>;
  transcriptDebugMode?: boolean;
  onTranscriptDebugModeChange?: (enabled: boolean) => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  theme = 'light',
  onThemeChange,
  voiceEnabled = true,
  onVoiceEnabledChange,
  wakeWordEnabled = false,
  onWakeWordEnabledChange,
  voiceSpeed = 1.0,
  onVoiceSpeedChange,
  voiceVolume = 1.0,
  onVoiceVolumeChange,
  selectedVoiceId,
  onSelectedVoiceIdChange,
  availableVoices = [],
  transcriptDebugMode = false,
  onTranscriptDebugModeChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [approvalAlwaysRequired, setApprovalAlwaysRequired] = useState(true);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [surrealDbPath, setSurrealDbPath] = useState('surrealkv://~/.alina/data');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[94vw] sm:w-[90vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] rounded-xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-800 z-50 focus:outline-none overflow-hidden flex flex-col animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300">
                <Sliders className="w-4 h-4" />
              </div>
              <Dialog.Title className="text-base font-semibold text-stone-900 dark:text-stone-100 font-sans">
                Preferences & System Configuration
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs Container */}
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar Tabs List */}
            <Tabs.List className="w-full md:w-48 bg-stone-50 dark:bg-stone-950/60 border-b md:border-b-0 md:border-r border-stone-100 dark:border-stone-800 p-2 space-y-1 shrink-0">
              <Tabs.Trigger
                value="general"
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-800 data-[state=active]:text-stone-900 dark:data-[state=active]:text-stone-100 data-[state=active]:shadow-xs transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>General</span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="voice"
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-800 data-[state=active]:text-stone-900 dark:data-[state=active]:text-stone-100 data-[state=active]:shadow-xs transition-colors"
              >
                <Mic className="w-3.5 h-3.5 text-amber-600" />
                <span>Voice & Persona</span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="security"
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-800 data-[state=active]:text-stone-900 dark:data-[state=active]:text-stone-100 data-[state=active]:shadow-xs transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Security & PathJail</span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="memory"
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-800 data-[state=active]:text-stone-900 dark:data-[state=active]:text-stone-100 data-[state=active]:shadow-xs transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Memory & Graph</span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="engine"
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60 data-[state=active]:bg-white dark:data-[state=active]:bg-stone-800 data-[state=active]:text-stone-900 dark:data-[state=active]:text-stone-100 data-[state=active]:shadow-xs transition-colors"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Local Engine</span>
              </Tabs.Trigger>
            </Tabs.List>

            {/* Tab Contents */}
            <div className="flex-1 p-5 sm:p-6 overflow-y-auto max-h-[500px]">
              {/* General Tab */}
              <Tabs.Content value="general" className="space-y-5 focus:outline-none">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Interface Theme</h4>
                  <p className="text-xs text-stone-500 font-sans mt-0.5">
                    ALINA defaults to warm stone light mode, with an editorial dark charcoal mode.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => onThemeChange?.('light')}
                      className={`flex items-center justify-center space-x-2 p-3 rounded-lg border text-xs font-medium transition-all ${
                        theme === 'light'
                          ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-stone-900'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-300'
                      }`}
                    >
                      <Sun className="w-4 h-4 text-amber-600" />
                      <span>Warm Light (Primary)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onThemeChange?.('dark')}
                      className={`flex items-center justify-center space-x-2 p-3 rounded-lg border text-xs font-medium transition-all ${
                        theme === 'dark'
                          ? 'border-amber-500 bg-amber-950/20 text-stone-100'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-300'
                      }`}
                    >
                      <Moon className="w-4 h-4 text-amber-400" />
                      <span>Charcoal Dark</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-stone-100 dark:border-stone-800">
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Zero-Telemetry Policy</h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    All logs, memory entries, and tool calls are stored strictly locally on this computer.
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-stone-700 dark:text-stone-300">Share anonymous diagnostic crash reports</span>
                    <button
                      type="button"
                      onClick={() => setTelemetryEnabled(!telemetryEnabled)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                        telemetryEnabled ? 'bg-amber-600' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          telemetryEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Tabs.Content>

              {/* Voice & Persona Tab */}
              <Tabs.Content value="voice" className="space-y-5 focus:outline-none">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center">
                        <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
                        Alina Natural Female Voice
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Calm, warm, intelligent, and subtle conversational voice.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onVoiceEnabledChange?.(!voiceEnabled)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ${
                        voiceEnabled ? 'bg-amber-600' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          voiceEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Voice Selector */}
                  <div className="mt-4">
                    <label className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">
                      Selected Neural Voice
                    </label>
                    <select
                      value={selectedVoiceId || ''}
                      onChange={(e) => onSelectedVoiceIdChange?.(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-sans text-stone-800 dark:text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      {availableVoices.length > 0 ? (
                        availableVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.lang}){v.gender ? ` • ${v.gender}` : ''}
                          </option>
                        ))
                      ) : (
                        <option value="">Default Natural Female Voice (Jenny / Aria / Samantha)</option>
                      )}
                    </select>
                  </div>

                  {/* Speed and Volume */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs text-stone-600 dark:text-stone-400">
                        <span>Speaking Speed</span>
                        <span className="font-mono">{voiceSpeed.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.7"
                        max="1.4"
                        step="0.1"
                        value={voiceSpeed}
                        onChange={(e) => onVoiceSpeedChange?.(parseFloat(e.target.value))}
                        className="w-full mt-1.5 accent-amber-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-stone-600 dark:text-stone-400">
                        <span>Voice Volume</span>
                        <span className="font-mono">{Math.round(voiceVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={voiceVolume}
                        onChange={(e) => onVoiceVolumeChange?.(parseFloat(e.target.value))}
                        className="w-full mt-1.5 accent-amber-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Wake-Word ("Hey Alina") Section */}
                <div className="pt-4 border-t border-stone-100 dark:border-stone-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center">
                        <Volume2 className="w-4 h-4 mr-1.5 text-amber-600" />
                        "Hey Alina" Wake-Word Activation
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Detects activation locally on-device. Audio is never continuously streamed to cloud services.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onWakeWordEnabledChange?.(!wakeWordEnabled)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ml-4 ${
                        wakeWordEnabled ? 'bg-amber-600' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          wakeWordEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Transcript Quality Debug Mode */}
                <div className="pt-4 border-t border-stone-100 dark:border-stone-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center">
                        <Terminal className="w-4 h-4 mr-1.5 text-stone-500" />
                        Transcript Quality & Debug Mode
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Captures RAW, FINAL, and NORMALIZED phonetic transcripts internally for quality verification.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTranscriptDebugModeChange?.(!transcriptDebugMode)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ml-4 ${
                        transcriptDebugMode ? 'bg-amber-600' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          transcriptDebugMode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Tabs.Content>

              {/* Security Tab */}
              <Tabs.Content value="security" className="space-y-5 focus:outline-none">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center">
                    <FolderLock className="w-4 h-4 mr-1.5 text-amber-600" />
                    PathJail Filesystem Sandbox
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    ALINA is physically locked to registered project folders. Writing outside is rejected.
                  </p>
                  <div className="mt-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300 flex items-center justify-between">
                    <span className="truncate">C:\Users\bitty\Desktop\ALINA</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">
                      Active Root
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-stone-100 dark:border-stone-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                        Always Require Approval for High-Risk Actions
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Never bypass human approval for mutating shell commands, file deletions, or package changes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setApprovalAlwaysRequired(!approvalAlwaysRequired)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 ml-4 ${
                        approvalAlwaysRequired ? 'bg-amber-600' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          approvalAlwaysRequired ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Tabs.Content>

              {/* Memory Tab */}
              <Tabs.Content value="memory" className="space-y-5 focus:outline-none">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-500" />
                    Embedded SurrealDB Storage Engine
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Local multi-model database engine holding graph relationships and vector embeddings.
                  </p>
                  <div className="mt-3">
                    <label className="text-[11px] font-mono text-stone-500">Storage URI</label>
                    <input
                      type="text"
                      value={surrealDbPath}
                      onChange={(e) => setSurrealDbPath(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-800 dark:text-stone-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </Tabs.Content>

              {/* Engine Tab */}
              <Tabs.Content value="engine" className="space-y-5 focus:outline-none">
                <div>
                  <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Tauri 2 Rust Core Bridge</h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Native desktop execution runtime with zero Node.js daemon overhead in production.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                      <div className="text-stone-400 text-[10px]">TAURI VERSION</div>
                      <div className="font-semibold text-stone-800 dark:text-stone-200 mt-0.5">2.2.0-stable</div>
                    </div>
                    <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                      <div className="text-stone-400 text-[10px]">RUST TOOLCHAIN</div>
                      <div className="font-semibold text-stone-800 dark:text-stone-200 mt-0.5">1.84+ (MSVC)</div>
                    </div>
                  </div>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* Footer */}
          <div className="px-6 py-3 bg-stone-50 dark:bg-stone-950 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end space-x-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
