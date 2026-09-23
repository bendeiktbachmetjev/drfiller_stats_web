import React, { useMemo } from 'react';
import { AlertTriangle, Ban, Eye, ListX } from 'lucide-react';
import TimeColumns from '../../charts/TimeColumns.jsx';
import { COLORS } from '../../charts/theme.js';
import { BarList, Card, ChartCard, DataTable, Disclosure, EmptyState, KpiTile, SectionTitle } from '../../ui/index.js';
import { errorKindLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { failureColumns } from './columns.jsx';
import TableCard from './TableCard.jsx';

/** Before event logging: say so plainly, then list what is visible without an error log (§4.6). */
function NotRecordedYet({ proxies = [] }) {
  const items = proxies.map((row) => ({ key: row.key, label: t(`models.proxy.${row.key}`), value: row.value }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <Card padding="none" className="lg:col-span-5 flex items-center justify-center p-4 sm:p-6">
        <EmptyState icon={ListX} size="sm" title={t('models.failures.offTitle')} hint={t('models.failures.offHint')} />
      </Card>
      <TableCard title={t('models.proxies.title')} icon={Eye} hintKey="models.proxies" className="lg:col-span-7">
        <BarList items={items} format="int" maxRows={5} />
      </TableCard>
    </div>
  );
}

function kindItems(rows) {
  return rows.map((row) => ({ key: row.key, label: errorKindLabel(row.kind), value: row.value }));
}

/** After event logging began: two tiles, then what broke and when behind "Show the math". */
function Recorded({ metric, doctors }) {
  const { dataset } = useAnalytics();
  const data = metric.data;
  const h = data.headline;
  const tables = data.tables;
  const firstLoad = metric.status === 'loading' && !data;
  const topRefusal = tables.refusalsByKind[0];
  const events = (h.serviceFailures ?? 0) + (h.refusals ?? 0);
  const columns = useMemo(() => failureColumns(doctors), [doctors]);
  const since = dataset?.v2LoggingSince?.events ?? null;
  const chartRows = data.series;
  // Failures are recorded only from `since` on; a period that starts earlier says where the count begins.
  let failureSub = null;
  if (h.serviceFailureRate != null) {
    failureSub = since && since > metric.period.fromMs
      ? t('models.tile.serviceFailuresSubSince', { rate: fmt.pct(h.serviceFailureRate), since: fmt.dayShort(since) })
      : t('models.tile.serviceFailuresSub', { rate: fmt.pct(h.serviceFailureRate) });
  }
  const chartTable = {
    columns: [
      { key: 'key', header: t('models.col.when'), type: 'text', priority: 1, render: (row) => fmt.bucketTitle(row.key, row.granularity) },
      { key: 'serviceFailures', header: t('models.tile.serviceFailures'), type: 'int', priority: 1 },
      { key: 'refusals', header: t('models.tile.refusals'), type: 'int', priority: 1 },
    ],
    rows: chartRows.filter((row) => row.serviceFailures !== null),
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <KpiTile
          label={t('models.tile.serviceFailures')}
          value={h.serviceFailures}
          sub={failureSub}
          delta={metric.delta((d) => d.headline.serviceFailures, 'abs')}
          compareLabel={metric.compareLabel}
          goodWhen="down"
          badge={data.basis.serviceFailures}
          hintKey="models.serviceFailures"
          hintValues={since ? { date: fmt.date(since) } : undefined}
          firstLoad={firstLoad}
        />
        <KpiTile
          label={t('models.tile.refusals')}
          value={h.refusals}
          sub={topRefusal ? t('models.tile.refusalsSub', { kind: errorKindLabel(topRefusal.kind) }) : t('models.tile.refusalsNone')}
          delta={metric.delta((d) => d.headline.refusals, 'abs')}
          compareLabel={metric.compareLabel}
          goodWhen="none"
          badge={data.basis.refusals}
          hintKey="models.refusals"
          firstLoad={firstLoad}
        />
      </div>
      {events > 0 && (
        <Disclosure id="models.failures" label={t('models.failures.show', { n: fmt.int(events) })}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TableCard title={t('models.failuresByKind.title')} icon={AlertTriangle}>
              <BarList items={kindItems(tables.failuresByKind).map((item) => ({ ...item, color: COLORS.bad }))} format="int" emptyText={t('models.failuresByKind.empty')} />
            </TableCard>
            <TableCard title={t('models.refusalsByKind.title')} icon={Ban}>
              <BarList items={kindItems(tables.refusalsByKind).map((item) => ({ ...item, color: COLORS['data-mute'] }))} format="int" emptyText={t('models.refusalsByKind.empty')} />
            </TableCard>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6">
            <ChartCard
              title={t('models.failuresChart.title')}
              rows={chartTable.rows}
              series={[{ key: 'serviceFailures', label: t('models.tile.serviceFailures') }]}
              events={h.serviceFailures ?? 0}
              height={240}
              table={chartTable}
            >
              <TimeColumns rows={chartTable.rows} valueKey="serviceFailures" color={COLORS.bad} unit={t('models.failuresChart.unit')} />
            </ChartCard>
            <TableCard title={t('models.failuresRecent.title')}>
              <DataTable columns={columns} rows={tables.failuresRecent} caption={t('models.failuresRecent.title')} emptyText={t('models.failuresRecent.empty')} phoneRows={3} />
            </TableCard>
          </div>
        </Disclosure>
      )}
    </>
  );
}

/**
 * Failures (§4.6 #failures). Before the server records failures (no event row yet, or a period that ends
 * before the first one) the section says so and shows indirect signs; afterwards it splits service
 * failures (something broke) from refusals (a rule said no).
 */
export default function FailuresSection({ metric, doctors }) {
  const data = metric.data;
  if (!data) return null;
  const recorded = data.headline.serviceFailures !== null && data.headline.serviceFailures !== undefined;
  return (
    <section aria-labelledby="failures">
      <SectionTitle id="failures" title={t('models.section.failures')} description={t('models.section.failuresSub')} />
      {recorded ? <Recorded metric={metric} doctors={doctors} /> : <NotRecordedYet proxies={data.tables.proxies} />}
    </section>
  );
}
