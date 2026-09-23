import React, { useMemo, useState } from 'react';
import { Info, Tags } from 'lucide-react';
import { useAnalytics, usePrices } from '../context/AnalyticsContext.jsx';
import { DataNotes, EmptyState, PageLayout, SectionNav } from '../ui/index.js';
import { STATS_START } from '../data/constants.js';
import { packsOf } from '../data/core/packs.js';
import { planningOf } from '../data/core/projection.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import AvailabilitySection from './prices/AvailabilitySection.jsx';
import BaselineTiles from './prices/BaselineTiles.jsx';
import FindingsSection from './prices/FindingsSection.jsx';
import PriceListsSection from './prices/PriceListsSection.jsx';
import SummaryCard from './prices/SummaryCard.jsx';
import WhatIfSection from './prices/WhatIfSection.jsx';
import { pricesExportTables } from './prices/exportTables.js';
import { textOf } from './prices/text.js';

const SECTIONS = ['summary', 'whatif', 'availability', 'findings', 'prices'];
const DEFAULT_VIEW = { filter: 'all', prices2027: false, showAll: false };

/**
 * Prices (§4.7): what other models and Google Cloud (Vertex) would cost on our own forms and how fast they are.
 * A service page with no period: "ours" is the last 30 days of the current setup, all traffic. Order: test caveat
 * → section chips → in short → today's numbers → options → where models run → test findings → price lists → notes.
 * Without any forms of ours the parts that reprice our forms give way to one empty state; the test and the price
 * lists stay.
 */
export default function PricesPage() {
  const [view, setView] = useState(DEFAULT_VIEW);
  const metric = usePrices(view);
  const { dataset } = useAnalytics();
  const data = metric.data;
  const plan = useMemo(() => planningOf(dataset?.settings?.planning), [dataset]);
  const packs = useMemo(() => packsOf(dataset), [dataset]);

  const answerItems = useMemo(() => (data?.answer?.length ? data.answer.map((item) => ({ text: textOf(item), tone: item.tone })) : undefined), [data]);
  const notes = useMemo(() => (data?.notes ?? []).map(textOf), [data]);
  const exportTables = useMemo(() => pricesExportTables(data, dataset?.nowMs ?? null), [data, dataset]);
  const caveat = data?.tables?.caveat?.[0];
  const empty = Boolean(data?.empty);
  const nav = SECTIONS.filter((id) => !empty || !['summary', 'whatif'].includes(id)).map((id) => ({ id, label: t(`prices.nav.${id}`) }));

  return (
    <PageLayout id="prices" metric={metric} sources={['usage', 'config']} answerItems={answerItems} exportTables={exportTables}>
      {caveat && (
        <p className="mb-6 flex items-start gap-2 text-[13px] leading-relaxed font-medium text-ink-soft">
          <Info className="mt-0.5 w-4 h-4 shrink-0 text-ink-mute" aria-hidden="true" />
          <span>{textOf(caveat)}</span>
        </p>
      )}
      <SectionNav items={nav} />
      {empty ? (
        <EmptyState icon={Tags} title={t('prices.empty.title')} hint={t('prices.empty.hint', { date: fmt.date(STATS_START) })} />
      ) : (
        <>
          <SummaryCard rows={data?.tables?.vertexSummary ?? []} />
          <BaselineTiles data={data} visits={plan.visitsPerDoctorMonth} firstLoad={metric.status === 'loading'} />
          <WhatIfSection data={data} view={view} onView={setView} scales={plan.doctorScales} />
        </>
      )}
      <AvailabilitySection rows={data?.tables?.availability ?? []} facts={data?.tables?.availabilityFacts ?? []} />
      <FindingsSection rows={data?.tables?.findings ?? []} />
      {data && <PriceListsSection tables={data.tables} packs={packs} />}
      <DataNotes notes={notes} />
    </PageLayout>
  );
}
