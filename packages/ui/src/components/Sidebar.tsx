import type { ReactNode } from 'react';
import {
  Compass,
  CheckSquare,
  Activity,
  Brain,
  ShieldCheck,
  Settings,
  FolderLock,
  ChevronLeft,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { cn } from '../utils';

export type NavItemKey = 'home' | 'tasks' | 'activity' | 'memory' | 'security' | 'observability' | 'settings';

export interface NavItem {
  key: NavItemKey;
  label: string;
  icon: ReactNode;
  badge?: number | string;
}

export interface SidebarProps {
  activeItem: NavItemKey;
  onSelect: (key: NavItemKey) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  workspacePath?: string;
  taskCount?: number;
  className?: string;
}

export function Sidebar({
  activeItem,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  workspacePath = 'ALINA Local Project',
  taskCount = 2,
  className,
}: SidebarProps) {
  const navItems: NavItem[] = [
    {
      key: 'home',
      label: 'Home & Goals',
      icon: <Compass className="w-4 h-4" />,
    },
    {
      key: 'tasks',
      label: 'Active Tasks',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: taskCount > 0 ? taskCount : undefined,
    },
    {
      key: 'activity',
      label: 'Execution Stream',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      key: 'memory',
      label: 'Semantic Memory',
      icon: <Brain className="w-4 h-4" />,
    },
    {
      key: 'security',
      label: 'Safety & PathJail',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      key: 'observability',
      label: 'Observability',
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      key: 'settings',
      label: 'Preferences',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <aside
      className={cn(
        'relative flex flex-col justify-between border-r transition-all duration-300 select-none z-30',
        'bg-stone-50/80 dark:bg-stone-950/80 border-stone-200/80 dark:border-stone-800/80 backdrop-blur-md',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Brand Top Header */}
      <div>
        <div className="flex items-center justify-between px-4 py-4 border-b border-stone-200/60 dark:border-stone-800/60">
          <div className="flex items-center space-x-2.5 min-w-0">
            {/* ALINA Monogram Glyph */}
            <div className="w-8 h-8 rounded-lg bg-stone-900 dark:bg-stone-100 flex items-center justify-center text-white dark:text-stone-900 font-serif font-bold text-sm tracking-wider shadow-sm shrink-0">
              A
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-wider font-sans uppercase text-stone-900 dark:text-stone-100">
                  ALINA
                </div>
                <div className="text-[10px] text-stone-400 font-mono truncate">
                  Personal Companion
                </div>
              </div>
            )}
          </div>

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav aria-label="Sidebar Navigation" className="p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeItem === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={cn(
                  'w-full flex items-center rounded-lg text-xs font-medium transition-all duration-150 group relative select-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80',
                  collapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-3',
                  isActive
                    ? 'bg-white dark:bg-stone-900 text-stone-950 dark:text-stone-50 shadow-xs border border-stone-200/90 dark:border-stone-750 font-semibold'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/40 hover:text-stone-950 dark:hover:text-stone-200'
                )}
                title={collapsed ? item.label : undefined}
              >
                <div
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300'
                  )}
                >
                  {item.icon}
                </div>

                {!collapsed && (
                  <span className="truncate flex-1 text-left">{item.label}</span>
                )}

                {!collapsed && item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                    {item.badge}
                  </span>
                )}

                {/* Collapsed dot badge */}
                {collapsed && item.badge !== undefined && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Workspace Sandbox Status */}
      <div className="p-3 border-t border-stone-200/60 dark:border-stone-800/60">
        {!collapsed ? (
          <div className="p-2.5 rounded-lg bg-stone-100/80 dark:bg-stone-900/80 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
              <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                Jail Active
              </span>
              <span>Local-First</span>
            </div>
            <div className="text-[11px] font-sans font-medium text-stone-700 dark:text-stone-300 truncate flex items-center">
              <FolderLock className="w-3 h-3 mr-1 text-stone-400 shrink-0" />
              <span className="truncate">{workspacePath}</span>
            </div>
          </div>
        ) : (
          <div
            className="flex justify-center p-2 rounded-lg bg-stone-100/80 dark:bg-stone-900/80 text-emerald-600 dark:text-emerald-400"
            title={`Sandbox Enforced: ${workspacePath}`}
          >
            <FolderLock className="w-4 h-4" />
          </div>
        )}
      </div>
    </aside>
  );
}
