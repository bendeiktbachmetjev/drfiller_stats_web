import React from 'react';
import { FileText } from 'lucide-react';
import { BarList, Card, CardHeader, DataTable, Disclosure, EmptyState, KpiTile, SectionTitle } from '../../ui/index.js';
import { SERIES } from '../../charts/theme.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';
import { ANAMNESIS_SINCE, RUN_ROWS } from '../../data/metrics/requests.js';
import { KPI_GRID } from './SizeSection.jsx';
import { runColumns } from './tables.jsx';

// Credits per summary: whole numbers as they are, a median between two runs with one decimal.
const creditsFormat = (v) => (Number.isInteger(v) ? fmt.int(v) : fmt.dec(v));

/**
 * "Medical history summary" (§4.4 anchor #anamnesis): four tiles; the cost by step and every run behind
 * "Show the math". Without runs in the period: an empty state that names the start date.
 */
export default function AnamnesisSection({ metric, doctors }) {
  const data = metric.data;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const tables = data?.tables ?? {};
  const firstLoad = metric.status === 'loading' && !data;
  const tile = { compareLabel: metric.compareLabel, firstLoad };
  const oldRuns = tables.byType?.find((row) => row.key === 'summaryV1')?.count ?? 0;
  const runs = tables.anamRuns ?? [];
  const calls = (tables.anamSteps ?? []).reduce((acc, step) => acc + step.calls, 0);

  const steps = (tables.anamSteps ?? []).map((step) => ({
    key: step.key,
    label: t(`requests.step.${step.key}`),
    value: step.costEur,
    sub: `${fmt.int(step.calls)} ${plural(step.calls, 'requests.unit.call')}`,
    color: SERIES.anamnesis,
    muted: step.key === 'summary',
  }));

  return (
    <section aria-label={t('requests.section.anamnesis')}>
      <SectionTitle id="anamnesis" title={t('requests.section.anamnesis')} />
      {!firstLoad && !(h.anamRuns > 0) ? (
        <Card padding="none">
          <EmptyState
            icon={FileText}
            title={t('requests.anamnesis.emptyTitle')}
            hint={t('requests.anamnesis.emptyHint', { date: fmt.date(ANAMNESIS_SINCE) })}
            action="widen"
          />
        </Card>
      ) : (
        <>
          <div className={KPI_GRID}>
            <KpiTile
              {...tile}
              label={t('requests.tile.anamRuns')}
              wide
              value={h.anamRuns}
              format="int"
              sub={oldRuns > 0 ? t('requests.tile.anamRuns.old', { n: fmt.int(oldRuns) }) : t('requests.tile.anamRuns.calls', { n: fmt.int(calls) })}
              delta={metric.delta((d) => d.headline.anamRuns, 'abs')}
              goodWhen="none"
              badge={basis.anamRuns}
              hintKey="requests.anamRuns"
            />
            <KpiTile
              {...tile}
              label={t('requests.tile.anamCostPerRun')}
              value={h.anamCostPerRun}
              format="eurUnit"
              wide={false}
              sub={t('requests.tile.anamCostPerRun.sub')}
              delta={metric.delta((d) => d.headline.anamCostPerRun)}
              goodWhen="down"
              badge={basis.anamCostPerRun === 'missing' ? undefined : basis.anamCostPerRun}
              hintKey="requests.anamCostPerRun"
            />
            <KpiTile
              {...tile}
              label={t('requests.tile.anamCreditsPerRun')}
              value={h.anamCreditsPerRun}
              format={creditsFormat}
              sub={Number.isFinite(h.anamNetPerRun) ? t('requests.tile.anamCreditsPerRun.sub', { eur: fmt.eur(h.anamNetPerRun) }) : null}
              delta={metric.delta((d) => d.headline.anamCreditsPerRun, 'abs')}
              goodWhen="none"
              hintKey="requests.anamCreditsPerRun"
            />
            <KpiTile
              {...tile}
              label={t('requests.tile.anamLeft')}
              wide
              value={h.anamLeft}
              format="pct"
              sub={t('requests.tile.anamLeft.sub')}
              delta={metric.delta((d) => d.headline.anamLeft, 'pp')}
              goodWhen="up"
              badge={basis.anamLeft === 'missing' ? undefined : basis.anamLeft}
              hintKey="requests.anamLeft"
            />
          </div>

          <Disclosure id="requests.anamnesis">
            <div className="flex flex-col gap-3 md:gap-6">
              <Card padding="none" className="p-4 sm:p-6">
                <CardHeader title={t('requests.anamSteps.title')} hintKey="requests.anamSteps" />
                <BarList items={steps} format="eur" showShare />
              </Card>
              <Card padding="none" className="p-4 sm:p-6">
                <CardHeader
                  title={t('requests.anamRunsTable.title')}
                  hint={runs.length >= RUN_ROWS ? t('requests.anamRunsTable.latest', { n: fmt.int(RUN_ROWS) }) : undefined}
                  hintKey="requests.anamRunsTable"
                />
                <DataTable columns={runColumns(doctors)} rows={runs} caption={t('requests.anamRunsTable.title')} />
              </Card>
            </div>
          </Disclosure>
        </>
      )}
    </section>
  );
}
