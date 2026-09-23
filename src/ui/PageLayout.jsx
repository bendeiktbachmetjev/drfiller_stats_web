import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnalytics, usePeriod, useScope } from '../context/AnalyticsContext.jsx';
import { sectionById } from '../app/nav.js';
import { hiddenImpact } from '../data/core/summary.js';
import { fmt } from '../format/format.js';
import { has, t } from '../copy/index.js';
import AnswerBlock from './AnswerBlock.jsx';
import BusyRegion from './BusyRegion.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import FilterBar from './FilterBar.jsx';
import HiddenNote from './HiddenNote.jsx';
import PageHeader from './PageHeader.jsx';
import PrintAppendix from './PrintAppendix.jsx';
import PrintHeader from './PrintHeader.jsx';
import SourceBanner from './SourceBanner.jsx';

/** Scope line (§3.2): "{range} · compared with {compare} · {scopeText} · updated {time}". */
export function scopeLineOf({ id, period, compareLabel, scope, internalCount, service, lastUpdated }) {
  const time = lastUpdated ? fmt.time(lastUpdated) : fmt.empty;
  if (id === 'prices') return t('common.scopeLine.prices', { time });
  const range = period ? fmt.range(period.from, period.isFuture ? period.to : period.effTo) : fmt.empty;
  let scopeText = t('common.scopeText.all');
  if (service) scopeText = t('common.scopeText.service');
  else if (scope?.excludeInternal && internalCount > 0) scopeText = t('common.scopeText.noInternal', { n: fmt.int(internalCount) });
  return compareLabel ? t('common.scopeLine', { range, compare: compareLabel, scopeText, time }) : t('common.scopeLine.noCompare', { range, scopeText, time });
}

/**
 * The HiddenNote values (§3.4) for a business page while "Without my and test accounts" hides something;
 * the numbers come from the data layer (core/summary.js#hiddenImpact). null when nothing changes.
 * @returns {{ n: number, costEur: number, resultEur: number|null } | null}
 */
export function hiddenNoteOf(dataset, period, scope, internalCount) {
  try {
    const impact = hiddenImpact(dataset, period, scope);
    return impact ? { n: internalCount, ...impact } : null;
  } catch (err) {
    // The note is a side line: a fault in it must not take the page down.
    console.error('Dr.Filler stats: hidden-accounts note could not be computed', err);
    return null;
  }
}

/**
 * Links such as /money#payments or /settings#planning arrive by client-side navigation, which does not
 * scroll by itself: once the page has its data (the section exists), bring the anchor into view.
 * @param {boolean} ready
 */
export function useScrollToHash(ready) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [ready, hash]);
}

/**
 * The fixed top of every page, in this order (§3.2; a page never reorders it):
 * PageHeader (h1 · question · scope line) → FilterBar (one row) → AnswerBlock → HiddenNote → SourceBanners,
 * then the page's children (alerts, strip, section nav, tiles, plan, charts, tables, notes, footnote).
 * Settings (§4.9) has no filter row: `filterBar={false}`, its own scope line and "Updated HH:mm ⟳" as `aside`.
 * A link's #anchor is scrolled into view once the metric has data.
 *   id            section id ('overview' …): title and question come from copy `<id>.title` / `<id>.question`
 *   metric        the useMetric('<id>') result (period, compare label, scope, sources, status, error)
 *   serviceScope  service page: static "All traffic — all accounts" chip (Models, Prices); defaults from nav.js
 *   vatChip       VAT chip in the filter row (Overview, Money)
 *   answerItems   [{ text, tone }] ready sentences; default: metric.data.answer translated; a placeholder while empty
 *   hiddenNote    { n, costEur, resultEur }; null hides it; left out (undefined) = worked out here from summarize()
 *                 on business pages whenever the scope hides accounts and that changes the cost or result
 *   sources       source names whose trouble this page must mention, e.g. ['usage', 'revenue', 'config']
 *   exportTables  ExportMenu tables
 *   filters       extra controls placed in the filter row
 *   filterBar     false = no filter row (Settings)
 *   scopeLine     ready text instead of the built scope line (null hides it)
 *   aside         node at the right of the title (Settings: updated time + refresh)
 */
export default function PageLayout({
  id,
  metric,
  serviceScope,
  vatChip = false,
  answerItems,
  hiddenNote,
  sources = ['usage', 'config'],
  exportTables,
  filters,
  filterBar = true,
  scopeLine: scopeLineText,
  aside,
  children,
}) {
  const { status, error, isStale, lastUpdated, refresh, dataset } = useAnalytics();
  const periodContext = usePeriod();
  const { scope: currentScope, internalCount } = useScope();
  const section = sectionById(id);
  const service = serviceScope ?? Boolean(section?.service);
  const title = has(`${id}.title`) ? t(`${id}.title`) : section?.label ?? id;
  const question = has(`${id}.question`) ? t(`${id}.question`) : null;
  const period = metric?.period ?? periodContext.period;
  const scope = metric?.scope ?? currentScope;
  useScrollToHash(Boolean(metric?.data));
  const builtScopeLine = scopeLineOf({
    id,
    period,
    compareLabel: section?.usesPeriod === false ? null : metric?.compareLabel ?? periodContext.compareLabel,
    scope,
    internalCount,
    service,
    lastUpdated,
  });

  const scopeLine = scopeLineText === undefined ? builtScopeLine : scopeLineText;

  const autoNote = useMemo(
    () => (hiddenNote === undefined && !service ? hiddenNoteOf(dataset, period, scope, internalCount) : null),
    [hiddenNote, service, dataset, period, scope, internalCount],
  );
  const note = hiddenNote === undefined ? autoNote : hiddenNote;

  const answers =
    answerItems ??
    (metric?.data?.answer?.length
      ? metric.data.answer.map((item) => ({ text: fmt.textOf(item), tone: item.tone }))
      : [{ text: status === 'loading' ? t('common.loading') : t('common.placeholder.answer'), tone: 'neutral' }]);

  const bannerValues = { config: { date: fmt.date(dataset?.prices?.CHECKED_AT) } };

  return (
    <>
      <PrintHeader section={id} />
      <PageHeader title={title} question={question} scopeLine={scopeLine} aside={aside} />
      {filterBar && (
        <FilterBar usesPeriod={section?.usesPeriod !== false} serviceScope={service} vatChip={vatChip} exportTables={exportTables}>
          {filters}
        </FilterBar>
      )}
      {status === 'error' && !dataset ? (
        <ErrorBanner error={error} onRetry={refresh} className="mb-6" />
      ) : (
        <>
          <AnswerBlock items={answers} />
          {!service && note && <HiddenNote {...note} />}
          {isStale && error && <ErrorBanner staleAt={lastUpdated} error={error} onRetry={refresh} className="mb-4" />}
          {dataset &&
            sources.map((name) => (
              <SourceBanner key={name} name={name} source={dataset.sources?.[name]} values={bannerValues[name]} />
            ))}
          <BusyRegion busy={status === 'loading'}>{children}</BusyRegion>
        </>
      )}
      <PrintAppendix section={id} />
    </>
  );
}
