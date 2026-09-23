import React from 'react';
import { Card, CardHeader, DataTable, Disclosure, ModelName, SectionTitle } from '../../ui/index.js';
import { endpointLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { roleText } from './view.js';

const byModelColumns = () => [
  { key: 'model', header: t('costs.col.model'), type: 'node', priority: 1, render: (row) => <ModelName id={row.model} />, sortValue: (row) => row.model },
  { key: 'role', header: t('costs.col.role'), type: 'node', priority: 2, render: roleText, sortValue: (row) => row.role },
  { key: 'where', header: t('costs.col.where'), type: 'node', priority: 3, render: (row) => endpointLabel(row.endpoint, row.location), sortValue: (row) => `${row.endpoint}|${row.location ?? ''}` },
  { key: 'forms', header: t('costs.col.forms'), type: 'int', priority: 1 },
  { key: 'inTok', header: t('costs.col.inTok'), type: 'tokens', priority: 3 },
  { key: 'outTok', header: t('costs.col.outTok'), type: 'tokens', priority: 3 },
  { key: 'costEur', header: t('costs.col.cost'), type: 'eur', priority: 1 },
  { key: 'perFormEur', header: t('costs.col.perForm'), type: 'eurUnit', priority: 1 },
  { key: 'share', header: t('costs.col.share'), type: 'pct', priority: 2 },
];

const fixedColumns = () => [
  { key: 'item', header: t('costs.col.item'), type: 'text', priority: 1 },
  { key: 'perMonthEur', header: t('costs.col.perMonth'), type: 'node', align: 'right', priority: 1, render: (row) => (row.key === 'firestore' ? t('costs.fixed.freeTier') : fmt.eur(row.perMonthEur)), sortValue: (row) => row.perMonthEur },
  { key: 'periodEur', header: t('costs.col.forPeriod'), type: 'eur', priority: 1 },
  { key: 'source', header: t('costs.col.source'), type: 'text', priority: 2 },
];

const sonioxDayColumns = () => [
  { key: 'date', header: t('costs.col.date'), type: 'text', priority: 1, sortValue: (row) => row.day },
  { key: 'oursEur', header: t('costs.soniox.ours'), type: 'eur', priority: 1, render: (row) => fmt.eurPrecise(row.oursEur) },
  { key: 'theirsEur', header: t('costs.soniox.theirs'), type: 'eur', priority: 1, render: (row) => fmt.eurPrecise(row.theirsEur) },
];

const SONIOX_STATUS_TEXT = {
  off: 'common.source.sonioxOff',
  error: 'common.source.sonioxError',
  before: 'costs.soniox.before',
  none: 'costs.soniox.none',
};

const signedPct = (share) => (Number.isFinite(share) && share > 0 ? `+${fmt.pct(share)}` : fmt.pct(share));

function Figure({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink tabular-nums">{value}</p>
    </div>
  );
}

/** «Soniox: our estimate and their numbers» for the days the period shares with Soniox's window. */
function SonioxCheck({ check, days }) {
  const statusKey = SONIOX_STATUS_TEXT[check.status];
  return (
    <Card className="min-w-0">
      <CardHeader title={t('costs.soniox.title')} hintKey="costs.soniox" />
      {statusKey ? (
        <p className="text-sm font-medium text-ink-soft">{t(statusKey)}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Figure label={t('costs.soniox.ours')} value={fmt.eurPrecise(check.oursEur)} />
            <Figure label={t('costs.soniox.theirs')} value={fmt.eurPrecise(check.theirsEur)} />
            <Figure label={t('costs.soniox.diff')} value={signedPct(check.diffShare)} />
          </div>
          <p className="mt-3 text-xs font-medium text-ink-soft">{t('costs.soniox.range', { range: fmt.range(check.from, check.to) })}</p>
          <DataTable
            className="mt-4"
            columns={sonioxDayColumns()}
            rows={days.map((day) => ({ ...day, date: fmt.date(day.day) }))}
            defaultSort={{ key: 'date', dir: 'desc' }}
            maxHeight={280}
            caption={t('costs.soniox.title')}
          />
        </>
      )}
      {check.partial && <p className="mt-3 text-xs font-medium text-ink-soft">{t('costs.soniox.partial')}</p>}
    </Card>
  );
}

/** «Details» behind "Show the math": costs by model, fixed costs (+ the Stripe memo) and the Soniox check. */
export default function DetailsSection({ data }) {
  const fixedRows = data.tables.fixed.map((row) => ({ ...row, item: t(`costs.fixed.${row.key}`), source: t(`costs.source.${row.source}`) }));
  const stripeFee = data.tables.fixedMemo?.[0]?.feeEur;
  return (
    <section aria-labelledby="costs-details">
      <SectionTitle id="costs-details" title={t('costs.section.details')} description={t('costs.section.details.lead')} />
      <Disclosure id="costs.details">
        <Card>
          <CardHeader title={t('costs.byModel.title')} hintKey="costs.byModel" />
          <DataTable columns={byModelColumns()} rows={data.tables.byModel} defaultSort={{ key: 'costEur', dir: 'desc' }} emptyText={t('costs.byModel.empty')} caption={t('costs.byModel.title')} />
        </Card>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader title={t('costs.fixed.title')} hintKey="costs.fixed" />
            <DataTable columns={fixedColumns()} rows={fixedRows} caption={t('costs.fixed.title')} />
            {Number.isFinite(stripeFee) && stripeFee > 0 && (
              <p className="mt-3 text-xs font-medium text-ink-soft">{t('costs.fixed.stripeMemo', { fee: fmt.eur(stripeFee) })}</p>
            )}
          </Card>
          <SonioxCheck check={data.tables.soniox[0]} days={data.tables.sonioxDays} />
        </div>
      </Disclosure>
    </section>
  );
}
