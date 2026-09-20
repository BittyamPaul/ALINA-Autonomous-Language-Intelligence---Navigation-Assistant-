'use client';

import React from 'react';
import { ApprovalRequest } from '@alina/shared';
import { ShieldAlert, Check, X, AlertCircle } from 'lucide-react';

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string, reason?: string) => void;
}

export function ApprovalModal({ request, onApprove, onDeny }: ApprovalModalProps) {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-stone-900 border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-amber-950/30 border-b border-amber-900/40 flex items-start space-x-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-stone-100">
                Action Approval Required
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider font-bold rounded bg-amber-500 text-stone-950">
                HITL Gate
              </span>
            </div>
            <p className="text-xs text-amber-300/80 mt-1">
              ALINA is paused waiting for your explicit confirmation before executing a potentially destructive operation.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-xs font-mono uppercase text-stone-400 tracking-wider">
              Proposed Operation
            </h3>
            <p className="text-sm font-medium text-stone-200 mt-1">
              {request.title}
            </p>
            <p className="text-xs text-stone-400 mt-0.5">
              {request.description}
            </p>
          </div>

          <div className="p-3 bg-stone-950 rounded-lg border border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-stone-400">Target Tool:</span>
              <code className="text-xs font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                {request.toolName}
              </code>
            </div>
            <div>
              <span className="text-xs font-mono text-stone-400">Parameters:</span>
              <pre className="mt-1 p-2 bg-stone-900 rounded font-mono text-[11px] text-stone-300 overflow-x-auto border border-stone-800 max-h-32">
                {JSON.stringify(request.parameters, null, 2)}
              </pre>
            </div>
          </div>

          {request.impactSummary && (
            <div className="flex items-center space-x-2 text-xs text-amber-400/90 bg-amber-950/20 p-2.5 rounded border border-amber-900/30">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{request.impactSummary}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-stone-950/60 border-t border-stone-800 flex items-center justify-end space-x-3">
          <button
            onClick={() => onDeny(request.id, 'User denied in HITL modal')}
            className="px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors flex items-center space-x-1.5"
          >
            <X className="w-4 h-4" />
            <span>Deny & Abort</span>
          </button>
          <button
            onClick={() => onApprove(request.id)}
            className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm shadow-amber-950"
          >
            <Check className="w-4 h-4" />
            <span>Approve & Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
}
