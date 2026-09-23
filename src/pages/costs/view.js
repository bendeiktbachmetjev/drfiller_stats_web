// Formatting of the Costs metric for the page: answer sentences, chart series, table rows, CSV.
// Every number is the metric's own; this file only turns them into words and rows.
import { SERIES } from '../../charts/theme.js';
import { SPLITS } from '../../data/metrics/costs.js';
import { csvFilename } from '../../export/csv.js';
import { fmt } from '../../format/format.js';
import { modelLabel, plural, t } from '../../copy/index.js';

const PART_ORDER = ['form', 'anam', 'rec', 'fixed'];

/** Identity colours of every series of the "Costs over time" chart (§4.3). */
const SERIES_COLORS = {
  form: SERIES.forms,
  recording: SERIES.live,
  anamnesis: SERIES.anamnesis,
  gemini: SERIES.google,
  soniox: SERIES.soniox,
  openai: SERIES.openai,
  main: SERIES.main,
  fallback: SERIES.fallback,
  other: SERIES.other,
  fixed: SERIES.fixed,
};

/** Colours of the "Where the money went" rows (identity, never rank). */
export const WHERE_COLORS = {
  form: SERIES.forms,
  anamnesis: SERIES.anamnesis,
  live: SERIES.live,
  dictation: SERIES.dictation,
  fixed: SERIES.fixed,
};

export const SPLIT_IDS = Object.keys(SPLITS);

/**
 * Series of one split for ChartCard / StackedColumns, bottom to top.
 * @param {'feature'|'provider'|'model'} split
 * @returns {Array<{ key: string, label: string, color: string }>}
 */
export const seriesOf = (split) => SPLITS[split].map((key) => ({ key, label: t(`costs.series.${key}`), color: SERIES_COLORS[key] }));

/**
 * One answer sentence. The split sentence names only the parts that cost something; the others are
 * the metric's items as they are.
 * @param {{ key: string, values?: object, tone: string }} item
 * @param {string} periodText
 * @returns {string}
 */
export function answerText(item, periodText) {
  if (item.key !== 'costs.answer.split') return fmt.textOf(item);
  const texts = fmt.values(item.values);
  const parts = PART_ORDER.filter((part) => item.values[part]?.[1] > 0).map((part) => t(`costs.part.${part}`, { x: texts[part] }));
  return t('costs.answer.split', { period: periodText, cost: texts.cost, parts: parts.join(', ') });
}

/** Tooltip/table title of a series bucket: 'Wed 23 Sep 2026', 'Week of 21 Sep 2026', 'September 2026'. */
export const bucketTitle = (row) => fmt.bucketTitle(row.key, row.granularity);

/** The largest row of "Where the money went" as one sentence ("Forms — Gemini: 70% of the costs."). */
export function whereLead(rows) {
  const total = rows.reduce((acc, row) => acc + row.valueEur, 0);
  const top = [...rows].sort((a, b) => b.valueEur - a.valueEur)[0];
  if (!top || !(total > 0)) return null;
  return t('costs.where.lead', { name: t(`costs.where.${top.key}`), share: fmt.pct(top.valueEur / total) });
}

/**
 * BarList items of "Where the money went" (rows without any cost are left out). Phones get the short
 * label ("Dictation"): their label column is 140 px and the sub-line with the vendor is hidden there.
 */
export function whereItems(rows, { short = false } = {}) {
  const subOf = (row) => {
    switch (row.key) {
      case 'form':
        return t('costs.where.form.sub', { n: fmt.int(row.count), forms: plural(row.count, 'common.unit.form'), unit: fmt.eurUnit(row.unitEur) });
      case 'anamnesis':
        return t('costs.where.anamnesis.sub', { n: fmt.int(row.count), runs: plural(row.count, 'costs.where.summary'), unit: fmt.eurUnit(row.unitEur) });
      case 'live':
        return t('costs.where.live.sub', { min: fmt.minutes(row.minutes), unit: fmt.eurUnit(row.unitEur) });
      case 'dictation':
        return t('costs.where.dictation.sub', { min: fmt.minutes(row.minutes), openai: fmt.minutes(row.openaiMinutes) });
      default:
        return t('costs.where.fixed.sub', { x: fmt.eur(row.perMonthEur) });
    }
  };
  return rows
    .filter((row) => row.valueEur > 0)
    .map((row) => ({ key: row.key, label: t(short ? `costs.whereShort.${row.key}` : `costs.where.${row.key}`), value: row.valueEur, sub: subOf(row), color: WHERE_COLORS[row.key] }));
}

/** Rows of «Why a form got more expensive» for the two month charts. */
export const monthChartRows = (months) =>
  months.map((month) => ({
    key: month.monthKey,
    granularity: 'month',
    isFuture: false,
    isPartial: month.isPartial,
    highlight: month.inPeriod,
    price: month.costPerFormEur,
    pages: month.meanPages,
    forms: month.forms,
  }));

