import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-900/30',
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 shadow-sm border border-stone-200/60 dark:border-stone-700/60">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 font-sans tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-stone-500 dark:text-stone-400 font-serif leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
