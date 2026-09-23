// Table columns of the Requests page (every column declares its phone priority, §3.2) and the CSV
// exports. Doctors are joined here by pid: the metric never carries names or emails (O2, privacy scan).
import React from 'react';
import { DoctorName, ModelName } from '../../ui/index.js';
import { csvFilename } from '../../export/csv.js';
import { doctorLabel, t } from '../../copy/index.js';

const doctorOf = (doctors, pid) => doctors?.get?.(pid) ?? null;

/** "The most expensive forms". */
export const priciestColumns = (doctors) => [
  { key: 't', header: t('requests.col.when'), type: 'dateTime', priority: 1 },
  {
    key: 'pid',
    header: t('requests.col.doctor'),
    type: 'node',
    render: (row) => <DoctorName doctor={doctorOf(doctors, row.pid)} stacked />,
    sortValue: (row) => doctorLabel(doctorOf(doctors, row.pid)),
    priority: 2,
  },
  { key: 'model', header: t('requests.col.model'), type: 'node', render: (row) => <ModelName id={row.model} />, sortValue: (row) => row.model, priority: 3 },
  { key: 'pages', header: t('requests.col.pages'), type: 'int', priority: 1 },
  { key: 'outTok', header: t('requests.col.answer'), type: 'tokens', priority: 3 },
  { key: 'chars', header: t('requests.col.words'), type: 'int', priority: 3 },
  { key: 'durMs', header: t('requests.col.time'), type: 'sec', priority: 2 },
  { key: 'costEur', header: t('requests.col.price'), type: 'eurUnit', priority: 1 },
];

/** "Summaries": one row per medical history summary run. */
export const runColumns = (doctors) => [
  { key: 'startMs', header: t('requests.col.start'), type: 'dateTime', priority: 1 },
  {
    key: 'pid',
    header: t('requests.col.doctor'),
    type: 'node',
    render: (row) => <DoctorName doctor={doctorOf(doctors, row.pid)} stacked />,
    sortValue: (row) => doctorLabel(doctorOf(doctors, row.pid)),
    priority: 2,
  },
  { key: 'version', header: t('requests.col.way'), type: 'node', render: (row) => t(`requests.way.${row.version}`), sortValue: (row) => row.version, priority: 3 },
  { key: 'calls', header: t('requests.col.calls'), type: 'int', priority: 3 },
  { key: 'docs', header: t('requests.col.docs'), type: 'int', priority: 3 },
  { key: 'facts', header: t('requests.col.facts'), type: 'int', priority: 3 },
  { key: 'durMs', header: t('requests.col.time'), type: 'duration', priority: 3 },
  { key: 'costEur', header: t('requests.col.cost'), type: 'eurUnit', priority: 1 },
  { key: 'credits', header: t('requests.col.credits'), type: 'int', priority: 1 },
  { key: 'left', header: t('requests.col.left'), type: 'pct', priority: 2 },
  { key: 'capped', header: t('requests.col.cut'), type: 'node', render: (row) => (row.capped ? t('requests.cut.yes') : ''), sortValue: (row) => (row.capped ? 1 : 0), priority: 3 },
];

/**
 * CSV exports of the page (ExportMenu tables). Rows are read at click time from the metric on screen.
 * @param {{ data: object|null, period: object, doctors: Map<string, object>|undefined }} input
 */
export function exportTables({ data, period, doctors }) {
  const tables = data?.tables ?? {};
  const file = (name) => () => csvFilename('requests', name, period);
  const doctorText = (pid) => doctorLabel(doctorOf(doctors, pid));
  return [
    {
      label: t('requests.export.byType'),
      filename: file('price_per_request'),
      columns: [
        { key: 'kind', header: 'kind', type: 'text' },
        { key: 'unit_eur', header: 'unit_eur', type: 'num' },
        { key: 'basis', header: 'basis', type: 'text' },
        { key: 'count', header: 'count', type: 'int' },
        { key: 'total_eur', header: 'total_eur', type: 'num' },
      ],
      getRows: () => (tables.byType ?? []).map((row) => ({ kind: row.key, unit_eur: row.unitEur, basis: row.basis, count: row.count, total_eur: row.totalEur })),
    },
    {
      label: t('requests.export.sizeBuckets'),
      filename: file('form_sizes'),
      columns: [
        { key: 'from_tokens', header: 'from_tokens', type: 'int' },
        { key: 'to_tokens', header: 'to_tokens', type: 'int' },
        { key: 'forms', header: 'forms', type: 'int' },
        { key: 'forms_pct', header: 'forms_pct', type: 'pct' },
        { key: 'cost_eur', header: 'cost_eur', type: 'num' },
        { key: 'cost_pct', header: 'cost_pct', type: 'pct' },
      ],
      getRows: () =>
        (tables.sizeBuckets ?? []).map((row) => ({
          from_tokens: row.fromTok, to_tokens: row.toTok, forms: row.forms, forms_pct: row.formShare * 100, cost_eur: row.costEur, cost_pct: row.costShare * 100,
        })),
    },
    {
      label: t('requests.export.priciest'),
      filename: file('priciest_forms'),
      columns: [
        { key: 'time', header: 'time', type: 'datetime' },
        { key: 'doctor', header: 'doctor', type: 'text' },
        { key: 'model', header: 'model', type: 'text' },
        { key: 'request_tokens', header: 'request_tokens', type: 'int' },
        { key: 'answer_tokens', header: 'answer_tokens', type: 'int' },
        { key: 'doctor_chars', header: 'doctor_chars', type: 'int' },
        { key: 'duration_ms', header: 'duration_ms', type: 'int' },
        { key: 'cost_eur', header: 'cost_eur', type: 'num' },
      ],
      getRows: () =>
        (tables.priciest ?? []).map((row) => ({
          time: row.t, doctor: doctorText(row.pid), model: row.model, request_tokens: row.inTok, answer_tokens: row.outTok,
          doctor_chars: row.chars, duration_ms: row.durMs, cost_eur: row.costEur,
        })),
    },
    {
      label: t('requests.export.anamRuns'),
      filename: file('history_summaries'),
      columns: [
        { key: 'start', header: 'start', type: 'datetime' },
        { key: 'doctor', header: 'doctor', type: 'text' },
        { key: 'way', header: 'way', type: 'text' },
        { key: 'calls', header: 'calls', type: 'int' },
        { key: 'documents', header: 'documents', type: 'int' },
        { key: 'facts', header: 'facts', type: 'int' },
        { key: 'duration_ms', header: 'duration_ms', type: 'int' },
        { key: 'cost_eur', header: 'cost_eur', type: 'num' },
        { key: 'credits', header: 'credits', type: 'int' },
        { key: 'kept_pct', header: 'kept_pct', type: 'pct' },
        { key: 'cut_off', header: 'cut_off', type: 'text' },
      ],
      getRows: () =>
        (tables.anamRuns ?? []).map((row) => ({
          start: row.startMs, doctor: doctorText(row.pid), way: row.version, calls: row.calls, documents: row.docs, facts: row.facts,
          duration_ms: row.durMs, cost_eur: row.costEur, credits: row.credits, kept_pct: row.left === null ? null : row.left * 100, cut_off: row.capped,
        })),
    },
  ];
}
