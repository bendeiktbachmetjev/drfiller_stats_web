// CSV of the Overview headline numbers (ExportMenu): one row per number, the period and the comparison.
import { addDays } from '../../data/period.js';
import { csvFilename } from '../../export/csv.js';
import { t } from '../../copy/index.js';

const COLUMNS = [
  { key: 'metric', header: 'metric', type: 'text' },
  { key: 'value', header: 'value', type: 'num' },
  { key: 'unit', header: 'unit', type: 'text' },
  { key: 'previous', header: 'previous_value', type: 'num' },
  { key: 'periodFrom', header: 'period_from', type: 'date' },
  { key: 'periodTo', header: 'period_to', type: 'date' },
];

const pct = (share) => (Number.isFinite(share) ? share * 100 : null);
const seconds = (ms) => (Number.isFinite(ms) ? ms / 1000 : null);
const part = (key) => (data) => data.tables?.costByFeature?.find((row) => row.key === key)?.valueEur ?? null;

// [metric, unit, pick(AreaResult)]
const ROWS = [
  ['result', 'eur', (d) => d.headline.result],
  ['income', 'eur', (d) => d.headline.income],
  ['costs', 'eur', (d) => d.headline.cost],
  ['costs_forms', 'eur', part('form')],
  ['costs_recording', 'eur', part('recording')],
  ['costs_medical_history', 'eur', part('anamnesis')],
  ['costs_server', 'eur', part('fixed')],
  ['paying_active_doctors', 'doctors', (d) => d.headline.payingActive],
  ['active_doctors', 'doctors', (d) => d.headline.active],
  ['costs_of_paying_doctors', 'pct', (d) => pct(d.headline.paidCostShare)],
  ['forms', 'forms', (d) => d.headline.forms],
  ['health', 'ok|slow|bad', (d) => d.headline.health],
  ['median_form_time', 's', (d) => seconds(d.headline.p50Ms)],
  ['forms_over_15s', 'forms', (d) => d.headline.over15],
  ['backup_model_answers', 'forms', (d) => d.headline.fallbackCount],
  ['service_failures', 'requests', (d) => d.headline.serviceFailures],
];

const cents = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : value);
const lastDay = (period) => addDays(period.effTo > period.from ? period.effTo : period.to, -1);

// "What Dr. Filler did": [metric, the count of scopedWorkTotals()]
const WORK_ROWS = [
  ['people_with_counts', 'people'], ['person_days', 'days'], ['button_presses', 'presses'], ['forms', 'forms'], ['express_forms', 'formsAuto'],
  ['written_into_forms', 'inserts'], ['referrals_written', 'referrals'], ['rx_renewed', 'rxNew'], ['rx_repeated', 'rxRep'], ['rx_saved', 'rxSaved'],
  ['fill_all_runs', 'fillRuns'], ['services', 'services'], ['express_services', 'servicesAuto'], ['visits_done', 'visitsDone'],
  ['forms_saved', 'formsSaved'], ['documents_added', 'docs'], ['tlk_codes_added', 'dx'],
];
const WORK_COLUMNS = [
  { key: 'metric', header: 'metric', type: 'text' },
  { key: 'value', header: 'value', type: 'int' },
  { key: 'periodFrom', header: 'period_from', type: 'date' },
  { key: 'periodTo', header: 'period_to', type: 'date' },
];
const BUTTON_COLUMNS = [
  { key: 'id', header: 'button_id', type: 'text' },
  { key: 'label', header: 'button', type: 'text' },
  { key: 'n', header: 'presses', type: 'int' },
  { key: 'periodFrom', header: 'period_from', type: 'date' },
  { key: 'periodTo', header: 'period_to', type: 'date' },
];

/**
 * ExportMenu tables of the page (§3.2 "Export"): the headline numbers of the period on screen, and once the work
 * counts are here, what Dr. Filler did (every count) and every button pressed (the card lists the top ones).
 * @param {{ data: object|null, prev: object|null, period: object }} metric the useOverview() result
 * @param {{ totals?: object|null }} [work] totals = scopedWorkTotals(): the numbers the card shows
 */
export function overviewExportTables(metric, { totals = null } = {}) {
  const { data, prev, period } = metric;
  if (!data || !period) return [];
  const days = { periodFrom: period.from, periodTo: lastDay(period) };
  const workTables = totals
    ? [
        {
          label: t('overview.export.work'),
          filename: () => csvFilename('overview', 'dr_filler_work', period),
          columns: WORK_COLUMNS,
          getRows: () => WORK_ROWS.map(([metricName, key]) => ({ metric: metricName, value: totals[key] ?? null, ...days })),
        },
        {
          label: t('overview.export.buttons'),
          filename: () => csvFilename('overview', 'dr_filler_buttons', period),
          columns: BUTTON_COLUMNS,
          getRows: () => totals.buttons.map((button) => ({ id: button.id, label: button.label, n: button.n, ...days })),
        },
      ]
    : [];
  return [
    {
      label: t('overview.export.summary'),
      filename: () => csvFilename('overview', 'headline', period),
      columns: COLUMNS,
      getRows: () =>
        ROWS.map(([metricName, unit, pick]) => ({
          metric: metricName,
          value: unit === 'eur' ? cents(pick(data)) : pick(data),
          unit,
          previous: prev ? (unit === 'eur' ? cents(pick(prev)) : pick(prev)) : null,
          periodFrom: period.from,
          periodTo: lastDay(period),
        })),
    },
    ...workTables,
  ];
}
