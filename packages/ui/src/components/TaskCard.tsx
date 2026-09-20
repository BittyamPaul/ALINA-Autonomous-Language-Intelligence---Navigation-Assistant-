import type { ReactNode } from 'react';
import { Clock, Layers, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { cn } from '../utils';
import { Badge } from './Badge';

export type TaskCardStatus =
  | 'draft'
  | 'planning'
  | 'ready'
  | 'executing'
  | 'awaiting_approval'
  | 'completed'
  | 'failed';

export interface TaskCardProps {
  id: string;
  goal: string;
  status: TaskCardStatus;
  completedSteps?: number;
  totalSteps?: number;
  durationMs?: number;
  currentAction?: string;
  onClick?: () => void;
  action?: ReactNode;
  className?: string;
}

export function TaskCard({
  id: _id,
  goal,
  status,
  completedSteps = 0,
  totalSteps = 0,
  durationMs,
  currentAction,
  onClick,
  action,
  className,
}: TaskCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'executing':
        return <Badge variant="amber">Executing</Badge>;
      case 'awaiting_approval':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold rounded bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-750 shadow-2xs">
            <ShieldAlert className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400" />
            Approval Needed
          </span>
        );
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Objective: ${goal}, status: ${status}`}
      className={cn(
        'group relative p-4 rounded-xl border transition-all duration-150 cursor-pointer select-none bg-white dark:bg-stone-900 border-stone-200/80 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700 shadow-2xs hover:shadow-xs',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80',
        status === 'awaiting_approval' && 'border-amber-400/90 dark:border-amber-600/70 bg-amber-50/20 dark:bg-amber-950/10',
        className
      )}
    >
      <div className="flex items-start justify-between space-x-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center space-x-2">
            {getStatusBadge()}
            {durationMs !== undefined && (
              <span className="flex items-center text-[10px] font-mono text-stone-500">
                <Clock className="w-3 h-3 mr-1" />
                {durationMs}ms
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 font-sans tracking-tight line-clamp-2 pt-0.5">
            {goal}
          </h4>
          {currentAction && (
            <p className="text-xs text-stone-600 dark:text-stone-400 truncate italic font-serif">
              Current: {currentAction}
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center space-x-2">
          {action}
          <div className="text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {totalSteps > 0 && (
        <div className="mt-3.5 pt-3 border-t border-stone-100 dark:border-stone-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-stone-500">
            <span className="flex items-center">
              <Layers className="w-3 h-3 mr-1" />
              {completedSteps} / {totalSteps} steps
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                status === 'completed'
                  ? 'bg-emerald-500'
                  : status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
