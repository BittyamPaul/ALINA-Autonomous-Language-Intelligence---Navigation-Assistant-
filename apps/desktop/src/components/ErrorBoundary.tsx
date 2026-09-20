'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Copy, Check, Home } from 'lucide-react';

const SENSITIVE_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /AIza[a-zA-Z0-9_-]{35}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /ghp_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{82}/g,
];

export function sanitizeClientMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    const sanitized = sanitizeClientMessage(error.message);
    console.error('[ALINA ErrorBoundary] Handled presentation error:', sanitized, errorInfo.componentStack);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleCopyDiagnostics = async () => {
    const { error, errorInfo } = this.state;
    const diagnosticReport = {
      product: 'ALINA Desktop Companion',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      error: error
        ? {
            name: error.name,
            message: sanitizeClientMessage(error.message),
            stack: error.stack ? sanitizeClientMessage(error.stack) : undefined,
          }
        : null,
      componentStack: errorInfo?.componentStack
        ? sanitizeClientMessage(errorInfo.componentStack)
        : undefined,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticReport, null, 2));
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Fallback if clipboard API is unavailable
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sanitizedMessage = this.state.error
        ? sanitizeClientMessage(this.state.error.message)
        : 'An unexpected application state occurred.';

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-stone-100 dark:bg-[#0c0a09] p-6 select-none">
          <div className="max-w-xl w-full bg-white dark:bg-[#1c1917] border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
                  ALINA encountered an unexpected state
                </h2>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  A presentation runtime error was safely contained. Your memory, task history, and database records are unharmed.
                </p>
              </div>
            </div>

            <div className="bg-stone-50 dark:bg-[#141210] border border-stone-200 dark:border-stone-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-1">
                Contained Error
              </span>
              <p className="font-mono text-xs text-stone-700 dark:text-stone-300 break-words leading-relaxed">
                {sanitizedMessage}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium hover:bg-stone-800 dark:hover:bg-white transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Reload ALINA
              </button>

              <button
                type="button"
                onClick={this.handleCopyDiagnostics}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                {this.state.copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Copied Diagnostics
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Diagnostics
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 text-sm font-medium transition-colors ml-auto cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
