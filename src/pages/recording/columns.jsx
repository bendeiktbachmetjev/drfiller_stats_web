// DataTable columns of the Recording page. Every column declares its phone priority (§3.2):
// priority 1 is shown on the phone card, 2–3 go behind "More details".
import React from 'react';
import { DoctorName } from '../../ui/index.js';
import { doctorLabel, errorKindLabel, has, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { bucketLabels } from '../../charts/theme.js';
import { MINUTES_SERIES } from './series.js';

const when = () => ({ key: 't', header: t('recording.col.when'), type: 'dateTime', priority: 1 });

const doctor = (doctorOf) => ({
  key: 'pid',
  header: t('recording.col.doctor'),
  type: 'node',
  priority: 2,
  render: (row) => <DoctorName doctor={doctorOf(row.pid)} stacked />,
  sortValue: (row) => doctorLabel(doctorOf(row.pid)),
});

const minutes = (key, header, priority = 1) => ({ key, header, type: 'minutes', priority });
const waited = (key, header) => ({ key, header, type: 'sec', priority: 3 });

const textCell = (key, header, priority, textOf) => ({
  key,
  header,
  type: 'node',
  priority,
  render: (row) => textOf(row),
  sortValue: (row) => textOf(row),
});

const labelOr = (key, raw) => (has(key) ? t(key) : raw ?? fmt.empty);

/** "Every recording since 22 Sep" (the list under a thin chart). */
export const recordingColumns = (doctorOf) => [
  when(),
  doctor(doctorOf),
  textCell('kind', t('recording.col.what'), 1, (row) => t(row.kind === 'live' ? 'recording.what.live' : 'recording.what.dictation')),
  textCell('provider', t('recording.col.via'), 1, (row) => t(row.provider === 'openai' ? 'recording.via.openai' : 'recording.via.soniox')),
  minutes('minutes', t('recording.col.length')),
];

/** "Conversations". */
export const sessionColumns = (doctorOf) => [
  when(),
  doctor(doctorOf),
  minutes('minutes', t('recording.col.length')),
  { key: 'speakers', header: t('recording.col.speakers'), type: 'int', priority: 3 },
  { key: 'reconnects', header: t('recording.col.reconnects'), type: 'int', priority: 3 },
  waited('waitMs', t('recording.col.wait')),
  { key: 'credits', header: t('recording.col.credits'), type: 'dec', priority: 1 },
  minutes('confirmedMin', t('recording.col.confirmed'), 3),
];

/** "Recording charges" (B2 meter events). */
export const meterColumns = (doctorOf) => [
  when(),
  doctor(doctorOf),
  textCell('source', t('recording.col.source'), 3, (row) => labelOr(`recording.meter.source.${row.source}`, row.source)),
  minutes('addedMin', t('recording.col.added'), 2),
  { key: 'charged', header: t('recording.col.charged'), type: 'int', priority: 1 },
  minutes('bankMin', t('recording.col.bank'), 3),
];

/** "Dictations through the backup OpenAI". */
export const openaiColumns = (doctorOf) => [
  when(),
  doctor(doctorOf),
  minutes('minutes', t('recording.col.lengthEstimate')),
  waited('waitMs', t('recording.col.waited')),
  textCell('reason', t('recording.col.reason'), 2, (row) =>
    row.reason ? (has(`errorKind.${row.reason}`) ? errorKindLabel(row.reason) : row.reason) : t('recording.openai.notRecorded'),
  ),
];

// Money cells show $ on hover (§2 rule 5: $ only in cost tooltips).
const eurWithUsd = (eurKey, usdKey, header, priority) => ({
  key: eurKey,
  header,
  type: 'node',
  align: 'right',
  priority,
  render: (row) => <span title={fmt.eurUsd(row[eurKey], row[usdKey])}>{fmt.eurUnit(row[eurKey])}</span>,
  sortValue: (row) => row[eurKey],
});

/** "Check against Soniox", by Vilnius day. */
export const reconcileColumns = () => [
  { key: 'day', header: t('recording.col.day'), type: 'date', priority: 1 },
  minutes('ourMin', t('recording.col.ourMin')),
  minutes('sonioxMin', t('recording.col.sonioxMin')),
  eurWithUsd('ourEur', 'ourUsd', t('recording.col.ourEur'), 2),
  eurWithUsd('sonioxEur', 'sonioxUsd', t('recording.col.sonioxEur'), 2),
  minutes('diffMin', t('recording.col.diffMin'), 1),
];

const LIMIT_TONE = { true: 'text-good', false: 'text-warn' };

/** "Soniox limit: when we hit it" (rows from capacity()). */
export const limitColumns = () => [
  {
    key: 'doctors',
    header: t('recording.limit.col.doctors'),
    type: 'node',
    priority: 1,
    sortValue: (row) => row.doctors,
    render: (row) => (
      <span className="whitespace-nowrap">
        {t(row.key === 'now' ? 'recording.limit.row.now' : 'recording.limit.row.n', { n: fmt.int(row.doctors) })}
      </span>
    ),
  },
  { key: 'mean', header: t('recording.limit.col.mean'), type: 'dec', priority: 2 },
  { key: 'p95', header: t('recording.limit.col.p95'), type: 'int', priority: 1 },
  { key: 'limit', header: t('recording.limit.col.limit'), type: 'int', priority: 3 },
  {
    key: 'enough',
    header: t('recording.limit.col.enough'),
    type: 'node',
    priority: 1,
    sortable: false,
    render: (row) =>
      row.enough === null ? fmt.empty : (
        <span className={`font-semibold ${LIMIT_TONE[row.enough]}`}>{t(row.enough ? 'recording.limit.yes' : 'recording.limit.no')}</span>
      ),
  },
];

/** The table twin of the minutes chart: one row per bucket. */
export function minutesTable(series) {
  const labels = bucketLabels(series);
  const rows = series
    .filter((row) => !row.isFuture)
    .map((row) => ({ ...row, bucket: labels[series.indexOf(row)].title }));
  const columns = [
    { key: 'bucket', header: t('recording.col.bucket'), type: 'text', priority: 1, sortValue: (row) => row.from },
    ...MINUTES_SERIES.map((s) => ({ key: s.key, header: t(s.labelKey), type: 'minutes', priority: 1 })),
  ];
  return { columns, rows };
}
