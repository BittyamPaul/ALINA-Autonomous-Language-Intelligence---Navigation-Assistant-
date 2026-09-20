import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../utils';

export interface ConversationLayoutProps {
  greeting?: string;
  headline?: string;
  subheadline?: string;
  composer: ReactNode;
  activeTasksSection?: ReactNode;
  activityTimelineSection?: ReactNode;
  memorySection?: ReactNode;
  toolExecutionSection?: ReactNode;
  systemBanner?: ReactNode;
  className?: string;
}

export function ConversationLayout({
  greeting = 'Good afternoon.',
  headline = 'What would you like to get done?',
  subheadline = 'ALINA plans, verifies, and executes multi-step computer tasks locally within your sandboxed project root.',
  composer,
  activeTasksSection,
  activityTimelineSection,
  memorySection,
  toolExecutionSection,
  systemBanner,
  className,
}: ConversationLayoutProps) {
  return (
    <div className={cn('max-w-5xl mx-auto px-6 py-8 space-y-8 select-none', className)}>
      {/* Editorial Greeting Header (Avoids traditional chatbot fluff) */}
      <div className="space-y-2 pt-2">
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-mono font-medium border border-amber-500/20">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>Autonomous Navigation & Intelligence</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-stone-900 dark:text-stone-50 font-normal">
          {greeting}
        </h1>

        <h2 className="text-xl sm:text-2xl font-sans font-medium tracking-tight text-stone-700 dark:text-stone-300">
          {headline}
        </h2>

        <p className="text-xs sm:text-sm text-stone-500 font-sans max-w-2xl leading-relaxed">
          {subheadline}
        </p>
      </div>

      {/* Optional System / Alert Banner */}
      {systemBanner && <div>{systemBanner}</div>}

      {/* Goal Composer Console */}
      <div className="pt-1">{composer}</div>

      {/* Grid of Autonomous Execution & Context */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
        {/* Left Column: Active Tasks & Execution Steps (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activeTasksSection && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-stone-500">
                  Active & Queued Objectives
                </h3>
              </div>
              <div>{activeTasksSection}</div>
            </div>
          )}

          {activityTimelineSection && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-stone-500">
                  Execution & Verification Stream
                </h3>
              </div>
              <div>{activityTimelineSection}</div>
            </div>
          )}
        </div>

        {/* Right Column: Semantic Memories & Tool Executions (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {toolExecutionSection && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-stone-500">
                  Controlled Tool Actions
                </h3>
              </div>
              <div>{toolExecutionSection}</div>
            </div>
          )}

          {memorySection && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-stone-500">
                  Semantic Long-Term Memory
                </h3>
              </div>
              <div>{memorySection}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
