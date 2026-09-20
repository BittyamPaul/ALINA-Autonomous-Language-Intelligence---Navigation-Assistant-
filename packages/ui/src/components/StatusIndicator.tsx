import type { HTMLAttributes } from 'react';
import { cn } from '../utils';

export type StatusType =
  | 'idle'
  | 'active'
  | 'verifying'
  | 'awaiting_approval'
  | 'error'
  | 'offline'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted';

export interface StatusIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  label?: string;
  showPulse?: boolean;
}

export function StatusIndicator({
  status,
  label,
  showPulse = true,
  className,
  ...props
}: StatusIndicatorProps) {
  const configs: Record<StatusType, { dot: string; text: string; defaultLabel: string }> = {
    idle: {
      dot: 'bg-emerald-500/80',
      text: 'text-stone-600 dark:text-stone-400',
      defaultLabel: 'Ready',
    },
    active: {
      dot: 'bg-amber-500',
      text: 'text-amber-800 dark:text-amber-300 font-medium',
      defaultLabel: 'Active',
    },
    verifying: {
      dot: 'bg-sky-500',
      text: 'text-sky-800 dark:text-sky-300 font-medium',
      defaultLabel: 'Verifying',
    },
    awaiting_approval: {
      dot: 'bg-amber-600',
      text: 'text-amber-900 dark:text-amber-200 font-medium',
      defaultLabel: 'Approval Required',
    },
    error: {
      dot: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-300 font-medium',
      defaultLabel: 'Error',
    },
    offline: {
      dot: 'bg-stone-400 dark:bg-stone-600',
      text: 'text-stone-500 dark:text-stone-500',
      defaultLabel: 'Offline',
    },
    listening: {
      dot: 'bg-amber-500 animate-pulse',
      text: 'text-amber-800 dark:text-amber-300 font-medium',
      defaultLabel: 'Listening...',
    },
    processing: {
      dot: 'bg-sky-500 animate-pulse',
      text: 'text-sky-800 dark:text-sky-300 font-medium',
      defaultLabel: 'Processing...',
    },
    speaking: {
      dot: 'bg-emerald-500',
      text: 'text-emerald-800 dark:text-emerald-300 font-medium',
      defaultLabel: 'Speaking...',
    },
    interrupted: {
      dot: 'bg-stone-500',
      text: 'text-stone-700 dark:text-stone-300 font-medium',
      defaultLabel: 'Interrupted',
    },
  };

  const config = configs[status] || configs.idle;
  const displayLabel = label ?? config.defaultLabel;

  const shouldPulse =
    showPulse &&
    (status === 'active' ||
      status === 'verifying' ||
      status === 'listening' ||
      status === 'processing');

  return (
    <div
      className={cn(
        'inline-flex items-center space-x-2 text-xs font-mono select-none transition-colors duration-150',
        config.text,
        className
      )}
      {...props}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        {shouldPulse && (
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              config.dot.replace(' animate-pulse', '')
            )}
          />
        )}
        <span className={cn('relative inline-flex rounded-full h-2 w-2', config.dot)} />
      </span>

      {/* Subtle audio indicator bars when ALINA is speaking */}
      {status === 'speaking' && (
        <span className="inline-flex items-center space-x-0.5 h-2.5">
          <span className="w-0.5 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="w-0.5 h-3 bg-emerald-500 rounded-full animate-pulse delay-75" />
          <span className="w-0.5 h-1.5 bg-emerald-500 rounded-full animate-pulse delay-150" />
        </span>
      )}

      {displayLabel && <span>{displayLabel}</span>}
    </div>
  );
}
