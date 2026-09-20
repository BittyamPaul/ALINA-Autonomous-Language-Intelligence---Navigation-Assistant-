import type { ReactNode } from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';
import { cn } from '../utils';
import { Button } from './Button';

export interface ErrorBannerProps {
  title?: string;
  message: string;
  recoveryHint?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  action?: ReactNode;
}

export function ErrorBanner({
  title = 'Operation Encountered an Error',
  message,
  recoveryHint,
  onRetry,
  onDismiss,
  className,
  action,
}: ErrorBannerProps) {
  return (
    <div
      className={cn(
        'p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 transition-all shadow-sm',
        className
      )}
    >
      <div className="flex items-start space-x-3">
        <div className="p-1 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-rose-900 dark:text-rose-200 font-sans">
            {title}
          </h4>
          <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5 font-mono">
            {message}
          </p>
          {recoveryHint && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400/80 mt-1 italic font-serif">
              Suggestion: {recoveryHint}
            </p>
          )}

          {(onRetry || action) && (
            <div className="mt-3 flex items-center space-x-2">
              {onRetry && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onRetry}
                  className="h-7 px-2.5 text-[11px] bg-white dark:bg-stone-800 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-stone-750"
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Retry Operation
                </Button>
              )}
              {action}
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
