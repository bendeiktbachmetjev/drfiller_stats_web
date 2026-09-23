// CSV tables of the Money page (ExportMenu): the same rows the page shows, with doctors by name (OVERRIDES O2).
import { addDays } from '../../data/period.js';
import { csvFilename } from '../../export/csv.js';
import { t } from '../../copy/index.js';
import { doctorOf, doctorText, methodLabel, packName } from './text.js';

const pct = (share) => (Number.isFinite(share) ? share * 100 : null);

const PAYMENT_COLUMNS = [
  { key: 't', header: 'paid_at', type: 'datetime' },
  { key: 'doctor', header: 'doctor', type: 'text' },
  { key: 'code', header: 'doctor_code', type: 'text' },
  { key: 'pack', header: 'pack', type: 'text' },
  { key: 'credits', header: 'credits', type: 'int' },
  { key: 'grossEur', header: 'paid_eur', type: 'num' },
  { key: 'discountEur', header: 'discount_eur', type: 'num' },
  { key: 'feeEur', header: 'fee_eur', type: 'num' },
  { key: 'vatEur', header: 'vat_eur', type: 'num' },
  { key: 'netEur', header: 'income_eur', type: 'num' },
  { key: 'refundEur', header: 'refund_eur', type: 'num' },
  { key: 'method', header: 'paid_with', type: 'text' },
  { key: 'credited', header: 'credits_arrived', type: 'text' },
];

const WEEK_COLUMNS = [
  { key: 'from', header: 'from', type: 'date' },
  { key: 'to', header: 'to_inclusive', type: 'date' },
  { key: 'income', header: 'income_eur', type: 'num' },
  { key: 'costForm', header: 'costs_forms_eur', type: 'num' },
  { key: 'costRecording', header: 'costs_recording_eur', type: 'num' },
  { key: 'costAnamnesis', header: 'costs_medical_history_eur', type: 'num' },
  { key: 'costFixed', header: 'costs_server_eur', type: 'num' },
  { key: 'cost', header: 'costs_eur', type: 'num' },
  { key: 'result', header: 'result_eur', type: 'num' },
];

const STEP_COLUMNS = [
  { key: 'step', header: 'step', type: 'text' },
  { key: 'now', header: 'now_per_month', type: 'num' },
  { key: 'nowTotal', header: 'period_total', type: 'num' },
  { key: 'visit', header: 'one_visit', type: 'num' },
  { key: 'doctor', header: 'doctor_per_month', type: 'num' },
  { key: 's0', header: 'scale_1_per_month', type: 'num' },
  { key: 's1', header: 'scale_2_per_month', type: 'num' },
];

const VISIT_COLUMNS = [
  { key: 'visit', header: 'visit', type: 'text' },
  { key: 'credits', header: 'credits', type: 'num' },
  { key: 'costEur', header: 'costs_eur', type: 'num' },
  { key: 'netEur', header: 'income_eur', type: 'num' },
  { key: 'leftEur', header: 'kept_eur', type: 'num' },
  { key: 'keptPct', header: 'kept_pct', type: 'pct' },
];

/**
 * ExportMenu tables of the page: purchases, income and costs by week/month, the plan step by step and the
 * visit types. `getRows` runs at click time on the data that is on screen.
 * @param {{ data: object|null, period: object }} metric the useMoney() result
 * @param {object|null} ds the Dataset (doctor names)
 */
export function moneyExportTables(metric, ds) {
  const { data, period } = metric;
  if (!data || !period) return [];
  const scalePct = (key, value) => (key === 'marginPct' ? pct(value) : value);
  return [
    {
      label: t('money.payments.title'),
      filename: () => csvFilename('money', 'purchases', period),
      columns: PAYMENT_COLUMNS,
      getRows: () =>
        (data.tables.payments ?? []).map((row) => ({
          ...row,
          doctor: doctorText(ds, row.pid),
          code: row.pid ? doctorOf(ds, row.pid).code ?? '' : '',
          pack: packName(row.packId),
          method: methodLabel(row.method),
        })),
    },
    {
      label: t('money.moneyChart.title'),
      filename: () => csvFilename('money', 'income_and_costs', period),
      columns: WEEK_COLUMNS,
      getRows: () => (data.moneySeries ?? []).filter((row) => !row.isFuture).map((row) => ({ ...row, to: addDays(row.to, -1) })),
    },
    {
      label: t('money.scaleTable.title'),
      filename: () => csvFilename('money', 'plan_steps', period),
      columns: STEP_COLUMNS,
      getRows: () =>
        (data.tables.scaleSteps ?? []).map((row) => {
          const out = { step: t(`money.step.${row.key}`) };
          ['now', 'nowTotal', 'visit', 'doctor', 's0', 's1'].forEach((column) => {
            out[column] = scalePct(row.key, row[column]);
          });
          return out;
        }),
    },
    {
      label: t('money.visitTypes.title'),
      filename: () => csvFilename('money', 'visits', period),
      columns: VISIT_COLUMNS,
      getRows: () => (data.tables.visitTypes ?? []).map((row) => ({ ...row, visit: t(`money.visit.${row.key}`), keptPct: pct(row.shareLeft) })),
    },
  ];
}
