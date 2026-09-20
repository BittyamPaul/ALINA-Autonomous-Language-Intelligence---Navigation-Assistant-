'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Terminal,
} from 'lucide-react';
import { cn } from '../utils';
import { Badge } from './Badge';

export type ActivityStepStatus = 'completed' | 'running' | 'awaiting_approval' | 'failed' | 'queued';
export type ActivityRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ActivityStep {
  id: string;
  title: string;
  toolName?: string;
  status: ActivityStepStatus;
  risk?: ActivityRisk;
  verification?: 'verified' | 'failed' | 'skipped';
  timestamp: string;
  durationMs?: number;
  parameters?: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface ActivityTimelineProps {
  steps: ActivityStep[];
  onApproveStep?: (stepId: string) => void;
  className?: string;
}

export function ActivityTimeline({
  steps,
  onApproveStep,
  className,
}: ActivityTimelineProps) {
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedStepIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusIcon = (status: ActivityStepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      case 'awaiting_approval':
        return <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'queued':
      default:
        return <Clock className="w-4 h-4 text-stone-400" />;
    }
  };

  const getRiskBadge = (risk?: ActivityRisk) => {
    if (!risk) return null;
    switch (risk) {
      case 'HIGH':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            HIGH RISK
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            MEDIUM
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-mono text-stone-500 bg-stone-100 dark:bg-stone-800 rounded">
            LOW
          </span>
        );
    }
  };

  return (
    <div className={cn('relative space-y-4 pl-2 font-sans', className)}>
      {/* Connecting vertical line */}
      <div className="absolute left-[17px] top-3 bottom-3 w-[1px] bg-stone-200 dark:bg-stone-800" />

      {steps.map((step) => {
        const isExpanded = !!expandedStepIds[step.id];

        return (
          <div key={step.id} className="relative flex items-start space-x-3 group">
            {/* Timeline node */}
            <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm group-hover:border-stone-400 dark:group-hover:border-stone-600 transition-colors">
              {getStatusIcon(step.status)}
            </div>

            {/* Step content card */}
            <div className="flex-1 min-w-0 bg-white dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800/80 rounded-lg p-3 shadow-sm hover:border-stone-300 dark:hover:border-stone-700 transition-all">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-medium text-stone-900 dark:text-stone-100">
                    {step.title}
                  </span>
                  {step.toolName && (
                    <Badge variant="default" className="text-[10px] py-0">
                      <Terminal className="w-2.5 h-2.5 mr-1 inline opacity-60" />
                      {step.toolName}
                    </Badge>
                  )}
                  {getRiskBadge(step.risk)}
                  {step.verification === 'verified' && (
                    <span className="inline-flex items-center text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3 h-3 mr-0.5" />
                      Verified
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 text-[10px] font-mono text-stone-400 shrink-0">
                  {step.durationMs !== undefined && <span>{step.durationMs}ms</span>}
                  <span>{step.timestamp}</span>
                  {(step.parameters || step.output || step.error) && (
                    <button
                      onClick={() => toggleExpand(step.id)}
                      className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors text-stone-500"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {step.status === 'awaiting_approval' && (
                <div className="mt-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between">
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    Safety Gate: Step requires explicit approval before mutating filesystem or running command.
                  </div>
                  {onApproveStep && (
                    <button
                      onClick={() => onApproveStep(step.id)}
                      className="ml-3 px-2.5 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded shadow-sm transition-colors"
                    >
                      Review & Authorize
                    </button>
                  )}
                </div>
              )}

              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-stone-100 dark:border-stone-800/80 space-y-2 text-xs font-mono">
                  {step.parameters && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">
                        Parameters
                      </div>
                      <pre className="p-2 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 text-stone-700 dark:text-stone-300 overflow-x-auto text-[11px]">
                        {JSON.stringify(step.parameters, null, 2)}
                      </pre>
                    </div>
                  )}
                  {step.output && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">
                        Output
                      </div>
                      <pre className="p-2 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 text-stone-700 dark:text-stone-300 overflow-x-auto text-[11px]">
                        {step.output}
                      </pre>
                    </div>
                  )}
                  {step.error && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rose-500 font-semibold mb-1">
                        Failure Log
                      </div>
                      <pre className="p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 overflow-x-auto text-[11px]">
                        {step.error}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
