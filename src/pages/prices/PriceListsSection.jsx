import React, { useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Card, CardHeader, DataTable, InfoHint, InsightRow, Segmented } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { modelPriceColumns, paymentColumns, transcriptionColumns } from './columns.jsx';
import ScrollRow from './ScrollRow.jsx';
import { textOf } from './text.js';

const TABS = ['models', 'transcription', 'payments'];
const HINTS = { models: 'prices.prices', transcription: 'prices.transcription', payments: 'prices.payments' };

/**
 * "Price lists" (§4.7 #prices): the vendors' prices behind every number — models, transcription, payments and
 * server — with $ in the vendor's currency and € next to it, and the date the prices were checked.
 *   tables  data.tables (pricesModels, pricesTranscription, pricesPayments, pricesOther, checked)
 *   packs   the three packs (id, credits, priceEur)
 */
export default function PriceListsSection({ tables, packs }) {
  const [tab, setTab] = useState('models');
  const models = useMemo(() => modelPriceColumns(), []);
  const transcription = useMemo(() => transcriptionColumns(), []);
  const payments = useMemo(() => paymentColumns(packs), [packs]);
  const minutes = tables?.pricesTranscription?.[0]?.minutesPerDoctor;

  return (
    <section id="prices" aria-labelledby="prices-lists-title" className="mt-12">
      <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <CardHeader title={<span id="prices-lists-title">{t('prices.prices.title')}</span>} icon={Receipt} hintKey="prices.prices" />
        <ScrollRow className="mb-4">
          <Segmented ariaLabel={t('prices.tab.label')} options={TABS.map((id) => ({ value: id, label: t(`prices.tab.${id}`) }))} value={tab} onChange={setTab} />
        </ScrollRow>
        {tab !== 'models' && (
          <p className="mb-3 flex items-start gap-1 text-[13px] font-medium text-ink-soft">
            <span>{t(HINTS[tab])}</span>
            <InfoHint hintKey={HINTS[tab]} values={{ minutes: fmt.int(minutes) }} label={t(`prices.tab.${tab}`)} />
          </p>
        )}
        {tab === 'models' && <DataTable columns={models} rows={tables?.pricesModels ?? []} maxHeight={null} caption={t('prices.tab.models')} />}
        {tab === 'transcription' && <DataTable columns={transcription} rows={tables?.pricesTranscription ?? []} maxHeight={null} caption={t('prices.tab.transcription')} />}
        {tab === 'payments' && (
          <>
            <DataTable columns={payments} rows={tables?.pricesPayments ?? []} maxHeight={null} caption={t('prices.tab.payments')} />
            <h4 className="mt-6 mb-1 text-sm font-extrabold text-ink">{t('prices.other.title')}</h4>
            <div className="flex flex-col">
              {(tables?.pricesOther ?? []).map((item) => (
                <InsightRow key={item.key} tone="quiet" parts={[{ t: textOf(item) }]} />
              ))}
            </div>
          </>
        )}
        {(tables?.checked ?? []).map((item) => (
          <p key={item.key} className="mt-4 text-xs font-medium text-ink-soft">
            {textOf(item)}
          </p>
        ))}
      </Card>
    </section>
  );
}
