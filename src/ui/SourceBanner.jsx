import React from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { t } from '../copy/index.js';

/** Which sentence a source state gets (null = nothing to say). */
export function sourceMessageKey(name, status) {
  if (!status || status === 'ok') return null;
  const table = {
    revenue: { off: 'common.source.revenueOff', error: 'common.source.revenueError', test: 'common.source.stripeTest' },
    soniox: { off: 'common.source.sonioxOff', error: 'common.source.sonioxError', limited: 'common.source.sonioxError' },
    config: { error: 'common.source.configOff', off: 'common.source.configOff' },
    usage: { limited: 'common.error.limited' },
    costs: { error: 'common.source.costsError' },
    settings: { error: 'common.source.settingsError' },
  };
  return table[name]?.[status] ?? null;
}

/**
 * Calm banner for a source that is off, failing, limited or in test mode (§3.2).
 *   source  { status, reason? }   name  'revenue' | 'soniox' | 'config' | 'usage' | 'costs' | 'settings'
 *   values  formatted placeholders (config: { date: fmt.date(prices.CHECKED_AT) }), action  { label, to }
 */
export default function SourceBanner({ source, name, values, action, className = '' }) {
  const key = sourceMessageKey(name, source?.status);
  if (!key) return null;
  const text = t(key, values);
  return (
    <div role="status" className={['mb-4 flex items-start gap-3 px-4 py-3 rounded-[16px] bg-warn-tint', className].filter(Boolean).join(' ')}>
      <Info className="w-5 h-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
      <p className="min-w-0 text-sm font-semibold text-ink-soft">{text}</p>
      {action?.to && action.label && (
        <Link to={action.to} className="ml-auto shrink-0 rounded-[6px] text-sm font-bold text-brand hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {action.label}
        </Link>
      )}
    </div>
  );
}
