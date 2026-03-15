'use client';

import { useState, useEffect } from 'react';
import { ListFilter } from 'lucide-react';
import type { WatchlistMeta } from '@/lib/types';

interface WatchlistSelectorProps {
  selectedId: string;
  onChange: (id: string) => void;
}

export function WatchlistSelector({ selectedId, onChange }: WatchlistSelectorProps) {
  const [watchlists, setWatchlists] = useState<WatchlistMeta[]>([]);

  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.ok ? r.json() : [])
      .then((data: WatchlistMeta[]) => setWatchlists(data))
      .catch(() => {/* ignore */});
  }, []);

  if (watchlists.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <ListFilter className="h-4 w-4 text-[#6B7280] shrink-0" />
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        className="bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-sm text-[#E5E7EB] focus:outline-none focus:border-[#00E59B]/50 min-w-[240px]"
        aria-label="Select watchlist"
      >
        {watchlists.map(w => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
