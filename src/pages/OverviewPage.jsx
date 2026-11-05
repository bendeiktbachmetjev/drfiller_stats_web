import React, { useMemo } from 'react';
import { Inbox } from 'lucide-react';
import { useAnalytics, useOverview } from '../context/AnalyticsContext.jsx';
import { useLive } from '../context/useLive.js';
import { useWorkCounts } from '../context/useWorkCounts.js';
import { AlertList, DataNotes, EmptyState, NotRecorded, PageLayout } from '../ui/index.js';
import { hidesInternal, isInternal } from '../data/core/scope.js';
import { scopedWorkTotals, workCountsStatus } from '../data/normalize/workCounts.js';
import NowLine from './overview/NowLine.jsx';
import OverviewTiles from './overview/OverviewTiles.jsx';
import PlanCard from './overview/PlanCard.jsx';
import ShortFacts from './overview/ShortFacts.jsx';
import WorkCard from './overview/WorkCard.jsx';
import { overviewExportTables } from './overview/exportTables.js';
import { answerItemsOf, emptyText } from './overview/text.js';

/**
 * Overview (§4.1): "Is everything OK, and are we making money?"
 * PageLayout (header · filter row · verdict · hidden-accounts note · source banners) → alerts that fired →
 * hero + four tiles → the plan row → "In short" → "What Dr. Filler did" → data notes → footnote → the "Right
 * now" line. No chart on this page: sparklines, one split bar and the buttons list only.
 * "What Dr. Filler did" comes from the period's work counts (useWorkCounts), in the page's scope; a period without
 * requests still shows it when something was counted.
 */
export default function OverviewPage() {
  const metric = useOverview();
  const live = useLive();
  const work = useWorkCounts();
  const { dataset } = useAnalytics();
  const { data, period, scope } = metric;
  const answerItems = data ? (data.empty ? [] : answerItemsOf(data, period, dataset)) : undefined;
  // My and test accounts leave the totals while the switch hides them, as everywhere on this page
  const workTotals = useMemo(
    () => scopedWorkTotals(work.counts, hidesInternal(dataset, scope) ? (pid) => isInternal(pid, dataset) : null),
    [work.counts, dataset, scope],
  );
  const workStatus = workCountsStatus(work, period, workTotals ?? undefined);
  const exportTables = useMemo(() => overviewExportTables(metric, { totals: workTotals }), [metric, workTotals]);

  return (
    <PageLayout
      id="overview"
      metric={metric}
      vatChip
      sources={['usage', 'revenue', 'config']}
      answerItems={answerItems}
      exportTables={exportTables}
    >
      <AlertList items={live.alerts} />
      {data?.empty ? (
        <>
          <EmptyState icon={Inbox} title={emptyText(period)} action="widen" />
          {(workStatus === 'ok' || workStatus === 'partial') && <WorkCard work={work} period={period} totals={workTotals} className="mt-6" />}
        </>
      ) : (
        <>
          <OverviewTiles metric={metric} />
          <div className="mt-6 flex flex-col gap-3 md:gap-6">
            <PlanCard projection={data?.projection} />
            <ShortFacts facts={data?.facts} ds={dataset} />
            {data && <WorkCard work={work} period={period} totals={workTotals} />}
          </div>
          <DataNotes notes={data?.notes} />
        </>
      )}
      <NotRecorded />
      <NowLine live={live} />
    </PageLayout>
  );
}
