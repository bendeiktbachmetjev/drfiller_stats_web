import React, { useMemo, useState } from 'react';
import StackedColumns from '../../charts/StackedColumns.jsx';
import { BarList, Card, CardHeader, ChartCard, InfoHint, SectionTitle, Segmented, SourceBadge } from '../../ui/index.js';
import useIsPhone from '../../context/useIsPhone.js';
import { def, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { SPLIT_IDS, bucketTitle, seriesOf, whereItems, whereLead } from './view.js';

// On a 320 px phone the switch, the (i) and the table button do not fit one header row: the switch
// gets one-word labels and the hint stays as the subtitle only.

/** "Costs over time" with the split switch (by service / vendor / model) and its table twin. */
function CostsOverTime({ series: rows, className }) {
  const isPhone = useIsPhone();
  const [split, setSplit] = useState('feature');
  const series = useMemo(() => seriesOf(split), [split]);
  const events = rows.reduce((acc, row) => acc + (row.requests ?? 0), 0);
  const granularity = rows[0]?.granularity ?? 'day';

  const table = useMemo(
    () => ({
      columns: [
        { key: 'bucket', header: t(`costs.col.${granularity}`), type: 'text', priority: 1, sortValue: (row) => row.key },
        { key: 'total', header: t('costs.col.total'), type: 'eur', priority: 1 },
        ...series.map((s) => ({ key: s.key, header: s.label, type: 'eur', priority: 2 })),
      ],
      rows: rows.filter((row) => !row.isFuture).map((row) => ({ ...row, bucket: bucketTitle(row) })),
    }),
    [rows, series, granularity],
  );

  const controls = (
    <Segmented
      size="sm"
      ariaLabel={t('costs.split.label')}
      value={split}
      onChange={setSplit}
      options={SPLIT_IDS.map((id) => ({ value: id, label: t(isPhone ? `costs.splitShort.${id}` : `costs.split.${id}`) }))}
    />
  );

  return (
    <ChartCard
      className={className}
      title={t('costs.overTime.title')}
      hint={def('costs.overTime')?.short}
      hintKey={isPhone ? undefined : 'costs.overTime'}
      rows={rows}
      series={series}
      events={events}
      controls={controls}
      table={table}
    >
      {({ series: kept }) => (
        <StackedColumns
          rows={rows}
          series={kept}
          valueFormat="eur"
          legend={false}
          footer={(row) => (Number.isFinite(row.total) ? `${t('costs.col.total')}: ${fmt.eur(row.total)}` : null)}
        />
      )}
    </ChartCard>
  );
}

/** "Where the money went": the services of the period with their unit price, then costs over time. */
export default function WhereSection({ data }) {
  const rows = data.tables.whereWent;
  const saving = data.headline.cacheSavingEur;
  const isPhone = useIsPhone();
  return (
    <section aria-labelledby="costs-where">
      <SectionTitle id="costs-where" title={t('costs.section.where')} description={whereLead(rows)} />
      <div className="grid grid-cols-1 gap-6">
        <Card className="min-w-0">
          <CardHeader title={t('costs.whereWent.title')} hintKey="costs.whereWent" />
          <BarList items={whereItems(rows, { short: isPhone })} format="eur" showShare maxRows={5} />
          {Number.isFinite(saving) && (
            <p className="mt-4 flex items-start gap-2 text-xs font-medium leading-relaxed text-ink-soft">
              <span>{t('costs.cacheSaving', { eur: fmt.eur(saving) })}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <SourceBadge basis={data.basis.cacheSavingEur} />
                <InfoHint hintKey="common.term.cache" label={t('costs.whereWent.title')} />
              </span>
            </p>
          )}
        </Card>
        <CostsOverTime series={data.series} />
      </div>
    </section>
  );
}
