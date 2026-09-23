import React from 'react';
import { useAnalytics } from '../context/AnalyticsContext.jsx';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';

/**
 * Which footnote applies (§3.9): 'before' while no row of the extra logging (B2) exists, else 'after'
 * with the first day it was recorded.
 * @param {{ forms: number|null, dictation: number|null, events: number|null } | null | undefined} since ds.v2LoggingSince
 * @returns {{ key: string, values?: { date: string } }}
 */
export function notRecordedText(since) {
  const first = Object.values(since ?? {}).filter((ms) => Number.isFinite(ms));
  if (first.length === 0) return { key: 'common.notRecorded.before' };
  return { key: 'common.notRecorded.after', values: { date: fmt.date(Math.min(...first)) } };
}

/**
 * The quiet footnote at the bottom of a page (§3.2, §3.9): what the server does not record yet,
 * or since when it does. Renders nothing before the dataset exists.
 */
export default function NotRecorded({ className = '' }) {
  const { dataset } = useAnalytics();
  if (!dataset) return null;
  const { key, values } = notRecordedText(dataset.v2LoggingSince);
  return <p className={['mt-8 max-w-3xl text-xs font-medium leading-relaxed text-ink-mute', className].filter(Boolean).join(' ')}>{t(key, values)}</p>;
}
