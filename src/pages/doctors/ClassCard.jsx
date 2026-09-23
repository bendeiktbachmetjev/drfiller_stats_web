import React from 'react';
import { BarList, Card, CardHeader, ShareBar, SourceBadge } from '../../ui/index.js';
import { COLORS, SERIES } from '../../charts/theme.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

/** Fixed colours of the account types (identity, never rank): paying = brand, like income. */
const CLASS_COLORS = {
  internal: COLORS.cost,
  gifted: SERIES.fallback,
  free: SERIES.dictation,
  paid: SERIES.income,
  other: SERIES.other,
};

const CARD = 'min-w-0 p-4 sm:p-6 lg:p-8';

/**
 * "Costs by account type" (§4.8): one bar split into the five fixed parts, with its lead sentence.
 * Parts that stay at zero are left out of the legend (a part that the scope hides says nothing).
 * @param {{ data: object }} props AreaResult of computeDoctors
 */
export function ClassCard({ data }) {
  const parts = data.tables.byClass;
  const items = parts
    .filter((part) => part.valueEur > 0)
    .map((part) => ({ key: part.key, label: t(`doctors.byClass.${part.key}`), value: part.valueEur, color: CLASS_COLORS[part.key] }));
  const lead = data.takeaways?.byClass ? fmt.textOf(data.takeaways.byClass) : t('doctors.byClass.none');
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('doctors.byClass.title')} hintKey="doctors.byClass" />
      <p className="mb-4 text-sm font-semibold text-ink">{lead}</p>
      {items.length > 0 && <ShareBar items={items} format="eur" />}
    </Card>
  );
}

/**
 * "The doctor's path" (§4.8, all time): signed up → made a request → active in the last 30 days → bought.
 * @param {{ data: object }} props AreaResult of computeDoctors
 */
export function FunnelCard({ data }) {
  const steps = data.tables.funnel;
  const items = steps.map((step) => ({
    key: step.key,
    label:
      step.basis === 'inferred' ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {t(`doctors.funnel.${step.key}`)}
          <SourceBadge basis="inferred" />
        </span>
      ) : (
        t(`doctors.funnel.${step.key}`)
      ),
    value: step.value,
  }));
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('doctors.funnel.title')} hintKey="doctors.funnel" />
      <BarList items={items} format="int" maxRows={4} unit={t('doctors.funnel.unit')} />
    </Card>
  );
}
