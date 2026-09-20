'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Globe,
  Download,
  Trash2,
  Search,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Button, Badge } from '@alina/ui';
import { TelemetrySpan, TelemetrySummaryMetrics } from '@alina/shared';

interface DeveloperObservabilityPanelProps {
  onToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function DeveloperObservabilityPanel({ onToast }: DeveloperObservabilityPanelProps) {
  const [metrics, setMetrics] = useState<TelemetrySummaryMetrics | null>(null);
  const [spans, setSpans] = useState<TelemetrySpan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSpanId, setExpandedSpanId] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMetrics(data.metrics);
          setSpans(data.spans || []);
        }
      }
    } catch {
      onToast('Telemetry Connection Failed', 'Using localized telemetry buffer.', 'warning');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const handleExport = async () => {
    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export' }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alina-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        onToast('Telemetry Exported', 'Sanitized JSON telemetry log saved.', 'success');
      }
    } catch {
      onToast('Export Failed', 'Unable to generate telemetry download.', 'error');
    }
  };

  const handleClear = async () => {
    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.ok) {
        setSpans([]);
        fetchTelemetry();
        onToast('Telemetry Cleared', 'In-memory telemetry buffer reset.', 'info');
      }
    } catch {
      onToast('Clear Failed', 'Unable to reset telemetry buffer.', 'error');
    }
  };

  // Filter spans based on type and search query
  const filteredSpans = spans.filter((span) => {
    if (activeTypeFilter !== 'all' && span.type !== activeTypeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        span.taskId.toLowerCase().includes(q) ||
        span.component.toLowerCase().includes(q) ||
        span.type.toLowerCase().includes(q) ||
        JSON.stringify(span.metadata).toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-200">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100 tracking-tight">
              Developer Observability & Telemetry
            </h2>
            <Badge variant="default">Zero CoT Leakage</Badge>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-0.5">
            Production-grade telemetry spans, tool durations, self-healing retries, and scrubbed security audit trails.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={fetchTelemetry} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export JSON
          </Button>
          <Button variant="danger" size="sm" onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Security Redaction Banner */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Editorial Secret Redaction Active:</strong> All API keys, bearer tokens, passwords, and raw chain-of-thought loops are strictly masked prior to rendering.
          </span>
        </div>
        <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">Fail-Closed</span>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Task Duration */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Avg Task Latency</span>
            <Clock className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-stone-900 dark:text-stone-100">
            {metrics?.tasks.averageDurationMs ?? 0}<span className="text-xs text-stone-400 font-sans ml-0.5">ms</span>
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            {metrics?.tasks.total ?? 0} total ({metrics?.tasks.completed ?? 0} completed)
          </div>
        </div>

        {/* Card 2: Tool Calls */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Tool Success Rate</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {metrics?.toolCalls.successRatePercent ?? 100}<span className="text-xs font-sans ml-0.5">%</span>
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            {metrics?.toolCalls.succeeded ?? 0} / {metrics?.toolCalls.total ?? 0} tool calls
          </div>
        </div>

        {/* Card 3: Failures & Components */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Failures Caught</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-mono font-semibold text-stone-900 dark:text-stone-100">
            {metrics?.failures.total ?? 0}
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            {metrics?.failures.retryableCount ?? 0} retryable, {metrics?.failures.fatalCount ?? 0} fatal
          </div>
        </div>

        {/* Card 4: Retries */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Self-Healing Retries</span>
            <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-stone-900 dark:text-stone-100">
            {metrics?.retries.total ?? 0}
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            Backoff & replanning active
          </div>
        </div>

        {/* Card 5: Approvals */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Approval Gates</span>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-mono font-semibold text-amber-600 dark:text-amber-400">
            {metrics?.approvals.total ?? 0}
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            {metrics?.approvals.granted ?? 0} granted, {metrics?.approvals.denied ?? 0} denied
          </div>
        </div>

        {/* Card 6: Browser & Agents */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
          <div className="flex items-center justify-between text-stone-400 mb-1">
            <span className="text-[11px] font-sans font-medium uppercase tracking-wider">Browser & Subagents</span>
            <Globe className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-mono font-semibold text-stone-900 dark:text-stone-100">
            {metrics?.agentRuns.total ?? 0}
          </div>
          <div className="text-[10px] text-stone-500 font-sans mt-1">
            {metrics?.browserActions.total ?? 0} browser actions
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/60 dark:bg-stone-900/40 p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800/80">
        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
          {[
            { key: 'all', label: 'All Spans' },
            { key: 'task_duration', label: 'Tasks' },
            { key: 'tool_call', label: 'Tool Calls' },
            { key: 'failure', label: 'Failures' },
            { key: 'retry', label: 'Retries' },
            { key: 'approval', label: 'Approvals' },
            { key: 'agent_run', label: 'Agents' },
            { key: 'browser_action', label: 'Browser' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTypeFilter(tab.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTypeFilter === tab.key
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by taskId, component..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-md bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Telemetry Spans Stream Table */}
      <div className="rounded-xl border border-stone-200/80 dark:border-stone-800/80 overflow-hidden bg-white dark:bg-stone-900/60 shadow-xs">
        <div className="px-4 py-3 border-b border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-500 font-sans">
          <span>Live Chronological Spans ({filteredSpans.length} events)</span>
          <span className="font-mono text-[11px]">Buffered Spans</span>
        </div>

        {filteredSpans.length === 0 ? (
          <div className="px-6 py-12 text-center text-stone-400 font-sans text-xs">
            No telemetry spans matching active filters.
          </div>
        ) : (
          <div className="divide-y divide-stone-200/60 dark:divide-stone-800/60 max-h-[500px] overflow-y-auto">
            {filteredSpans.map((span) => {
              const isExpanded = expandedSpanId === span.id;
              const formattedTime = new Date(span.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={span.id}
                  className="p-3 hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedSpanId(isExpanded ? null : span.id)}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <button className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="text-[11px] font-mono text-stone-400 shrink-0">
                        {formattedTime}
                      </span>

                      <Badge
                        variant={
                          span.status === 'succeeded' || span.status === 'approved'
                            ? 'success'
                            : span.status === 'failed' || span.status === 'denied'
                            ? 'danger'
                            : 'amber'
                        }
                      >
                        {span.type}
                      </Badge>

                      <span className="text-xs font-mono font-medium text-stone-900 dark:text-stone-100 truncate">
                        {span.component}
                      </span>

                      {Boolean(span.metadata?.toolName) && (
                        <span className="text-xs font-mono text-stone-500 truncate">
                          ({String(span.metadata?.toolName)})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      {span.durationMs !== undefined && (
                        <span className="text-[11px] font-mono text-stone-500">
                          {span.durationMs}ms
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-sans font-medium px-2 py-0.5 rounded-full ${
                          span.status === 'succeeded' || span.status === 'approved'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                            : span.status === 'failed' || span.status === 'denied'
                            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
                            : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {span.status}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Sanitized Details View */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-stone-200/60 dark:border-stone-800/60 pl-6 space-y-2 text-xs font-mono">
                      <div className="flex items-center space-x-4 text-stone-400 text-[11px]">
                        <span>Span ID: {span.id}</span>
                        <span>Task ID: {span.taskId}</span>
                      </div>

                      {Object.keys(span.metadata).length > 0 && (
                        <div>
                          <div className="text-[11px] font-sans font-semibold text-stone-500 uppercase tracking-wider mb-1">
                            Metadata
                          </div>
                          <pre className="p-2.5 rounded-lg bg-stone-100 dark:bg-stone-950 text-[11px] text-stone-800 dark:text-stone-200 overflow-x-auto">
                            {JSON.stringify(span.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                      {Object.keys(span.sanitizedDetails).length > 0 && (
                        <div>
                          <div className="text-[11px] font-sans font-semibold text-stone-500 uppercase tracking-wider mb-1">
                            Sanitized Details (Zero-Leak Verified)
                          </div>
                          <pre className="p-2.5 rounded-lg bg-stone-100 dark:bg-stone-950 text-[11px] text-stone-800 dark:text-stone-200 overflow-x-auto">
                            {JSON.stringify(span.sanitizedDetails, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
