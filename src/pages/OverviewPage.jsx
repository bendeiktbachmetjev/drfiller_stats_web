import React from 'react';
import { Inbox } from 'lucide-react';
import { useAnalytics, useOverview } from '../context/AnalyticsContext.jsx';
import { useLive } from '../context/useLive.js';
import { AlertList, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import NowLine from './overview/NowLine.jsx';
import OverviewTiles from './overview/OverviewTiles.jsx';
import PlanCard from './overview/PlanCard.jsx';
import ShortFacts from './overview/ShortFacts.jsx';
import { overviewExportTables } from './overview/exportTables.js';
import { answerItemsOf, emptyText } from './overview/text.js';

/**
 * Overview (§4.1): "Is everything OK, and are we making money?"
 * PageLayout (header · filter row · verdict · hidden-accounts note · source banners) → alerts that fired →
 * hero + four tiles → the plan row → "In short" → data notes → footnote → the "Right now" line.
 * No chart on this page: sparklines and one split bar only.
 */
export default function OverviewPage() {
  const metric = useOverview();
  const live = useLive();
  const { dataset } = useAnalytics();
  const { data, period } = metric;
  const answerItems = data ? (data.empty ? [] : answerItemsOf(data, period, dataset)) : undefined;

  return (
    <PageLayout
      id="overview"
      metric={metric}
      vatChip
      sources={['usage', 'revenue', 'config']}
      answerItems={answerItems}
      exportTables={overviewExportTables(metric)}
    >
      <AlertList items={live.alerts} />
      {data?.empty ? (
        <EmptyState icon={Inbox} title={emptyText(period)} action="widen" />
      ) : (
        <>
          <OverviewTiles metric={metric} />
          <div className="mt-6 flex flex-col gap-3 md:gap-6">
            <PlanCard projection={data?.projection} />
            <ShortFacts facts={data?.facts} ds={dataset} />
          </div>
          <DataNotes notes={data?.notes} />
        </>
      )}
      <NotRecorded />
      <NowLine live={live} />
    </PageLayout>
  );
}
