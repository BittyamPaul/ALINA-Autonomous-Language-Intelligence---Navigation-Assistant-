'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Tag,
  Clock,
  Sparkles,
  X,
  Layers,
  History,
  Loader2,
} from 'lucide-react';
import { alinaApi } from '@/lib/api-client';
import type { MemoryEntity, MemoryCategory, MemoryLayer } from '@alina/database';

interface ThingsAlinaRemembersProps {
  onToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
}

type LayerFilter = 'all' | 'semantic' | 'episodic' | 'conversation';

export function ThingsAlinaRemembers({ onToast }: ThingsAlinaRemembersProps) {
  const [memories, setMemories] = useState<MemoryEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState<LayerFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // New Memory Form State
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [newLayer, setNewLayer] = useState<MemoryLayer>('semantic');
  const [newImportance, setNewImportance] = useState(4);
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const res = await alinaApi.memories.list(
        activeLayer !== 'all' ? { layer: activeLayer } : undefined
      );
      if (res.success && res.data) {
        setMemories(res.data);
      }
    } catch {
      // Retain current
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemories();
  }, [activeLayer]);

  const handleForget = async (id: string, content: string) => {
    try {
      await alinaApi.memories.delete(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onToast('Memory Forgotten', `ALINA will no longer recall: "${content.slice(0, 35)}..."`, 'info');
    } catch {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onToast('Memory Forgotten', 'Removed from local memory graph.', 'info');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setSaving(true);
    try {
      const tagsArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const res = await alinaApi.memories.create({
        content: newContent.trim(),
        category: newCategory,
        layer: newLayer,
        importance: newImportance / 5,
        tags: tagsArray,
      });

      if (res.success && res.data) {
        const savedMemory: MemoryEntity = res.data;
        setMemories((prev) => [savedMemory, ...prev]);
        setNewContent('');
        setNewTags('');
        setIsCreating(false);
        onToast('Memory Stored', 'ALINA has learned and indexed new knowledge in SurrealDB.', 'success');
      } else {
        const err = res.error?.message || 'Failed to store memory';
        onToast('Extraction Rejected', err, 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onToast('Error Storing Memory', msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered memory list based on search query
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const lower = searchQuery.toLowerCase();
    return memories.filter(
      (m) =>
        m.content.toLowerCase().includes(lower) ||
        m.category.toLowerCase().includes(lower) ||
        (m.tags && m.tags.some((t) => t.toLowerCase().includes(lower)))
    );
  }, [memories, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: memories.length,
      semantic: memories.filter((m) => m.layer === 'semantic').length,
      episodic: memories.filter((m) => m.layer === 'episodic').length,
      conversation: memories.filter((m) => m.layer === 'conversation').length,
    };
  }, [memories]);

  const getCategoryBadgeColor = (category: MemoryCategory) => {
    switch (category) {
      case 'preference':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
      case 'rule':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20';
      case 'location':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
      case 'task_outcome':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
      case 'project_info':
      case 'project_context':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
      case 'recurring_task':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20';
      default:
        return 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/20';
    }
  };

  const getLayerBadge = (layer?: MemoryLayer) => {
    switch (layer) {
      case 'conversation':
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-stone-500 dark:text-stone-400">
            <Clock className="w-2.5 h-2.5 mr-1" />
            Conversation (24h TTL)
          </span>
        );
      case 'episodic':
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
            <History className="w-2.5 h-2.5 mr-1" />
            Episodic (Task History)
          </span>
        );
      case 'semantic':
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-mono text-purple-600 dark:text-purple-400">
            <Layers className="w-2.5 h-2.5 mr-1" />
            Semantic (Permanent)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-stone-200/80 dark:border-stone-800/80 pb-4 gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Brain className="w-5 h-5 text-amber-500" />
            <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
              Things Alina remembers
            </h2>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-1">
            Three conceptual layers: Semantic facts & user preferences, Episodic task outcomes, and Conversation context.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium transition-colors shadow-xs"
        >
          {isCreating ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
          <span>{isCreating ? 'Close Form' : 'Teach ALINA'}</span>
        </button>
      </div>

      {/* Teach ALINA Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center space-x-2 text-xs font-medium uppercase tracking-wider text-stone-700 dark:text-stone-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Teach ALINA New Knowledge</span>
            </div>
            <span className="text-[11px] font-mono text-stone-400">
              Extraction & Safety Rules Enforced
            </span>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              What should ALINA remember? (Secrets & transient chit-chat will be blocked)
            </label>
            <textarea
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g. I prefer strict TypeScript with no unnecessary any types, and pnpm as the package manager."
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-serif text-stone-800 dark:text-stone-200 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-stone-500 mb-1">Memory Layer:</label>
              <select
                value={newLayer}
                onChange={(e) => setNewLayer(e.target.value as MemoryLayer)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
              >
                <option value="semantic">Semantic (Permanent)</option>
                <option value="episodic">Episodic (Task Learning)</option>
                <option value="conversation">Conversation (Short-term)</option>
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">Category:</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
              >
                <option value="preference">User Preference</option>
                <option value="project_info">Project Information</option>
                <option value="location">Location / Path</option>
                <option value="recurring_task">Recurring Task</option>
                <option value="task_outcome">Task Outcome</option>
                <option value="rule">Strict Rule</option>
                <option value="fact">General Fact</option>
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">
                Importance: {newImportance}/5
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={newImportance}
                onChange={(e) => setNewImportance(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Tags (comma-separated):</label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="e.g. design, typescript, preferences"
              className="w-full p-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono text-stone-800 dark:text-stone-200"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
            >
              {saving ? 'Indexing...' : 'Save to Memory'}
            </button>
          </div>
        </form>
      )}

      {/* Layer Filter Tabs & Live Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center p-1 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono">
          <button
            onClick={() => setActiveLayer('all')}
            className={`px-3 py-1 rounded-md transition-all ${
              activeLayer === 'all'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setActiveLayer('semantic')}
            className={`px-3 py-1 rounded-md transition-all ${
              activeLayer === 'semantic'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Semantic ({stats.semantic})
          </button>
          <button
            onClick={() => setActiveLayer('episodic')}
            className={`px-3 py-1 rounded-md transition-all ${
              activeLayer === 'episodic'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Episodic ({stats.episodic})
          </button>
          <button
            onClick={() => setActiveLayer('conversation')}
            className={`px-3 py-1 rounded-md transition-all ${
              activeLayer === 'conversation'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Conversation ({stats.conversation})
          </button>
        </div>

        {/* Semantic Search Bar */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recalled memories..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 font-mono focus:outline-none focus:border-amber-500"
          />
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
          {loading && !searchQuery && (
            <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin absolute right-2.5 top-2.5" />
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Memory Items Grid */}
      {filteredMemories.length === 0 ? (
        <div className="py-12 text-center rounded-xl border border-dashed border-stone-300 dark:border-stone-800 space-y-2">
          <Brain className="w-8 h-8 mx-auto text-stone-400 stroke-1" />
          <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300">
            No memories match your filter
          </h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto font-serif">
            ALINA only retains meaningful facts, user preferences, locations, and learned task outcomes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => {
            const importanceDots = Math.round(mem.importance * 5);
            return (
              <div
                key={mem.id}
                className="group relative p-4 rounded-xl border transition-all duration-200 bg-white dark:bg-stone-900/90 border-stone-200/80 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${getCategoryBadgeColor(
                          mem.category
                        )}`}
                      >
                        {mem.category.replace('_', ' ')}
                      </span>
                      {getLayerBadge(mem.layer)}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <div className="flex items-center space-x-0.5" title={`Importance: ${(mem.importance * 100).toFixed(0)}%`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              i < importanceDots ? 'bg-amber-500 dark:bg-amber-400' : 'bg-stone-200 dark:bg-stone-800'
                            }`}
                          />
                        ))}
                      </div>

                      {/* Forget memory button */}
                      <button
                        onClick={() => handleForget(mem.id, mem.content)}
                        title="Forget this memory"
                        className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-2.5 text-sm text-stone-800 dark:text-stone-200 font-serif leading-relaxed">
                    {mem.content}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/60 flex items-center justify-between text-[10px] font-mono text-stone-400 dark:text-stone-500">
                  <div className="flex items-center space-x-1 truncate max-w-[60%]">
                    {mem.tags && mem.tags.length > 0 && (
                      <span className="flex items-center truncate">
                        <Tag className="w-2.5 h-2.5 mr-0.5" />
                        {mem.tags.slice(0, 2).join(', ')}
                        {mem.tags.length > 2 ? ` +${mem.tags.length - 2}` : ''}
                      </span>
                    )}
                  </div>

                  <span className="shrink-0">
                    {new Date(mem.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
