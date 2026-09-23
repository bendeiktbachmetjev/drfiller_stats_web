// Text of the Prices page items. The metric returns copy keys with raw values; most go through `fmt.values`
// (['sec', 5900], ['eurUnit', 0.0076], ['model', id] …). Hints only this page uses are resolved here:
//   ['combo', { model, endpoint }]   an option in a sentence → "Gemini 3.8 Flash directly from Google"
//   ['priceSay', word]               price in a sentence → "about the same", "3.5 times as much", "24% less"
//   ['priceVsNow', word]             price in brackets → "24% cheaper than now"
//   ['speedSay', word]               speed in a sentence → "about the same", "0.7 s faster"
//   ['times', 2.69]                  a factor → "2.7"
//   ['place', 'eu' | 'direct']       a place → "Google Cloud, EU only"
//   ['rate', 0.0315] / ['usdRate', 0.033]   price-list rates → "3.15%" / "$0.033"
//   ['placesIn', [...]]              places joined with "or" → "the Netherlands or Belgium"
//   ['placesShort', [...]]           places joined with "and" → "“any country” and “EU only”"
import { endpointLabel, getLocale, modelLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** A factor with at most one decimal: 3.485 → "3.5", 2 → "2". */
export const timesText = (r) => (isNum(r) ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(r) : fmt.empty);

/** A rate from a price list, exact to two decimals: 0.0315 → "3.15%", 0.015 → "1.5%". */
export const ratePct = (share) => (isNum(share) ? `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(share * 100)}%` : fmt.empty);

/** A small vendor price in dollars, up to three decimals: 0.033 → "$0.033", 5 → "$5". */
export const usdRate = (usd) => (isNum(usd) ? `$${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(usd)}` : fmt.empty);

/** Where an option runs: 'direct' → "Google API (direct)", 'eu' → "Google Cloud, EU only". */
export const placeLabel = (endpoint) => (endpoint === 'direct' ? endpointLabel('direct') : endpointLabel('vertex', endpoint));

/** An option inside a sentence. */
export const comboName = ({ model, endpoint } = {}) =>
  endpoint === 'direct'
    ? t('prices.name.direct', { model: modelLabel(model) })
    : t('prices.name.cloud', { model: modelLabel(model), place: endpointLabel('vertex', endpoint) });

const priceText = (prefix) => (word) => {
  if (!word) return fmt.empty;
  if (word.kind === 'same') return t(`${prefix}.same`);
  if (word.kind === 'more') return t(`${prefix}.more`, { r: timesText(word.ratio) });
  return t(`${prefix}.less`, { p: fmt.pct(word.cut) });
};

const speedText = (prefix) => (word) => {
  if (!word) return fmt.empty;
  if (word.kind === 'same') return t(`${prefix}.speedSame`);
  return t(`${prefix}.${word.kind}`, { s: fmt.sec(word.ms) });
};

/** Table cells: "≈ same", "×3.5", "−24%" and "≈ same", "0.6 s slower". */
export const priceCell = priceText('prices.cell');
export const speedCell = speedText('prices.cell');
/** Sentences: "about the same", "3.5 times as much", "24% less"; "0.7 s faster". */
export const priceSay = priceText('prices.say');
export const speedSay = speedText('prices.say');
/** In brackets after a price: "about the same as now", "3.5 times today’s price", "24% cheaper than now". */
export const priceVsNow = (word) => {
  if (!word) return fmt.empty;
  if (word.kind === 'same') return t('prices.vsNow.same');
  if (word.kind === 'more') return t('prices.vsNow.more', { r: timesText(word.ratio) });
  return t('prices.vsNow.less', { p: fmt.pct(word.cut) });
};

const listOf = (items, type) => {
  try {
    return new Intl.ListFormat(getLocale(), { style: 'long', type }).format(items);
  } catch {
    return items.join(', ');
  }
};

const CUSTOM = {
  combo: comboName,
  priceSay,
  priceVsNow,
  speedSay,
  times: timesText,
  place: placeLabel,
  rate: ratePct,
  usdRate,
  placesIn: (list) => listOf((list ?? []).map((place) => t(`prices.placeIn.${place}`)), 'disjunction'),
  placesShort: (list) => listOf((list ?? []).map((place) => t(`prices.placeShort.${place}`)), 'conjunction'),
};

/**
 * Formats a `values` map of a Prices item: page-only hints first, everything else through fmt.values.
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
