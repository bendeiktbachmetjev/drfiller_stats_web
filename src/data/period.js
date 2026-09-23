// Periods, comparison windows, chart buckets and Vilnius calendar helpers (§3.3).
// Pure: "now" is always passed in. Day keys ('YYYY-MM-DD') are Europe/Vilnius calendar days, whatever
// the browser's zone, and every step is calendar arithmetic (DST days are 23/25 h long).
// No copy strings here: labels are built by the UI from the structured fields (`compare`, `preset`).
import { MONTH_DAYS, PHONE_MAX_BUCKETS, STATS_START, TIMEZONE } from './constants.js';
import { MODEL_ERAS, BILLING_ERAS } from './eras.js';

export const PRESETS = Object.freeze([
  { id: 'last7' },
  { id: 'last30' },
  { id: 'month' },
  { id: 'year' },
  { id: 'allTime' },
  { id: 'custom' },
]);
export const PRESET_IDS = Object.freeze(PRESETS.map((preset) => preset.id));
export const DEFAULT_PRESET = 'last30';
/** Presets the ‹ › stepper can move. */
export const SHIFTABLE_PRESETS = Object.freeze(['month', 'year']);

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITY_ORDER = ['day', 'week', 'month'];

// ---------------------------------------------------------------------------
// Vilnius wall clock
// ---------------------------------------------------------------------------

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

let offsetFormatter = null;
const offsetCache = new Map(); // UTC hour → minutes east of UTC

const zoneOffsetUncached = (ms) => {
  offsetFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const parts = offsetFormatter.formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
};

/** Minutes east of UTC in Vilnius at an instant (cached per UTC hour; DST switches on the hour). */
export const vilniusOffsetMin = (ms) => {
  const hour = Math.floor(ms / HOUR_MS);
  let offset = offsetCache.get(hour);
  if (offset === undefined) {
    offset = zoneOffsetUncached(hour * HOUR_MS);
    if (offsetCache.size > 20000) offsetCache.clear();
    offsetCache.set(hour, offset);
  }
  return offset;
};

/** Vilnius wall clock of an instant as a UTC-based Date (read it with getUTC*). */
const wall = (ms) => new Date(ms + vilniusOffsetMin(ms) * 60000);

const keyOfUtcDate = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const utcOfKey = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** @param {number} ms @returns {string} Vilnius day 'YYYY-MM-DD' */
export const dayKeyOf = (ms) => keyOfUtcDate(wall(ms));
/** @param {number} ms @returns {string} Vilnius month 'YYYY-MM' */
export const monthKeyOf = (ms) => dayKeyOf(ms).slice(0, 7);
/** @param {number} ms @returns {number} Vilnius hour 0–23 */
export const hourOf = (ms) => wall(ms).getUTCHours();
/** @param {number} ms @returns {number} ISO weekday 1 (Mon) – 7 (Sun), Vilnius */
export const isoWeekdayOf = (ms) => wall(ms).getUTCDay() || 7;
/** @param {number} ms @returns {string} Monday of the Vilnius week, 'YYYY-MM-DD' */
export const weekKeyOf = (ms) => mondayOf(dayKeyOf(ms));

export const isValidDateKey = (key) => typeof key === 'string' && DATE_RE.test(key) && keyOfUtcDate(new Date(utcOfKey(key))) === key;

/** @param {string} dayKey @returns {number} epoch ms of Vilnius midnight that starts the day */
export const dateToMs = (dayKey) => {
  const guess = utcOfKey(dayKey);
  let ms = guess - vilniusOffsetMin(guess) * 60000;
  const check = guess - vilniusOffsetMin(ms) * 60000;
  if (check !== ms) ms = check;
  return ms;
};

export const isoWeekdayOfDate = (dayKey) => new Date(utcOfKey(dayKey)).getUTCDay() || 7;

export const addDays = (dayKey, n) => {
  const d = new Date(utcOfKey(dayKey));
  d.setUTCDate(d.getUTCDate() + n);
  return keyOfUtcDate(d);
};

/** Whole calendar days from a to b (b exclusive). */
export const diffDays = (a, b) => Math.round((utcOfKey(b) - utcOfKey(a)) / DAY_MS);

export const eachDay = (from, toExcl) => {
  const days = [];
  if (!isValidDateKey(from) || !isValidDateKey(toExcl)) return days;
  for (let key = from; key < toExcl; key = addDays(key, 1)) days.push(key);
  return days;
};

export const mondayOf = (dayKey) => addDays(dayKey, 1 - isoWeekdayOfDate(dayKey));

