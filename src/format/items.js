// Metric items → sentences, for every page (§4.0). A metric returns `{ key, values }` with raw values; this
// file turns them into text in one way everywhere. Besides the `fmt` hints (['eur', 12.3], ['model', id] …)
// it knows the forms that need the dataset or nest:
//   { key, values }                         a nested copy item (the plan scenario, "who worked for free")
//   ['doctor', pid]                          the doctor's name: email, else "Doctor NN" (OVERRIDES O2)
//   ['endpoint', { endpoint, location }]     where a model runs ("Google Cloud, EU only")
// Page-only kinds come in through `hints` ({ combo: (raw) => text, … }).
import { doctorLabel, endpointLabel, t } from '../copy/index.js';
import { fmt } from './format.js';

const isItem = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.key === 'string';
const hintName = (value) => (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' ? value[0] : null);

/**
 * The display name of a doctor by pid: email (OVERRIDES O2), else "Doctor NN", else "Deleted account";
 * requests without any account ('anonymous') are "No account".
 * @param {{ doctors?: Map<string, object> } | null} ds
 * @param {string} pid
 * @param {Map<string, string>} [revealed] emails shown by "Show email" (click mode), by pid
 * @returns {string}
 */
export function doctorName(ds, pid, revealed) {
  if (pid === 'anonymous') return t('common.doctor.noAccount');
  const doctor = ds?.doctors?.get?.(pid);
  if (!doctor) return t('common.doctor.deleted');
  const email = revealed?.get?.(pid);
  return doctorLabel(email ? { ...doctor, email } : doctor);
}

/**
 * @typedef {{ ds?: object|null, extra?: Record<string, string>, hints?: Record<string, (raw: unknown) => string> }} ItemContext
 *   extra  ready strings for placeholders the page fills itself ({ period })
 *   hints  page-only value kinds
 */

/**
 * Formats a `values` map: nested items, doctors, places and page hints first, everything else through fmt.values.
 * @param {Record<string, unknown>|undefined} values
 * @param {ItemContext} [context]
 * @returns {Record<string, string>}
 */
export function itemValues(values, context = {}) {
  const { ds = null, hints = {} } = context;
  const out = {};
  const standard = {};
  Object.entries(values ?? {}).forEach(([name, raw]) => {
    const hint = hintName(raw);
    if (isItem(raw)) out[name] = itemText(raw, context);
    else if (hint && hints[hint]) out[name] = hints[hint](raw[1]);
    else if (hint === 'doctor') out[name] = doctorName(ds, raw[1]);
    else if (hint === 'endpoint') out[name] = endpointLabel(raw[1]?.endpoint ?? null, raw[1]?.location ?? null);
    else standard[name] = raw;
  });
  return { ...fmt.values(standard), ...out };
}

/**
 * Text of one metric item (answer, fact, note, takeaway); '' for nothing.
 * @param {{ key: string, values?: object } | null | undefined} item
 * @param {ItemContext} [context]
 * @returns {string}
 */
export function itemText(item, context = {}) {
  if (!item?.key) return '';
  return t(item.key, { ...itemValues(item.values, context), ...context.extra });
}

/**
 * The period inside a sentence: "over the last 30 days" · "in September 2026 so far" · "in 2026" ·
 * "since 5 Mar 2026" · "over 1–7 Aug 2026".
 * @param {import('../data/period.js').Period|null} period
 * @returns {string}
 */
export function periodPhrase(period) {
  if (!period) return fmt.empty;
  switch (period.preset) {
    case 'last7':
    case 'last30':
      return t('common.period.lastDays', { n: fmt.int(period.days) });
    case 'month':
      return t(period.isPartial ? 'common.period.monthSoFar' : 'common.period.month', { month: fmt.month(period.from) });
    case 'year':
      return t(period.isPartial ? 'common.period.yearSoFar' : 'common.period.year', { year: period.from.slice(0, 4) });
    case 'allTime':
      return t('common.period.allTime', { date: fmt.date(period.from) });
    default:
      return t('common.period.range', { range: fmt.range(period.from, period.effTo) });
  }
}
