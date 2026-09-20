'use client';

import React, { useState } from 'react';
import { MemoryRecord } from '@alina/shared';
import { Brain, Search, Tag, Star } from 'lucide-react';

interface MemoryDrawerProps {
  memories: MemoryRecord[];
  onSearch: (query: string) => void;
}

export function MemoryDrawer({ memories, onSearch }: MemoryDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const getCategoryColor = (category: MemoryRecord['category']) => {
    switch (category) {
      case 'preference':
        return 'bg-amber-950/60 text-amber-400 border-amber-800/40';
      case 'project_context':
        return 'bg-stone-800 text-stone-300 border-stone-700';
      case 'workflow_pattern':
        return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';
      default:
        return 'bg-stone-900 text-stone-400 border-stone-800';
    }
  };

  return (
    <div className="rounded-xl bg-stone-900/50 border border-stone-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-300">
            Semantic Memory Graph
          </h3>
        </div>
        <span className="text-xs font-mono text-stone-500">
          {memories.length} memories indexed
        </span>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter semantic memories..."
          className="w-full bg-stone-950/80 border border-stone-800 text-xs text-stone-200 placeholder:text-stone-500 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-500/50"
        />
        <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-2.5" />
      </form>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span
                className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded border ${getCategoryColor(
                  mem.category
                )}`}
              >
                {mem.category.replace('_', ' ')}
              </span>
              <span className="flex items-center text-[10px] font-mono text-amber-500/80">
                <Star className="w-2.5 h-2.5 mr-1 fill-amber-500/80" />
                {(mem.importance * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-xs text-stone-300 line-clamp-2 leading-relaxed">
              {mem.content}
            </p>
            {mem.tags.length > 0 && (
              <div className="flex items-center space-x-1.5 pt-1">
                {mem.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-mono text-stone-500 flex items-center"
                  >
                    <Tag className="w-2.5 h-2.5 mr-0.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {memories.length === 0 && (
          <div className="py-4 text-center text-xs text-stone-500 italic font-serif">
            No memories matched your query.
          </div>
        )}
      </div>
    </div>
  );
}
