'use client';

import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Lock,
  RefreshCw,
  X,
  AlertCircle,
  ShieldCheck,
  Signal,
  CheckCircle2,
} from 'lucide-react';
import { Button, Badge, type ToastProps } from '@alina/ui';
import { NativeDesktopClient } from '@/lib/native-client';
import type { WifiNetwork, WifiConnectResult } from '@alina/shared';

const bridge = NativeDesktopClient.getInstance();

export interface WifiOnboardingDialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onConnected?: (ssid: string) => void;
  onToast?: (title: string, description?: string, variant?: ToastProps['variant']) => void;
}

export function WifiOnboardingDialog({
  isOpen,
  open,
  onClose,
  onOpenChange,
  onConnected,
  onToast,
}: WifiOnboardingDialogProps) {
  const isDialogOpen = open !== undefined ? open : (isOpen ?? false);
  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDialogOpen) {
      scanNetworks();
      setPassword('');
      setErrorMessage(null);
    }
  }, [isDialogOpen]);

  async function scanNetworks() {
    setScanning(true);
    setErrorMessage(null);
    try {
      const list = await bridge.scanWifiNetworks();
      setNetworks(list);
      if (list.length > 0 && !selectedSsid) {
        setSelectedSsid(list[0]?.ssid ?? '');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to scan available Wi-Fi networks.';
      setErrorMessage(msg);
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSsid) return;

    setConnecting(true);
    setErrorMessage(null);

    try {
      // Pass credentials directly to native OS bridge without logging or persistence
      const result: WifiConnectResult = await bridge.connectWifi(selectedSsid, password || undefined);

      // Memory clearance immediately
      setPassword('');

      if (result.success) {
        onToast?.(
          'Wi-Fi Connected',
          `Successfully connected to "${selectedSsid}". Internet capabilities restored.`,
          'success'
        );
        onConnected?.(selectedSsid);
        handleClose();
      } else {
        if (result.errorCode === 'invalid_credentials') {
          setErrorMessage('Invalid network security key or password. Please try again.');
        } else if (result.errorCode === 'permission_denied') {
          setErrorMessage('OS network permission denied. Administrator privileges required to manage network profiles.');
        } else {
          setErrorMessage(result.message || 'Failed to connect to network.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network connection error.';
      setErrorMessage(msg);
      setPassword('');
    } finally {
      setConnecting(false);
    }
  }

  if (!isDialogOpen) return null;

  const selectedNet = networks.find((n) => n.ssid === selectedSsid);
  const isProtected = selectedNet ? selectedNet.security !== 'open' : true;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs select-none"
    >
      <div className="w-full max-w-md bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <Wifi className="w-5 h-5" />
              </div>
              <h3 className="text-base font-serif font-semibold text-stone-900 dark:text-stone-100">
                Network Connection Required
              </h3>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 font-sans leading-relaxed pt-1">
              &quot;I can&apos;t reach the internet. Which Wi-Fi network would you like to connect to?&quot;
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security & Privacy Guarantee Callout */}
        <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 text-[11px] font-mono text-stone-500 space-y-0.5">
          <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero-Retention Credential Guard</span>
          </div>
          <p className="text-[10px] text-stone-400 font-sans">
            Credentials pass directly to the OS network API. Passwords are never saved in SurrealDB, never logged, never sent to LLMs, and wiped immediately.
          </p>
        </div>

        {/* Network Selection List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-stone-500">
            <span>Available Networks</span>
            <button
              type="button"
              onClick={scanNetworks}
              disabled={scanning}
              className="flex items-center space-x-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 text-[11px]"
            >
              <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
              <span>Rescan</span>
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {networks.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-stone-400 bg-stone-50 dark:bg-stone-950 rounded-lg border border-stone-200/60 dark:border-stone-800">
                {scanning ? 'Scanning nearby Wi-Fi networks...' : 'No Wi-Fi networks found.'}
              </div>
            ) : (
              networks.map((net) => (
                <button
                  key={net.ssid}
                  type="button"
                  onClick={() => {
                    setSelectedSsid(net.ssid);
                    setErrorMessage(null);
                  }}
                  className={`w-full p-2.5 rounded-lg text-left text-xs font-mono flex items-center justify-between border transition-all ${
                    selectedSsid === net.ssid
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200 font-semibold'
                      : 'bg-white dark:bg-stone-950 border-stone-200/80 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Signal className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{net.ssid}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0 text-[10px]">
                    {net.security !== 'open' ? (
                      <Lock className="w-3 h-3 text-stone-400" />
                    ) : (
                      <Badge variant="default">OPEN</Badge>
                    )}
                    <span className="text-stone-400">{net.signalPercent}%</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Password input if selected network is protected */}
        {selectedSsid && isProtected && (
          <form onSubmit={handleConnect} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label htmlFor="wifi-password-input" className="block text-xs font-mono text-stone-600 dark:text-stone-300">
                Password for <strong className="text-stone-900 dark:text-stone-100">{selectedSsid}</strong>
              </label>
              <input
                id="wifi-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter network security key"
                autoComplete="off"
                className="w-full text-xs font-mono p-2.5 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200/80 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-mono text-red-600 dark:text-red-400 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button variant="secondary" size="sm" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="amber" size="sm" type="submit" disabled={connecting || !password.trim()}>
                {connecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Open Network Connect Action */}
        {selectedSsid && !isProtected && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="amber" size="sm" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting...' : 'Connect to Open Network'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