/** The role of a model as words: its main role, plus the others it also had ("backup · manual switch 1"). */
export function roleText(row) {
  const others = Object.entries(row.roles)
    .filter(([role, n]) => role !== row.role && n > 0)
    .map(([role, n]) => `${t(`costs.role.${role}`)} ${fmt.int(n)}`);
  return [t(`costs.role.${row.role}`), ...others].join(' · ');
}

/** The newest month with a Google invoice, as the invoices lead sentence. */
export function invoiceLead(rows) {
  const latest = rows.find((row) => Number.isFinite(row.googleInvoiceEur));
  if (!latest) return t('costs.invoices.empty');
  const values = { month: fmt.month(latest.month), list: fmt.eur(latest.googleListEur), paid: fmt.eur(latest.googlePaidEur), promo: fmt.eur(latest.googlePromoCreditsEur) };
  return latest.googlePromoCreditsEur > 0 ? t('costs.invoices.lead', values) : t('costs.invoices.leadNoPromo', values);
}

// ---------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------

const col = (key, type = 'num') => ({ key, header: key, type });

/**
 * The page's CSV files (ExportMenu). Names and codes only; no personal data.
 * @param {object|null} data AreaResult of computeCosts
 * @param {object} period
 */
export function exportTablesOf(data, period) {
  if (!data || data.empty) return [];
  const file = (name) => () => csvFilename('costs', name, period);
  return [
    {
      label: t('costs.export.series'),
      filename: file('over_time'),
      columns: [col('bucket_start', 'date'), col('total_eur'), col('forms_eur'), col('recording_eur'), col('medical_history_eur'), col('server_eur'), col('google_eur'), col('soniox_eur'), col('openai_eur'), col('main_model_eur'), col('backup_model_eur'), col('other_models_eur'), col('requests', 'int')],
      getRows: () =>
        data.series
          .filter((row) => !row.isFuture)
          .map((row) => ({
            bucket_start: row.from, total_eur: row.total, forms_eur: row.form, recording_eur: row.recording, medical_history_eur: row.anamnesis, server_eur: row.fixed,
            google_eur: row.gemini, soniox_eur: row.soniox, openai_eur: row.openai, main_model_eur: row.main, backup_model_eur: row.fallback, other_models_eur: row.other, requests: row.requests,
          })),
    },
    {
      label: t('costs.export.whereWent'),
      filename: file('where_the_money_went'),
      columns: [col('item', 'text'), col('eur'), col('share_pct'), col('count', 'int'), col('minutes'), col('unit_eur')],
      getRows: () =>
        data.tables.whereWent.map((row) => ({
          item: t(`costs.where.${row.key}`), eur: row.valueEur, share_pct: data.headline.total > 0 ? (row.valueEur / data.headline.total) * 100 : null,
          count: row.count ?? null, minutes: row.minutes ?? null, unit_eur: row.unitEur ?? null,
        })),
    },
    {
      label: t('costs.export.byModel'),
      filename: file('by_model'),
      columns: [col('model', 'text'), col('model_id', 'text'), col('role', 'text'), col('forms', 'int'), col('request_tokens', 'int'), col('answer_tokens', 'int'), col('eur'), col('per_form_eur'), col('share_pct')],
      getRows: () =>
        data.tables.byModel.map((row) => ({
          model: modelLabel(row.model), model_id: row.model, role: t(`costs.role.${row.role}`), forms: row.forms, request_tokens: row.inTok, answer_tokens: row.outTok,
          eur: row.costEur, per_form_eur: row.perFormEur, share_pct: row.share === null ? null : row.share * 100,
        })),
    },
    {
      label: t('costs.export.invoices'),
      filename: () => `drfiller_costs_invoices_${data.tables.invoices.at(-1)?.month ?? ''}_${data.tables.invoices[0]?.month ?? ''}.csv`,
      columns: [col('month', 'text'), col('google_list_eur'), col('google_invoice_eur'), col('promo_credits_eur'), col('google_paid_eur'), col('railway_share_usd'), col('soniox_list_eur'), col('soniox_invoice_usd'), col('openai_invoice_usd'), col('other_eur'), col('total_eur'), col('note', 'text')],
      getRows: () =>
        data.tables.invoices.map((row) => ({
          month: row.month, google_list_eur: row.googleListEur, google_invoice_eur: row.googleInvoiceEur, promo_credits_eur: row.googlePromoCreditsEur, google_paid_eur: row.googlePaidEur,
          railway_share_usd: row.railwayUsd, soniox_list_eur: row.sonioxListEur, soniox_invoice_usd: row.sonioxInvoiceUsd, openai_invoice_usd: row.openaiInvoiceUsd, other_eur: row.otherEur,
          total_eur: row.totalEur, note: row.note,
        })),
    },
  ];
}
