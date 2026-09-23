import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { useAnalytics, useModels } from '../context/AnalyticsContext.jsx';
import { DataNotes, EmptyState, NotRecorded, PageLayout, SectionNav } from '../ui/index.js';
import { t } from '../copy/index.js';
import FailuresSection from './models/FailuresSection.jsx';
import FallbackSection from './models/FallbackSection.jsx';
import LoadSection from './models/LoadSection.jsx';
import NowSection from './models/NowSection.jsx';
import RightNow from './models/RightNow.jsx';
import RisksSection from './models/RisksSection.jsx';
import SpeedSection from './models/SpeedSection.jsx';
import { modelsExportTables } from './models/exportTables.js';
import { textOf } from './models/text.js';

const SECTIONS = ['now', 'speed', 'fallback', 'failures', 'load', 'risks'];
/** Sections that need forms in the period; without any they give way to one empty state. */
const PERIOD_SECTIONS = ['speed', 'fallback', 'load'];

/**
 * Models (§4.6): which model answers, how fast and without failures. A service page — every number counts
 * all traffic. Order: live strip → section chips → now → speed → backup → failures → load → risks → notes.
 */
export default function ModelsPage() {
  const metric = useModels();
  const { dataset } = useAnalytics();
  const data = metric.data;
  const doctors = dataset?.doctors;

  const answerItems = useMemo(() => (data?.answer?.length ? data.answer.map((item) => ({ text: textOf(item), tone: item.tone })) : undefined), [data]);
  const notes = useMemo(() => (data?.notes ?? []).map(textOf), [data]);
  const exportTables = useMemo(() => modelsExportTables(metric, doctors), [metric, doctors]);
  const noForms = Boolean(data) && data.headline.forms === 0;
  const nav = SECTIONS.filter((id) => !noForms || !PERIOD_SECTIONS.includes(id)).map((id) => ({ id, label: t(`models.nav.${id}`) }));

  return (
    <PageLayout id="models" metric={metric} sources={['usage', 'config']} answerItems={answerItems} exportTables={exportTables}>
      <RightNow />
      <SectionNav items={nav} />
      <NowSection rows={data?.tables.nowCard ?? []} />
      {noForms ? (
        <EmptyState icon={Gauge} title={t('models.empty.title')} hint={t('models.empty.hint')} action="widen" className="mt-12" />
      ) : (
        <>
          <SpeedSection metric={metric} doctors={doctors} timeoutMs={dataset?.config?.gemini?.primaryTimeoutMs} />
          <FallbackSection metric={metric} doctors={doctors} />
        </>
      )}
      <FailuresSection metric={metric} doctors={doctors} />
      {!noForms && <LoadSection metric={metric} />}
      <RisksSection rows={data?.tables.risks ?? []} />
      <DataNotes notes={notes} />
      <NotRecorded />
    </PageLayout>
  );
}
