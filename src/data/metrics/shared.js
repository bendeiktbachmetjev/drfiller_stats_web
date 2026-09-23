// Helpers every metric shares: period membership, comparison deltas, rounding, the frame of a chart
// series, and the empty AreaResult. Pure: "now" always comes from the dataset (ds.nowMs), never a clock.
// FROZEN CONTRACT 3 (metric): every `compute<Name>(ds, period, scope, opts) → AreaResult` (SPEC §4.0).
import { buildBuckets, bucketIndexer, inPeriod } from '../period.js';

export { inPeriod };

/**
 * @typedef {'exact'|'estimate'|'inferred'|'missing'|'model'} Basis
 * @typedef {{ key: string, values?: Record<string, unknown> }} TextItem
 *   `values` holds raw numbers plus fmt hints: `{ cost: ['eur', 12.3], cpf: ['eurUnit', 0.0076], n: 5 }`
 * @typedef {{ key: string, from: string, to: string, granularity: 'day'|'week'|'month', isFuture: boolean,
 *   isPartial: boolean, [field: string]: unknown }} SeriesRow
 *   No labels: charts build them with charts/theme.js#bucketLabels (the data layer is copy-free).
 * @typedef {{
 *   empty: boolean,
 *   headline: Record<string, number|string|null>,
 *   basis: Record<string, Basis>,
 *   answer: Array<TextItem & { tone: 'neutral'|'attention'|'good' }>,
 *   facts?: Array<TextItem & { tone: 'neutral'|'attention'|'quiet', link?: string }>,
 *   series: SeriesRow[],
 *   moneySeries?: SeriesRow[],
 *   tables: Record<string, object[]>,
 *   takeaways?: Record<string, TextItem>,
 *   projection?: object,
 *   notes: TextItem[]
 * }} AreaResult
 */

/** What a metric returns for an empty dataset or while its page is a stub. Never mutate it. */
export const EMPTY_RESULT = Object.freeze({
  empty: true,
  headline: Object.freeze({}),
  basis: Object.freeze({}),
  answer: Object.freeze([]),
  facts: Object.freeze([]),
  series: Object.freeze([]),
  moneySeries: Object.freeze([]),
  tables: Object.freeze({}),
  takeaways: Object.freeze({}),
  notes: Object.freeze([]),
});

export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;

/** Share 0..1; null when there is nothing to divide by. */
export const share = (n, d) => (Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null);

export const sum = (values) => (values || []).reduce((acc, v) => (Number.isFinite(v) ? acc + v : acc), 0);

export const median = (values) => {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Nearest-rank quantile (q in 0..1); null for an empty list. */
export const quantile = (values, q) => {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank];
};

/** A comparison is shown only when the earlier window holds recorded activity. */
export const comparable = (ds, prevPeriod) => {
  if (!ds || !prevPeriod || !Number.isFinite(ds.firstActivityMs)) return false;
  if (!(prevPeriod.toMs > ds.firstActivityMs)) return false;
  return (ds.rows || []).some((row) => inPeriod(row.t, prevPeriod));
};

/**
 * Change against the comparison window (SimuFlow rules):
 *   null      nothing to compare with, or a % of zero
 *   pct       relative change in %; for prev < 10 the plain difference is given instead (kind abs)
 *   pp        difference of two SHARES (0..1 inputs), returned in percentage points (×100)
 *   eur       absolute € difference (money that can be negative, e.g. the result)
 * |value| under 0.5 reads as "no change" (flat).
 * @param {number|null} cur
 * @param {number|null} prev
 * @param {{ kind?: 'pct'|'pp'|'abs'|'eur', comparable?: boolean }} [options]
 * @returns {{ kind: 'pct'|'pp'|'abs'|'eur', value: number, dir: 'up'|'down'|'flat', prev: number } | null}
 */
export const makeDelta = (cur, prev, { kind = 'pct', comparable: canCompare = true } = {}) => {
  if (!canCompare || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  let outKind = kind;
  let value;
  let flatBelow = 0.5;
  if (kind === 'pp') {
    value = round1((cur - prev) * 100);
  } else if (kind === 'eur') {
    value = round2(cur - prev);
    flatBelow = 0.005;
  } else if (kind === 'abs') {
    value = round1(cur - prev);
  } else if (prev === 0) {
    return null;
  } else if (prev < 10) {
    outKind = 'abs';
    value = round1(cur - prev);
  } else {
    outKind = 'pct';
    value = round1(((cur - prev) / prev) * 100);
  }
  let dir = 'flat';
  if (Math.abs(value) >= flatBelow) dir = value > 0 ? 'up' : 'down';
  return { kind: outKind, value, dir, prev };
};

/**
 * One row per bucket of the NOMINAL period at `granularity` (default period.chart.granularity).
 * `fields` start at 0; in buckets that have not begun they are null (a gap, not a zero).
 * @param {import('../period.js').Period} period
 * @param {string[]} fields
 * @param {{ granularity?: 'day'|'week'|'month', keepFuture?: string[] }} [options]
 * @returns {{ rows: SeriesRow[], indexOf: (value: number|string) => number }}
 */
export const makeSeries = (period, fields, { granularity, keepFuture = [] } = {}) => {
  const buckets = buildBuckets(period, granularity);
  const rows = buckets.map((bucket) => {
    const row = {
      key: bucket.key,
      from: bucket.from,
      to: bucket.to,
      granularity: bucket.granularity,
      isFuture: bucket.isFuture,
      isPartial: bucket.isPartial,
    };
    fields.forEach((field) => {
      row[field] = bucket.isFuture && !keepFuture.includes(field) ? null : 0;
    });
    return row;
  });
  return { rows, indexOf: bucketIndexer(buckets) };
};

/** Adds to a series cell unless the cell is a future (null) slot. */
export const addTo = (row, field, amount) => {
  if (row && row[field] !== null && Number.isFinite(amount)) row[field] += amount;
};

/** Rows of a list whose `t` lies in the period. */
export const rowsIn = (rows, period) => (rows || []).filter((row) => inPeriod(row.t, period));

/**
 * The same headline keys with the same basis — for page tests: every headline key has a basis.
 * @param {Record<string, unknown>} headline
 * @param {Record<string, string>} basis
 * @returns {string[]} headline keys without a basis entry
 */
export const missingBasis = (headline, basis) => Object.keys(headline || {}).filter((key) => !(key in (basis || {})));