const firstOfMonth = (year, monthIndex) => keyOfUtcDate(new Date(Date.UTC(year, monthIndex, 1)));
export const addMonths = (dayKey, n) => {
  const d = new Date(utcOfKey(dayKey));
  return firstOfMonth(d.getUTCFullYear(), d.getUTCMonth() + n);
};
const isFirstOfMonth = (dayKey) => dayKey.endsWith('-01');
const minKey = (a, b) => (a < b ? a : b);
const maxKey = (a, b) => (a > b ? a : b);

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** Nominal granularity of a custom range: ≤ 31 days → day, ≤ 120 → week, else month. */
export const pickGranularity = (days) => {
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
};

const bucketCount = (from, to, granularity) => {
  if (!(from < to)) return 0;
  if (granularity === 'day') return diffDays(from, to);
  if (granularity === 'week') return Math.ceil(diffDays(mondayOf(from), to) / 7);
  const a = new Date(utcOfKey(from));
  const b = new Date(utcOfKey(addDays(to, -1)));
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
};

/**
 * Coarsens the nominal granularity (day → week → month) until the period has at most `maxBuckets` buckets.
 * @param {{ from: string, to: string, granularity: string }} period
 * @param {number} [maxBuckets]
 */
export const chartGranularity = (period, maxBuckets = Infinity) => {
  let index = GRANULARITY_ORDER.indexOf(period.granularity);
  while (index < GRANULARITY_ORDER.length - 1 && bucketCount(period.from, period.to, GRANULARITY_ORDER[index]) > maxBuckets) {
    index += 1;
  }
  return GRANULARITY_ORDER[index];
};

/** Money charts: week buckets when the nominal range is ≤ 90 days, else month (§3.3). */
export const moneyGranularity = (period) => (period.days <= 90 ? 'week' : 'month');

/**
 * «Per month» factor of a period: 30.4375 ÷ elapsed days; null when nothing has elapsed.
 * @param {{ effDays: number }} period
 * @returns {number|null}
 */
export const monthFactor = (period) => (period && period.effDays > 0 ? MONTH_DAYS / period.effDays : null);

/**
 * @typedef {'day'|'week'|'month'} Granularity
 * @typedef {{ kind: 'prevDays'|'monthPart'|'month'|'year'|'range', n?: number, from: string, to: string }} CompareSpec
 * @typedef {{
 *   preset: string, offset: number, from: string, to: string, fromMs: number, toMs: number,
 *   effTo: string, effToMs: number, days: number, effDays: number, isPartial: boolean, isFuture: boolean,
 *   granularity: Granularity, chart: { granularity: Granularity }, key: string, today: string,
 *   statsStart: string, startClamped: boolean, requestedFrom: string, compare?: CompareSpec
 * }} Period
 */

const makePeriod = ({ preset, offset, from: requestedFrom, to, granularity }, today, maxBuckets) => {
  const from = requestedFrom < STATS_START ? minKey(STATS_START, to) : requestedFrom;
  const tomorrow = addDays(today, 1);
  let effTo = minKey(to, tomorrow);
  if (effTo < from) effTo = from;
  const days = diffDays(from, to);
  const nominal = granularity ?? pickGranularity(days);
  const period = {
    preset,
    offset,
    from,
    to,
    fromMs: dateToMs(from),
    toMs: dateToMs(to),
    effTo,
    effToMs: dateToMs(effTo),
    days,
    effDays: diffDays(from, effTo),
    isPartial: from <= today && today < to,
    isFuture: from > today,
    granularity: nominal,
    key: `${preset}:${from}..${to}`,
    today,
    statsStart: STATS_START,
    startClamped: requestedFrom < STATS_START,
    requestedFrom,
  };
  period.chart = { granularity: chartGranularity(period, maxBuckets) };
  return period;
};

const presetRange = (presetId, today, { offset, custom }) => {
  const tomorrow = addDays(today, 1);
  switch (presetId) {
    case 'last7':
      return { preset: 'last7', offset: 0, from: addDays(today, -6), to: tomorrow, granularity: 'day' };
    case 'last30':
      return { preset: 'last30', offset: 0, from: addDays(today, -29), to: tomorrow, granularity: 'day' };
    case 'month': {
      const from = addMonths(`${today.slice(0, 7)}-01`, offset);
      return { preset: 'month', offset, from, to: addMonths(from, 1), granularity: 'day' };
    }
    case 'year': {
      const year = Number(today.slice(0, 4)) + offset;
      return { preset: 'year', offset, from: `${year}-01-01`, to: `${year + 1}-01-01`, granularity: 'month' };
    }
    case 'allTime':
      return { preset: 'allTime', offset: 0, from: STATS_START, to: tomorrow, granularity: 'month' };
    case 'custom': {
      const from = custom?.from;
      const to = custom?.to;
      if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return null;
      const toExcl = addDays(to, 1);
      if (toExcl <= STATS_START) return null;
      return { preset: 'custom', offset: 0, from, to: toExcl };
    }
    default:
      return null;
  }
};

