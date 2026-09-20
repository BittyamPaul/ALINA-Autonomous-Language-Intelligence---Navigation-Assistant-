'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Sparkles, ArrowRight, CornerDownLeft } from 'lucide-react';

interface SpotlightBarProps {
  onSubmitGoal: (goal: string) => void;
  isExecuting: boolean;
}

export function SpotlightBar({ onSubmitGoal, isExecuting }: SpotlightBarProps) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
      e.preventDefault();
      if (!isExecuting) {
        onSubmitGoal(input.trim());
        setInput('');
      }
    }
  };

  const handleQuickExample = (text: string) => {
    if (!isExecuting) {
      onSubmitGoal(text);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="relative flex items-center bg-stone-900/90 border border-stone-800 rounded-xl p-2.5 shadow-xl transition-all focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20">
        <div className="p-2 text-amber-500/90">
          <Sparkles className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          placeholder={
            isExecuting
              ? 'ALINA is actively executing workflow...'
              : 'Ask ALINA a goal (e.g., "Inspect workspace and check system architecture")...'
          }
          className="w-full bg-transparent text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none px-2 font-sans disabled:opacity-60"
        />
        <div className="flex items-center space-x-2 shrink-0 pr-1">
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-stone-400 bg-stone-800/80 border border-stone-700/60 rounded">
            <CornerDownLeft className="w-3 h-3 mr-1" />
            Enter
          </kbd>
          <button
            onClick={() => {
              if (input.trim() && !isExecuting) {
                onSubmitGoal(input.trim());
                setInput('');
              }
            }}
            disabled={!input.trim() || isExecuting}
            className="p-2 text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:hover:bg-amber-500 rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      {!isExecuting && (
        <div className="flex items-center space-x-2 overflow-x-auto text-xs text-stone-400 pt-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-stone-600">
            Suggested:
          </span>
          <button
            onClick={() => handleQuickExample('Inspect workspace files and system resources')}
            className="px-2.5 py-1 rounded-md bg-stone-900/60 border border-stone-800/80 hover:border-amber-700/40 text-stone-300 transition-colors whitespace-nowrap"
          >
            🔍 Inspect workspace
          </button>
          <button
            onClick={() => handleQuickExample('Generate project summary documentation file')}
            className="px-2.5 py-1 rounded-md bg-stone-900/60 border border-stone-800/80 hover:border-amber-700/40 text-stone-300 transition-colors whitespace-nowrap"
          >
            ✍️ Generate project summary
          </button>
          <button
            onClick={() => handleQuickExample('Search semantic memory for project preferences')}
            className="px-2.5 py-1 rounded-md bg-stone-900/60 border border-stone-800/80 hover:border-amber-700/40 text-stone-300 transition-colors whitespace-nowrap"
          >
            🧠 Search memory
          </button>
        </div>
      )}
    </div>
  );
}
