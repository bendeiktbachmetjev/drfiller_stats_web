// Text of the Models page items. The metric returns copy keys with raw values; most values go through
// `fmt.values` (['sec', 5900], ['model', id] …). A few hints only this page uses are resolved here:
//   ['where', code]     friendly place ('direct' | 'vertex:<location>') → "Google API (direct)"
//   ['place', code]     the same place inside a sentence → "directly from Google"
//   ['yesNo', bool]     "yes" / "no"
//   ['provider', id]    "Soniox" / "OpenAI"
//   ['ago', [ms, now]]  "3 h ago"
//   ['weekday', 1..7]   "Monday"
//   ['status', status]  Google's model status ("trial version – may be removed")
//   ['factor', 2]       "2", "1.5"
//   ['seconds', 25000]  "25 s" (a whole setting, not a measurement: no ".0")
import { endpointLabel, getLocale, statusLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const locationOf = (code) => (typeof code === 'string' && code.startsWith('vertex:') ? code.slice('vertex:'.length) : null);

/** Friendly place of a model: 'direct' | 'vertex:<location>' → "Google API (direct)" / "Google Cloud, EU only". */
export const whereLabel = (code) => (locationOf(code) ? endpointLabel('vertex', locationOf(code)) : endpointLabel('direct'));

const placePhrase = (code) => (locationOf(code) ? t('models.where.cloud', { place: endpointLabel('vertex', locationOf(code)) }) : t('models.where.direct'));

/** "Monday" … "Sunday" for an ISO weekday. */
export const weekdayLong = (n) => t('models.weekdays.long').split('|')[n - 1] ?? fmt.empty;

/** A price factor without trailing zeros: 2 → "2", 1.5 → "1.5". */
export const factorText = (n) => (Number.isFinite(n) ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(n) : fmt.empty);

const CUSTOM = {
  where: whereLabel,
  place: placePhrase,
  yesNo: (v) => t(v ? 'models.word.yes' : 'models.word.no'),
  provider: (id) => (id ? t(`models.provider.${id}`) : fmt.empty),
  ago: ([ms, now]) => fmt.ago(ms, now),
  weekday: weekdayLong,
  status: (status) => (status ? statusLabel(status) : fmt.empty),
  factor: factorText,
  seconds: (ms) => fmt.sec(ms).replace(/\.0(?=\D|$)/, ''),
};

/**
 * Formats a `values` map of a Models item: page-only hints first, everything else through fmt.values.
 * @param {Record<string, unknown>} [values]
 * @returns {Record<string, string>}
 */
export function valuesOf(values) {
  const standard = {};
  const custom = {};
  Object.entries(values ?? {}).forEach(([key, raw]) => {
    if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === 'string' && CUSTOM[raw[0]]) custom[key] = CUSTOM[raw[0]](raw[1]);
    else standard[key] = raw;
  });
  return { ...fmt.values(standard), ...custom };
}

/**
 * The sentence of a metric item `{ key, values }` ('' for nothing).
 * @param {{ key: string, values?: object } | null | undefined} item
 */
export const textOf = (item) => (item?.key ? t(item.key, valuesOf(item.values)) : '');

/** Wait bucket label: "0–3 s", "7.5–10 s", "over 30 s". */
export function waitLabel(row) {
  const nf = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 });
  const from = nf.format(row.fromMs / 1000);
  return row.toMs == null ? t('models.waitHist.over', { from }) : t('models.waitHist.range', { from, to: nf.format(row.toMs / 1000) });
}
