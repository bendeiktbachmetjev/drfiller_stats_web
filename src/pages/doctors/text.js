// Words and files for the Doctors page. Every number is the metric's own; this file turns metric items
// into sentences (through the shared resolver, format/items.js) and builds the CSV files.
import { classLabel, t } from '../../copy/index.js';
import { csvFilename } from '../../export/csv.js';
import { fmt } from '../../format/format.js';
import { doctorName, itemText as sharedItemText } from '../../format/items.js';
import { personButtons, workCountsOf } from '../../data/normalize/workCounts.js';

/**
 * Text of one metric item (answer, note, takeaway); ['doctor', pid] values become the doctor's name.
 * @param {{ key: string, values?: object } | null} item
 * @param {object|null} ds
 * @returns {string}
 */
export const itemText = (item, ds) => sharedItemText(item, { ds });

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
 * CSV column → the Dr. Filler count it holds (GET /work-counts; empty when nothing was counted or it did not load),
 * in the table's order: the six shown by default, then the nine rarer ones.
 */
const WORK_CSV = [
  ['button_presses', 'presses'], ['express_forms', 'formsAuto'], ['rx_renewed', 'rxNew'], ['rx_saved', 'rxSaved'], ['fill_all_runs', 'fillRuns'],
  ['services', 'services'], ['written_into_forms', 'inserts'], ['referrals_written', 'referrals'], ['rx_repeated', 'rxRep'],
  ['express_services', 'servicesAuto'], ['visits_done', 'visitsDone'], ['forms_saved', 'formsSaved'], ['documents_added', 'docs'],
  ['tlk_codes_added', 'dx'], ['work_days', 'days'],
];

/**
 * The page's CSV files (ExportMenu): the doctors of the current view (with what Dr. Filler did for each), which
 * buttons each of them pressed (once the counts are here), costs by account type, the path.
 * @param {object|null} data AreaResult of computeDoctors
 * @param {object} period
 * @param {object|null} ds
 * @param {{ counts: import('../../data/normalize/workCounts.js').WorkCounts|null }|null} [work] useWorkCounts()
 */
export function exportTablesOf(data, period, ds, work = null) {
  if (!data) return [];
  const file = (name) => () => csvFilename('doctors', name, period);
  const counts = work?.counts ?? null;
  const workValues = (pid) => {
    const person = workCountsOf(counts, pid);
    return Object.fromEntries(WORK_CSV.map(([header, key]) => [header, person ? person[key] : null]));
  };
  const buttonsTable = counts && {
    label: t('doctors.export.buttons'),
    filename: file('buttons_by_doctor'),
    columns: [col('doctor', 'text'), col('code', 'text'), col('button_id', 'text'), col('button', 'text'), col('presses', 'int')],
    getRows: () =>
      data.tables.doctors.flatMap((row) =>
        personButtons(counts, row.pid).map((button) => ({
          doctor: doctorName(ds, row.pid),
          code: row.code,
          button_id: button.id,
          button: button.label,
          presses: button.n,
        })),
      ),
  };
  const clinicOf = (pid) => {
    const id = ds?.doctors?.get?.(pid)?.clinicId;
    return id ? ds?.clinicById?.get?.(id)?.name ?? id : null;
  };
  return [
    {
      label: t('doctors.export.table'),
      filename: file('doctors'),
      // The table's order (columns.jsx): the doctor, money, what Dr. Filler did, then the account marks
      columns: [
        col('doctor', 'text'), col('email', 'text'), col('code', 'text'), col('type', 'text'), col('specialty', 'text'),
        col('signed_up', 'date'), col('last_active', 'datetime'), col('forms', 'int'), col('credits_left', 'int'), col('recording_min'),
        col('recording_counter_min'), col('history_summaries', 'int'), col('costs_eur'), col('costs_per_month_eur'),
        col('cost_share_pct', 'pct'), col('income_eur'), col('result_eur'),
        ...WORK_CSV.map(([header]) => col(header, 'int')),
        col('mine_or_test', 'text'), col('clinic', 'text'),
      ],
      getRows: () =>
        data.tables.doctors.map((row) => ({
          ...workValues(row.pid),
          doctor: doctorName(ds, row.pid),
          email: ds?.doctors?.get?.(row.pid)?.email ?? null,
          code: row.code,
          type: classLabel(row.class),
          specialty: row.specialty,
          signed_up: row.signupAt,
          last_active: row.lastActiveMs,
          forms: row.forms,
          credits_left: row.balance,
          recording_min: row.recordingMin,
          recording_counter_min: row.audioBankMin,
          history_summaries: row.anamnesisRuns,
          costs_eur: row.costEur,
          costs_per_month_eur: row.costPerMonthEur,
          cost_share_pct: row.costShare === null ? null : row.costShare * 100,
          income_eur: row.paidNetEur,
          result_eur: row.resultEur,
          mine_or_test: row.internal,
          clinic: clinicOf(row.pid),
        })),
    },
    ...(buttonsTable ? [buttonsTable] : []),
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
