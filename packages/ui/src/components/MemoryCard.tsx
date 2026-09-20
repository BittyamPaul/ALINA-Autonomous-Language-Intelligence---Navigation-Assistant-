import type { ReactNode } from 'react';
import { Brain, Calendar, Tag, Trash2, ArrowRight } from 'lucide-react';
import { cn } from '../utils';
import { Badge } from './Badge';

export type MemoryCategory = 'preference' | 'fact' | 'context' | 'rule' | 'workflow';

export interface MemoryCardProps {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number; // 1 to 5
  tags?: string[];
  createdAt?: string;
  lastAccessedAt?: string;
  onSelect?: () => void;
  onDelete?: () => void;
  action?: ReactNode;
  className?: string;
}

export function MemoryCard({
  id: _id,
  category,
  content,
  importance,
  tags = [],
  createdAt,
  lastAccessedAt,
  onSelect,
  onDelete,
  action,
  className,
}: MemoryCardProps) {
  const getCategoryBadge = () => {
    switch (category) {
      case 'rule':
        return <Badge variant="danger">Rule</Badge>;
      case 'preference':
        return <Badge variant="amber">Preference</Badge>;
      case 'workflow':
        return <Badge variant="success">Workflow</Badge>;
      case 'context':
        return <Badge variant="default">Context</Badge>;
      case 'fact':
      default:
        return <Badge variant="default">Fact</Badge>;
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none',
        'bg-white dark:bg-stone-900/90 border-stone-200/80 dark:border-stone-800/80',
        'hover:border-stone-300 dark:hover:border-stone-700 shadow-sm hover:shadow',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-2">
          {getCategoryBadge()}
          <div className="flex items-center space-x-1" title={`Importance: ${importance}/5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i < importance
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : 'bg-stone-200 dark:bg-stone-800'
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete memory"
              className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {action}
          <div className="text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200">
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-sm text-stone-800 dark:text-stone-200 font-serif leading-relaxed line-clamp-3">
        {content}
      </p>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/70 border border-stone-200/50 dark:border-stone-800"
            >
              <Tag className="w-2.5 h-2.5 mr-1 opacity-60" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/60 flex items-center justify-between text-[10px] font-mono text-stone-400 dark:text-stone-500">
        <span className="flex items-center">
          <Brain className="w-3 h-3 mr-1 opacity-70" />
          {lastAccessedAt ? `Accessed ${lastAccessedAt}` : 'Long-term memory'}
        </span>
        {createdAt && (
          <span className="flex items-center">
            <Calendar className="w-3 h-3 mr-1 opacity-70" />
            {createdAt}
          </span>
        )}
      </div>
    </div>
  );
}
