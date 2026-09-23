import React from 'react';
import { Card, CardHeader, Meter } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

/** The sentence of one limit that is reached (§4.2 D). */
function sentenceOf(row) {
  const n = fmt.int(row.n);
  if (row.key === 'soniox') return t('money.capacity.soniox', { n, value: fmt.int(row.value), limit: fmt.int(row.limit) });
  if (row.key === 'firestore') return t('money.capacity.firestore', { n, value: fmt.int(row.value), limit: fmt.int(row.limit), eur: fmt.eur(row.eur) });
  if (row.months < 1) return t('money.capacity.dashboardSoon', { n });
  return t('money.capacity.dashboard', { n, months: fmt.value(row.months, row.months < 10 ? 'dec' : 'int') });
}

/**
 * "Where we hit a limit" (§4.2 D): a row only for a limit reached at one of the two scales, as a meter
 * (value ÷ limit) and one sentence; nothing reached → one quiet line.
 *   rows   AreaResult.tables.capacity (from core capacity())      scales  [s0, s1]
 */
export default function CapacityCard({ rows = [], scales = [], className = '' }) {
  return (
    <Card padding="none" className={['min-w-0 p-4 sm:p-6 lg:p-8', className].filter(Boolean).join(' ')}>
      <CardHeader title={t('money.capacity.title')} hintKey="money.capacity" />
      {rows.length === 0 ? (
        <p className="text-sm font-medium text-ink-soft">{t('money.capacity.none', { n: fmt.int(scales[1]) })}</p>
      ) : (
        <ul role="list" className="flex flex-col gap-5">
          {rows.map((row) => (
            <li key={row.key}>
              <Meter
                label={t(`money.capacity.label.${row.key}`)}
                valueLabel={t('common.unit.of', { n: fmt.int(row.value), total: fmt.int(row.limit) })}
                value={row.ratio}
                tone={row.ratio >= 1 ? 'warn' : 'brand'}
                size="sm"
              />
              <p className="mt-2 text-sm font-medium text-ink-soft">{sentenceOf(row)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
