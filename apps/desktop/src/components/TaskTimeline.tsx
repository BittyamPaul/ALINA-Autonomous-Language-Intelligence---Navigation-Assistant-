'use client';

import React, { useState } from 'react';
import { PlanStep } from '@alina/shared';
import {
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  RotateCw,
  Clock,
  Terminal,
  FileText,
  Compass,
} from 'lucide-react';

interface TaskTimelineProps {
  steps: PlanStep[];
  activeStepId?: string;
}

export function TaskTimeline({ steps, activeStepId }: TaskTimelineProps) {
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (stepId: string) => {
    setExpandedStepIds((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const getRoleIcon = (role: PlanStep['agentRole']) => {
    switch (role) {
      case 'workspace':
        return <FileText className="w-3.5 h-3.5 text-stone-400" />;
      case 'navigator':
        return <Compass className="w-3.5 h-3.5 text-amber-500/80" />;
      case 'planner':
        return <Terminal className="w-3.5 h-3.5 text-stone-300" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-stone-400" />;
    }
  };

  const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'running':
        return <RotateCw className="w-4 h-4 text-amber-500 animate-spin" />;
      case 'verifying':
        return <ShieldCheck className="w-4 h-4 text-amber-400 animate-pulse" />;
      case 'awaiting_approval':
        return <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      default:
        return <CircleDashed className="w-4 h-4 text-stone-600" />;
    }
  };

  const getRiskBadge = (risk: PlanStep['riskLevel']) => {
    switch (risk) {
      case 'HIGH_DESTRUCTIVE':
        return (
          <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider font-semibold rounded bg-rose-950/60 text-rose-400 border border-rose-800/40">
            High Risk
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider font-medium rounded bg-amber-950/60 text-amber-400 border border-amber-800/40">
            Write
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider font-normal rounded bg-stone-900 text-stone-400 border border-stone-800">
            Read
          </span>
        );
    }
  };

  if (steps.length === 0) {
    return (
      <div className="py-8 text-center text-stone-500 text-sm italic font-serif">
        No active execution plan. Enter a goal above to begin.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-800/80">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Execution Blueprint
        </h3>
        <span className="text-xs font-mono text-stone-500">
          {steps.filter((s) => s.status === 'completed').length} / {steps.length} completed
        </span>
      </div>

      <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-stone-800">
        {steps.map((step) => {
          const isActive = step.id === activeStepId || step.status === 'running';
          const isExpanded = !!expandedStepIds[step.id];

          return (
            <div
              key={step.id}
              className={`relative rounded-lg border transition-all duration-200 ${
                isActive
                  ? 'bg-stone-900/90 border-amber-700/50 shadow-sm'
                  : 'bg-stone-900/40 border-stone-800/60 hover:border-stone-700/80'
              }`}
            >
              {/* Step indicator node on timeline track */}
              <div className="absolute -left-[27px] top-3 bg-[#0c0a09] p-0.5 rounded-full ring-2 ring-stone-900">
                {getStatusIcon(step.status)}
              </div>

              {/* Step Header */}
              <div
                onClick={() => toggleExpand(step.id)}
                className="p-3 cursor-pointer flex items-center justify-between select-none"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="p-1 rounded bg-stone-800/70 border border-stone-700/40">
                    {getRoleIcon(step.agentRole)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-stone-200 truncate">
                        {step.title}
                      </span>
                      {getRiskBadge(step.riskLevel)}
                    </div>
                    <p className="text-xs text-stone-400 truncate mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 ml-3 shrink-0">
                  {step.durationMs !== undefined && (
                    <span className="flex items-center text-[11px] font-mono text-stone-500">
                      <Clock className="w-3 h-3 mr-1" />
                      {step.durationMs}ms
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-stone-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  )}
                </div>
              </div>

              {/* Collapsible Details Drawer */}
              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 text-xs border-t border-stone-800/60 space-y-2 bg-stone-950/40 rounded-b-lg">
                  <div>
                    <span className="text-[11px] font-mono text-stone-500 uppercase">Tool:</span>{' '}
                    <code className="text-amber-300/90 font-mono text-[11px]">{step.tool}</code>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-stone-500 uppercase">Parameters:</span>
                    <pre className="mt-1 p-2 bg-stone-950 rounded font-mono text-[11px] text-stone-300 overflow-x-auto border border-stone-800">
                      {JSON.stringify(step.parameters, null, 2)}
                    </pre>
                  </div>
                  {step.postCondition && (
                    <div className="pt-1">
                      <span className="text-[11px] font-mono text-stone-500 uppercase">
                        Post-Condition:
                      </span>
                      <p className="text-stone-300 text-xs mt-0.5 italic">
                        {step.postCondition.description} ({step.postCondition.type})
                      </p>
                    </div>
                  )}
                  {step.error && (
                    <div className="p-2 rounded bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs mt-2">
                      <strong>Failure:</strong> {step.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
