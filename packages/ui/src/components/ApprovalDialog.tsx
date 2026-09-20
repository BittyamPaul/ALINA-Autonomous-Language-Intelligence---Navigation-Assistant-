'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  FileCode,
  Check,
  Ban,
  Clock,
  ArrowRight,
  Shield,
  Key,
} from 'lucide-react';
import { Button } from './Button';

export interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  action?: string;
  target?: string;
  source?: string;
  toolName: string;
  riskLevel: 'SAFE' | 'APPROVAL_REQUIRED' | 'HIGH_RISK' | 'LOW' | 'MEDIUM' | 'HIGH';
  description?: string;
  reason?: string;
  details?: Record<string, unknown>;
  diff?: string;
  expiresAt?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  title = 'Alina needs your permission',
  action = 'execute',
  target,
  source,
  toolName,
  riskLevel,
  description,
  reason,
  details,
  diff,
  expiresAt,
  status = 'pending',
  onApprove,
  onDeny,
}: ApprovalDialogProps) {
  const isHighRisk = riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH';
  const effectiveReason = reason || description || 'Autonomous operation requires affirmative human authorization.';

  // Expiration countdown
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(status === 'expired');

  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const diffMs = new Date(expiresAt).getTime() - Date.now();
      if (diffMs <= 0) {
        setSecondsRemaining(0);
        setIsExpired(true);
      } else {
        setSecondsRemaining(Math.ceil(diffMs / 1000));
        setIsExpired(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Keyboard navigation for approval dialog
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isExpired && status === 'pending') {
        e.preventDefault();
        onApprove();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isExpired, status, onApprove, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[90vh] w-[94vw] sm:w-[90vw] max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-xl bg-white dark:bg-stone-900 p-4 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 z-50 focus:outline-none overflow-y-auto animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                  isHighRisk
                    ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                    : 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isHighRisk ? <AlertTriangle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-stone-900 dark:text-stone-100 font-sans">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-stone-500 font-mono mt-0.5 flex items-center gap-2">
                  <span>
                    Tool: <span className="font-semibold text-stone-700 dark:text-stone-300">{toolName}</span>
                  </span>
                  <span>•</span>
                  <span
                    className={`font-semibold uppercase ${
                      isHighRisk
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {riskLevel}
                  </span>
                </Dialog.Description>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Primary Action & Target Highlight (Linear / Arc Editorial Card) */}
          <div className="mt-5 p-4 rounded-lg bg-stone-50 dark:bg-stone-950/70 border border-stone-200 dark:border-stone-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              ALINA wants to {action}:
            </div>

            {source ? (
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-800 dark:text-stone-200 break-all select-all">
                  {source}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 px-1">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                  <span>to:</span>
                </div>
                <div className="p-2.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono font-medium text-stone-900 dark:text-stone-100 break-all select-all">
                  {target}
                </div>
              </div>
            ) : target ? (
              <div className="p-2.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono font-medium text-stone-900 dark:text-stone-100 break-all select-all">
                {target}
              </div>
            ) : null}

            <div className="mt-3 pt-3 border-t border-stone-200/60 dark:border-stone-800/60 text-xs text-stone-600 dark:text-stone-300 leading-relaxed font-sans">
              <span className="font-medium text-stone-700 dark:text-stone-200">Reason: </span>
              {effectiveReason}
            </div>
          </div>

          {/* Diff preview if present */}
          {diff && (
            <div className="mt-4">
              <div className="text-xs font-mono font-medium text-stone-500 mb-1.5 flex items-center">
                <FileCode className="w-3.5 h-3.5 mr-1 text-stone-400" />
                Proposed Changes:
              </div>
              <pre className="p-3 rounded-lg bg-stone-900 text-stone-100 text-xs font-mono overflow-x-auto max-h-36 border border-stone-800">
                {diff}
              </pre>
            </div>
          )}

          {/* Sanitized Parameters (No Secrets) */}
          {details && Object.keys(details).length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-mono font-medium text-stone-500 mb-1.5 flex items-center justify-between">
                <span>Execution Parameters:</span>
                <span className="text-[10px] text-stone-400 flex items-center gap-1">
                  <Key className="w-3 h-3" /> Secrets Redacted
                </span>
              </div>
              <pre className="p-2.5 rounded-lg bg-stone-100/70 dark:bg-stone-950 text-stone-800 dark:text-stone-300 text-[11px] font-mono overflow-x-auto max-h-28 border border-stone-200 dark:border-stone-800">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}

          {/* Expiration Status / Security Notice */}
          <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
            {secondsRemaining !== null && (
              <div
                className={`flex items-center gap-1.5 font-mono text-[11px] ${
                  isExpired
                    ? 'text-rose-600 dark:text-rose-400 font-semibold'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {isExpired ? (
                  <span>Request expired. Cannot allow.</span>
                ) : (
                  <span>Expires in: {formatCountdown(secondsRemaining)}</span>
                )}
              </div>
            )}
            <div className="text-[10px] text-stone-400 font-mono flex items-center gap-1 ml-auto">
              <Shield className="w-3 h-3 text-amber-500" /> Single-use authorization
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="mt-5 flex items-center justify-end space-x-3 pt-4 border-t border-stone-100 dark:border-stone-800">
            <Button
              variant="secondary"
              onClick={() => {
                onDeny();
                onOpenChange(false);
              }}
              className="text-stone-700 dark:text-stone-300"
            >
              <Ban className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
              Cancel
            </Button>

            <Button
              variant={isHighRisk ? 'danger' : 'amber'}
              disabled={isExpired || status !== 'pending'}
              onClick={() => {
                if (!isExpired) {
                  onApprove();
                  onOpenChange(false);
                }
              }}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Allow
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
