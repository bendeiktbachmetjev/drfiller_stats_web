import React, { useMemo } from 'react';
import { History, LifeBuoy } from 'lucide-react';
import { fallbackEmptyKey } from '../../data/metrics/models.js';
import { DataTable, Disclosure, SectionTitle } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { eraColumns, fallbackColumns, modelColumns } from './columns.jsx';
import TableCard from './TableCard.jsx';

/**
 * Backup model (§4.6 #fallback): every case the backup answered → the setup history (open by default)
 * → all models of the period behind "Show the math".
 */
export default function FallbackSection({ metric, doctors }) {
  const data = metric.data;
  const events = data?.tables.fallbackEvents ?? [];
  const total = data?.headline.fallbackCount ?? 0;
  const models = data?.tables.modelTable ?? [];
  const eventColumns = useMemo(() => fallbackColumns(doctors), [doctors]);
  return (
    <section aria-labelledby="fallback">
      <SectionTitle id="fallback" title={t('models.section.fallback')} description={t('models.section.fallbackSub')} />
      <TableCard title={t('models.fallbackEvents.title')} icon={LifeBuoy} hintKey="models.fallbackEvents">
        {events.length < total && (
          <p className="mb-3 text-xs font-medium text-ink-soft">{t('models.fallbackEvents.capped', { n: fmt.int(events.length), total: fmt.int(total) })}</p>
        )}
        <DataTable columns={eventColumns} rows={events} caption={t('models.fallbackEvents.title')} emptyText={t(fallbackEmptyKey(metric.period))} maxHeight={360} />
      </TableCard>
      <Disclosure id="models.eras" label={t('models.eras.title')} defaultOpen>
        <TableCard title={t('models.eras.title')} icon={History} hintKey="models.eras">
          <DataTable columns={eraColumns()} rows={data?.tables.eras ?? []} caption={t('models.eras.title')} maxHeight={null} />
        </TableCard>
      </Disclosure>
      {models.length > 0 && (
        <Disclosure id="models.table" label={t('models.table.show', { n: fmt.int(models.length) })}>
          <TableCard title={t('models.table.title')} hintKey="models.table">
            <DataTable columns={modelColumns()} rows={models} caption={t('models.table.title')} maxHeight={null} />
          </TableCard>
        </Disclosure>
      )}
    </section>
  );
}
