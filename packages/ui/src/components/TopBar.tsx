import {
  Search,
  Sun,
  Moon,
  Settings,
  ShieldCheck,
  Cpu,
  Menu,
} from 'lucide-react';
import { cn } from '../utils';

export interface TopBarProps {
  breadcrumbs?: string[];
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  pendingApprovalsCount?: number;
  onToggleMobileMenu?: () => void;
  className?: string;
}

export function TopBar({
  breadcrumbs = ['Workspace', 'Active Plan'],
  theme,
  onThemeToggle,
  onOpenCommandPalette,
  onOpenSettings,
  pendingApprovalsCount = 0,
  onToggleMobileMenu,
  className,
}: TopBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        'h-12 border-b px-3 sm:px-4 flex items-center justify-between select-none z-20 shrink-0',
        'bg-white/80 dark:bg-stone-900/80 border-stone-200/80 dark:border-stone-800/80 backdrop-blur-md',
        className
      )}
    >
      {/* Left: Mobile Menu Toggle + Breadcrumb / Location */}
      <div className="flex items-center space-x-2 text-xs font-sans text-stone-500 dark:text-stone-400 truncate">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <span className="font-semibold text-stone-900 dark:text-stone-100 shrink-0">ALINA</span>
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb} className="flex items-center space-x-2">
            <span className="text-stone-300 dark:text-stone-700">/</span>
            <span
              className={
                i === breadcrumbs.length - 1
                  ? 'font-medium text-stone-800 dark:text-stone-200'
                  : ''
              }
            >
              {crumb}
            </span>
          </div>
        ))}
      </div>

      {/* Center: Command Palette Trigger */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-stone-100/90 dark:bg-stone-850/70 border border-stone-200/80 dark:border-stone-750 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 transition-all text-xs w-64 justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
        aria-label="Open command palette (Ctrl+K or Cmd+K)"
      >
        <span className="flex items-center">
          <Search className="w-3.5 h-3.5 mr-2 text-stone-400" />
          <span>Quick actions & search...</span>
        </span>
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-stone-500 bg-white dark:bg-stone-800 rounded border border-stone-200 dark:border-stone-700 shadow-2xs">
          ⌘K
        </kbd>
      </button>

      {/* Right: Actions & Status */}
      <div className="flex items-center space-x-2">
        {/* System Health Status */}
        <div
          className="hidden sm:flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono text-stone-600 dark:text-stone-400 bg-stone-100/70 dark:bg-stone-850 border border-stone-200/70 dark:border-stone-800"
          title="Local SurrealDB & Tauri Engine"
        >
          <Cpu className="w-3 h-3 text-emerald-600 dark:text-emerald-400 mr-1" />
          <span>SurrealDB + Rust</span>
        </div>

        {/* Approval Safety Gate Alert Counter */}
        {pendingApprovalsCount > 0 && (
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 shadow-2xs"
            title={`${pendingApprovalsCount} action requires human authorization`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{pendingApprovalsCount} Action Gated</span>
          </div>
        )}

        {/* Theme Switcher: Warm Light <-> Charcoal Dark */}
        <button
          type="button"
          onClick={onThemeToggle}
          className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
          title={theme === 'light' ? 'Switch to Charcoal Dark mode' : 'Switch to Warm Light mode'}
          aria-label={theme === 'light' ? 'Switch to Charcoal Dark mode' : 'Switch to Warm Light mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4 text-stone-600" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </button>

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/80"
          title="System Preferences (Cmd+,)"
          aria-label="System Preferences"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
