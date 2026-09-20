import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../utils';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ReactNode;
  onClose?: (id: string) => void;
}

export function ToastItem({
  id,
  title,
  description,
  variant = 'info',
  action,
  onClose,
}: ToastProps) {
  const icons: Record<ToastVariant, ReactNode> = {
    info: <Info className="w-4 h-4 text-stone-600 dark:text-stone-300" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    error: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
  };

  const borders: Record<ToastVariant, string> = {
    info: 'border-stone-200 dark:border-stone-800',
    success: 'border-emerald-200 dark:border-emerald-900/50',
    warning: 'border-amber-200 dark:border-amber-900/50',
    error: 'border-rose-200 dark:border-rose-900/50',
  };

  return (
    <div
      className={cn(
        'flex items-start space-x-3 p-3.5 rounded-xl bg-white dark:bg-stone-900 border shadow-lg transition-all select-none max-w-sm w-full',
        borders[variant]
      )}
    >
      <div className="shrink-0 mt-0.5">{icons[variant]}</div>
      <div className="min-w-0 flex-1">
        <h5 className="text-xs font-semibold text-stone-900 dark:text-stone-100 font-sans">
          {title}
        </h5>
        {description && (
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed font-serif">
            {description}
          </p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onClose && (
        <button
          onClick={() => onClose(id)}
          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: ToastProps[];
  onClose: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem {...toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}