/**
 * Resolves a stored period choice.
 * @param {string} presetId one of PRESET_IDS (unusable choices fall back to DEFAULT_PRESET)
 * @param {number} nowMs
 * @param {{ offset?: number, custom?: { from: string, to: string } | null, maxBuckets?: number }} [options]
 *   custom days are inclusive; maxBuckets = 14 on phones (chart granularity only)
 * @returns {Period}
 */
export const resolvePeriod = (presetId, nowMs, options = {}) => {
  const today = dayKeyOf(nowMs);
  const offset = Number.isFinite(options.offset) ? Math.min(0, Math.trunc(options.offset)) : 0;
  const maxBuckets = options.maxBuckets ?? Infinity;
  let range = presetRange(presetId, today, { offset, custom: options.custom ?? null });
  if (!range) return resolvePeriod(DEFAULT_PRESET, nowMs, { maxBuckets });
  // A stored offset older than the history moves forward to the first period that has counted days.
  if (range.to <= STATS_START && SHIFTABLE_PRESETS.includes(range.preset)) {
    let step = range.offset;
    while (range.to <= STATS_START && step < 0) {
      step += 1;
      range = presetRange(presetId, today, { offset: step, custom: null });
    }
  }
  return makePeriod(range, today, maxBuckets);
};

/**
 * The window a period is compared with, or null (All time; nothing before the history).
 * - last7/last30/custom: the same number of elapsed days right before → `prevDays`
 * - month, partial: the same days of the previous month → `monthPart`; full: the previous month → `month`
 * - year: the previous year → `year`
 * The returned period carries `compare` (kind + dates) for the UI label; a window cut at the history
 * start becomes kind `range`.
 * @param {Period} period
 * @param {{ maxBuckets?: number }} [options]
 * @returns {(Period & { compare: CompareSpec }) | null}
 */
export const previousPeriod = (period, options = {}) => {
  if (!period || period.preset === 'allTime' || period.effDays <= 0) return null;
  if (period.from <= STATS_START) return null;
  const maxBuckets = options.maxBuckets ?? Infinity;
  let from;
  let to;
  let compare;
  if (period.preset === 'month') {
    from = addMonths(period.from, -1);
    const fullMonth = period.effTo === period.to;
    to = fullMonth ? period.from : minKey(addDays(from, period.effDays), period.from);
    compare = fullMonth ? { kind: 'month', from, to } : { kind: 'monthPart', from, to };
  } else if (period.preset === 'year') {
    from = `${Number(period.from.slice(0, 4)) - 1}-01-01`;
    to = period.effTo === period.to ? period.from : addDays(from, period.effDays);
    compare = { kind: 'year', from, to };
  } else {
    from = addDays(period.from, -period.effDays);
    to = period.from;
    compare = { kind: 'prevDays', n: period.effDays, from, to };
  }
  if (from < STATS_START) {
    from = STATS_START;
    compare = { kind: 'range', from, to };
  }
  if (!(from < to)) return null;
  const prev = makePeriod(
    { preset: 'compare', offset: 0, from, to, granularity: period.granularity },
    addDays(to, -1),
    maxBuckets,
  );
  return { ...prev, key: `compare:${from}..${to}`, compare };
};

/**
 * Stepper rules: month and year only; never forward past the current period, never back into a
 * period that ends before the history starts (months back to 03.2026).
 * @param {Period} period
 * @param {number} nowMs
 * @returns {{ prev: boolean, next: boolean }}
 */
export const canShiftPeriod = (period, nowMs) => {
  if (!period || !SHIFTABLE_PRESETS.includes(period.preset)) return { prev: false, next: false };
  const earlier = presetRange(period.preset, dayKeyOf(nowMs), { offset: period.offset - 1, custom: null });
  return { prev: Boolean(earlier) && earlier.to > STATS_START, next: period.offset < 0 };
};

/** @param {Period} period @param {-1|1} direction @param {number} nowMs @param {{ maxBuckets?: number }} [options] */
export const shiftPeriod = (period, direction, nowMs, options = {}) => {
  const allowed = canShiftPeriod(period, nowMs);
  if ((direction < 0 && !allowed.prev) || (direction > 0 && !allowed.next) || !direction) return period;
  return resolvePeriod(period.preset, nowMs, { ...options, offset: period.offset + (direction < 0 ? -1 : 1) });
};

// ---------------------------------------------------------------------------
// Comparison caveats (a setup change between the two windows)
// ---------------------------------------------------------------------------

const overlapMs = (aFrom, aTo, bFrom, bTo) => Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));

const dominant = (eras, fromMs, toMs) => {
  let best = null;
  let bestMs = 0;
  eras.forEach((era) => {
    const ms = overlapMs(fromMs, toMs, era.fromMs, era.toMs ?? Infinity);
    if (ms > bestMs) {
      best = era;
      bestMs = ms;
    }
  });
  return best;
};

