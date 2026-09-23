import React from 'react';
import { Card, CardHeader, DataTable, Disclosure, InfoHint, SectionTitle } from '../../ui/index.js';
import { PACK_OPTIONS } from '../../data/metrics/money.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import ChoiceRow from './ChoiceRow.jsx';
import CreditAnatomy from './CreditAnatomy.jsx';
import { anatomyColumns, visitColumns } from './columns.jsx';
import { textOf } from './text.js';

const CARD = 'min-w-0 p-4 sm:p-6 lg:p-8';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Section C "One credit and one visit" (§4.2 C): the pack switch (default "As planned"), what one credit is
 * made of (form and 10 minutes of conversation), the whole visit table, the share of visits that could be
 * free, and the cheapest pack with VAT.
 */
export default function UnitSection({ metric, pack, onPack, phrase }) {
  const data = metric.data;
  if (!data) return null;
  const { headline: h, tables } = data;
  const vatOn = Boolean(metric.scope?.vatPayer);
  const bars = (tables.anatomy ?? []).slice(0, 2);
  const options = PACK_OPTIONS.map((value) => ({ value, label: t(`money.packOption.${value}`) }));

  return (
    <section aria-label={t('money.c.title')}>
      <SectionTitle id="unit" title={t('money.c.title')} description={textOf(data.takeaways?.unit, { period: phrase })} />
      <ChoiceRow label={t('money.packSwitch')} options={options} value={pack} onChange={onPack} />
      <div className="grid grid-cols-1 items-start gap-3 md:gap-6 lg:grid-cols-12">
        <Card padding="none" className={`${CARD} lg:col-span-5`}>
          <CardHeader title={t('money.anatomy.title')} hintKey="money.anatomy" />
          <div className="flex flex-col gap-6">
            {bars.map((row) => (
              <CreditAnatomy key={row.key} row={row} vatOn={vatOn} />
            ))}
          </div>
          <Disclosure id="money.anatomy" label={t('money.anatomy.table')}>
            <DataTable columns={anatomyColumns} rows={tables.anatomy ?? []} caption={t('money.anatomy.title')} limit={0} />
          </Disclosure>
        </Card>
        <Card padding="none" className={`${CARD} lg:col-span-7`}>
          <CardHeader title={t('money.visitTypes.title')} hintKey="money.visitTypes" />
          <DataTable columns={visitColumns} rows={tables.visitTypes ?? []} caption={t('money.visitTypes.title')} limit={0} />
          <div className="mt-4 flex items-start gap-2 text-sm font-semibold text-ink">
            <span className="min-w-0">
              {isNum(h.safeFreeShare) && h.safeFreeShare > 0 ? t('money.safeFree', { x: fmt.pct(h.safeFreeShare) }) : t('money.safeFree.none')}
            </span>
            <InfoHint hintKey="money.safeFree" label={t('money.visitTypes.title')} />
          </div>
          {isNum(h.worstLive15LeftEur) && (
            <p className="mt-1 text-xs font-medium text-ink-soft">{t('money.visitTypes.worst', { x: fmt.eurUnit(h.worstLive15LeftEur) })}</p>
          )}
        </Card>
      </div>
    </section>
  );
}
