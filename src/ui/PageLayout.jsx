import React from 'react';
import { useAnalytics } from '../context/AnalyticsContext.jsx';
import { sectionById } from '../app/nav.js';
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
 * The fixed top of every page except Settings, in this order (§3.2; a page never reorders it):
 * PageHeader (h1 · question · scope line) → FilterBar (one row) → AnswerBlock → HiddenNote → SourceBanners,
 * then the page's children (alerts, strip, section nav, tiles, plan, charts, tables, notes, footnote).
 *   id            section id ('overview' …): title and question come from copy `<id>.title` / `<id>.question`
 *   metric        the useMetric('<id>') result (period, compare label, scope, sources, status, error)
 *   serviceScope  service page: static "All traffic — all accounts" chip (Models, Prices); defaults from nav.js
 *   vatChip       VAT chip in the filter row (Overview, Money)
 *   answerItems   [{ text, tone }] ready sentences; default: metric.data.answer translated; a placeholder while empty
 *   hiddenNote    { n, costEur, resultEur } or null
 *   sources       source names whose trouble this page must mention, e.g. ['usage', 'revenue', 'config']
 *   exportTables  ExportMenu tables
 *   filters       extra controls placed in the filter row
 */
export default function PageLayout({
  id,
  metric,
  serviceScope,
  vatChip = false,
  answerItems,
  hiddenNote = null,
  sources = ['usage', 'config'],
  exportTables,
  filters,
  children,
}) {
  const { status, error, isStale, lastUpdated, refresh, dataset } = useAnalytics();
  const section = sectionById(id);
  const service = serviceScope ?? Boolean(section?.service);
  const title = has(`${id}.title`) ? t(`${id}.title`) : section?.label ?? id;
  const question = has(`${id}.question`) ? t(`${id}.question`) : null;
  const scopeLine = scopeLineOf({
    id,
    period: metric?.period,
    compareLabel: section?.usesPeriod === false ? null : metric?.compareLabel,
    scope: metric?.scope,
    internalCount: (dataset?.doctorList ?? []).filter((doctor) => doctor.internal).length,
    service,
    lastUpdated,
  });

  const answers =
    answerItems ??
    (metric?.data?.answer?.length
      ? metric.data.answer.map((item) => ({ text: fmt.textOf(item), tone: item.tone }))
      : [{ text: status === 'loading' ? t('common.loading') : t('common.placeholder.answer'), tone: 'neutral' }]);

  const bannerValues = { config: { date: fmt.date(dataset?.prices?.CHECKED_AT) } };

  return (
    <>
      <PrintHeader section={id} />
      <PageHeader title={title} question={question} scopeLine={scopeLine} />
      <FilterBar usesPeriod={section?.usesPeriod !== false} serviceScope={service} vatChip={vatChip} exportTables={exportTables}>
        {filters}
      </FilterBar>
      {status === 'error' && !dataset ? (
        <ErrorBanner error={error} onRetry={refresh} className="mb-6" />
      ) : (
        <>
          <AnswerBlock items={answers} />
          {!service && hiddenNote && <HiddenNote {...hiddenNote} />}
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
