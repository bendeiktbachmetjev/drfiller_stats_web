import React from 'react';
import { t } from '../copy/index.js';

// The unfilled track is a lighter step of the fill colour, so the whole bar reads as one state.
const TRACKS = {
  brand: { md: 'h-2 rounded-full bg-brand/10 overflow-hidden', sm: 'h-1.5 rounded-full bg-brand/10 overflow-hidden' },
  rec: { md: 'h-2 rounded-full bg-rec/10 overflow-hidden', sm: 'h-1.5 rounded-full bg-rec/10 overflow-hidden' },
  warn: { md: 'h-2 rounded-full bg-warn-tint overflow-hidden', sm: 'h-1.5 rounded-full bg-warn-tint overflow-hidden' },
};

const FILLS = {
  brand: 'h-full rounded-full bg-brand transition-[width] duration-[400ms] ease-out motion-reduce:transition-none',
  rec: 'h-full rounded-full bg-rec transition-[width] duration-[400ms] ease-out motion-reduce:transition-none',
  warn: 'h-full rounded-full bg-warn transition-[width] duration-[400ms] ease-out motion-reduce:transition-none',
};

// Share of a whole as a thin bar.
//   value      0–1 (clamped; null counts as 0)
//   label      text on the left; without `label` and `valueLabel` only the bar is drawn
//   valueLabel text on the right ("64%"), also read out as the meter's value
//   size       'md' | 'sm'
//   tone       'brand' | 'rec' (live conversations) | 'warn' (near a limit)
//   ariaLabel  accessible name when there is no visible label
export default function Meter({ value, label, valueLabel, size = 'md', tone = 'brand', ariaLabel, className = '' }) {
  const ratio = typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(ratio * 1000) / 10;
  const track = (TRACKS[tone] || TRACKS.brand)[size === 'sm' ? 'sm' : 'md'];
  const fill = FILLS[tone] || FILLS.brand;
  // role="meter" must have a name, even for the bare bar in the Right now strip.
  const name = ariaLabel ?? (typeof label === 'string' && label ? label : t('common.share'));

  return (
    <div className={className}>
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-semibold text-ink-soft">{label}</span>
          <span className="text-xs font-bold text-ink tabular-nums">{valueLabel}</span>
        </div>
      )}
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={typeof valueLabel === 'string' ? valueLabel : `${percent}%`}
        className={track}
      >
        {/* A share above zero always shows at least a 2 px sliver. */}
        <div className={fill} style={{ width: `${percent}%`, minWidth: ratio > 0 ? 2 : 0 }} />
      </div>
    </div>
  );
}
