'use client';

import { useState } from 'react';
import { Terminal, Check, AlertCircle, ChevronDown, ChevronRight, ShieldCheck, Clock } from 'lucide-react';
import { cn } from '../utils';
import { Badge } from './Badge';

export interface ToolExecutionCardProps {
  toolName: string;
  riskLevel: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH_DESTRUCTIVE';
  parameters: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
  postConditionVerified?: boolean;
  status: 'running' | 'success' | 'failed';
  error?: string;
  className?: string;
}

export function ToolExecutionCard({
  toolName,
  riskLevel,
  parameters,
  output,
  durationMs,
  postConditionVerified,
  status,
  error,
  className,
}: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRiskBadge = () => {
    switch (riskLevel) {
      case 'HIGH_DESTRUCTIVE':
        return <Badge variant="danger">High Risk</Badge>;
      case 'MEDIUM':
        return <Badge variant="amber">Write</Badge>;
      default:
        return <Badge variant="default">Read Only</Badge>;
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-white dark:bg-stone-900 overflow-hidden shadow-sm transition-all',
        className
      )}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3 cursor-pointer flex items-center justify-between select-none hover:bg-stone-50/60 dark:hover:bg-stone-850/50 transition-colors"
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200/60 dark:border-stone-700/60">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <code className="text-xs font-mono font-semibold text-stone-900 dark:text-stone-100">
                {toolName}
              </code>
              {getRiskBadge()}
              {postConditionVerified && (
                <span className="hidden sm:inline-flex items-center text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Asserted
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-500 font-mono truncate mt-0.5">
              {JSON.stringify(parameters).slice(0, 70)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 shrink-0 ml-3">
          {durationMs !== undefined && (
            <span className="text-[11px] font-mono text-stone-400 flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              {durationMs}ms
            </span>
          )}
          {status === 'success' && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          {status === 'failed' && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-stone-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 text-xs border-t border-stone-100 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-950/40 space-y-2.5">
          <div>
            <span className="text-[10px] font-mono uppercase text-stone-500 tracking-wider">
              Input Parameters:
            </span>
            <pre className="mt-1 p-2.5 rounded-lg bg-white dark:bg-stone-950 font-mono text-[11px] text-stone-800 dark:text-stone-300 border border-stone-200 dark:border-stone-800 overflow-x-auto">
              {JSON.stringify(parameters, null, 2)}
            </pre>
          </div>

          {output !== undefined && (
            <div>
              <span className="text-[10px] font-mono uppercase text-stone-500 tracking-wider">
                Execution Output:
              </span>
              <pre className="mt-1 p-2.5 rounded-lg bg-white dark:bg-stone-950 font-mono text-[11px] text-stone-800 dark:text-stone-300 border border-stone-200 dark:border-stone-800 overflow-x-auto max-h-40">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs">
              <strong>Execution Error:</strong> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
