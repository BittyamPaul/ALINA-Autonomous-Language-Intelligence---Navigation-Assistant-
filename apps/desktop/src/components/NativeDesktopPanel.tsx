'use client';

import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Cpu,
  HardDrive,
  Camera,
  Terminal,
  MousePointer,
  Keyboard,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  Play,
  CheckCircle2,
} from 'lucide-react';
import {
  NativeSystemInfo,
  NativeAuditEvent,
  NativeAppLaunchResult,
  NativeScreenshotResult,
  NativeInputResult,
} from '@alina/shared';
import { NativeDesktopClient } from '@/lib/native-client';

const bridge = NativeDesktopClient.getInstance();
const WHITELIST_APPS = ['calc', 'notepad', 'code', 'explorer', 'terminal', 'mspaint'] as const;

export function NativeDesktopPanel() {
  const [isTauri, setIsTauri] = useState(false);
  const [sysInfo, setSysInfo] = useState<NativeSystemInfo | null>(null);
  const [auditLog, setAuditLog] = useState<NativeAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // App launch form state
  const [selectedApp, setSelectedApp] = useState<(typeof WHITELIST_APPS)[number]>('calc');
  const [launchArgs, setLaunchArgs] = useState('');

  // Input simulation state
  const [keyboardText, setKeyboardText] = useState('Hello from ALINA');
  const [keyCombination, setKeyCombination] = useState('Ctrl+S');
  const [mouseX, setMouseX] = useState(640);
  const [mouseY, setMouseY] = useState(480);
  const [mouseAction, setMouseAction] = useState<'click' | 'move' | 'double_click'>('click');

  const refreshSystemInfo = async () => {
    setLoading(true);
    try {
      const info = await bridge.getNativeSystemInfo();
      setSysInfo(info);
      setAuditLog(bridge.getAuditLog());
      setStatusMessage('Native telemetry refreshed successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error fetching system info: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsTauri(bridge.isTauriAvailable());
    refreshSystemInfo();
  }, []);

  const handleLaunchApp = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const args = launchArgs.trim() ? launchArgs.trim().split(/\s+/) : [];
      const res: NativeAppLaunchResult = await bridge.launchApplication({
        appName: selectedApp,
        args,
      });
      setAuditLog(bridge.getAuditLog());
      setStatusMessage(`Launched "${res.appName}" (PID: ${res.pid}) at ${res.launchedAt.slice(11, 19)}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Launch rejected: ${msg}`);
      setAuditLog(bridge.getAuditLog());
    } finally {
      setLoading(false);
    }
  };

  const handleCaptureScreenshot = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res: NativeScreenshotResult = await bridge.captureNativeScreenshot({ displayIndex: 0 });
      setAuditLog(bridge.getAuditLog());
      setStatusMessage(`Captured screenshot (${res.width}x${res.height}, ${(res.byteSize / 1024).toFixed(1)} KB) -> ${res.filePath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Screenshot failed: ${msg}`);
      setAuditLog(bridge.getAuditLog());
    } finally {
      setLoading(false);
    }
  };

  const handleKeyboardInput = async (mode: 'text' | 'combo') => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const input = mode === 'text' ? { text: keyboardText } : { keyCombination };
      const res: NativeInputResult = await bridge.sendControlledKeyboard(input);
      setAuditLog(bridge.getAuditLog());
      setStatusMessage(`Keyboard input: ${res.details}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Keyboard event rejected: ${msg}`);
      setAuditLog(bridge.getAuditLog());
    } finally {
      setLoading(false);
    }
  };

  const handleMouseInput = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res: NativeInputResult = await bridge.sendControlledMouse({
        action: mouseAction,
        x: mouseX,
        y: mouseY,
        button: 'left',
      });
      setAuditLog(bridge.getAuditLog());
      setStatusMessage(`Mouse input: ${res.details}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Mouse event rejected: ${msg}`);
      setAuditLog(bridge.getAuditLog());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Tauri 2 Native Desktop Bridge
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                  isTauri
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                }`}
              >
                {isTauri ? 'Native Window (Tauri IPC)' : 'Desktop Simulation Mode'}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Secure native execution layer with strict whitelist, argument sanitization, and audit logging.
            </p>
          </div>
        </div>

        <button
          onClick={refreshSystemInfo}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-200/80 hover:bg-stone-200 dark:bg-stone-800 hover:dark:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Status feedback message */}
      {statusMessage && (
        <div className="flex items-center space-x-2 p-3 rounded-lg bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {/* System Telemetry Metrics */}
      {sysInfo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80">
            <div className="flex items-center space-x-2 text-stone-500 text-xs mb-1">
              <Monitor className="w-3.5 h-3.5" />
              <span>OS & Platform</span>
            </div>
            <div className="text-sm font-mono font-medium text-stone-800 dark:text-stone-200">
              {sysInfo.os} ({sysInfo.arch})
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5 truncate">{sysInfo.hostname}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80">
            <div className="flex items-center space-x-2 text-stone-500 text-xs mb-1">
              <Cpu className="w-3.5 h-3.5" />
              <span>Logical Processors</span>
            </div>
            <div className="text-sm font-mono font-medium text-stone-800 dark:text-stone-200">
              {sysInfo.cpuCount} Cores
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">CPU Architecture</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80">
            <div className="flex items-center space-x-2 text-stone-500 text-xs mb-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>System Memory</span>
            </div>
            <div className="text-sm font-mono font-medium text-stone-800 dark:text-stone-200">
              {sysInfo.memoryTotalMb.toLocaleString()} MB
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">Physical RAM</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80">
            <div className="flex items-center space-x-2 text-stone-500 text-xs mb-1">
              <Monitor className="w-3.5 h-3.5" />
              <span>Primary Display</span>
            </div>
            <div className="text-sm font-mono font-medium text-stone-800 dark:text-stone-200">
              {sysInfo.displays[0]?.width ?? 1920}x{sysInfo.displays[0]?.height ?? 1080}
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Scale: {sysInfo.displays[0]?.scaleFactor ?? 1.0}x
            </div>
          </div>
        </div>
      )}

      {/* Controlled Native Commands Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Whitelist App Launcher */}
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-stone-600 dark:text-stone-400" />
              <h4 className="text-xs font-medium uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Approved Application Launcher
              </h4>
            </div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Requires Approval
            </span>
          </div>

          <p className="text-xs text-stone-500">
            Launches whitelisted productivity tools in detached background processes.
          </p>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <label className="text-xs text-stone-500 w-16">App:</label>
              <select
                value={selectedApp}
                onChange={(e) => setSelectedApp(e.target.value as (typeof WHITELIST_APPS)[number])}
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
              >
                {WHITELIST_APPS.map((app) => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-xs text-stone-500 w-16">Args:</label>
              <input
                type="text"
                value={launchArgs}
                onChange={(e) => setLaunchArgs(e.target.value)}
                placeholder="Optional safe args"
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
              />
            </div>

            <button
              onClick={handleLaunchApp}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch {selectedApp}</span>
            </button>
          </div>
        </div>

        {/* Screen Capture & Native Input */}
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-stone-600 dark:text-stone-400" />
              <h4 className="text-xs font-medium uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Native Screen Capture
              </h4>
            </div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Requires Approval
            </span>
          </div>

          <p className="text-xs text-stone-500">
            Captures the active monitor display and archives to the current session.
          </p>

          <button
            onClick={handleCaptureScreenshot}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Capture Desktop Display</span>
          </button>

          <div className="pt-2 border-t border-stone-100 dark:border-stone-800/60 space-y-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
                <div className="flex items-center space-x-1">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Controlled Keyboard</span>
                </div>
                <div className="space-x-1">
                  <button
                    onClick={() => handleKeyboardInput('combo')}
                    className="px-2 py-0.5 text-[11px] rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono hover:bg-stone-200"
                  >
                    Send Shortcut
                  </button>
                  <button
                    onClick={() => handleKeyboardInput('text')}
                    className="px-2 py-0.5 text-[11px] rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono hover:bg-stone-200"
                  >
                    Type Text
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <input
                  type="text"
                  value={keyCombination}
                  onChange={(e) => setKeyCombination(e.target.value)}
                  placeholder="e.g. Ctrl+S"
                  className="px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono text-stone-800 dark:text-stone-200"
                />
                <input
                  type="text"
                  value={keyboardText}
                  onChange={(e) => setKeyboardText(e.target.value)}
                  placeholder="Text to type"
                  className="px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono text-stone-800 dark:text-stone-200"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100 dark:border-stone-800/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
                <div className="flex items-center space-x-1">
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Controlled Mouse</span>
                </div>
                <button
                  onClick={handleMouseInput}
                  className="px-2 py-0.5 text-[11px] rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono hover:bg-stone-200"
                >
                  Dispatch Mouse Event
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                <input
                  type="number"
                  value={mouseX}
                  onChange={(e) => setMouseX(parseInt(e.target.value, 10) || 0)}
                  placeholder="X"
                  className="px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                />
                <input
                  type="number"
                  value={mouseY}
                  onChange={(e) => setMouseY(parseInt(e.target.value, 10) || 0)}
                  placeholder="Y"
                  className="px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                />
                <select
                  value={mouseAction}
                  onChange={(e) => setMouseAction(e.target.value as 'click' | 'move' | 'double_click')}
                  className="px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                >
                  <option value="click">click</option>
                  <option value="move">move</option>
                  <option value="double_click">dblclick</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Native Command Audit Trail */}
      <div className="p-4 rounded-xl bg-white dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h4 className="text-xs font-medium uppercase tracking-wider text-stone-700 dark:text-stone-300">
              Native Security & Audit Event Stream
            </h4>
          </div>
          <span className="text-[11px] font-mono text-stone-400">
            {auditLog.length} Event(s) Recorded
          </span>
        </div>

        {auditLog.length === 0 ? (
          <div className="py-6 text-center text-xs text-stone-400 font-mono">
            No native commands issued in current session.
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-xs">
            {auditLog.slice().reverse().map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 dark:bg-stone-950/60 border border-stone-200/60 dark:border-stone-800/60"
              >
                <div className="flex items-center space-x-2.5 truncate max-w-[70%]">
                  {evt.permission_tier === 'Safe' ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : evt.permission_tier === 'RequiresApproval' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <ShieldX className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  )}
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    {evt.command}
                  </span>
                  <span className="text-stone-400 truncate">{evt.details}</span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      evt.outcome === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {evt.outcome}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    {evt.timestamp.slice(11, 19)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
