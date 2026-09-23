// Monthly form size and price since the history start ("Why did a form get more expensive", §4.3).
// Business numbers: follows the scope. Not bound to the selected period.
import { CHARS_PER_PAGE, CHARS_PER_TOKEN, STATS_START } from '../constants.js';
import { addMonths, monthKeyOf } from '../period.js';
import { remember } from './memo.js';
import { hidesInternal, isInternal, scopeKey } from './scope.js';

/**
 * @typedef {{ monthKey: string, forms: number, meanInTok: number|null, meanOutTok: number|null,
 *   meanPages: number|null, costPerFormEur: number|null }} FormMonth
 *   Means are null in a month without forms.
 */

/**
 * One row per calendar month from the history start to the dataset's current month.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('./scope.js').Scope} scope
 * @returns {FormMonth[]}
 */
export function formMonthly(ds, scope) {
  if (!ds) return [];
  return remember(ds, `formMonthly|${scopeKey(scope)}`, () => {
    const hide = hidesInternal(ds, scope);
    const totals = new Map();
    (ds.forms ?? []).forEach((row) => {
      if (hide && isInternal(row.pid, ds)) return;
      const entry = totals.get(row.monthKey) ?? { forms: 0, inTok: 0, outTok: 0, costEur: 0 };
      entry.forms += 1;
      entry.inTok += row.inTok;
      entry.outTok += row.outTok;
      entry.costEur += row.costEur;
      totals.set(row.monthKey, entry);
    });
    const months = [];
    const last = monthKeyOf(ds.nowMs);
    for (let first = `${STATS_START.slice(0, 7)}-01`; first.slice(0, 7) <= last; first = addMonths(first, 1)) {
      const monthKey = first.slice(0, 7);
      const entry = totals.get(monthKey);
      const meanInTok = entry ? entry.inTok / entry.forms : null;
      months.push({
        monthKey,
        forms: entry?.forms ?? 0,
        meanInTok,
        meanOutTok: entry ? entry.outTok / entry.forms : null,
        meanPages: meanInTok === null ? null : (meanInTok * CHARS_PER_TOKEN) / CHARS_PER_PAGE,
        costPerFormEur: entry ? entry.costEur / entry.forms : null,
      });
    }
    return months;
  });
}
