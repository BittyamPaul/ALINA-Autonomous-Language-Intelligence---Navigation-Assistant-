'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import {
  ArrowUp,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Layers,
  FolderGit2,
  Mic,
  Square,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../utils';

export interface ChatComposerProps {
  placeholder?: string;
  onSubmit: (goal: string, mode: 'verify_and_execute' | 'ask_always') => void;
  disabled?: boolean;
  activeWorkspace?: string;
  quickPrompts?: string[];
  className?: string;
  // Voice interaction props
  voiceState?: 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'error';
  onStartVoice?: () => void;
  onStopVoice?: () => void;
  onInterruptVoice?: () => void;
  interimTranscript?: string;
  voiceErrorMessage?: string;
  onClearVoiceError?: () => void;
}

export function ChatComposer({
  placeholder = 'Describe an objective or task to plan and execute...',
  onSubmit,
  disabled = false,
  activeWorkspace = 'ALINA (Active Workspace)',
  quickPrompts = [
    'Audit PathJail sandbox & tool execution permissions',
    'Verify monorepo build outputs and Vitest coverage',
    'Index local documentation into semantic vector memory',
  ],
  className,
  voiceState = 'idle',
  onStartVoice,
  onStopVoice,
  onInterruptVoice,
  interimTranscript,
  voiceErrorMessage,
  onClearVoiceError,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'verify_and_execute' | 'ask_always'>('verify_and_execute');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim(), mode);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className={cn('w-full space-y-3 font-sans', className)}>
      {/* Voice Error Fallback Alert Banner */}
      {voiceErrorMessage && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-800 dark:text-amber-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>{voiceErrorMessage}</span>
          </div>
          {onClearVoiceError && (
            <button
              type="button"
              onClick={onClearVoiceError}
              className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline font-sans ml-2"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Quick Prompts */}
      {quickPrompts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-stone-400 mr-1 flex items-center">
            <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
            Suggestions:
          </span>
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setValue(prompt)}
              className="text-xs px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-850 text-stone-700 dark:text-stone-300 border border-stone-200/70 dark:border-stone-750 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50/40 dark:hover:bg-amber-950/30 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div
        className={cn(
          'relative rounded-xl border bg-white dark:bg-stone-900 shadow-sm transition-all duration-200',
          voiceState === 'listening'
            ? 'border-amber-500 ring-2 ring-amber-500/20'
            : 'border-stone-200/80 dark:border-stone-800 focus-within:border-amber-500/80 focus-within:ring-2 focus-within:ring-amber-500/10'
        )}
      >
        {/* Context bar inside composer */}
        <div className="flex items-center justify-between px-3.5 pt-2.5 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <div className="flex items-center space-x-2">
            <span className="flex items-center text-stone-600 dark:text-stone-300">
              <FolderGit2 className="w-3 h-3 mr-1 text-amber-600" />
              {activeWorkspace}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              setMode(mode === 'verify_and_execute' ? 'ask_always' : 'verify_and_execute')
            }
            className={cn(
              'flex items-center space-x-1 px-2 py-0.5 rounded transition-colors text-[10px]',
              mode === 'verify_and_execute'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            )}
            title="Toggle safety execution mode"
          >
            <ShieldCheck className="w-3 h-3 mr-1" />
            {mode === 'verify_and_execute' ? 'Self-Healing & Verify' : 'Manual Approval'}
          </button>
        </div>

        {/* Live Streaming Voice Transcript Bar */}
        {voiceState === 'listening' && (
          <div className="mx-3.5 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs font-mono text-amber-800 dark:text-amber-200">
            <div className="flex items-center space-x-2 truncate">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="truncate">
                {interimTranscript || 'Listening... Speak your objective'}
              </span>
            </div>
            {onStopVoice && (
              <button
                type="button"
                onClick={onStopVoice}
                className="ml-2 text-[10px] text-amber-700 dark:text-amber-300 font-sans hover:underline flex-shrink-0"
              >
                Done
              </button>
            )}
          </div>
        )}

        {/* Text input area */}
        <div className="px-3.5 py-2">
          <textarea
            ref={textareaRef}
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Objective or task prompt"
            placeholder={
              voiceState === 'listening'
                ? 'Listening to microphone...'
                : placeholder
            }
            disabled={disabled || voiceState === 'listening'}
            className="w-full resize-none bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none leading-relaxed font-sans"
          />
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-stone-100 dark:border-stone-800/60">
          <div className="flex items-center space-x-1.5 text-stone-400">
            {/* Voice Control Button */}
            {voiceState === 'listening' ? (
              <button
                type="button"
                onClick={onStopVoice}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-mono animate-pulse transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
                title="Stop listening and execute"
                aria-label="Stop listening and execute"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Listening</span>
              </button>
            ) : voiceState === 'speaking' ? (
              <button
                type="button"
                onClick={onInterruptVoice}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-stone-700 dark:text-stone-300 text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
                title="Click to interrupt speech"
                aria-label="Interrupt speech playback"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>Interrupt</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartVoice}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-amber-600 dark:hover:text-amber-400 text-stone-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
                title="Voice objective (Microphone)"
                aria-label="Start microphone input"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
              title="Attach context file"
              aria-label="Attach context file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
              title="Select plan template"
              aria-label="Select plan template"
            >
              <Layers className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono text-stone-400 hidden sm:inline">
              ↵ to submit • ⇧↵ for newline
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={!value.trim() || disabled || voiceState === 'listening'}
              aria-label="Submit Goal"
              className={cn(
                'flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80',
                value.trim() && !disabled && voiceState !== 'listening'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-95'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
              )}
            >
              <span>Submit Goal</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
