import React from 'react';
import { Card, CardHeader, KpiTile, ScaleProjection } from '../../ui/index.js';
import { fillHint, plural, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const SPARK_MONTHS = 12;

/**
 * The four tiles of the Costs page (§4.3): costs, one form, one doctor in the plan, fixed costs per month.
 * @param {{ metric: ReturnType<typeof import('../../context/AnalyticsContext.jsx').useCosts> }} props
 */
export function CostTiles({ metric }) {
  const data = metric.data;
  const loading = !data;
  const h = data?.headline ?? {};
  const basis = data?.basis ?? {};
  const fixedEur = data?.tables.whereWent.find((row) => row.key === 'fixed')?.valueEur;
  const projection = data?.projection;
  const visits = projection?.scenario.visitsPerDoctorMonth;
  const fixedRow = data?.tables.fixed[0];
  const spark = data ? data.tables.formMonthly.slice(-SPARK_MONTHS).map((month) => month.costPerFormEur) : [];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-4">
      <KpiTile
        label={t('costs.tile.total')}
        value={h.total}
        format="eur"
        goodWhen="none"
        delta={metric.delta((d) => d.headline.total, 'pctAlways')}
        compareLabel={metric.compareLabel}
        badge={basis.total}
        sub={Number.isFinite(fixedEur) ? t('costs.tile.total.sub', { x: fmt.eur(fixedEur) }) : null}
        hintKey="costs.total"
        firstLoad={loading}
      />
      <KpiTile
        label={t('costs.tile.perForm')}
        value={h.perForm}
        format="eurUnit"
        goodWhen="down"
        delta={metric.delta((d) => d.headline.perForm, 'pctAlways')}
        compareLabel={metric.compareLabel}
        badge={basis.perForm}
        sub={h.formCount > 0 ? t('costs.tile.perForm.sub', { n: fmt.int(h.formCount), forms: plural(h.formCount, 'common.unit.form') }) : null}
        spark={spark}
        hintKey="costs.perForm"
        firstLoad={loading}
      />
      <KpiTile
        label={t('costs.tile.perDoctorPlan')}
        value={h.perDoctorPlan}
        format="eur"
        goodWhen="down"
        badge="model"
        sub={Number.isFinite(visits) ? t('costs.tile.perDoctorPlan.sub', { visits: fmt.int(visits) }) : null}
        hintKey="costs.perDoctorPlan"
        hintValues={Number.isFinite(visits) ? { visits: fmt.int(visits) } : undefined}
        firstLoad={loading}
      />
      <KpiTile
        label={t('costs.tile.fixedMonth')}
        value={h.fixedMonth}
        format="eur"
        goodWhen="none"
        badge={basis.fixedMonth}
        sub={fixedRow ? (fixedRow.source === 'invoice' ? t('costs.tile.fixedMonth.invoice', { month: fmt.month(fixedRow.month) }) : t('costs.tile.fixedMonth.settings')) : null}
        hintKey="costs.fixedMonth"
        firstLoad={loading}
      />
    </div>
  );
}

/** One row "Costs" now and in the plan, per month (§4.1 compact mode). */
export function CostPlan({ projection }) {
  if (!projection) return null;
  const visits = fmt.int(projection.scenario.visitsPerDoctorMonth);
  return (
    <Card className="mt-6">
      <CardHeader title={t('costs.scale.title')} hint={fillHint('costs.scale', { visits })} hintKey="costs.scale" />
      <ScaleProjection compact rows={[{ key: 'costTotalEur', label: t('costs.scale.row'), format: 'eur' }]} data={projection} />
    </Card>
  );
}
