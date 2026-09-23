import React from 'react';
import { UserCheck } from 'lucide-react';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { doctorName } from '../../format/items.js';
import { useSuggestionDismissed } from './hooks.js';

const BUTTON = 'relative inline-flex items-center h-9 px-4 rounded-full text-[13px] font-bold transition-colors after:absolute after:-inset-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * First-run question (§4.8, OVERRIDES O3): "{email} made 87% of all forms. Is this your account?"
 * [Mark as mine] saves the mark on the server; [No] hides the row on this device.
 * @param {{ row: { pid: string, share: number } | undefined, ds: object|null, busy: boolean,
 *   onMark: (pid: string, on: boolean) => void }} props
 */
export default function SuggestionRow({ row, ds, busy, onMark }) {
  const [dismissed, dismiss] = useSuggestionDismissed(row?.pid ?? null);
  if (!row || dismissed) return null;
  return (
    <div role="group" aria-label={t('doctors.suggestion.yes')} className="flex flex-col gap-3 rounded-[16px] border border-warn/25 bg-warn-tint p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-3 text-sm font-semibold text-ink">
        <UserCheck className="w-5 h-5 shrink-0 text-warn mt-px" aria-hidden="true" />
        <span className="min-w-0 sf-wrap-any">{t('doctors.suggestion', { name: doctorName(ds, row.pid), share: fmt.pct(row.share) })}</span>
      </p>
      <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
        <button type="button" disabled={busy} onClick={() => onMark(row.pid, true)} className={`${BUTTON} bg-brand text-white hover:bg-brand-strong`}>
          {t('doctors.suggestion.yes')}
        </button>
        <button type="button" onClick={dismiss} className={`${BUTTON} border border-line bg-surface text-ink-soft hover:bg-line/20`}>
          {t('doctors.suggestion.no')}
        </button>
      </div>
    </div>
  );
}
