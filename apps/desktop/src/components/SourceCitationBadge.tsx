'use client';

import React from 'react';
import { Globe, ExternalLink, ShieldCheck, Clock } from 'lucide-react';

export interface SourceCitationProps {
  url: string;
  title: string;
  domain: string;
  confidence?: number;
  retrievedAt?: string;
  category?: string;
  onClick?: () => void;
}

export function SourceCitationBadge({
  url,
  title,
  domain,
  confidence = 0.9,
  retrievedAt,
  category: _category = 'official_docs',
  onClick,
}: SourceCitationProps) {
  const percentConfidence = Math.round(confidence * 100);

  const formatFreshness = (isoString?: string) => {
    if (!isoString) return 'Verified';
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div
      onClick={onClick}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-amber-400/80 dark:hover:border-amber-500/80 transition-colors cursor-pointer group shadow-xs select-none"
      title={`Source: ${title} (${url})`}
    >
      <div className="flex items-center text-amber-600 dark:text-amber-400">
        <Globe className="w-3.5 h-3.5 mr-1" />
        <span className="font-semibold">{domain}</span>
      </div>

      <span className="text-stone-400 dark:text-stone-600">|</span>

      <span className="text-stone-700 dark:text-stone-300 truncate max-w-[180px] font-sans">
        {title}
      </span>

      <span className="text-stone-400 dark:text-stone-600">|</span>

      <div className="flex items-center text-[11px] text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="w-3 h-3 mr-0.5" />
        <span>{percentConfidence}%</span>
      </div>

      {retrievedAt && (
        <>
          <span className="text-stone-400 dark:text-stone-600">|</span>
          <div className="flex items-center text-[11px] text-stone-500 dark:text-stone-400">
            <Clock className="w-3 h-3 mr-0.5" />
            <span>{formatFreshness(retrievedAt)}</span>
          </div>
        </>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-stone-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors ml-0.5"
        title="Open external source"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
