import React, { useMemo } from 'react';
import { Clock, TrendingUp } from 'lucide-react';
import TimeLines from '../../charts/TimeLines.jsx';
import { COLORS, SERIES } from '../../charts/theme.js';
import { HEALTH } from '../../data/constants.js';
import { latencyBands } from '../../data/metrics/models.js';
import { ChartCard, DataTable, Disclosure, KpiTile, SectionTitle } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { slowColumns } from './columns.jsx';
import TableCard from './TableCard.jsx';
import WaitHistogram from './WaitHistogram.jsx';
import { waitLabel } from './text.js';

const KPI_GRID = 'grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4';

/** The four speed tiles (§4.6 #speed); each sub-line carries one number at most. */
function SpeedTiles({ metric }) {
  const h = metric.data?.headline ?? {};
  const b = metric.data?.basis ?? {};
  const firstLoad = metric.status === 'loading' && !metric.data;
  const common = { compareLabel: metric.compareLabel, firstLoad, goodWhen: 'down' };
  const hasFallback = h.fallbackEligible > 0;
  return (
    <div className={KPI_GRID}>
      <KpiTile
        {...common}
        label={t('models.tile.p50')}
        value={h.p50Ms}
        format="sec"
        delta={metric.delta((d) => d.headline.p50Ms)}
        badge={b.p50Ms}
        hintKey="models.p50"
        wide={false}
      />
      <KpiTile
        {...common}
        label={t('models.tile.p90')}
        value={h.p90Ms}
        format="sec"
        delta={metric.delta((d) => d.headline.p90Ms)}
        badge={b.p90Ms}
        hintKey="models.p90"
        wide={false}
      />
      <KpiTile
        {...common}
        label={t('models.tile.over15')}
        value={h.forms ? h.over15 : null}
        valueText={h.forms ? fmt.countOf(h.over15, h.forms) : undefined}
        sub={h.forms ? t('models.tile.over15Sub', { n: fmt.int(h.over25) }) : null}
        delta={metric.delta((d) => d.headline.over15Share, 'pp')}
        badge={b.over15}
        hintKey="models.over15"
        hintValues={{ share: fmt.pct(h.over15Share) }}
      />
      <KpiTile
        {...common}
        label={t('models.tile.fallback')}
        value={hasFallback ? h.fallbackCount : null}
        valueText={hasFallback ? fmt.countOf(h.fallbackCount, h.fallbackEligible) : undefined}
        sub={hasFallback ? (h.fallbackCount > 0 ? t('models.tile.fallbackSub', { wait: fmt.sec(h.fallbackWaitMs) }) : t('models.tile.fallbackNone')) : null}
        delta={metric.delta((d) => d.headline.fallbackCount, 'abs')}
        badge={b.fallbackCount}
        hintKey="models.fallback"
        hintValues={{ share: fmt.pct(h.fallbackShare) }}
      />
    </div>
  );
}

function WaitCard({ data }) {
  const rows = data?.tables.waitHist ?? [];
  const total = rows.reduce((acc, row) => acc + row.count, 0);
  const table = {
    columns: [
      { key: 'key', header: t('models.waitHist.col.wait'), type: 'text', priority: 1, sortable: false, render: waitLabel },
      { key: 'count', header: t('models.waitHist.col.forms'), type: 'int', priority: 1 },
      { key: 'fallback', header: t('models.waitHist.col.fallback'), type: 'int', priority: 1 },
    ],
    rows,
  };
  return (
    <ChartCard
      title={t('models.waitHist.title')}
      icon={Clock}
      hintKey="models.waitHist"
      takeaway={data?.takeaways?.waitHist}
      rows={rows}
      series={[{ key: 'count', label: t('models.waitHist.unit') }]}
      events={total}
      height={260}
      table={table}
      state={data ? 'ready' : 'first'}
    >
      <WaitHistogram rows={rows} />
    </ChartCard>
  );
}

/** Monthly answer time — only for Year and All time (§4.6), with the special setup periods shaded. */
function LatencyCard({ data, timeoutMs }) {
  const rows = data?.tables.latency ?? [];
  const bands = useMemo(() => latencyBands(rows), [rows]);
  if (!rows.length) return null;
  const series = [
    { key: 'p50Ms', label: t('models.latency.p50'), color: SERIES.main },
    { key: 'p90Ms', label: t('models.latency.p90'), color: COLORS['ink-soft'], dash: true },
  ];
  const bandText = bands.map((band) => `${t(`models.era.${band.era}`)} (${fmt.dayShort(band.fromMs)} – ${fmt.dayShort(band.toMs - 1)})`).join(', ');
  const table = {
    columns: [
      { key: 'key', header: t('models.latency.col.month'), type: 'text', priority: 1, render: (row) => fmt.month(row.key) },
      { key: 'forms', header: t('models.latency.col.forms'), type: 'int', priority: 1 },
      { key: 'p50Ms', header: t('models.latency.p50'), type: 'sec', priority: 1 },
      { key: 'p90Ms', header: t('models.latency.p90'), type: 'sec', priority: 1 },
    ],
    rows,
  };
  return (
    <ChartCard title={t('models.latency.title')} icon={TrendingUp} hintKey="models.latency" rows={rows} series={series} height={280} table={table}>
      {({ series: shown }) => (
        <>
          <TimeLines
            rows={rows}
            series={shown}
            format="sec"
            referenceLines={[
              { y: HEALTH.slowMs, label: t('models.latency.ref15'), tone: 'attention' },
              { y: timeoutMs, label: t('models.latency.refTimeout'), tone: 'neutral' },
            ]}
            bands={bands}
          />
          {bandText && <p className="mt-2 text-xs font-medium text-ink-soft">{t('models.latency.bands', { list: bandText })}</p>}
        </>
      )}
    </ChartCard>
  );
}

/**
 * Speed (§4.6 #speed): tiles → wait histogram → [monthly answer time] → slow answers behind "Show the math".
 *   doctors    dataset.doctors (pid → Doctor) for the doctor column   timeoutMs  the main model's time limit
 */
export default function SpeedSection({ metric, doctors, timeoutMs = HEALTH.fallbackWaitMs }) {
  const data = metric.data;
  const slow = data?.tables.slow ?? [];
  const over15 = data?.headline.over15 ?? 0;
  const columns = useMemo(() => slowColumns(doctors), [doctors]);
  return (
    <section aria-labelledby="speed">
      <SectionTitle id="speed" title={t('models.section.speed')} description={t('models.section.speedSub')} />
      <SpeedTiles metric={metric} />
      <div className="mt-6 grid grid-cols-1 gap-6">
        <WaitCard data={data} />
        <LatencyCard data={data} timeoutMs={timeoutMs} />
      </div>
      {over15 > 0 && (
        <Disclosure id="models.slow" label={t('models.slow.show', { n: fmt.int(over15) })}>
          <TableCard title={t('models.slow.title')} hintKey="models.slow">
            {slow.length < over15 && <p className="mb-3 text-xs font-medium text-ink-soft">{t('models.slow.capped', { n: fmt.int(slow.length), total: fmt.int(over15) })}</p>}
            <DataTable columns={columns} rows={slow} caption={t('models.slow.title')} emptyText={t('models.slow.empty')} phoneRows={3} />
          </TableCard>
        </Disclosure>
      )}
    </section>
  );
}
