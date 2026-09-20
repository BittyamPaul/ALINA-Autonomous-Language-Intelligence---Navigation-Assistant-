'use client';

import React from 'react';
import { ShieldCheck, HardDrive, Lock } from 'lucide-react';

interface SystemStatusBannerProps {
  dbConnected: boolean;
  activeSandboxRoot: string;
  isExecuting: boolean;
}

export function SystemStatusBanner({
  dbConnected,
  activeSandboxRoot,
  isExecuting,
}: SystemStatusBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-stone-900/60 border border-stone-800/80 rounded-lg text-[11px] font-mono text-stone-400">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isExecuting
                ? 'bg-amber-500 animate-pulse'
                : 'bg-emerald-500'
            }`}
          />
          <span className="text-stone-300">
            {isExecuting ? 'Agent Active' : 'Companion Ready'}
          </span>
        </div>

        <div className="hidden sm:flex items-center space-x-1.5 text-stone-400">
          <HardDrive className="w-3.5 h-3.5 text-stone-500" />
          <span>SurrealDB:</span>
          <span className={dbConnected ? 'text-emerald-400' : 'text-amber-400'}>
            {dbConnected ? 'Daemon Online' : 'Local In-Memory'}
          </span>
        </div>

        <div className="hidden md:flex items-center space-x-1.5 text-stone-400 truncate max-w-xs">
          <Lock className="w-3.5 h-3.5 text-stone-500" />
          <span className="truncate">Jail: {activeSandboxRoot}</span>
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 text-stone-400">
          <span className="text-stone-500">Native:</span>
          <span className="text-amber-400 font-medium">Tauri 2 IPC Ready</span>
        </div>
      </div>

      <div className="flex items-center space-x-1 text-emerald-400/90">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Local-First Sandbox Active</span>
      </div>
    </div>
  );
}
