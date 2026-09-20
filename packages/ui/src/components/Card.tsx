import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, active, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border transition-all duration-200',
          active
            ? 'bg-amber-50/40 dark:bg-stone-900/90 border-amber-300 dark:border-amber-700/50 shadow-xs'
            : 'bg-white dark:bg-stone-900/60 border-stone-200/80 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700 shadow-2xs',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
