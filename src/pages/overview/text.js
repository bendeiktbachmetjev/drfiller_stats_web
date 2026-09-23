// Words for the Overview metric items. The metric returns copy keys with raw values (§4.0); besides the
// `fmt` hints it uses three page-level forms that `fmt.values` does not know:
//   { key, values }                         a nested copy item (the plan scenario, "who worked for free")
//   ['doctor', pid]                          the doctor's display name (email, else "Doctor NN")
//   ['endpoint', { endpoint, location }]     where a model runs ("Google Cloud, EU only")
import { doctorLabel, endpointLabel, plural, t } from '../../copy/index.js';
import { addDays } from '../../data/period.js';
import { fmt } from '../../format/format.js';

const isItem = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.key === 'string';
const isHint = (value, name) => Array.isArray(value) && value.length === 2 && value[0] === name;

/**
 * The display name of a doctor by pid: email (OVERRIDES O2), else "Doctor NN", else "Deleted account".
 * @param {{ doctors?: Map<string, object> } | null} ds
 * @param {string} pid
 */
export const doctorName = (ds, pid) => {
  const doctor = ds?.doctors?.get?.(pid);
  return doctor ? doctorLabel(doctor) : t('common.doctor.deleted');
};

/**
 * Turns the page-level forms of a `values` map into text; `fmt` hints and plain numbers pass through.
 * @param {Record<string, unknown>|undefined} values
 * @param {{ ds?: object|null }} [context]
 * @returns {Record<string, unknown>}
 */
export function resolveValues(values, context = {}) {
  const out = {};
  Object.entries(values ?? {}).forEach(([name, raw]) => {
    if (isItem(raw)) out[name] = itemText(raw, context);
    else if (isHint(raw, 'doctor')) out[name] = doctorName(context.ds, raw[1]);
    else if (isHint(raw, 'endpoint')) out[name] = endpointLabel(raw[1]?.endpoint ?? null, raw[1]?.location ?? null);
    else out[name] = raw;
  });
  return out;
}

/**
 * Text of one metric item (answer, fact, note); `extra` adds ready strings such as `{ period }`.
 * @param {{ key: string, values?: object } | null} item
 * @param {{ ds?: object|null, extra?: Record<string, string> }} [context]
 * @returns {string}
 */
export function itemText(item, context = {}) {
  if (!item?.key) return '';
  return fmt.textOf({ key: item.key, values: { ...resolveValues(item.values, context), ...context.extra } });
}

/**
 * "over the last 30 days" · "in September 2026 (so far)" · "in 2026" · "since 5 Mar 2026" · "over 1–7 Aug 2026".
 * @param {import('../../data/period.js').Period|null} period
 * @returns {string}
 */
export function periodPhrase(period) {
  if (!period) return fmt.empty;
  switch (period.preset) {
    case 'last7':
    case 'last30':
      return t('overview.period.lastDays', { n: fmt.int(period.days) });
    case 'month':
      return t(period.isPartial ? 'overview.period.monthSoFar' : 'overview.period.month', { month: fmt.month(period.from) });
    case 'year':
      return t(period.isPartial ? 'overview.period.yearSoFar' : 'overview.period.year', { year: period.from.slice(0, 4) });
    case 'allTime':
      return t('overview.period.allTime', { date: fmt.date(period.from) });
    default:
      return t('overview.period.range', { range: fmt.range(period.from, period.effTo) });
  }
}

/**
 * The AnswerBlock sentences: the verdict and the plan line with `{period}` filled in.
 * @param {import('../../data/metrics/shared.js').AreaResult} data
 * @param {import('../../data/period.js').Period} period
 * @param {object|null} ds
 * @returns {Array<{ text: string, tone: string }>}
 */
export const answerItemsOf = (data, period, ds) =>
  (data?.answer ?? []).map((item) => ({ text: itemText(item, { ds, extra: { period: periodPhrase(period) } }), tone: item.tone }));

/**
 * "No requests from 1 Aug 2026 to 7 Aug 2026." (the empty state names both days of the period).
 * @param {import('../../data/period.js').Period} period
 */
export function emptyText(period) {
  const end = period.effTo > period.from ? period.effTo : period.to;
  return t('overview.empty', { from: fmt.date(period.from), to: fmt.date(addDays(end, -1)) });
}

/**
 * The quiet line at the bottom (§4.1 NowLine): open conversations and the last form of today, all
 * accounts; "Right now: —" before the first live answer.
 * @param {{ data?: { now?: number, openCount?: number } | null, today?: { lastAt?: { form: number|null } } | null,
 *   updatedAt?: number|null } | null} live the useLive() result
 * @returns {string}
 */
export function nowText(live) {
  const data = live?.data;
  if (!data) return t('overview.now.waiting');
  const n = Number.isFinite(data.openCount) ? data.openCount : 0;
  const values = { n: fmt.int(n), conversations: plural(n, 'common.unit.conversation') };
  const lastForm = live.today ? live.today.lastAt?.form ?? null : undefined;
  if (lastForm === null) return t('overview.now.noForm', values);
  const nowMs = Number.isFinite(data.now) ? data.now : live.updatedAt;
  return t('overview.now', { ...values, ago: lastForm === undefined ? fmt.empty : fmt.ago(lastForm, nowMs) });
}
