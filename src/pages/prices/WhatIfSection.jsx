import React, { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardHeader, DataTable, Disclosure, InfoHint, Segmented } from '../../ui/index.js';
import { def, t } from '../../copy/index.js';
import { whatIfColumns, whatIfMoreColumns } from './columns.jsx';
import ScrollRow from './ScrollRow.jsx';

const FILTERS = ['all', 'eu', 'noFailures'];
const DEFAULT_SORT = { key: 'priceRatio', dir: 'asc' };
const LEGEND = [
  ['prices.col.ratio', 'prices.ratio'],
  ['prices.col.speed', 'prices.speed'],
  ['prices.col.checks', 'prices.quality'],
  ['prices.col.failed', 'prices.benchFailures'],
  ['prices.col.from2027', 'prices.from2027'],
  ['prices.legend.thinking', 'prices.thinking'],
];

/**
 * "Options" (§4.7 #whatif): our real forms repriced on each option of the test. The curated 9 by default (today's
 * setup tagged "now"), "Show all" for the 23; filters by EU servers / no failures; 2026 or 2027 prices. The plan
 * scales, 2027, the usual time and the test notes sit in "Show the math" (density rule §4.0).
 *   data      the Prices AreaResult for the current view     view / onView  { filter, prices2027, showAll }
 *   scales    planning.doctorScales
 */
export default function WhatIfSection({ data, view, onView, scales }) {
  const rows = data?.tables?.whatIf ?? [];
  const filtered = data?.tables?.whatIfFiltered ?? [];
  const columns = useMemo(() => whatIfColumns(rows), [rows]);
  const moreColumns = useMemo(() => whatIfMoreColumns(scales), [scales]);
  const canExpand = filtered.length > rows.length;
  const set = (patch) => onView({ ...view, ...patch });

  return (
    <section id="whatif" aria-labelledby="prices-whatif-title" className="mt-12">
      <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
        <CardHeader title={<span id="prices-whatif-title">{t('prices.whatIf.title')}</span>} icon={Scale} hintKey="prices.whatIf" />
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ScrollRow>
            <Segmented
              ariaLabel={t('prices.filter.label')}
              options={FILTERS.map((id) => ({ value: id, label: t(`prices.filter.${id}`) }))}
              value={view.filter}
              onChange={(filter) => set({ filter })}
            />
          </ScrollRow>
          <ScrollRow>
            <Segmented
              ariaLabel={t('prices.year.label')}
              options={[
                { value: false, label: t('prices.year.now') },
                { value: true, label: t('prices.year.2027') },
              ]}
              value={view.prices2027}
              onChange={(prices2027) => set({ prices2027 })}
            />
          </ScrollRow>
        </div>
        {(view.filter === 'eu' || view.prices2027) && (
          <p className="mb-3 text-[13px] font-medium text-ink-soft">
            {[view.filter === 'eu' ? t('prices.whatIf.basePinned') : null, view.prices2027 ? t('prices.whatIf.prices2027') : null].filter(Boolean).join(' ')}
          </p>
        )}
        <DataTable columns={columns} rows={rows} defaultSort={DEFAULT_SORT} maxHeight={null} caption={t('prices.whatIf.title')} />
        {(canExpand || view.showAll) && (
          <button
            type="button"
            onClick={() => set({ showAll: !view.showAll })}
            className="mt-4 inline-flex items-center h-9 px-3.5 rounded-full border border-line bg-surface text-[13px] font-semibold text-brand hover:bg-line/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {view.showAll ? t('prices.whatIf.showFewer') : t('prices.whatIf.showAll', { n: String(filtered.length) })}
          </button>
        )}
        <Disclosure id="prices.whatif">
          <h4 className="text-sm font-extrabold text-ink">{t('prices.whatIfMore.title')}</h4>
          <DataTable columns={moreColumns} rows={rows} defaultSort={DEFAULT_SORT} maxHeight={null} caption={t('prices.whatIfMore.title')} className="mt-3" />
          <h4 className="mt-6 text-sm font-extrabold text-ink flex items-center gap-2">
            {t('prices.whatIfMore.legend')}
            <InfoHint hintKey="prices.whatIf" label={t('prices.whatIfMore.legend')} />
          </h4>
          <dl className="mt-2 grid gap-y-2 text-[13px]">
            {LEGEND.map(([label, hint]) => (
              <div key={hint}>
                <dt className="inline font-bold text-ink">{t(label)}: </dt>
                <dd className="inline font-medium text-ink-soft">
                  {def(hint)?.short} {def(hint)?.long ?? ''}
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </Card>
    </section>
  );
}
