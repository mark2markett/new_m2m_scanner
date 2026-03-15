'use client';

import type { SpyRelativeStrength } from '@/lib/types';

interface SpyRSBadgeProps {
  spyRS: SpyRelativeStrength | null | undefined;
  compact?: boolean;
}

const LABEL_STYLES: Record<SpyRelativeStrength['label'], string> = {
  leading: 'bg-[#00E59B]/15 text-[#00E59B] border border-[#00E59B]/30',
  inline:  'bg-[#6B7280]/15 text-[#9CA3AF] border border-[#6B7280]/30',
  lagging: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

export function SpyRSBadge({ spyRS, compact = false }: SpyRSBadgeProps) {
  if (!spyRS) return <span className="text-[#6B7280] text-xs">—</span>;

  const style = LABEL_STYLES[spyRS.label];

  if (compact) {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${style}`}>
        {spyRS.label.charAt(0).toUpperCase() + spyRS.label.slice(1)}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}>
        vs SPY: {spyRS.label.charAt(0).toUpperCase() + spyRS.label.slice(1)}
      </span>
      <div className="flex gap-2 text-[10px] text-[#6B7280]">
        <span title="10-day RS vs SPY">10d {formatRS(spyRS.rs10d)}</span>
        <span title="20-day RS vs SPY">20d {formatRS(spyRS.rs20d)}</span>
        <span title="50-day RS vs SPY">50d {formatRS(spyRS.rs50d)}</span>
      </div>
    </div>
  );
}

function formatRS(rs: number): string {
  if (rs === 0) return '—';
  const pct = (rs - 1) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}
