import React from 'react';
import { Card, CardHeader, ShareBar } from '../../ui/index.js';
import { fmt } from '../../format/format.js';
import { plural, t } from '../../copy/index.js';
import { PROVIDER_COLORS } from './series.js';

/** Under 5 recordings the bar counts recordings instead of minutes (§4.5). */
const FEW_RECORDINGS = 5;

const countText = (n) => `${fmt.int(n)} ${plural(n, 'recording.unit.recording')}`;

/** "Who transcribes": Soniox against the backup OpenAI since 22.09, with the price of 10 minutes each. */
export default function ProvidersCard({ rows = [], className = '' }) {
  const recordings = rows.reduce((acc, row) => acc + row.count, 0);
  const byCount = recordings < FEW_RECORDINGS;
  const items = rows.map((row) => ({
    key: row.key,
    label: [t(`recording.providers.${row.key}`), row.per10Eur === null ? null : t('recording.providers.per10', { price: fmt.eurUnit(row.per10Eur) })]
      .filter(Boolean)
      .join(' · '),
    value: byCount ? row.count : row.minutes,
    color: PROVIDER_COLORS[row.key],
  }));
  return (
    <Card padding="none" className={['min-w-0 p-4 sm:p-6 lg:p-8', className].filter(Boolean).join(' ')}>
      <CardHeader title={t('recording.providers.title')} hintKey="recording.providers" />
      {recordings === 0 ? (
        <p className="text-sm font-medium text-ink-soft">{t('recording.providers.empty')}</p>
      ) : (
        <ShareBar items={items} format={byCount ? countText : 'minutes'} />
      )}
    </Card>
  );
}
