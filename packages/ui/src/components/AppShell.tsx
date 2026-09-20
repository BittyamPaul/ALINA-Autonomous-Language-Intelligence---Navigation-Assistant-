import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar, NavItemKey } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette, CommandPaletteItem } from './CommandPalette';
import { SettingsModal } from './SettingsModal';
import { ToastContainer, type ToastProps } from './Toast';
import { cn } from '../utils';

export interface AppShellProps {
  children: ReactNode;
  activeNav: NavItemKey;
  onNavSelect: (key: NavItemKey) => void;
  breadcrumbs?: string[];
  workspacePath?: string;
  taskCount?: number;
  pendingApprovalsCount?: number;
  commandPaletteItems?: CommandPaletteItem[];
  toasts?: ToastProps[];
  onCloseToast?: (id: string) => void;
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  className?: string;
}

export function AppShell({
  children,
  activeNav,
  onNavSelect,
  breadcrumbs = ['Overview', 'Today'],
  workspacePath = 'ALINA Local Project',
  taskCount = 2,
  pendingApprovalsCount = 0,
  commandPaletteItems,
  toasts = [],
  onCloseToast,
  theme = 'light',
  onThemeChange,
  className,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    onThemeChange?.(nextTheme);
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K for Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      // ⌘, or Ctrl+, for Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={cn(
        'flex h-screen w-screen overflow-hidden font-sans antialiased select-none',
        theme === 'dark' ? 'dark bg-[#0c0a09] text-stone-100' : 'bg-[#fafaf9] text-stone-900',
        className
      )}
    >
      {/* Editorial Sidebar */}
      <Sidebar
        activeItem={activeNav}
        onSelect={onNavSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        workspacePath={workspacePath}
        taskCount={taskCount}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar with drag support */}
        <TopBar
          breadcrumbs={breadcrumbs}
          theme={theme}
          onThemeToggle={toggleTheme}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        {/* Scrollable Content Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Command Palette (⌘K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandPaletteItems}
        onThemeToggle={toggleTheme}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        theme={theme}
        onThemeChange={onThemeChange}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={onCloseToast || (() => {})} />
    </div>
  );
}
