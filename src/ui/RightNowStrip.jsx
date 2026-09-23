import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import InfoHint from './InfoHint.jsx';
import LiveDot from './LiveDot.jsx';
import Meter from './Meter.jsx';

const REFRESH_CLASS =
  'sf-hit w-8 h-8 flex items-center justify-center rounded-full border border-line text-ink-soft hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// The value is re-keyed so a changed number fades in instead of snapping.
function Cell({ value, label, meter }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span key={value} className="sf-fade text-xl font-extrabold leading-none text-ink tabular-nums">
          {value ?? fmt.empty}
        </span>
        {meter && (
          <span className="w-12" aria-hidden="true">
            <Meter tone={meter.tone ?? 'rec'} size="sm" value={meter.value} />
          </span>
        )}
      </div>
      <div className="mt-1 text-xs font-semibold text-ink-soft">{label}</div>
    </div>
  );
}

/**
 * Live strip ("Right now"): period-independent, all accounts, refreshed every 60 s (§3.2).
 * Pages build the cells from `useLive().today` / `.data`, so each page chooses what it shows:
 *   cells    [{ key, value: string|null, label: string, meter?: { value: 0..1, tone? } }]
 *   live     the useLive() result (status, error, isStale, updatedAt, refresh)
 *   compact  one line of cells (Recording); the full strip is for Models
 *   hintKey  (i) text, default 'common.liveNow'
 * Before the first answer every value is "—", so the strip already has its final height.
 */
export default function RightNowStrip({ cells = [], live, compact = false, hintKey = 'common.liveNow' }) {
  const { error = null, isStale = false, updatedAt = null, refresh, data = null } = live || {};
  const failed = Boolean(isStale || error);
  const leadText = failed ? t('common.live.failed') : t('common.live.lead');

  return (
    <section
      data-print="hide"
      aria-label={t('common.live.aria')}
      className={[
        'mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[20px] bg-surface border border-line/60 shadow-[0_4px_12px_rgba(65,65,65,0.06)]',
        compact ? 'px-4 py-2.5' : 'px-5 py-3',
      ].join(' ')}
    >
      <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-rec/10 text-xs font-bold text-ink">
        <LiveDot active={!failed && Boolean(data)} />
        <span>
          {leadText}
          {updatedAt ? ` · ${fmt.time(updatedAt)}` : ''}
        </span>
      </div>

      {cells.map((cell) => (
        <Cell key={cell.key} value={data ? cell.value : null} label={cell.label} meter={data ? cell.meter : null} />
      ))}

      <div className="ml-auto flex items-center gap-2">
        {failed && typeof refresh === 'function' && (
          <button type="button" aria-label={t('common.live.refresh')} onClick={() => refresh()} className={REFRESH_CLASS}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <InfoHint hintKey={hintKey} label={t('common.live.lead')} />
      </div>
    </section>
  );
}
