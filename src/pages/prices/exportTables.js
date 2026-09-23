// CSV files of the Prices page (ExportMenu). Rows are built at click time from the metric on screen; the
// file name carries the last 30 days, the window "ours" is measured on (the page has no period).
import { csvFilename } from '../../export/csv.js';
import { modelLabel, statusLabel, t } from '../../copy/index.js';
import { resolvePeriod } from '../../data/period.js';
import { placeLabel } from './text.js';

/**
 * @param {object|null} data the Prices AreaResult
 * @param {number|null} nowMs dataset.nowMs
 * @returns {Array<{ label: string, filename: () => string, columns: object[], getRows: () => object[] }>}
 */
export function pricesExportTables(data, nowMs) {
  const tables = data?.tables;
  if (!tables || !Number.isFinite(nowMs)) return [];
  const window = resolvePeriod('last30', nowMs);
  const file = (name) => () => csvFilename('prices', name, window);
  return [
    {
      label: t('prices.export.options'),
      filename: file('options'),
      columns: [
        { key: 'model', header: 'model', type: 'text' },
        { key: 'place', header: 'place', type: 'text' },
        { key: 'now', header: 'now', type: 'text' },
        { key: 'eu_servers', header: 'eu_servers', type: 'text' },
        { key: 'price_ratio', header: 'price_ratio', type: 'num' },
        { key: 'eur_per_form', header: 'eur_per_form', type: 'num' },
        { key: 'eur_per_form_2027', header: 'eur_per_form_2027', type: 'num' },
        { key: 'forms_per_doctor_month_eur', header: 'forms_per_doctor_month_eur', type: 'num' },
        { key: 'usual_s', header: 'usual_s', type: 'num' },
        { key: 'speed_diff_s', header: 'speed_diff_s', type: 'num' },
        { key: 'checks_of_14', header: 'checks_of_14', type: 'int' },
        { key: 'no_answer', header: 'no_answer', type: 'int' },
        { key: 'runs', header: 'runs', type: 'int' },
      ],
      getRows: () =>
        (tables.whatIfFiltered ?? []).map((row) => ({
          model: modelLabel(row.model), place: placeLabel(row.endpoint), now: row.isBase ? 'yes' : '', eu_servers: row.eu ? 'yes' : 'no',
          price_ratio: row.priceRatio, eur_per_form: row.eurPerForm, eur_per_form_2027: row.eurPerForm2027, forms_per_doctor_month_eur: row.perDoctorEur,
          usual_s: row.expectedMs / 1000, speed_diff_s: row.speedDeltaMs / 1000, checks_of_14: row.checks, no_answer: row.failed, runs: row.runs,
        })),
    },
    {
      label: t('prices.export.availability'),
      filename: file('availability'),
      columns: [
        { key: 'model', header: 'model', type: 'text' },
        { key: 'place', header: 'place', type: 'text' },
        { key: 'available', header: 'available', type: 'text' },
        { key: 'tiny_request_s', header: 'tiny_request_s', type: 'num' },
      ],
      getRows: () =>
        (tables.availability ?? []).flatMap((row) =>
          Object.entries(row.places)
            .filter(([, cell]) => cell)
            .map(([place, cell]) => ({ model: modelLabel(row.model), place: placeLabel(place), available: cell.available ? 'yes' : 'no', tiny_request_s: cell.sec })),
        ),
    },
    {
      label: t('prices.export.models'),
      filename: file('model_prices'),
      columns: [
        { key: 'model', header: 'model', type: 'text' },
        { key: 'input_usd_per_1m', header: 'input_usd_per_1m', type: 'num' },
        { key: 'output_usd_per_1m', header: 'output_usd_per_1m', type: 'num' },
        { key: 'eur_per_our_form', header: 'eur_per_our_form', type: 'num' },
        { key: 'eur_per_our_form_2027', header: 'eur_per_our_form_2027', type: 'num' },
        { key: 'status', header: 'status', type: 'text' },
        { key: 'switch_off_api', header: 'switch_off_api', type: 'text' },
        { key: 'switch_off_cloud', header: 'switch_off_cloud', type: 'text' },
      ],
      getRows: () =>
        (tables.pricesModels ?? []).map((row) => ({
          model: modelLabel(row.model), input_usd_per_1m: row.inPerM, output_usd_per_1m: row.outPerM, eur_per_our_form: row.formEur,
          eur_per_our_form_2027: row.formEur2027 ?? row.formEur, status: statusLabel(row.status), switch_off_api: row.shutdownDirect ?? '', switch_off_cloud: row.vertexShutdown ?? '',
        })),
    },
    {
      label: t('prices.export.transcription'),
      filename: file('transcription_prices'),
      columns: [
        { key: 'service', header: 'service', type: 'text' },
        { key: 'usd_per_hour', header: 'usd_per_hour', type: 'num' },
        { key: 'eur_per_10_min', header: 'eur_per_10_min', type: 'num' },
        { key: 'eur_per_doctor_month', header: 'eur_per_doctor_month', type: 'num' },
      ],
      getRows: () =>
        (tables.pricesTranscription ?? []).map((row) => ({ service: row.id, usd_per_hour: row.perHourUsd, eur_per_10_min: row.per10Eur, eur_per_doctor_month: row.perDoctorMonthEur })),
    },
    {
      label: t('prices.export.payments'),
      filename: file('payment_fees'),
      columns: [
        { key: 'method', header: 'method', type: 'text' },
        { key: 'pct', header: 'fee_pct', type: 'num' },
        { key: 'fixed', header: 'fee_fixed_eur', type: 'num' },
        { key: 'pack250', header: 'pack250_fee_eur', type: 'num' },
        { key: 'pack600', header: 'pack600_fee_eur', type: 'num' },
        { key: 'pack1500', header: 'pack1500_fee_eur', type: 'num' },
      ],
      getRows: () => (tables.pricesPayments ?? []).map((row) => ({ ...row, method: t(`prices.method.${row.method}`), pct: row.pct * 100 })),
    },
  ];
}
