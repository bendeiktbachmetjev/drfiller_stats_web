import React from 'react';
import { usePeriod } from '../context/AnalyticsContext.jsx';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

/**
 * Top of every page (§3.2): h1 · the page's one question · the scope line. No eyebrow.
 * `scopeLine` is the ready text (PageLayout builds it: range · compared with … · accounts · updated).
 * `aside` sits at the right of the title (Settings: "Updated 14:05" + Refresh, §4.9).
 * A <div>, not a <header>: the print rules hide every <header> of the site.
 */
export default function PageHeader({ title, question, scopeLine, note, aside }) {
  const { period } = usePeriod();
  return (
    <div className="pt-2 pb-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        {aside && <div className="shrink-0 flex items-center gap-2 print:hidden">{aside}</div>}
      </div>
      {question && <p className="mt-1 text-[15px] font-medium text-ink-soft">{question}</p>}
      {scopeLine && <p className="mt-1 text-xs font-semibold text-ink-mute print:hidden">{scopeLine}</p>}
      {period?.startClamped && <p className="mt-1 text-xs font-semibold text-ink-mute">{t('common.statsStart', { date: fmt.date(period.from) })}</p>}
      {note && <p className="mt-3 max-w-3xl text-xs font-semibold text-ink-soft">{note}</p>}
    </div>
  );
}