const setupOf = (era) => `${era.main}|${era.endpoint}|${era.location ?? ''}`;

/**
 * Did the main model (or where it runs) or the billing rule differ between a period and its comparison window?
 * Decided by the era that covers most of each window's elapsed time.
 * @param {Period} period
 * @param {Period|null} prev
 * @returns {{ modelEraChanged: boolean, billingEraChanged: boolean, era: { id: string, main: string, endpoint: string, location: string|null } | null }}
 */
export const compareCaveat = (period, prev) => {
  if (!period || !prev) return { modelEraChanged: false, billingEraChanged: false, era: null };
  const nowModel = dominant(MODEL_ERAS, period.fromMs, period.effToMs);
  const prevModel = dominant(MODEL_ERAS, prev.fromMs, prev.effToMs);
  const nowBilling = dominant(BILLING_ERAS, period.fromMs, period.effToMs);
  const prevBilling = dominant(BILLING_ERAS, prev.fromMs, prev.effToMs);
  // The chip says "a different model": eras that only add a fallback (e1 → e5) keep the same main model and endpoint.
  const modelEraChanged = Boolean(nowModel && prevModel && setupOf(nowModel) !== setupOf(prevModel));
  const billingEraChanged = Boolean(nowBilling && prevBilling && nowBilling.rule !== prevBilling.rule);
  const era = modelEraChanged
    ? { id: prevModel.id, main: prevModel.main, endpoint: prevModel.endpoint, location: prevModel.location }
    : null;
  return { modelEraChanged, billingEraChanged, era };
};

// ---------------------------------------------------------------------------
// Chart buckets
// ---------------------------------------------------------------------------

/**
 * @typedef {{ key: string, from: string, to: string, fromMs: number, toMs: number,
 *   granularity: Granularity, isFuture: boolean, isPartial: boolean }} Bucket
 */

const makeBucket = (key, from, to, granularity, today) => ({
  key,
  from,
  to,
  fromMs: dateToMs(from),
  toMs: dateToMs(to),
  granularity,
  isFuture: from > today,
  isPartial: from <= today && today < to,
});

/**
 * Buckets that tile the NOMINAL period [from, to); the first and last one are cut at the period edges.
 * Keys: day and week buckets 'YYYY-MM-DD' (weeks keyed by their Monday), month buckets 'YYYY-MM'.
 * @param {Period} period
 * @param {Granularity} [granularity] defaults to period.chart.granularity
 * @returns {Bucket[]}
 */
export const buildBuckets = (period, granularity = period?.chart?.granularity ?? period?.granularity) => {
  if (!period || !(period.from < period.to)) return [];
  const { from, to } = period;
  const today = period.today ?? addDays(period.effTo, -1);
  const clip = (a, b) => [maxKey(a, from), minKey(b, to)];
  const buckets = [];
  if (granularity === 'day') {
    eachDay(from, to).forEach((day) => buckets.push(makeBucket(day, day, addDays(day, 1), 'day', today)));
    return buckets;
  }
  if (granularity === 'week') {
    for (let monday = mondayOf(from); monday < to; monday = addDays(monday, 7)) {
      const [a, b] = clip(monday, addDays(monday, 7));
      buckets.push(makeBucket(monday, a, b, 'week', today));
    }
    return buckets;
  }
  for (let first = `${from.slice(0, 7)}-01`; first < to; first = addMonths(first, 1)) {
    const [a, b] = clip(first, addMonths(first, 1));
    buckets.push(makeBucket(first.slice(0, 7), a, b, 'month', today));
  }
  return buckets;
};

/** (epoch ms | 'YYYY-MM-DD') → bucket index, or -1 when outside every bucket. */
export const bucketIndexer = (buckets) => {
  const list = Array.isArray(buckets) ? buckets : [];
  const find = (value, startKey, endKey) => {
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (value < list[mid][startKey]) hi = mid - 1;
      else if (value >= list[mid][endKey]) lo = mid + 1;
      else return mid;
    }
    return -1;
  };
  return (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? find(value, 'fromMs', 'toMs') : -1;
    if (typeof value === 'string' && value.length >= 10) return find(value.slice(0, 10), 'from', 'to');
    return -1;
  };
};

/** Epoch ms or a Vilnius day key against the NOMINAL period [from, to). */
export const inPeriod = (value, period) => {
  if (!period) return false;
  if (typeof value === 'number') return value >= period.fromMs && value < period.toMs;
  if (typeof value === 'string' && value.length >= 10) {
    const day = value.slice(0, 10);
    return day >= period.from && day < period.to;
  }
  return false;
};

/** Phone chart cap, re-exported for the period hook. */
export { PHONE_MAX_BUCKETS };
