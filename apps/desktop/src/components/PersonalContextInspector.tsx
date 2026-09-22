'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Network,
  Brain,
  Search,
  Trash2,
  HelpCircle,
  Clock,
  ShieldCheck,
  Eye,
  RefreshCw,
  FolderGit2,
  Cpu,
  BookmarkCheck,
  Workflow,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react';
import { alinaApi } from '@/lib/api-client';
import type {
  UnifiedPersonalContextGraph,
  PersonalContextNodeEntity,
  PersonalContextExplanation,
  ContextUsageRecordEntity,
  PersonalContextNodeType,
} from '@alina/shared';

interface PersonalContextInspectorProps {
  onToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
  activeConversationId?: string;
  isMemoryDisabled?: boolean;
  onToggleMemoryDisabled?: (disabled: boolean) => void;
}

const NODE_TYPE_COLORS: Record<PersonalContextNodeType, { bg: string; text: string; border: string }> = {
  USER: { bg: 'bg-stone-100 dark:bg-stone-800', text: 'text-stone-800 dark:text-stone-200', border: 'border-stone-300 dark:border-stone-700' },
  PROJECT: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800/60' },
  TECHNOLOGY: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-800/60' },
  PREFERENCE: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800/60' },
  WORKFLOW: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800/60' },
  CONCEPT: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-800 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-800/60' },
  TASK: { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-800/60' },
  KNOWLEDGE: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-800/60' },
  CONVERSATION: { bg: 'bg-stone-50 dark:bg-stone-900', text: 'text-stone-700 dark:text-stone-300', border: 'border-stone-200 dark:border-stone-800' },
  VOICE_SESSION: { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800/60' },
};

function getNodeIcon(type: PersonalContextNodeType) {
  switch (type) {
    case 'USER':
      return <Brain className="w-3.5 h-3.5" />;
    case 'PROJECT':
      return <FolderGit2 className="w-3.5 h-3.5" />;
    case 'TECHNOLOGY':
      return <Cpu className="w-3.5 h-3.5" />;
    case 'PREFERENCE':
      return <BookmarkCheck className="w-3.5 h-3.5" />;
    case 'WORKFLOW':
      return <Workflow className="w-3.5 h-3.5" />;
    case 'CONCEPT':
      return <Sparkles className="w-3.5 h-3.5" />;
    default:
      return <Info className="w-3.5 h-3.5" />;
  }
}

export function PersonalContextInspector({
  onToast,
  activeConversationId,
  isMemoryDisabled: propIsMemoryDisabled,
  onToggleMemoryDisabled,
}: PersonalContextInspectorProps) {
  const [graph, setGraph] = useState<UnifiedPersonalContextGraph>({
    nodes: [],
    edges: [],
    rootUserId: 'user_default',
    generatedAt: new Date().toISOString(),
  });
  const [usages, setUsages] = useState<ContextUsageRecordEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'graph' | 'nodes' | 'usages'>('graph');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<PersonalContextNodeEntity | null>(null);
  const [explanation, setExplanation] = useState<PersonalContextExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);

  // Per-conversation killswitch local state
  const [localMemoryDisabled, setLocalMemoryDisabled] = useState(propIsMemoryDisabled ?? false);

  useEffect(() => {
    if (propIsMemoryDisabled !== undefined) {
      setLocalMemoryDisabled(propIsMemoryDisabled);
    }
  }, [propIsMemoryDisabled]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [graphRes, usagesRes] = await Promise.all([
        alinaApi.personalContext.getUnifiedGraph(),
        alinaApi.personalContext.getRecentUsages(30),
      ]);

      if (graphRes.success && graphRes.data) {
        setGraph(graphRes.data);
      }
      if (usagesRes.success && usagesRes.data) {
        setUsages(usagesRes.data);
      }
    } catch {
      onToast('Error loading personal context', 'Could not retrieve graph from database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExplain = async (nodeId: string) => {
    setExplaining(true);
    setExplanation(null);
    try {
      const res = await alinaApi.personalContext.explain(nodeId);
      if (res.success && res.data) {
        setExplanation(res.data);
      } else {
        onToast('Explain Failed', res.error?.message || 'Unable to retrieve provenance', 'warning');
      }
    } catch {
      onToast('Explain Failed', 'Network or service error', 'error');
    } finally {
      setExplaining(false);
    }
  };

  const handleForget = async (nodeId: string, nodeName: string) => {
    setForgetting(nodeId);
    try {
      const res = await alinaApi.personalContext.forget(nodeId);
      if (res.success) {
        onToast(
          'Memory Forgotten',
          `Deleted "${nodeName}" and ${res.data?.edgesDeleted ?? 0} connected edge(s).`,
          'success'
        );
        // Refresh local graph state
        setGraph((prev) => ({
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== nodeId),
          edges: prev.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
        }));
        if (selectedNode?.id === nodeId) {
          setSelectedNode(null);
          setExplanation(null);
        }
      } else {
        onToast('Deletion Failed', res.error?.message || 'Could not forget node', 'error');
      }
    } catch {
      onToast('Deletion Failed', 'Network or service error', 'error');
    } finally {
      setForgetting(null);
    }
  };

  const handleToggleMemory = async () => {
    const nextState = !localMemoryDisabled;
    setLocalMemoryDisabled(nextState);

    if (activeConversationId) {
      try {
        const res = await alinaApi.conversations.toggleMemory(activeConversationId, nextState);
        if (res.success) {
          onToast(
            nextState ? 'Memory Disabled for Session' : 'Memory Enabled for Session',
            nextState
              ? 'ALINA will operate in Zero-Context mode for this conversation.'
              : 'ALINA will utilize personal context graph and project memory.',
            nextState ? 'warning' : 'success'
          );
        }
      } catch {
        onToast('Update Failed', 'Could not persist conversation memory setting.', 'error');
      }
    }

    if (onToggleMemoryDisabled) {
      onToggleMemoryDisabled(nextState);
    }
  };

  const filteredNodes = useMemo(() => {
    return graph.nodes.filter((node) => {
      const matchesType = selectedType === 'ALL' || node.type === selectedType;
      const matchesSearch =
        searchQuery === '' ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.description && node.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [graph.nodes, selectedType, searchQuery]);

  const nodeDegreeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of graph.edges) {
      map.set(e.fromNodeId, (map.get(e.fromNodeId) || 0) + 1);
      map.set(e.toNodeId, (map.get(e.toNodeId) || 0) + 1);
    }
    return map;
  }, [graph.edges]);

  return (
    <div className="space-y-6 select-none">
      {/* Header & Killswitch Banner */}
      <div className="bg-stone-50 dark:bg-stone-900/60 p-5 rounded-xl border border-stone-200/80 dark:border-stone-800/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-serif font-medium text-stone-900 dark:text-stone-100">
                  Personal Operating System & Context Graph
                </h3>
                <p className="text-xs text-stone-500 font-sans">
                  Unified memory graph: Projects, Technologies, Preferences, Workflows & Task Provenance.
                </p>
              </div>
            </div>
          </div>

          {/* Per-Conversation Memory Toggle */}
          <div className="flex items-center space-x-3 bg-white dark:bg-stone-950 px-3.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800">
            <div className="text-right">
              <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
                {localMemoryDisabled ? 'Zero-Context Mode' : 'Operating Graph Active'}
              </div>
              <div className="text-[10px] text-stone-400 font-mono">
                {localMemoryDisabled ? 'Memory Bypass On' : 'Bounded Retrieval'}
              </div>
            </div>
            <button
              onClick={handleToggleMemory}
              title={localMemoryDisabled ? 'Enable memory for this session' : 'Disable memory for this session'}
              className="focus:outline-hidden transition-transform active:scale-95"
            >
              {localMemoryDisabled ? (
                <ToggleLeft className="w-7 h-7 text-amber-600 dark:text-amber-500" />
              ) : (
                <ToggleRight className="w-7 h-7 text-emerald-600 dark:text-emerald-500" />
              )}
            </button>
          </div>
        </div>

        {/* Invariant & Decoupling Guarantees */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-stone-200/60 dark:border-stone-800/60 text-xs">
          <div className="flex items-center space-x-2 text-stone-600 dark:text-stone-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Zero New Surveillance: No external collectors.</span>
          </div>
          <div className="flex items-center space-x-2 text-stone-600 dark:text-stone-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Prompt Precedence: Instructions override memory.</span>
          </div>
          <div className="flex items-center space-x-2 text-stone-600 dark:text-stone-400">
            <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>Relevance Budget: Max 5 candidates per prompt.</span>
          </div>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 bg-stone-100 dark:bg-stone-900 p-1 rounded-lg border border-stone-200/80 dark:border-stone-800/80">
          <button
            onClick={() => setActiveTab('graph')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'graph'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Graph Relations ({graph.edges.length})
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'nodes'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Nodes & Provenance ({graph.nodes.length})
          </button>
          <button
            onClick={() => setActiveTab('usages')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'usages'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Context Usages ({usages.length})
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search context nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-hidden focus:ring-1 focus:ring-stone-400"
            />
          </div>

          <button
            onClick={loadData}
            title="Refresh graph"
            className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="p-12 text-center text-xs text-stone-400 font-mono">
          Loading personal context graph...
        </div>
      ) : activeTab === 'graph' ? (
        /* Graph Visual Relationships View */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 space-y-3">
              <div className="text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">
                Graph Relations ({graph.edges.length} Edges)
              </div>
              {graph.edges.length === 0 ? (
                <div className="text-xs text-stone-400 py-8 text-center">
                  No relationships established in graph yet. As you interact and run tasks, relations will form naturally.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {graph.edges.map((edge) => {
                    const fromNode = graph.nodes.find((n) => n.id === edge.fromNodeId);
                    const toNode = graph.nodes.find((n) => n.id === edge.toNodeId);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/50 dark:bg-stone-950/40 text-xs hover:border-stone-300 dark:hover:border-stone-700 transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => fromNode && setSelectedNode(fromNode)}
                            className="font-medium text-stone-900 dark:text-stone-100 hover:underline flex items-center space-x-1"
                          >
                            <span>{fromNode?.name || edge.fromNodeId}</span>
                          </button>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            {edge.relation}
                          </span>
                          <button
                            onClick={() => toNode && setSelectedNode(toNode)}
                            className="font-medium text-stone-900 dark:text-stone-100 hover:underline"
                          >
                            {toNode?.name || edge.toNodeId}
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-stone-400">
                          weight: {edge.weight.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Context Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['PROJECT', 'PREFERENCE', 'WORKFLOW', 'TECHNOLOGY'] as PersonalContextNodeType[]).map((t) => {
                const count = graph.nodes.filter((n) => n.type === t).length;
                const colors = NODE_TYPE_COLORS[t];
                return (
                  <div
                    key={t}
                    onClick={() => {
                      setSelectedType(t);
                      setActiveTab('nodes');
                    }}
                    className={`p-3 rounded-lg border ${colors.border} ${colors.bg} cursor-pointer hover:shadow-xs transition-all`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-medium ${colors.text}`}>{t}</span>
                      {getNodeIcon(t)}
                    </div>
                    <div className={`text-lg font-serif font-semibold mt-1 ${colors.text}`}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Node Detail & Provenance Inspector Drawer */}
          <div className="bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800/60 pb-3">
              <div className="text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">
                Context Inspector
              </div>
              {selectedNode && (
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setExplanation(null);
                  }}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        NODE_TYPE_COLORS[selectedNode.type]?.border
                      } ${NODE_TYPE_COLORS[selectedNode.type]?.bg} ${NODE_TYPE_COLORS[selectedNode.type]?.text}`}
                    >
                      {selectedNode.type}
                    </span>
                    <span className="text-[10px] font-mono text-stone-400">
                      {nodeDegreeMap.get(selectedNode.id) || 0} connection(s)
                    </span>
                  </div>
                  <h4 className="text-sm font-serif font-medium text-stone-900 dark:text-stone-100 mt-2">
                    {selectedNode.name}
                  </h4>
                  {selectedNode.description && (
                    <p className="text-stone-500 mt-1">{selectedNode.description}</p>
                  )}
                </div>

                {/* Explanation / "Why do you remember this?" */}
                <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-950/60 border border-stone-200/60 dark:border-stone-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-stone-700 dark:text-stone-300 font-medium">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Why do you remember this?</span>
                    </div>
                    {!explanation && !explaining && (
                      <button
                        onClick={() => handleExplain(selectedNode.id)}
                        className="text-[11px] font-mono text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        Explain
                      </button>
                    )}
                  </div>

                  {explaining && (
                    <div className="text-[11px] text-stone-400 font-mono">
                      Tracing provenance graph...
                    </div>
                  )}

                  {explanation && (
                    <div className="space-y-1.5 text-[11px] text-stone-600 dark:text-stone-400 pt-1">
                      <div>
                        <strong className="text-stone-800 dark:text-stone-200">Justification: </strong>
                        {explanation.whyRemembered}
                      </div>
                      <div>
                        <strong className="text-stone-800 dark:text-stone-200">Source: </strong>
                        <span className="font-mono">{explanation.source}</span>
                      </div>
                      {explanation.originalStatement && (
                        <div>
                          <strong className="text-stone-800 dark:text-stone-200">Original Prompt: </strong>
                          <span className="italic">"{explanation.originalStatement}"</span>
                        </div>
                      )}
                      <div>
                        <strong className="text-stone-800 dark:text-stone-200">Confidence: </strong>
                        {(explanation.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-200/60 dark:border-stone-800/60">
                  <button
                    onClick={() => handleExplain(selectedNode.id)}
                    className="flex items-center space-x-1.5 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Provenance</span>
                  </button>

                  <button
                    onClick={() => handleForget(selectedNode.id, selectedNode.name)}
                    disabled={forgetting === selectedNode.id}
                    className="flex items-center space-x-1.5 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{forgetting === selectedNode.id ? 'Forgetting...' : 'Forget This'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-stone-400 py-12 text-center space-y-1">
                <HelpCircle className="w-6 h-6 mx-auto opacity-40 mb-2" />
                <p>Select any node to inspect why ALINA remembers it, view its provenance, or forget it.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'nodes' ? (
        /* Nodes List View */
        <div className="bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-stone-200/60 dark:border-stone-800/60">
            {['ALL', 'PROJECT', 'PREFERENCE', 'WORKFLOW', 'TECHNOLOGY', 'CONCEPT', 'TASK'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-md transition-all ${
                  selectedType === t
                    ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 font-semibold'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredNodes.length === 0 ? (
              <div className="text-xs text-stone-400 py-8 text-center">
                No context nodes match your current filter.
              </div>
            ) : (
              filteredNodes.map((node) => {
                const colors = NODE_TYPE_COLORS[node.type];
                return (
                  <div
                    key={node.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/40 dark:bg-stone-950/30 gap-2 hover:border-stone-300 dark:hover:border-stone-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${colors?.border} ${colors?.bg} ${colors?.text}`}
                        >
                          {node.type}
                        </span>
                        <h4 className="text-xs font-serif font-medium text-stone-900 dark:text-stone-100">
                          {node.name}
                        </h4>
                        <span className="text-[10px] font-mono text-stone-400">
                          {(node.confidence * 100).toFixed(0)}% conf
                        </span>
                      </div>
                      {node.description && (
                        <p className="text-[11px] text-stone-500">{node.description}</p>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => {
                          setSelectedNode(node);
                          handleExplain(node.id);
                        }}
                        className="text-[11px] font-mono text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center space-x-1"
                      >
                        <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Why?</span>
                      </button>

                      <button
                        onClick={() => handleForget(node.id, node.name)}
                        disabled={forgetting === node.id}
                        className="text-[11px] font-mono text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center space-x-1 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Forget</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Context Usages Log View */
        <div className="bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 space-y-3">
          <div className="text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">
            Context Usages in Recent Tasks ({usages.length})
          </div>
          <p className="text-xs text-stone-500">
            Transparency log of personal context records that were recalled to inform supervisor planning.
          </p>

          {usages.length === 0 ? (
            <div className="text-xs text-stone-400 py-8 text-center">
              No context usages recorded yet. Context will be automatically logged when tasks execute.
            </div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {usages.map((usage) => (
                <div
                  key={usage.id}
                  className="p-3 rounded-lg border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/40 dark:bg-stone-950/30 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          NODE_TYPE_COLORS[usage.nodeType]?.border
                        } ${NODE_TYPE_COLORS[usage.nodeType]?.bg} ${NODE_TYPE_COLORS[usage.nodeType]?.text}`}
                      >
                        {usage.nodeType}
                      </span>
                      <span className="font-serif font-medium text-stone-900 dark:text-stone-100">
                        {usage.nodeName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-stone-400">
                      {new Date(usage.usedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-600 dark:text-stone-400">
                    <strong className="text-stone-700 dark:text-stone-300">Justification: </strong>
                    {usage.justification}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 pt-1 border-t border-stone-200/40 dark:border-stone-800/40">
                    <span>Task: {usage.taskId}</span>
                    {usage.overriddenByPrompt && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        Overridden by Prompt
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
