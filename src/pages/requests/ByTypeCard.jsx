import React from 'react';
import { BarList, Card, CardHeader } from '../../ui/index.js';
import { SERIES } from '../../charts/theme.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';

const COLOR = { form: SERIES.forms, dictation: SERIES.dictation, live: SERIES.live, anamnesis: SERIES.anamnesis, summaryV1: SERIES.anamnesis };

const countText = (row) => {
  const n = fmt.int(row.count);
  if (row.key === 'form') return `${n} ${plural(row.count, 'common.unit.form')}`;
  if (row.key === 'live') return `${n} ${plural(row.count, 'common.unit.conversation')}`;
  if (row.key === 'dictation') {
    return t('requests.type.dictationCount', { n, unit: plural(row.count, 'requests.unit.dictation'), min: fmt.minutes(row.totalMinutes) });
  }
  return `${n} ${plural(row.count, 'requests.unit.summary')}`;
};

const subOf = (row) => {
  if (row.key === 'anamnesis' && !row.measured) return t('requests.type.none.anamnesis');
  if (!row.measured) return t(`requests.type.forecast.${row.key}`);
  return t('requests.type.sub', { count: countText(row), eur: fmt.eur(row.totalEur) });
};

// Second label line: the length that is priced, plus the badge word when the price is not measured.
const detailOf = (row) => {
  const unit = t(`requests.type.${row.key}.unit`);
  return ['model', 'estimate'].includes(row.basis) ? `${unit} · ${t(`common.badge.${row.basis}`)}` : unit;
};

/**
 * "What one request costs": one bar per kind of request, most expensive first (§4.4 `requests.byType`).
 * @param {{ rows: Array<{ key: string, unitEur: number|null, basis: string, count: number, totalEur: number, measured: boolean }> }} props
 */
export default function ByTypeCard({ rows = [] }) {
  const items = rows.map((row) => ({
    key: row.key,
    label: t(`requests.type.${row.key}`),
    detail: detailOf(row),
    value: row.unitEur,
    sub: subOf(row),
    color: COLOR[row.key],
    muted: row.key === 'summaryV1',
  }));
  return (
    <Card padding="none" className="p-4 sm:p-6">
      <CardHeader title={t('requests.byType.title')} hintKey="requests.byType" />
      <BarList items={items} format="eurUnit" />
    </Card>
  );
}
