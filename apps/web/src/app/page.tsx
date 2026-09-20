import React from 'react';
import { Button, Badge, Card } from '@alina/ui';
import { Sparkles, ShieldCheck } from 'lucide-react';

export default function WebHomePage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <div className="flex items-center space-x-2">
          <Badge variant="amber">ALINA Web</Badge>
          <span className="text-xs font-mono text-stone-500">v0.1.0</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-100 font-sans">
          Autonomous Language Intelligence & Navigation Assistant
        </h1>
        <p className="text-sm text-stone-400 font-serif italic">
          A local-first personal computer companion designed with editorial calm and Linear-inspired precision.
        </p>
      </header>

      <Card className="p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-stone-800 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-200">
              Web Companion Portal
            </h2>
            <p className="text-xs text-stone-400">
              Connected to the local monorepo core packages.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 pt-2">
          <Button variant="primary">
            Launch Desktop App
          </Button>
          <Button variant="secondary">
            View Documentation
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between text-xs font-mono text-stone-500 pt-8 border-t border-stone-800">
        <span className="flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Local-First Zero-Trust Architecture</span>
        </span>
        <span>Turborepo Monorepo</span>
      </div>
    </main>
  );
}
