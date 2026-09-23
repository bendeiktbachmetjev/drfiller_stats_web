import React from 'react';
import { Award, Cloud, PiggyBank } from 'lucide-react';
import { Card, CardHeader, InsightRow } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { textOf } from './text.js';

const ICONS = {
  'prices.vertex.same': Cloud,
  'prices.vertex.cheapestEu': PiggyBank,
  'prices.vertex.cheapestEuSimpler': PiggyBank,
  'prices.vertex.bestEu': Award,
};

/**
 * "If we move to Vertex — in short" (§4.7 #summary): three sentences straight under the answer, every number from
 * projectCombo. The best-EU row may carry a quiet sub-line when its quality lead is one check or less.
 *   rows  data.tables.vertexSummary
 */
export default function SummaryCard({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <section id="summary" aria-labelledby="prices-summary-title">
      <Card padding="none" className="p-4 sm:p-6 lg:p-8">
        <CardHeader title={<span id="prices-summary-title">{t('prices.vertexSummary.title')}</span>} icon={Cloud} hintKey="prices.vertexSummary" />
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.key}>
              <InsightRow tone={row.tone} icon={ICONS[row.key]} parts={[{ t: textOf(row) }]} />
              {row.sub && <p className="-mt-1 mb-1 pl-12 text-[13px] font-medium text-ink-soft">{textOf(row.sub)}</p>}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
