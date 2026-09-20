import type { HTMLAttributes } from 'react';
import { cn } from '../utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-pulse rounded-md bg-stone-200/70 dark:bg-stone-800/60',
        className
      )}
      {...props}
    />
  );
}

export function TaskCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading task details"
      className="p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-white dark:bg-stone-900/60 space-y-3 shadow-2xs"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-3/4" />
      <div className="pt-2 flex items-center justify-between">
        <Skeleton className="h-2 w-2/3" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export function TimelineRowSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading timeline step"
      className="flex items-start space-x-3 p-3 rounded-lg border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/40 dark:bg-stone-900/20"
    >
      <Skeleton className="h-4 w-4 rounded-full shrink-0" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-2.5 w-4/5" />
      </div>
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  );
}

export function MemoryCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading memory"
      className="p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-white dark:bg-stone-900/60 space-y-3 shadow-2xs"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-2/3" />
      <div className="pt-2 flex items-center space-x-2">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
    </div>
  );
}
