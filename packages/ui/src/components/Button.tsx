import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none rounded-lg cursor-pointer';

    const variants = {
      primary:
        'bg-amber-600 dark:bg-amber-500 text-white dark:text-stone-950 hover:bg-amber-500 dark:hover:bg-amber-400 active:scale-[0.98] shadow-xs font-semibold',
      amber:
        'bg-amber-600 dark:bg-amber-500 text-white dark:text-stone-950 hover:bg-amber-500 dark:hover:bg-amber-400 active:scale-[0.98] shadow-xs font-semibold',
      secondary:
        'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200/80 dark:hover:bg-stone-700/80 active:scale-[0.98] border border-stone-200/80 dark:border-stone-700/60 shadow-2xs',
      danger:
        'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/70 active:scale-[0.98] border border-rose-200 dark:border-rose-800/60 shadow-2xs',
      ghost:
        'text-stone-600 dark:text-stone-400 hover:text-stone-950 dark:hover:text-stone-100 hover:bg-stone-100/80 dark:hover:bg-stone-800/60 active:scale-[0.98]',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs',
      md: 'h-9 px-3.5 text-xs',
      lg: 'h-10 px-4 text-sm',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 mr-1.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
