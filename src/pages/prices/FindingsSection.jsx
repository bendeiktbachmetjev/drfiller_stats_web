import React from 'react';
import { FlaskConical } from 'lucide-react';
import { Card, CardHeader, InsightRow } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { textOf } from './text.js';

/**
 * "What the test showed" (§4.7 #findings): six sentences; the money and time in them are repriced on our own forms,
 * the same numbers as in the Options table.
 *   rows  data.tables.findings
 */
export default function FindingsSection({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <section id="findings" aria-labelledby="prices-findings-title" className="mt-12">
      <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <CardHeader title={<span id="prices-findings-title">{t('prices.findings.title')}</span>} icon={FlaskConical} hintKey="prices.findings" />
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <InsightRow key={row.key} tone={row.tone} parts={[{ t: textOf(row) }]} />
          ))}
        </div>
      </Card>
    </section>
  );
}
