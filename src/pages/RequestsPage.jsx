import React, { useEffect, useMemo, useState } from 'react';
import { useAnalytics, useRequests } from '../context/AnalyticsContext.jsx';
import { Card, DataNotes, EmptyState, NotRecorded, PageLayout, SectionNav, SectionTitle } from '../ui/index.js';
import { addDays } from '../data/period.js';
import { fmt } from '../format/format.js';
import { t } from '../copy/index.js';
import AnamnesisSection from './requests/AnamnesisSection.jsx';
import ByTypeCard from './requests/ByTypeCard.jsx';
import SizeSection from './requests/SizeSection.jsx';
import { exportTables } from './requests/tables.jsx';

const NAV = ['bytype', 'size', 'anamnesis'];

// The last day inside the period (periods end on an exclusive day).
const lastDay = (period) => fmt.date(addDays(period.effTo, -1));

/**
 * Requests (§4.4): which requests are big, which are small, and what each one costs. Business page: the
 * account switch applies. Order: answer → section chips → price per request → form size → medical history
 * summary → notes.
 */
export default function RequestsPage() {
  const [segment, setSegment] = useState('specialty');
  const metric = useRequests({ segment });
  const { dataset } = useAnalytics();
  const { data, period } = metric;
  const tables = data?.tables ?? {};
  const doctors = dataset?.doctors;

  // The chosen doctor grouping may have too few doctors while the other one has enough: switch to it.
  const groups = tables.segmentGroups;
  useEffect(() => {
    const [current, other] = groups ?? [];
    if (current && !current.shown && other?.shown) setSegment(other.key);
  }, [groups]);

  const exports = useMemo(() => exportTables({ data, period, doctors }), [data, period, doctors]);
  const empty = Boolean(data?.empty) && metric.status !== 'loading';
  const answerItems = empty && period ? [{ text: t('requests.answer.empty', { from: fmt.date(period.from), to: lastDay(period) }), tone: 'neutral' }] : undefined;

  return (
    <PageLayout id="requests" metric={metric} sources={['usage', 'config']} exportTables={exports} answerItems={answerItems}>
      {empty ? (
        <Card padding="none">
          <EmptyState title={t('common.empty.period', { from: fmt.date(period.from), to: lastDay(period) })} action="widen" />
        </Card>
      ) : (
        <>
          <SectionNav items={NAV.map((id) => ({ id, label: t(`requests.nav.${id}`) }))} />
          <section aria-label={t('requests.section.bytype')}>
            <SectionTitle id="bytype" title={t('requests.section.bytype')} />
            <ByTypeCard rows={tables.byType} />
          </section>
          <SizeSection metric={metric} doctors={doctors} segment={segment} onSegment={setSegment} />
          <AnamnesisSection metric={metric} doctors={doctors} />
          <DataNotes notes={data?.notes} />
          <NotRecorded />
        </>
      )}
    </PageLayout>
  );
}
