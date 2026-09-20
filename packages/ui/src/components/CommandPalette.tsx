import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  CheckSquare,
  Brain,
  Shield,
  Sun,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { cn } from '../utils';

export interface CommandPaletteItem {
  id: string;
  category: 'Actions' | 'Tasks' | 'Memories' | 'Navigation';
  title: string;
  subtitle?: string;
  icon?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: CommandPaletteItem[];
  onSelectAction?: (actionId: string) => void;
  onThemeToggle?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  items: customItems,
  onSelectAction,
  onThemeToggle,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const defaultItems: CommandPaletteItem[] = useMemo(
    () => [
      {
        id: 'action-new-goal',
        category: 'Actions',
        title: 'Define new autonomous goal...',
        subtitle: 'Initiate a multi-step verified plan',
        icon: 'terminal',
        onSelect: () => onSelectAction?.('new_goal'),
      },
      {
        id: 'action-security-audit',
        category: 'Actions',
        title: 'Run PathJail & sandbox security audit',
        subtitle: 'Inspect filesystem boundaries and tool permissions',
        icon: 'shield',
        onSelect: () => onSelectAction?.('security_audit'),
      },
      {
        id: 'action-theme-toggle',
        category: 'Actions',
        title: 'Toggle interface theme (Light / Dark)',
        subtitle: 'Switch between warm light and editorial charcoal',
        icon: 'theme',
        onSelect: () => onThemeToggle?.(),
      },
      {
        id: 'task-recent-1',
        category: 'Tasks',
        title: 'Audit repository architecture & package boundaries',
        subtitle: 'Completed 5/5 steps • 1420ms',
        icon: 'task',
        onSelect: () => onSelectAction?.('task_1'),
      },
      {
        id: 'memory-recent-1',
        category: 'Memories',
        title: 'Preference: Always use strict TypeScript with zero any',
        subtitle: 'Rule • Importance: 5/5',
        icon: 'brain',
        onSelect: () => onSelectAction?.('memory_1'),
      },
    ],
    [onSelectAction, onThemeToggle]
  );

  const allItems = customItems || defaultItems;

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const lower = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(lower)) ||
        item.category.toLowerCase().includes(lower)
    );
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
          onOpenChange(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filteredItems, onOpenChange]);

  const getItemIcon = (category: string, icon?: string) => {
    if (icon === 'theme') return <Sun className="w-4 h-4 text-amber-500" />;
    if (icon === 'shield') return <Shield className="w-4 h-4 text-amber-600" />;
    if (icon === 'terminal') return <Terminal className="w-4 h-4 text-stone-500" />;

    switch (category) {
      case 'Tasks':
        return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      case 'Memories':
        return <Brain className="w-4 h-4 text-indigo-500" />;
      case 'Actions':
      default:
        return <ArrowRight className="w-4 h-4 text-stone-400" />;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[20%] w-[90vw] max-w-xl translate-x-[-50%] rounded-xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-800 z-50 focus:outline-none overflow-hidden animate-in fade-in zoom-in-95">
          <div className="flex items-center px-4 border-b border-stone-100 dark:border-stone-800">
            <Search className="w-4 h-4 text-stone-400 shrink-0 mr-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command, task, or search memories..."
              className="w-full py-3.5 bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none font-sans"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 rounded border border-stone-200 dark:border-stone-700">
              ESC
            </kbd>
          </div>

          <div
            role="listbox"
            aria-label="Commands"
            className="max-h-80 overflow-y-auto p-2 divide-y divide-transparent"
          >
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400 font-sans">
                No commands or tasks found matching &quot;{query}&quot;
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      item.onSelect();
                      onOpenChange(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors select-none',
                      isSelected
                        ? 'bg-amber-500/10 dark:bg-stone-800/90 text-stone-950 dark:text-stone-50 border border-amber-500/20 dark:border-stone-700 font-medium'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/40 border border-transparent'
                    )}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="p-1.5 rounded-md bg-stone-100 dark:bg-stone-800/60 shrink-0 text-stone-600 dark:text-stone-300">
                        {getItemIcon(item.category, item.icon)}
                      </div>
                      <div className="truncate">
                        <div className="font-medium text-stone-900 dark:text-stone-100">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center space-x-2 pl-3">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
                        {item.category}
                      </span>
                      {isSelected && (
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-200/80 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                          ↵
                        </kbd>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 bg-stone-50 dark:bg-stone-950/80 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-[11px] font-mono text-stone-400">
            <div className="flex items-center space-x-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>esc Dismiss</span>
            </div>
            <span>ALINA Command Layer</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
