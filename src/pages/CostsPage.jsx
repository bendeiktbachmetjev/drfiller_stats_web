import React, { useMemo } from 'react';
import { useAnalytics, useCosts } from '../context/AnalyticsContext.jsx';
import { Card, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import { STATS_START } from '../data/constants.js';
import { addDays } from '../data/period.js';
import { t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import { CostPlan, CostTiles } from './costs/CostTiles.jsx';
import DetailsSection from './costs/DetailsSection.jsx';
import InvoicesSection from './costs/InvoicesSection.jsx';
import WhereSection from './costs/WhereSection.jsx';
import WhySection from './costs/WhySection.jsx';
import { answerText, exportTablesOf } from './costs/view.js';

/**
 * Costs (§4.3): how much we spend, on what, and why it grows. PageLayout fixes the top (header, filter
 * row, answer, hidden-accounts note, source banners); then tiles → plan row → where the money went →
 * why a form got more expensive → invoices → details → notes → footnote.
 */
export default function CostsPage() {
  const metric = useCosts();
  const { dataset } = useAnalytics();
  const { data, period } = metric;
  const periodText = period ? fmt.range(period.from, period.effTo) : '';
  const empty = Boolean(data?.empty);

  const answerItems = useMemo(() => {
    if (!data) return undefined;
    if (data.empty) {
      const lastDay = addDays(period.effTo > period.from ? period.effTo : period.to, -1);
      return [{ text: t('costs.empty', { from: fmt.date(period.from), to: fmt.date(lastDay) }), tone: 'neutral' }];
    }
    return data.answer.map((item) => ({ text: answerText(item, periodText), tone: item.tone }));
  }, [data, period, periodText]);

  const exportTables = useMemo(() => exportTablesOf(data, period), [data, period]);

  return (
    <PageLayout id="costs" metric={metric} sources={['usage', 'config', 'costs']} answerItems={answerItems} exportTables={exportTables}>
      {empty ? (
        <Card>
          <EmptyState title={t('common.list.empty')} hint={t('common.statsStart', { date: fmt.date(STATS_START) })} action="widen" />
        </Card>
      ) : (
        <>
          <CostTiles metric={metric} />
          {data && (
            <>
              <CostPlan projection={data.projection} />
              <WhereSection data={data} />
              <WhySection data={data} />
              <InvoicesSection data={data} usdPerEur={dataset?.fx?.usdPerEur ?? 1} />
              <DetailsSection data={data} />
            </>
          )}
        </>
      )}
      <DataNotes notes={data?.notes ?? []} />
      <NotRecorded />
    </PageLayout>
  );
}
