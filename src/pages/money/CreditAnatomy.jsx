import React from 'react';
import { Legend } from '../../ui/index.js';
import { COLORS, SERIES } from '../../charts/theme.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const SEGMENT = 'first:rounded-l-full last:rounded-r-full min-w-[4px]';

/** "0.8¢ · 25%" — the amount and its share of the credit price. */
const partText = (eur, share) => `${fmt.eurUnit(eur)} · ${fmt.pct(share)}`;

/**
 * One credit as a bar on the same 100 % (= its price in the chosen pack, §4.2 C): VAT and fee (data-mute),
 * our costs (cost) and what we keep (brand). A credit that costs more than it brings is one red bar with
 * "minus {x}" (the metric sets `negative` and the shares).
 *   row      a row of AreaResult.tables.anatomy      vatOn  whether VAT is part of the grey segment
 */
export default function CreditAnatomy({ row, vatOn }) {
  const label = t(`money.anatomy.${row.key}`);
  const greyLabel = t(vatOn ? 'money.anatomy.vatFee' : 'money.anatomy.fee');
  const parts = row.negative
    ? [{ key: 'cost', value: 1, color: COLORS.bad }]
    : [
        { key: 'vatFee', value: row.shares.vatFee, color: SERIES.vatFee },
        { key: 'cost', value: row.shares.cost, color: SERIES.cost },
        { key: 'left', value: row.shares.left, color: SERIES.income },
      ];
  const legend = row.negative
    ? [{ key: 'minus', label: t('money.anatomy.minus', { x: fmt.eurUnit(-row.leftEur) }), color: COLORS.bad, shape: 'rect' }]
    : [
        { key: 'vatFee', label: greyLabel, color: SERIES.vatFee, value: partText(row.vatEur + row.feeEur, row.shares.vatFee) },
        { key: 'cost', label: t('money.anatomy.cost'), color: SERIES.cost, value: partText(row.costEur, row.shares.cost) },
        { key: 'left', label: t('money.anatomy.left'), color: SERIES.income, value: partText(row.leftEur, row.shares.left) },
      ];
  const summary = legend.map((item) => (item.value ? `${item.label}: ${item.value}` : item.label)).join(', ');

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="shrink-0 text-xs font-semibold text-ink-soft tabular-nums">{t('money.anatomy.perCredit', { price: fmt.eurUnit(row.priceEur) })}</p>
      </div>
      <div role="img" aria-label={`${label}: ${summary}`} className="flex h-3 gap-0.5">
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <div key={part.key} className={SEGMENT} style={{ flexGrow: part.value, flexBasis: 0, background: part.color }} />
          ))}
      </div>
      <Legend single className="mt-2" items={legend} />
      {row.negative && (
        <p className="mt-1 text-xs font-medium text-ink-soft">
          {t('money.anatomy.minusLine', { cost: fmt.eurUnit(row.costEur), price: fmt.eurUnit(row.priceEur - row.vatEur - row.feeEur) })}
        </p>
      )}
    </div>
  );
}
