'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Sparkles,
  X,
  Loader2,
  Edit3,
  ThumbsUp,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { alinaApi } from '@/lib/api-client';
import type {
  MemoryEntity,
  MemoryCategory,
  MemoryLayer,
  EpistemicTier,
  LearningSettings,
} from '@alina/database';

interface ThingsAlinaRemembersProps {
  onToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
}

type LayerFilter = 'all' | 'semantic' | 'episodic' | 'conversation';
type TierFilter = 'all' | 'EXPLICIT' | 'OBSERVED' | 'INFERRED';

const ALL_CONCEPTUAL_CATEGORIES: Array<{ key: MemoryCategory; label: string; desc: string }> = [
  { key: 'PERSONAL_PREFERENCE', label: 'Personal Preference', desc: 'Direct user preferences & likes' },
  { key: 'WORK_STYLE', label: 'Work Style', desc: 'Workflow pace, pairing & execution habits' },
  { key: 'COMMUNICATION_STYLE', label: 'Communication Style', desc: 'Response brevity, tone & detail level' },
  { key: 'PROJECT_CONTEXT', label: 'Project Context', desc: 'Repositories, stacks, paths & structure' },
  { key: 'RECURRING_WORKFLOW', label: 'Recurring Workflow', desc: 'Periodic routines & schedules' },
  { key: 'TOOL_PREFERENCE', label: 'Tool Preference', desc: 'Editors, package managers & utilities' },
  { key: 'UI_PREFERENCE', label: 'UI Preference', desc: 'Theme, density, typography & view modes' },
  { key: 'TASK_PATTERN', label: 'Task Pattern', desc: 'Observed workflows & verification habits' },
  { key: 'EXPLICIT_FACT', label: 'Explicit Fact', desc: 'Confirmed user directives & key facts' },
  { key: 'TEMPORARY_CONTEXT', label: 'Temporary Context', desc: 'Short-term session context (24h TTL)' },
];

