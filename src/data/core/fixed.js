// Fixed costs (§5.3.7 "Fixed"): per month the Railway share entered for that month (costsMonthly), else
// the planning value, plus the planning "other"; spread over the elapsed days. Not per doctor, no scope.
import { DEFAULT_PLANNING } from '../api/contract.js';
import { addMonths, diffDays, eachDay } from '../period.js';

/**
 * Monthly fixed USD of one month.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {string} monthKey 'YYYY-MM'
 * @param {object} [planning]
 * @returns {{ usd: number, railwayUsd: number, otherUsd: number, entered: boolean }}
 */
export function fixedMonthUsd(ds, monthKey, planning = ds?.settings?.planning) {
  const plan = planning?.fixedMonthlyUsd ?? DEFAULT_PLANNING.fixedMonthlyUsd;
  const entry = (ds?.costsMonthly ?? []).find((month) => month.month === monthKey);
  const entered = Number.isFinite(entry?.railwayUsd);
  const railwayUsd = entered ? entry.railwayUsd : plan.railway ?? 0;
  const otherUsd = plan.other ?? 0;
  return { usd: railwayUsd + otherUsd, railwayUsd, otherUsd, entered };
}

/**
 * Fixed cost of whole Vilnius days [from, toExcl), in € (converted once with the dataset's rate).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {string} from day key
 * @param {string} toExcl day key (exclusive)
 * @param {object} [planning]
 * @returns {number}
 */
export function fixedCostEur(ds, from, toExcl, planning = ds?.settings?.planning) {
  let usd = 0;
  const perMonth = new Map();
  eachDay(from, toExcl).forEach((day) => {
    const monthKey = day.slice(0, 7);
    let perDay = perMonth.get(monthKey);
    if (perDay === undefined) {
      const first = `${monthKey}-01`;
      perDay = fixedMonthUsd(ds, monthKey, planning).usd / diffDays(first, addMonths(first, 1));
      perMonth.set(monthKey, perDay);
    }
    usd += perDay;
  });
  return usd / (ds?.fx?.usdPerEur ?? 1);
}

/**
 * Fixed cost of the elapsed part of a period, in €.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {object} [planning]
 * @returns {number}
 */
export const periodFixedEur = (ds, period, planning) =>
  period && period.from < period.effTo ? fixedCostEur(ds, period.from, period.effTo, planning) : 0;

/**
 * Fixed cost of one chart bucket, only for its elapsed days (future days cost nothing yet).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {{ from: string, to: string }} bucket
 * @param {import('../period.js').Period} period
 * @param {object} [planning]
 * @returns {number} €
 */
export function bucketFixedEur(ds, bucket, period, planning) {
  const end = bucket.to < period.effTo ? bucket.to : period.effTo;
  return end > bucket.from ? fixedCostEur(ds, bucket.from, end, planning) : 0;
}
