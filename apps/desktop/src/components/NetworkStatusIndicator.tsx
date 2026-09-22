'use client';

import React from 'react';
import { WifiOff, RefreshCw, AlertTriangle, Globe } from 'lucide-react';
import type { NetworkReadinessState, StartupHealthCheckResult } from '@alina/shared';

export interface NetworkStatusIndicatorProps {
  state?: NetworkReadinessState;
  health?: StartupHealthCheckResult;
  onOpenWifiModal?: () => void;
  onConnectClick?: () => void;
  onRetryClick?: () => void;
  className?: string;
}

export function NetworkStatusIndicator({
  state: propState,
  health,
  onOpenWifiModal,
  onConnectClick,
  onRetryClick,
  className = '',
}: NetworkStatusIndicatorProps) {
  const state = propState || health?.state || 'OFFLINE';
  const handleOpenWifi = onConnectClick || onOpenWifiModal;

  const renderContent = () => {
    switch (state) {
      case 'ONLINE':
        return (
          <button
            type="button"
            onClick={handleOpenWifi}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[11px] font-mono transition-all hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
            title={`Online via ${health?.activeInterface || 'Interface'} (${health?.latencyMs ? `${health.latencyMs}ms` : 'reachable'})`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <Globe className="w-3 h-3" />
            <span className="font-medium">Online</span>
            {health?.latencyMs !== null && health?.latencyMs !== undefined && (
              <span className="text-[10px] opacity-75">{health.latencyMs}ms</span>
            )}
          </button>
        );

      case 'CONNECTING':
        return (
          <button
            type="button"
            onClick={onRetryClick}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 text-[11px] font-mono"
            title="Testing network connection... Click to retry"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
            <span>Connecting...</span>
          </button>
        );

      case 'DEGRADED':
        return (
          <button
            type="button"
            onClick={handleOpenWifi}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 text-[11px] font-mono hover:bg-amber-100 dark:hover:bg-amber-900/50"
            title="Local network connected, but internet reachability is limited."
          >
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="font-medium">Limited Access</span>
          </button>
        );

      case 'OFFLINE':
      default:
        return (
          <button
            type="button"
            onClick={handleOpenWifi}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200/80 dark:border-stone-700 text-[11px] font-mono hover:border-amber-500 transition-colors"
            title="You're offline. Local features are still available. Click to configure Wi-Fi."
          >
            <WifiOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span className="font-medium">Offline • Local Ready</span>
          </button>
        );
    }
  };

  return <div className={`inline-flex items-center ${className}`}>{renderContent()}</div>;
}