export function ThingsAlinaRemembers({ onToast }: ThingsAlinaRemembersProps) {
  const [memories, setMemories] = useState<MemoryEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LearningSettings>({
    learningEnabled: true,
    disabledCategories: [],
    inferentialLearningEnabled: true,
    updatedAt: new Date().toISOString(),
  });
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Filters
  const [activeLayer, setActiveLayer] = useState<LayerFilter>('all');
  const [activeTier, setActiveTier] = useState<TierFilter>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Forms
  const [isCreating, setIsCreating] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryEntity | null>(null);

  // Create Form State
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('PERSONAL_PREFERENCE');
  const [newLayer, setNewLayer] = useState<MemoryLayer>('semantic');
  const [newTier, setNewTier] = useState<EpistemicTier>('EXPLICIT');
  const [newImportance, setNewImportance] = useState(4);
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit / Correct Form State
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('PERSONAL_PREFERENCE');
  const [editTier, setEditTier] = useState<EpistemicTier>('EXPLICIT');
  const [editConfidence, setEditConfidence] = useState(1.0);
  const [editImportance, setEditImportance] = useState(4);
  const [editTags, setEditTags] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [memRes, setRes] = await Promise.all([
        alinaApi.memories.list(
          activeLayer !== 'all' ? { layer: activeLayer } : undefined
        ),
        alinaApi.memories.getSettings(),
      ]);

      if (memRes.success && memRes.data) {
        setMemories(memRes.data);
      }
      if (setRes.success && setRes.data) {
        setSettings(setRes.data);
      }
    } catch {
      // Retain current in-memory data on failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeLayer]);

  // Toggle Global Learning
  const handleToggleGlobalLearning = async () => {
    const nextState = !settings.learningEnabled;
    try {
      const res = await alinaApi.memories.updateSettings({ learningEnabled: nextState });
      if (res.success && res.data) {
        setSettings(res.data);
        onToast(
          nextState ? 'Personal Learning Enabled' : 'Personal Learning Paused',
          nextState
            ? 'ALINA will adaptively remember preferences from authorized tasks and conversations.'
            : 'ALINA will not persist new memories until re-enabled.',
          nextState ? 'success' : 'warning'
        );
      }
    } catch {
      setSettings((prev) => ({ ...prev, learningEnabled: nextState }));
      onToast('Settings Updated', `Learning set to ${nextState ? 'ENABLED' : 'PAUSED'}.`, 'info');
    }
  };

  // Toggle Category
  const handleToggleCategory = async (cat: MemoryCategory) => {
    const current = settings.disabledCategories || [];
    const isCurrentlyDisabled = current.includes(cat);
    const updated = isCurrentlyDisabled
      ? current.filter((c) => c !== cat)
      : [...current, cat];

    try {
      const res = await alinaApi.memories.updateSettings({ disabledCategories: updated });
      if (res.success && res.data) {
        setSettings(res.data);
        onToast(
          isCurrentlyDisabled ? 'Category Enabled' : 'Category Disabled',
          `Learning for ${cat.replace('_', ' ')} is now ${isCurrentlyDisabled ? 'ACTIVE' : 'MUTED'}.`,
          'info'
        );
      }
    } catch {
      setSettings((prev) => ({ ...prev, disabledCategories: updated }));
    }
  };

  // Delete Memory
  const handleForget = async (id: string, content: string) => {
    try {
      await alinaApi.memories.delete(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onToast('Memory Forgotten', `Removed from memory graph: "${content.slice(0, 35)}..."`, 'info');
    } catch {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onToast('Memory Forgotten', 'Removed from local memory graph.', 'info');
    }
  };

  // Reinforce Memory
  const handleReinforce = async (id: string) => {
    try {
      const res = await alinaApi.memories.reinforce(id, 0.1);
      if (res.success && res.data) {
        setMemories((prev) => prev.map((m) => (m.id === id ? res.data! : m)));
        onToast('Memory Reinforced', `Confidence boosted to ${((res.data.confidence ?? 1.0) * 100).toFixed(0)}%.`, 'success');
      }
    } catch {
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, confidence: Math.min(1.0, (m.confidence ?? 0.8) + 0.1) }
            : m
        )
      );
      onToast('Memory Reinforced', 'Memory confirmed and confidence boosted.', 'success');
    }
  };

  // Open Edit Modal
  const handleStartEdit = (mem: MemoryEntity) => {
    setEditingMemory(mem);
    setEditContent(mem.content);
    setEditCategory(mem.category);
    setEditTier(mem.epistemicTier ?? 'EXPLICIT');
    setEditConfidence(mem.confidence ?? 1.0);
    setEditImportance(Math.round((mem.importance ?? 0.8) * 5));
    setEditTags((mem.tags || []).join(', '));
  };

  // Submit Edit / Correct
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemory || !editContent.trim()) return;

    setEditSaving(true);
    try {
      const tagsArray = editTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const updates = {
        content: editContent.trim(),
        category: editCategory,
        epistemicTier: editTier,
        confidence: editConfidence,
        importance: editImportance / 5,
        tags: tagsArray,
      };

      const res = await alinaApi.memories.update(editingMemory.id, updates);
      if (res.success && res.data) {
        setMemories((prev) => prev.map((m) => (m.id === editingMemory.id ? res.data! : m)));
        setEditingMemory(null);
        onToast('Memory Corrected', 'Successfully updated and re-indexed in SurrealDB.', 'success');
      } else {
        const err = res.error?.message || 'Failed to update memory';
        onToast('Update Rejected', err, 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onToast('Error Updating Memory', msg, 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // Create Memory
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
        epistemicTier: newTier,
        importance: newImportance / 5,
        confidence: newTier === 'EXPLICIT' ? 1.0 : newTier === 'OBSERVED' ? 0.85 : 0.6,
        source: 'user_explicit',
        tags: tagsArray,
      });

      if (res.success && res.data) {
        const savedMemory: MemoryEntity = res.data;
        setMemories((prev) => [savedMemory, ...prev]);
        setNewContent('');
        setNewTags('');
        setIsCreating(false);
        onToast('Memory Stored', 'ALINA has indexed this preference with full provenance.', 'success');
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

  // Filtered memory list
  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      // Search filter
      if (searchQuery.trim()) {
        const lower = searchQuery.toLowerCase();
        const matchesContent = m.content.toLowerCase().includes(lower);
        const matchesCategory = m.category.toLowerCase().includes(lower);
        const matchesSource = (m.source || '').toLowerCase().includes(lower);
        const matchesTags = m.tags && m.tags.some((t) => t.toLowerCase().includes(lower));
        if (!matchesContent && !matchesCategory && !matchesSource && !matchesTags) {
          return false;
        }
      }

      // Tier filter
      if (activeTier !== 'all') {
        const tier = m.epistemicTier ?? 'EXPLICIT';
        if (tier !== activeTier) return false;
      }

      // Category filter
      if (activeCategory !== 'all') {
        if (m.category !== activeCategory) return false;
      }

      return true;
    });
  }, [memories, searchQuery, activeTier, activeCategory]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: memories.length,
      explicit: memories.filter((m) => (m.epistemicTier || 'EXPLICIT') === 'EXPLICIT').length,
      observed: memories.filter((m) => m.epistemicTier === 'OBSERVED').length,
      inferred: memories.filter((m) => m.epistemicTier === 'INFERRED').length,
    };
  }, [memories]);

  const getCategoryBadgeColor = (category: MemoryCategory) => {
    switch (category) {
      case 'PERSONAL_PREFERENCE':
      case 'preference':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
      case 'WORK_STYLE':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
      case 'COMMUNICATION_STYLE':
        return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20';
      case 'PROJECT_CONTEXT':
      case 'project_info':
      case 'project_context':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
      case 'RECURRING_WORKFLOW':
      case 'recurring_task':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20';
      case 'TOOL_PREFERENCE':
        return 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20';
      case 'UI_PREFERENCE':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20';
      case 'TASK_PATTERN':
      case 'task_outcome':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
      case 'TEMPORARY_CONTEXT':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20';
      case 'EXPLICIT_FACT':
      case 'fact':
      case 'rule':
      default:
        return 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/20';
    }
  };

  const getTierBadge = (tier?: EpistemicTier) => {
    switch (tier) {
      case 'INFERRED':
        return (
          <span
            title="Inferred preference with tempered phrasing (never asserted as confirmed fact)"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono border border-dashed border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
          >
            INFERRED
          </span>
        );
      case 'OBSERVED':
        return (
          <span
            title="Observed repeatedly during non-sensitive task execution"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
          >
            OBSERVED
          </span>
        );
      case 'EXPLICIT':
      default:
        return (
          <span
            title="Explicitly stated by operator"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold"
          >
            EXPLICIT
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 select-none">
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
            ALINA learns strictly from explicit conversations and authorized tasks. Zero ambient surveillance, credential harvesting, or unauthorized tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Global Learning Switch */}
          <button
            onClick={handleToggleGlobalLearning}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              settings.learningEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                : 'bg-stone-100 dark:bg-stone-900 text-stone-500 border-stone-300 dark:border-stone-800'
            }`}
            title="Global master switch for personal learning"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                settings.learningEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
              }`}
            />
            <span className="font-mono text-[11px]">
              LEARNING {settings.learningEnabled ? 'ENABLED' : 'PAUSED'}
            </span>
          </button>

          {/* Category Controls Popover Toggle */}
          <button
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              showSettingsDrawer
                ? 'bg-stone-200 dark:bg-stone-800 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100'
                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
            title="Manage per-category learning settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
            <span>Categories</span>
          </button>

          {/* Teach ALINA Button */}
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-medium transition-colors shadow-xs"
          >
            {isCreating ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            <span>{isCreating ? 'Close Form' : 'Teach ALINA'}</span>
          </button>
        </div>
      </div>

      {/* Per-Category Learning Settings Panel */}
      {showSettingsDrawer && (
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/60 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300 font-mono">
                Per-Category Learning Preferences
              </h4>
            </div>
            <span className="text-[11px] text-stone-500 font-serif">
              Disable any category to stop ALINA from indexing memories of that type.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {ALL_CONCEPTUAL_CATEGORIES.map((cat) => {
              const isDisabled = (settings.disabledCategories || []).includes(cat.key);
              return (
                <div
                  key={cat.key}
                  className={`p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                    isDisabled
                      ? 'bg-stone-100 dark:bg-stone-900/40 border-stone-200 dark:border-stone-800 opacity-60'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                      {cat.label}
                    </div>
                    <div className="text-[10px] text-stone-500 truncate font-sans">{cat.desc}</div>
                  </div>

                  <button
                    onClick={() => handleToggleCategory(cat.key)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors shrink-0 ${
                      isDisabled
                        ? 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isDisabled ? 'DISABLED' : 'ACTIVE'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Teach ALINA Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center space-x-2 text-xs font-medium uppercase tracking-wider text-stone-700 dark:text-stone-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Teach ALINA New Knowledge or Preference</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Privacy Sanitizer Active
            </span>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">
              Memory content (Credentials, private keys, and sensitive personal profiling are blocked by policy):
            </label>
            <textarea
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g. I prefer strict TypeScript with no arbitrary any types, and pnpm as the package manager."
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-serif text-stone-800 dark:text-stone-200 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-stone-500 mb-1">Category:</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
              >
                {ALL_CONCEPTUAL_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">Memory Layer:</label>
              <select
                value={newLayer}
                onChange={(e) => setNewLayer(e.target.value as MemoryLayer)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
              >
                <option value="semantic">Semantic (Permanent)</option>
                <option value="episodic">Episodic (Task History)</option>
                <option value="conversation">Conversation (24h TTL)</option>
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">Epistemic Tier:</label>
              <select
                value={newTier}
                onChange={(e) => setNewTier(e.target.value as EpistemicTier)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
              >
                <option value="EXPLICIT">EXPLICIT (Fact)</option>
                <option value="OBSERVED">OBSERVED (Habit)</option>
                <option value="INFERRED">INFERRED (Hypothesis)</option>
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
              placeholder="e.g. typescript, architecture, pnpm"
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

      {/* Edit / Correct Memory Modal */}
      {editingMemory && (
        <form
          onSubmit={handleSaveEdit}
          className="p-5 rounded-xl bg-white dark:bg-stone-900 border-2 border-amber-500/60 space-y-4 shadow-lg"
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 font-mono">
              <Edit3 className="w-3.5 h-3.5" />
              <span>Correct or Refine Learned Memory</span>
            </div>
            <span className="text-[11px] font-mono text-stone-400">ID: {editingMemory.id}</span>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Corrected Content:</label>
            <textarea
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-serif text-stone-800 dark:text-stone-200 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-stone-500 mb-1">Category:</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
              >
                {ALL_CONCEPTUAL_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">Epistemic Tier:</label>
              <select
                value={editTier}
                onChange={(e) => {
                  const val = e.target.value as EpistemicTier;
                  setEditTier(val);
                  if (val === 'EXPLICIT') setEditConfidence(1.0);
                  else if (val === 'OBSERVED') setEditConfidence(0.85);
                  else setEditConfidence(0.65);
                }}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
              >
                <option value="EXPLICIT">EXPLICIT (Promote to Confirmed Fact)</option>
                <option value="OBSERVED">OBSERVED (Repeated Habit)</option>
                <option value="INFERRED">INFERRED (Tempered Hypothesis)</option>
              </select>
            </div>

            <div>
              <label className="block text-stone-500 mb-1">
                Confidence: {(editConfidence * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(editConfidence * 100)}
                onChange={(e) => setEditConfidence(parseInt(e.target.value, 10) / 100)}
                className="w-full mt-2 accent-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Tags (comma-separated):</label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              className="w-full p-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono text-stone-800 dark:text-stone-200"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingMemory(null)}
              className="px-3 py-1.5 rounded-lg text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
            >
              {editSaving ? 'Updating...' : 'Save Corrections'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Tier & Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono">
            <button
              onClick={() => setActiveTier('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTier === 'all'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setActiveTier('EXPLICIT')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTier === 'EXPLICIT'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Explicit ({stats.explicit})
            </button>
            <button
              onClick={() => setActiveTier('OBSERVED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTier === 'OBSERVED'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Observed ({stats.observed})
            </button>
            <button
              onClick={() => setActiveTier('INFERRED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTier === 'INFERRED'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs font-medium'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Inferred ({stats.inferred})
            </button>
          </div>

          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-mono text-stone-700 dark:text-stone-300 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {ALL_CONCEPTUAL_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={activeLayer}
            onChange={(e) => setActiveLayer(e.target.value as LayerFilter)}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-mono text-stone-700 dark:text-stone-300 focus:outline-none"
          >
            <option value="all">All Layers</option>
            <option value="semantic">Semantic</option>
            <option value="episodic">Episodic</option>
            <option value="conversation">Conversation</option>
          </select>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recalled preferences..."
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
            ALINA only retains meaningful user preferences, working habits, and authorized task outcomes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => {
            const importanceDots = Math.round((mem.importance ?? 0.8) * 5);
            const confidencePercent = Math.round((mem.confidence ?? 1.0) * 100);

            return (
              <div
                key={mem.id}
                className="group relative p-4 rounded-xl border transition-all duration-200 bg-white dark:bg-stone-900/90 border-stone-200/80 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700 shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${getCategoryBadgeColor(
                          mem.category
                        )}`}
                      >
                        {mem.category.replace('_', ' ')}
                      </span>
                      {getTierBadge(mem.epistemicTier)}
                    </div>

                    {/* Confidence, Importance Dots & Actions */}
                    <div className="flex items-center space-x-1.5">
                      <div className="flex items-center space-x-0.5" title={`Importance: ${importanceDots}/5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              i < importanceDots ? 'bg-amber-500 dark:bg-amber-400' : 'bg-stone-200 dark:bg-stone-800'
                            }`}
                          />
                        ))}
                      </div>

                      <span
                        className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                        title="Model confidence score"
                      >
                        {confidencePercent}%
                      </span>

                      {/* Reinforce button */}
                      <button
                        onClick={() => handleReinforce(mem.id)}
                        title="Reinforce: Boost confidence"
                        className="p-1 rounded text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit button */}
                      <button
                        onClick={() => handleStartEdit(mem)}
                        title="Edit or correct memory"
                        className="p-1 rounded text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Forget button */}
                      <button
                        onClick={() => handleForget(mem.id, mem.content)}
                        title="Forget this memory"
                        className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <p className="mt-2.5 text-sm text-stone-800 dark:text-stone-200 font-serif leading-relaxed">
                    {mem.content}
                  </p>
                </div>

                {/* Footer: Provenance & Timestamps */}
                <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/60 flex items-center justify-between text-[10px] font-mono text-stone-400 dark:text-stone-500">
                  <div className="flex items-center space-x-1.5 truncate max-w-[65%]">
                    {mem.source && (
                      <span
                        className="truncate bg-stone-50 dark:bg-stone-800 px-1 py-0.5 rounded border border-stone-200/40 dark:border-stone-700/40"
                        title={`Provenance: ${mem.source}`}
                      >
                        src: {mem.source}
                      </span>
                    )}
                    {mem.tags && mem.tags.length > 0 && (
                      <span className="truncate">
                        {mem.tags.slice(0, 2).join(', ')}
                        {mem.tags.length > 2 ? ` +${mem.tags.length - 2}` : ''}
                      </span>
                    )}
                  </div>

                  <span className="shrink-0">
                    {mem.last_used_at
                      ? `used ${new Date(mem.last_used_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                      : new Date(mem.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
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
