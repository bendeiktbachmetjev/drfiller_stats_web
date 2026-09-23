// Words and files for the Doctors page. Every number is the metric's own; this file turns metric items
// into sentences (resolving ['doctor', pid] to the doctor's email or "Doctor NN") and builds the CSV files.
import { classLabel, doctorLabel, t } from '../../copy/index.js';
import { csvFilename } from '../../export/csv.js';
import { fmt } from '../../format/format.js';

const isDoctorHint = (value) => Array.isArray(value) && value.length === 2 && value[0] === 'doctor';

/**
 * How a doctor is named on this page: email (OVERRIDES O2), else "Doctor NN", else "Deleted account";
 * a pid without any account (anonymous requests) is "No account".
 * @param {{ doctors?: Map<string, object> } | null} ds
 * @param {string} pid
 * @param {Map<string, string>} [revealed] emails shown by "Show email" (click mode), by pid
 */
export function doctorName(ds, pid, revealed) {
  if (pid === 'anonymous') return t('doctors.noAccount');
  const doctor = ds?.doctors?.get?.(pid);
  if (!doctor) return t('common.doctor.deleted');
  const email = revealed?.get(pid);
  return doctorLabel(email ? { ...doctor, email } : doctor);
}

/**
 * Text of one metric item (answer, note, takeaway); ['doctor', pid] values become the doctor's name.
 * @param {{ key: string, values?: object } | null} item
 * @param {object|null} ds
 * @returns {string}
 */
export function itemText(item, ds) {
  if (!item?.key) return '';
  const values = {};
  Object.entries(item.values ?? {}).forEach(([name, raw]) => {
    values[name] = isDoctorHint(raw) ? doctorName(ds, raw[1]) : raw;
  });
  return fmt.textOf({ key: item.key, values });
}

/**
 * The answer sentences for PageLayout. An empty period names its days (§2 rule 4); the doctor's path
 * (all time) still follows.
 * @param {object|null} data AreaResult of computeDoctors
 * @param {object} period
 * @param {object|null} ds
 * @returns {Array<{ text: string, tone: string }>|undefined}
 */
export function answerItemsOf(data, period, ds) {
  if (!data) return undefined;
  const items = data.answer.map((item) => ({ text: itemText(item, ds), tone: item.tone }));
  if (!data.empty) return items;
  const lastDay = fmt.date(period.effToMs - 1);
  return [{ text: t('doctors.empty', { from: fmt.date(period.from), to: lastDay }), tone: 'neutral' }, ...items];
}

// ---------------------------------------------------------------------------------------------------
// CSV (OVERRIDES O2: emails are exported; revealed click-mode emails are not)
// ---------------------------------------------------------------------------------------------------

const col = (key, type = 'num') => ({ key, header: key, type });

/**
 * The page's CSV files (ExportMenu): the doctors of the current view, costs by account type, the path.
 * @param {object|null} data AreaResult of computeDoctors
 * @param {object} period
 * @param {object|null} ds
 */
export function exportTablesOf(data, period, ds) {
  if (!data) return [];
  const file = (name) => () => csvFilename('doctors', name, period);
  return [
    {
      label: t('doctors.export.table'),
      filename: file('doctors'),
      columns: [
        col('doctor', 'text'), col('email', 'text'), col('code', 'text'), col('type', 'text'), col('specialty', 'text'),
        col('forms', 'int'), col('recording_min'), col('history_summaries', 'int'), col('costs_eur'), col('costs_per_month_eur'),
        col('cost_share_pct', 'pct'), col('income_eur'), col('result_eur'), col('credits_left', 'int'), col('recording_counter_min'),
        col('last_active', 'datetime'), col('signed_up', 'date'),
      ],
      getRows: () =>
        data.tables.doctors.map((row) => ({
          doctor: doctorName(ds, row.pid),
          email: ds?.doctors?.get?.(row.pid)?.email ?? null,
          code: row.code,
          type: classLabel(row.class),
          specialty: row.specialty,
          forms: row.forms,
          recording_min: row.recordingMin,
          history_summaries: row.anamnesisRuns,
          costs_eur: row.costEur,
          costs_per_month_eur: row.costPerMonthEur,
          cost_share_pct: row.costShare === null ? null : row.costShare * 100,
          income_eur: row.paidNetEur,
          result_eur: row.resultEur,
          credits_left: row.balance,
          recording_counter_min: row.audioBankMin,
          last_active: row.lastActiveMs,
          signed_up: row.signupAt,
        })),
    },
    {
      label: t('doctors.export.byClass'),
      filename: file('costs_by_account_type'),
      columns: [col('account_type', 'text'), col('costs_eur'), col('share_pct', 'pct')],
      getRows: () =>
        data.tables.byClass.map((part) => ({
          account_type: t(`doctors.byClass.${part.key}`),
          costs_eur: part.valueEur,
          share_pct: part.share === null ? null : part.share * 100,
        })),
    },
    {
      label: t('doctors.export.funnel'),
      filename: file('path_all_time'),
      columns: [col('step', 'text'), col('doctors', 'int')],
      getRows: () => data.tables.funnel.map((step) => ({ step: t(`doctors.funnel.${step.key}`), doctors: step.value })),
    },
  ];
}
