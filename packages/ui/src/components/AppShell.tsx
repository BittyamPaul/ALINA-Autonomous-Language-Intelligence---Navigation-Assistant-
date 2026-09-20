'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  Compass,
  CheckSquare,
  Activity,
  Brain,
  Settings,
  X,
} from 'lucide-react';
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
  // Voice & Persona settings pass-through
  voiceEnabled?: boolean;
  onVoiceEnabledChange?: (enabled: boolean) => void;
  wakeWordEnabled?: boolean;
  onWakeWordEnabledChange?: (enabled: boolean) => void;
  voiceSpeed?: number;
  onVoiceSpeedChange?: (speed: number) => void;
  voiceVolume?: number;
  onVoiceVolumeChange?: (volume: number) => void;
  selectedVoiceId?: string;
  onSelectedVoiceIdChange?: (voiceId: string) => void;
  availableVoices?: Array<{ id: string; name: string; lang: string; gender?: string }>;
  transcriptDebugMode?: boolean;
  onTranscriptDebugModeChange?: (enabled: boolean) => void;
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
  voiceEnabled = true,
  onVoiceEnabledChange,
  wakeWordEnabled = false,
  onWakeWordEnabledChange,
  voiceSpeed = 1.0,
  onVoiceSpeedChange,
  voiceVolume = 1.0,
  onVoiceVolumeChange,
  selectedVoiceId,
  onSelectedVoiceIdChange,
  availableVoices = [],
  transcriptDebugMode = false,
  onTranscriptDebugModeChange,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      {/* Desktop & Tablet Sidebar (Hidden on small mobile screens < 768px) */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar
          activeItem={activeNav}
          onSelect={onNavSelect}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          workspacePath={workspacePath}
          taskCount={taskCount}
        />
      </div>

      {/* Mobile Drawer Overlay (< 768px) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex-1 max-w-[280px] w-full bg-stone-50 dark:bg-stone-950 z-10 shadow-2xl h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between p-3 border-b border-stone-200 dark:border-stone-800">
              <span className="font-semibold text-xs tracking-wider uppercase text-stone-500 font-mono">Navigation</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Sidebar
              activeItem={activeNav}
              onSelect={(k) => {
                onNavSelect(k);
                setMobileMenuOpen(false);
              }}
              collapsed={false}
              workspacePath={workspacePath}
              taskCount={taskCount}
              className="border-r-0 h-full w-full"
            />
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar with mobile hamburger and drag support */}
        <TopBar
          breadcrumbs={breadcrumbs}
          theme={theme}
          onThemeToggle={toggleTheme}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        {/* Scrollable Content Viewport with mobile safe-area insets */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (< 768px: Android & iOS) */}
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden flex items-center justify-around border-t bg-white/95 dark:bg-stone-950/95 border-stone-200 dark:border-stone-850 backdrop-blur-md px-1 py-1 z-30 shrink-0 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        >
          <button
            type="button"
            onClick={() => onNavSelect('home')}
            className={cn(
              'flex flex-col items-center justify-center min-w-[48px] min-h-[48px] py-1 px-2 rounded-lg text-[10px] font-medium transition-colors',
              activeNav === 'home'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            )}
            aria-label="Home"
          >
            <Compass className="w-5 h-5 mb-0.5" />
            <span>Home</span>
          </button>
          <button
            type="button"
            onClick={() => onNavSelect('tasks')}
            className={cn(
              'relative flex flex-col items-center justify-center min-w-[48px] min-h-[48px] py-1 px-2 rounded-lg text-[10px] font-medium transition-colors',
              activeNav === 'tasks'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            )}
            aria-label="Tasks"
          >
            <CheckSquare className="w-5 h-5 mb-0.5" />
            <span>Tasks</span>
            {taskCount > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-mono font-bold">
                {taskCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavSelect('activity')}
            className={cn(
              'flex flex-col items-center justify-center min-w-[48px] min-h-[48px] py-1 px-2 rounded-lg text-[10px] font-medium transition-colors',
              activeNav === 'activity'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            )}
            aria-label="Execution Stream"
          >
            <Activity className="w-5 h-5 mb-0.5" />
            <span>Stream</span>
          </button>
          <button
            type="button"
            onClick={() => onNavSelect('memory')}
            className={cn(
              'flex flex-col items-center justify-center min-w-[48px] min-h-[48px] py-1 px-2 rounded-lg text-[10px] font-medium transition-colors',
              activeNav === 'memory'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            )}
            aria-label="Semantic Memory"
          >
            <Brain className="w-5 h-5 mb-0.5" />
            <span>Memory</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] py-1 px-2 rounded-lg text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span>Settings</span>
          </button>
        </nav>
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
        voiceEnabled={voiceEnabled}
        onVoiceEnabledChange={onVoiceEnabledChange}
        wakeWordEnabled={wakeWordEnabled}
        onWakeWordEnabledChange={onWakeWordEnabledChange}
        voiceSpeed={voiceSpeed}
        onVoiceSpeedChange={onVoiceSpeedChange}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={onVoiceVolumeChange}
        selectedVoiceId={selectedVoiceId}
        onSelectedVoiceIdChange={onSelectedVoiceIdChange}
        availableVoices={availableVoices}
        transcriptDebugMode={transcriptDebugMode}
        onTranscriptDebugModeChange={onTranscriptDebugModeChange}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={onCloseToast || (() => {})} />
    </div>
  );
}
