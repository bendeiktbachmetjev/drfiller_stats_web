import React, { useMemo } from 'react';
import StackedColumns from '../../charts/StackedColumns.jsx';
import { ChartCard, SectionTitle } from '../../ui/index.js';
import { SERIES } from '../../charts/theme.js';
import { REQUEST_SERIES } from '../../data/metrics/requests.js';
import { fmt } from '../../format/format.js';
import { periodPhrase } from '../../format/items.js';
import { plural, t } from '../../copy/index.js';

// Colour by identity, the same as in "Price of one request" right below (§5.3.4).
const COLOR = { forms: SERIES.forms, conversations: SERIES.live, dictations: SERIES.dictation, summaries: SERIES.anamnesis };
const UNIT = {
  forms: 'common.unit.form',
  conversations: 'common.unit.conversation',
  dictations: 'requests.unit.dictation',
  summaries: 'requests.unit.historySummary',
};

/**
 * The line under the section title: "1,299 requests over the last 30 days: 1,002 forms, 251 conversations, …".
 * Kinds without a request are left out; a single kind needs no total in front of it.
 * @param {Array<{ key: string, count: number }>} counts tables.requestCounts
 * @param {import('../../data/period.js').Period} period
 * @returns {string|null}
 */
export function countLead(counts, period) {
  const parts = (counts ?? [])
    .filter((row) => row.count > 0)
    .map((row) => t('requests.count.part', { n: fmt.int(row.count), unit: plural(row.count, UNIT[row.key]) }));
  if (parts.length === 0) return null;
  const phrase = periodPhrase(period);
  if (parts.length === 1) return t('requests.count.leadOne', { part: parts[0], period: phrase });
  const total = counts.reduce((acc, row) => acc + row.count, 0);
  return t('requests.count.lead', { n: fmt.int(total), requests: plural(total, 'common.unit.request'), period: phrase, parts: parts.join(', ') });
}

/**
 * "How many requests" (anchor #count): requests per day, week or month of the period as stacked columns — forms,
 * conversations, dictations, medical history summaries — with the table twin. The bucket follows the period, as on
 * every chart of the site. These are plain counts, so the chart is drawn however few requests there are (the
 * "too little data" sentences are for trends and averages); a kind without requests is named under the chart.
 *   metric  the useRequests() result
 */
export default function CountSection({ metric }) {
  const { data, period } = metric;
  const rows = data?.series;
  const counts = data?.tables?.requestCounts;
  const granularity = rows?.[0]?.granularity ?? period?.chart?.granularity ?? 'day';
  const series = useMemo(() => REQUEST_SERIES.map((key) => ({ key, label: t(`requests.series.${key}`), color: COLOR[key] })), []);

  const table = useMemo(() => {
    const shown = (rows ?? []).filter((row) => !row.isFuture);
    const footerRow = { key: 'sum', bucket: t('requests.col.total'), total: 0 };
    series.forEach((s) => {
      footerRow[s.key] = shown.reduce((acc, row) => acc + (row[s.key] ?? 0), 0);
      footerRow.total += footerRow[s.key];
    });
    return {
      columns: [
        { key: 'bucket', header: t(`requests.col.${granularity}`), type: 'text', priority: 1, sortValue: (row) => row.key },
        { key: 'total', header: t('requests.col.total'), type: 'int', priority: 1 },
        ...series.map((s) => ({ key: s.key, header: s.label, type: 'int', priority: 2 })),
      ],
      rows: shown.map((row) => ({ ...row, bucket: fmt.bucketTitle(row.key, row.granularity) })),
      footerRow: shown.length > 1 ? footerRow : undefined,
    };
  }, [rows, series, granularity]);

  // A column of one kind already shows its total as the value.
  const totalLine = (row) => (series.filter((s) => row[s.key] > 0).length > 1 ? `${t('requests.col.total')}: ${fmt.int(row.total)}` : null);

  return (
    <section aria-label={t('requests.section.count')}>
      <SectionTitle id="count" title={t('requests.section.count')} description={countLead(counts, period)} />
      <ChartCard
        title={t(`requests.overTime.title.${granularity}`)}
        hintKey="requests.overTime"
        rows={rows}
        series={series}
        minNonZeroBuckets={1}
        table={table}
        state={data ? 'ready' : 'first'}
      >
        {({ series: kept }) => <StackedColumns rows={rows ?? []} series={kept} valueFormat="int" legend={false} footer={totalLine} />}
      </ChartCard>
    </section>
  );
}
