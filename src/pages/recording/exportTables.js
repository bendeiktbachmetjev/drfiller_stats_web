// CSV exports of the Recording page (ExportMenu tables). Rows are built at click time from the metric
// that is on screen; doctors are written as shown on the page (email or "Doctor NN") plus the short code.
import { csvFilename } from '../../export/csv.js';
import { doctorLabel, t } from '../../copy/index.js';

const doctorFields = (doctorOf, pid) => {
  const doctor = doctorOf(pid);
  return { doctor: doctorLabel(doctor), code: doctor?.code ?? '' };
};

const DOCTOR_COLUMNS = [
  { key: 'doctor', header: 'doctor', type: 'text' },
  { key: 'code', header: 'code', type: 'text' },
];

/**
 * @param {() => import('../../data/metrics/shared.js').AreaResult|null} getData
 * @param {import('../../data/period.js').Period} period
 * @param {(pid: string) => object|null} doctorOf
 */
export function exportTables(getData, period, doctorOf) {
  const rowsOf = (name) => getData()?.tables?.[name] ?? [];
  return [
    {
      label: t('recording.chart.title'),
      filename: () => csvFilename('recording', 'minutes', period),
      columns: [
        { key: 'from', header: 'bucket_start', type: 'date' },
        { key: 'live', header: 'conversation_min', type: 'num' },
        { key: 'dictationSoniox', header: 'dictation_soniox_min', type: 'num' },
        { key: 'dictationOpenai', header: 'dictation_openai_min', type: 'num' },
      ],
      getRows: () => (getData()?.series ?? []).filter((row) => !row.isFuture),
    },
    {
      label: t('recording.sessions.title'),
      filename: () => csvFilename('recording', 'conversations', period),
      columns: [
        { key: 't', header: 'ended_at', type: 'datetime' },
        ...DOCTOR_COLUMNS,
        { key: 'minutes', header: 'minutes', type: 'num' },
        { key: 'speakers', header: 'speakers', type: 'int' },
        { key: 'reconnects', header: 'reconnects', type: 'int' },
        { key: 'credits', header: 'credits_estimate', type: 'num' },
        { key: 'confirmedMin', header: 'soniox_confirmed_min', type: 'num' },
      ],
      getRows: () => rowsOf('sessions').map((row) => ({ ...row, ...doctorFields(doctorOf, row.pid) })),
    },
    {
      label: t('recording.meter.title'),
      filename: () => csvFilename('recording', 'charges', period),
      columns: [
        { key: 't', header: 'at', type: 'datetime' },
        ...DOCTOR_COLUMNS,
        { key: 'source', header: 'source', type: 'text' },
        { key: 'addedMin', header: 'added_min', type: 'num' },
        { key: 'charged', header: 'credits_charged', type: 'int' },
        { key: 'bankMin', header: 'left_on_counter_min', type: 'num' },
      ],
      getRows: () => rowsOf('meterEvents').map((row) => ({ ...row, ...doctorFields(doctorOf, row.pid) })),
    },
    {
      label: t('recording.openai.title'),
      filename: () => csvFilename('recording', 'openai_backup', period),
      columns: [
        { key: 't', header: 'at', type: 'datetime' },
        ...DOCTOR_COLUMNS,
        { key: 'minutes', header: 'minutes_estimate', type: 'num' },
        { key: 'waitMs', header: 'waited_ms', type: 'int' },
        { key: 'reason', header: 'reason', type: 'text' },
      ],
      getRows: () => rowsOf('openaiFallbacks').map((row) => ({ ...row, ...doctorFields(doctorOf, row.pid) })),
    },
  ];
}
