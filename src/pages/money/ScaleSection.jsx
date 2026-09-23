import React, { useMemo } from 'react';
import { Card, CardHeader, DataTable, Disclosure, ScaleProjection, SectionTitle } from '../../ui/index.js';
import { SCENARIO_OPTIONS } from '../../data/metrics/money.js';
import { fillHint, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import CapacityCard from './CapacityCard.jsx';
import ChoiceRow from './ChoiceRow.jsx';
import { sensitivityColumns, stepColumns } from './columns.jsx';
import { textOf } from './text.js';

const CARD = 'min-w-0 p-4 sm:p-6 lg:p-8';

/** The four default rows of the scale table (§4.2 D); Income carries its own (i). */
const scaleRows = () => [
  { key: 'netEur', label: t('common.row.income'), format: 'eur', hintKey: 'money.scaleTable.income' },
  { key: 'costTotalEur', label: t('common.row.cost'), format: 'eur' },
  { key: 'resultEur', label: t('common.row.result'), format: 'eurSigned' },
  { key: 'marginPct', label: t('common.row.left'), format: 'pct' },
];

function SensitivityCard({ rows, scale }) {
  const top = rows.filter((row) => row.top);
  const maxAbs = useMemo(() => Math.max(1e-9, ...rows.map((row) => Math.abs(row.diffEur))), [rows]);
  return (
    <Card padding="none" className={`${CARD} lg:col-span-7`}>
      <CardHeader title={t('money.sensitivity.title')} hint={fillHint('money.sensitivity', { n: fmt.int(scale) })} hintKey="money.sensitivity" />
      {top.length === 0 ? (
        <p className="text-sm font-medium text-ink-soft">{t('money.sensitivity.none')}</p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {top.map((row) => (
            <li key={row.key} className="text-sm font-semibold text-ink">
              {textOf(row.line)}
            </li>
          ))}
        </ul>
      )}
      <Disclosure id="money.sensitivity" label={t('money.sensitivity.table')}>
        <DataTable columns={sensitivityColumns(maxAbs)} rows={rows} caption={t('money.sensitivity.title')} maxHeight={null} />
      </Disclosure>
    </Card>
  );
}

/**
 * Section D "Will it pay off at scale?" (§4.2 D): the scenario switch (default "My plan"), now next to the
 * plan per month (4 rows, 13 steps behind "Show the math"), what moves the result most, and the limits.
 */
export default function ScaleSection({ metric, scenario, onScenario }) {
  const data = metric.data;
  const projection = data?.projection;
  if (!data || !projection) return null;
  const scales = projection.scales;
  const showNow = !projection.now.hidden;
  const options = SCENARIO_OPTIONS.map((value) => ({ value, label: t(`money.scenarioOption.${value}`) }));

  return (
    <section aria-label={t('money.d.title')}>
      <SectionTitle id="scale" title={t('money.d.title')} description={textOf(data.takeaways?.scale)} />
      <ChoiceRow label={t('money.scenarioSwitch')} options={options} value={scenario} onChange={onScenario} />
      <Card padding="none" className={CARD}>
        <CardHeader
          title={t('money.scaleTable.title')}
          hint={fillHint('money.scaleTable', { s0: fmt.int(scales[0]), s1: fmt.int(scales[1]) })}
          hintKey="money.scaleTable"
        />
        <ScaleProjection data={projection} rows={scaleRows()} columns={['now', 'visit', 'doctor', 's0', 's1']} />
        <Disclosure id="money.scaleSteps" label={t('money.scaleSteps.toggle')}>
          <DataTable columns={stepColumns({ scales, showNow })} rows={data.tables.scaleSteps ?? []} caption={t('money.scaleTable.title')} maxHeight={null} />
        </Disclosure>
      </Card>
      <div className="mt-3 md:mt-6 grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-12">
        <SensitivityCard rows={data.tables.sensitivity ?? []} scale={scales[0]} />
        <CapacityCard className="lg:col-span-5" rows={data.tables.capacity ?? []} scales={scales} />
      </div>
    </section>
  );
}
