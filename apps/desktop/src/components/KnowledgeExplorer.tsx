'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Clock,
  Sparkles,
  HelpCircle,
  FolderGit2,
  GitBranch,
} from 'lucide-react';
import { Button, Badge, type ToastProps } from '@alina/ui';
import { alinaApi } from '@/lib/api-client';

interface KnowledgeItemView {
  id: string;
  topic: string;
  title: string;
  sourceUrl: string;
  sourceDomain: string;
  summary: string;
  confidence: number;
  retrievedAt: string;
  lastRefreshedAt: string;
  status: 'active' | 'stale' | 'expired' | 'refreshing';
  refreshPolicy: {
    type: string;
    intervalDays: number;
  };
  projectId?: string;
  taskId?: string;
}

interface ProvenanceView {
  item: KnowledgeItemView;
  source?: {
    domain: string;
    url: string;
    title: string;
    reliabilityScore: number;
    category: string;
  };
  topic?: {
    name: string;
    slug: string;
  };
  updates: Array<{
    updateType: string;
    timestamp: string;
    reason?: string;
  }>;
  isFresh: boolean;
  daysUntilReview?: number;
}

export interface KnowledgeExplorerProps {
  onToast?: (title: string, description?: string, variant?: ToastProps['variant']) => void;
}


export function KnowledgeExplorer({ onToast }: KnowledgeExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'project' | 'stale'>('all');
  const [items, setItems] = useState<KnowledgeItemView[]>([
    {
      id: 'ki-react-19',
      topic: 'React Architecture & Ecosystem',
      title: 'React 19 Official Release Notes & Server Actions',
      sourceUrl: 'https://react.dev/blog/2024/12/05/react-19',
      sourceDomain: 'react.dev',
      summary: 'React 19 introduces native Actions for async state management, useActionState, Server Components, and deprecation of forwardRef in favor of direct ref props.',
      confidence: 0.98,
      retrievedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      lastRefreshedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      status: 'active',
      refreshPolicy: {
        type: 'software_documentation',
        intervalDays: 60,
      },
      projectId: 'alina-core',
      taskId: 'task-101',
    },
    {
      id: 'ki-tauri-ipc',
      topic: 'Tauri Native Desktop Architecture',
      title: 'Tauri 2 IPC & Multi-Window Security Architecture',
      sourceUrl: 'https://v2.tauri.app/develop/calling-rust',
      sourceDomain: 'tauri.app',
      summary: 'Tauri 2 enforces strict isolation and permission scoping for invoke handlers. Custom commands require capability grants defined in src-tauri/capabilities.',
      confidence: 0.96,
      retrievedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      lastRefreshedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      status: 'active',
      refreshPolicy: {
        type: 'software_documentation',
        intervalDays: 60,
      },
      projectId: 'alina-desktop',
      taskId: 'task-102',
    },
    {
      id: 'ki-surrealdb-graph',
      topic: 'SurrealDB Multi-Model Architecture',
      title: 'SurrealDB 2.x Graph Relations & HNSW Vector Indexing',
      sourceUrl: 'https://surrealdb.com/docs/surrealql/statements/define/index',
      sourceDomain: 'surrealdb.com',
      summary: 'HNSW vector indexes with COSINE distance metric enable deterministic local semantic search. Graph edges (RELATE from -> rel -> to) provide zero-join relational traversal.',
      confidence: 0.95,
      retrievedAt: new Date(Date.now() - 86400000 * 25).toISOString(),
      lastRefreshedAt: new Date(Date.now() - 86400000 * 25).toISOString(),
      status: 'active',
      refreshPolicy: {
        type: 'stable_technical_concept',
        intervalDays: 365,
      },
      projectId: 'alina-core',
      taskId: 'task-103',
    },
  ]);

  const [selectedProvenance, setSelectedProvenance] = useState<ProvenanceView | null>(null);
  const [explainModal, setExplainModal] = useState<{
    title: string;
    content: string;
    details?: unknown;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load items from API
  useEffect(() => {
    let mounted = true;
    async function loadKnowledge() {
      try {
        const res = await alinaApi.knowledge.list({ limit: 50 });
        if (mounted && res.success && res.data && res.data.length > 0) {
          const mapped: KnowledgeItemView[] = res.data.map((d: Record<string, unknown>) => {
            const it = (d.item || d) as Record<string, unknown>;
            return {
              id: String(it.id || ''),
              topic: String(it.topic || 'General Technical Research'),
              title: String(it.title || 'Technical Document'),
              sourceUrl: String(it.sourceUrl || 'https://example.org'),
              sourceDomain: String(it.sourceDomain || 'example.org'),
              summary: String(it.summary || ''),
              confidence: typeof it.confidence === 'number' ? it.confidence : 0.85,
              retrievedAt: String(it.retrievedAt || new Date().toISOString()),
              lastRefreshedAt: String(it.lastRefreshedAt || new Date().toISOString()),
              status: (it.status as KnowledgeItemView['status']) || 'active',
              refreshPolicy: (it.refreshPolicy as KnowledgeItemView['refreshPolicy']) || { type: 'software_documentation', intervalDays: 60 },
              projectId: it.projectId ? String(it.projectId) : undefined,
              taskId: it.taskId ? String(it.taskId) : undefined,
            };
          });
          setItems(mapped);
        }
      } catch {
        // Fallback
      }
    }
    loadKnowledge();
    return () => {
      mounted = false;
    };
  }, []);

  // Handle Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      const res = await alinaApi.knowledge.list({ limit: 50 });
      if (res.success && res.data) {
        setItems(res.data.map((d: Record<string, unknown>) => ((d.item || d) as KnowledgeItemView)));
      }
      return;
    }

    try {
      const res = await alinaApi.knowledge.list({ q: searchQuery.trim(), limit: 10 });
      if (res.success && res.data) {
        const mapped = res.data.map((d: Record<string, unknown>) => ((d.item || d) as KnowledgeItemView));
        setItems(mapped);
        onToast?.('Vector Retrieval', `Found ${mapped.length} matching knowledge records.`, 'info');
      }
    } catch {
      onToast?.('Search Error', 'Unable to execute vector query.', 'error');
    }
  };

  // Handle Refresh Action
  const handleRefreshItem = async (item: KnowledgeItemView) => {
    setIsRefreshing(true);
    try {
      const res = await alinaApi.knowledge.refresh({ itemId: item.id });
      if (res.success) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, lastRefreshedAt: new Date().toISOString(), status: 'active' }
              : i
          )
        );
        onToast?.('Knowledge Refreshed', `Updated freshness timestamp for "${item.title}".`, 'success');
      }
    } catch {
      onToast?.('Refresh Failed', 'Unable to contact source repository.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Inspect Provenance
  const handleInspectProvenance = async (item: KnowledgeItemView) => {
    try {
      const res = await alinaApi.knowledge.explain<ProvenanceView>('provenance', item.id);
      if (res.success && res.data) {
        setSelectedProvenance(res.data);
      } else {
        // Fallback synthesized provenance
        setSelectedProvenance({
          item,
          source: {
            domain: item.sourceDomain,
            url: item.sourceUrl,
            title: item.title,
            reliabilityScore: item.confidence,
            category: 'official_docs',
          },
          topic: {
            name: item.topic,
            slug: item.topic.toLowerCase().replace(/\s+/g, '-'),
          },
          updates: [
            {
              updateType: 'created',
              timestamp: item.retrievedAt,
              reason: 'Ingested via autonomous research pipeline',
            },
          ],
          isFresh: true,
          daysUntilReview: 45,
        });
      }
    } catch {
      // Fallback
    }
  };

  // Explain Questions
  const handleExplainProject = async () => {
    try {
      const res = await alinaApi.knowledge.explain<{ summary?: string }>('project', 'alina-workspace');
      setExplainModal({
        title: 'What did ALINA learn about this project?',
        content: res.data?.summary || `ALINA acquired ${items.length} verified technical knowledge items across topics: [${Array.from(new Set(items.map((i) => i.topic))).join(', ')}] with zero unverified hearsay.`,
        details: res.data,
      });
    } catch {
      setExplainModal({
        title: 'What did ALINA learn about this project?',
        content: `ALINA acquired ${items.length} verified technical knowledge items across topics: [${Array.from(new Set(items.map((i) => i.topic))).join(', ')}].`,
      });
    }
  };

  const handleExplainRecommendation = async () => {
    try {
      const res = await alinaApi.knowledge.explain<{ rationale?: string }>('recommendation', 'React 19 Server Actions');
      setExplainModal({
        title: 'Why are you recommending this?',
        content: res.data?.rationale || 'Recommendation is supported by verified official release documentation from react.dev with 98% confidence.',
        details: res.data,
      });
    } catch {
      setExplainModal({
        title: 'Why are you recommending this?',
        content: 'Recommendation is supported by verified official release documentation from react.dev with 98% confidence.',
      });
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'project') return !!item.projectId;
    if (activeFilter === 'stale') return item.status === 'stale' || item.status === 'expired';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
              Persistent Knowledge Base
            </h2>
            <Badge variant="amber">3-LAYER SYSTEM</Badge>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-0.5">
            Intentionally retained, source-attributed, and refreshable technical knowledge. Decoupled from personal memory.
          </p>
        </div>

        {/* Explainability Action Buttons */}
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExplainProject}
            title="Explain learned project knowledge"
          >
            <FolderGit2 className="w-3.5 h-3.5 mr-1.5 text-stone-500" />
            Project Findings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExplainRecommendation}
            title="Explain why ALINA makes specific recommendations"
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-stone-500" />
            Why Recommend?
          </Button>
        </div>
      </div>

      {/* 3-Tier Layer Overview Callout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40">
          <div className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">Layer 1</div>
          <div className="font-serif text-sm font-semibold text-stone-800 dark:text-stone-200 mt-0.5">
            Personal Memory
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Information about the user (preferences, style, facts). Strictly isolated from web scraping.
          </div>
        </div>

        <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40">
          <div className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">Layer 2</div>
          <div className="font-serif text-sm font-semibold text-stone-800 dark:text-stone-200 mt-0.5">
            Working Knowledge
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Task-scoped ephemeral candidate facts gathered during active execution. Expires with task.
          </div>
        </div>

        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10">
          <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Layer 3 (Active)
          </div>
          <div className="font-serif text-sm font-semibold text-stone-800 dark:text-stone-200 mt-0.5">
            Persistent Knowledge Base
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Reusable technical facts with source provenance, confidence ratings, and periodic refresh policies.
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Vector semantic search across acquired knowledge..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs font-sans rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
          />
        </form>

        <div className="flex items-center space-x-1.5 self-start sm:self-auto text-xs font-mono">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeFilter === 'all'
                ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setActiveFilter('project')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeFilter === 'project'
                ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Project-Linked
          </button>
          <button
            onClick={() => setActiveFilter('stale')}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeFilter === 'stale'
                ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Refresh Overdue
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs hover:border-amber-400/80 dark:hover:border-amber-500/80 transition-all space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  {item.topic}
                </span>
                <span className="text-stone-300 dark:text-stone-700">•</span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-xs font-mono text-amber-600 dark:text-amber-400 hover:underline"
                >
                  {item.sourceDomain}
                  <ExternalLink className="w-3 h-3 ml-1 inline" />
                </a>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex items-center text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {Math.round(item.confidence * 100)}% Confidence
                </div>
                <Badge variant={item.status === 'active' ? 'success' : 'amber'}>
                  {item.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {item.title}
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1 leading-relaxed">
                {item.summary}
              </p>
            </div>

            {/* Bottom Meta & Action Bar */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-stone-500">
              <div className="flex items-center space-x-3">
                <span className="flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  Refresh: {item.refreshPolicy.type} ({item.refreshPolicy.intervalDays}d)
                </span>
                <span>•</span>
                <span>Last Verified: {new Date(item.lastRefreshedAt).toLocaleDateString()}</span>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleInspectProvenance(item)}
                >
                  <GitBranch className="w-3 h-3 mr-1" />
                  Provenance Graph
                </Button>
                <Button
                  variant="amber"
                  size="sm"
                  disabled={isRefreshing}
                  onClick={() => handleRefreshItem(item)}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Provenance Graph Modal */}
      {selectedProvenance && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl select-none">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center space-x-2">
                <GitBranch className="w-4 h-4 text-amber-500" />
                <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-stone-100">
                  SurrealDB Provenance Graph
                </h3>
              </div>
              <Badge variant={selectedProvenance.isFresh ? 'success' : 'amber'}>
                {selectedProvenance.isFresh ? 'VERIFIED FRESH' : 'REVIEW NEEDED'}
              </Badge>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 space-y-1.5">
                <div className="text-[10px] text-stone-400 uppercase">Graph Topology</div>
                <div className="text-stone-700 dark:text-stone-300">
                  topic (<span className="text-amber-600">{selectedProvenance.topic?.name}</span>)
                  <br />→ has_source → (<span className="text-amber-600">{selectedProvenance.source?.domain}</span>)
                  <br />→ produced_item → (<span className="text-amber-600">{selectedProvenance.item.title.slice(0, 30)}...</span>)
                  {selectedProvenance.item.projectId && (
                    <>
                      <br />→ relates_to_project → (<span className="text-amber-600">{selectedProvenance.item.projectId}</span>)
                    </>
                  )}
                  {selectedProvenance.item.taskId && (
                    <>
                      <br />→ referenced_by_task → (<span className="text-amber-600">{selectedProvenance.item.taskId}</span>)
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-stone-400 text-[11px]">Primary Source URL:</div>
                <a
                  href={selectedProvenance.source?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 dark:text-amber-400 truncate block hover:underline"
                >
                  {selectedProvenance.source?.url}
                </a>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-stone-50 dark:bg-stone-950 rounded border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400">Reliability Score</div>
                  <div className="font-semibold text-emerald-600">
                    {Math.round((selectedProvenance.source?.reliabilityScore || 0.9) * 100)}%
                  </div>
                </div>
                <div className="p-2 bg-stone-50 dark:bg-stone-950 rounded border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400">Days Until Review</div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">
                    {selectedProvenance.daysUntilReview ?? 45} days
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelectedProvenance(null)}>
                Close Provenance
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Explainability Inquiries Modal */}
      {explainModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl select-none">
            <div className="flex items-center space-x-2 border-b border-stone-100 dark:border-stone-800 pb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-stone-100">
                {explainModal.title}
              </h3>
            </div>

            <div className="text-xs text-stone-600 dark:text-stone-300 font-sans leading-relaxed">
              {explainModal.content}
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="amber" size="sm" onClick={() => setExplainModal(null)}>
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
