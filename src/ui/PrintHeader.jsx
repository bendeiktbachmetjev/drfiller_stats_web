import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePeriod } from '../context/AnalyticsContext.jsx';
import { usePrintMode } from '../context/usePrintMode.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import { SECTIONS } from '../app/nav.js';
import AppMark from './AppMark.jsx';

// Numbers cover the elapsed part of a period; a period still ahead prints its planned dates.
const rangeOf = (period) => fmt.range(period.from, period.isFuture ? period.to : period.effTo);

/**
 * Report letterhead, visible only on paper. `section` is a section id ('overview') or a ready label.
 * A <div>, not a <header>: the print rules hide every <header> of the site.
 */
export default function PrintHeader({ section }) {
  const { period, prevPeriod } = usePeriod();
  const { printing } = usePrintMode();
  const [generatedAt, setGeneratedAt] = useState(() => Date.now());

  // The stamp is taken when printing starts (also for a bare Cmd/Ctrl+P), not when the page was opened.
  useEffect(() => {
    const stamp = () => flushSync(() => setGeneratedAt(Date.now()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  useEffect(() => {
    if (printing) setGeneratedAt(Date.now());
  }, [printing]);

  const sectionLabel = SECTIONS.find((item) => item.id === section)?.label ?? section;
  const range = period ? rangeOf(period) : null;

  return (
    <div className="hidden print:flex items-start justify-between pb-4 mb-6 border-b border-line text-ink">
      <div className="flex items-center gap-3">
        <AppMark size={40} />
        <p className="text-[15pt] leading-tight font-extrabold">{t('common.print.report', { section: sectionLabel })}</p>
      </div>
      <div className="text-[9pt] text-right">
        {range && <p className="font-bold">{range}</p>}
        {prevPeriod && <p>{t('common.print.compared', { range: fmt.range(prevPeriod.from, prevPeriod.to) })}</p>}
        <p className="text-ink-soft">{t('common.print.generated', { date: fmt.date(generatedAt), time: fmt.time(generatedAt) })}</p>
      </div>
    </div>
  );
}
