// "Why did a form get more expensive?" — one answer for every page (§2 rule 2). Overview and Costs both
// read this; each page keeps only its own threshold for when the change is worth a sentence.
// Business numbers: follows the scope.
import { compareCaveat, inPeriod, previousPeriod } from '../period.js';
import { comparable } from '../metrics/shared.js';
import { remember } from './memo.js';
import { hidesInternal, isInternal, scopeKey } from './scope.js';
import { summarize } from './summary.js';

/** The request (input) or the answer (output) must grow at least this much to be named as the cause. */
export const FORM_SIZE_GROWTH = 0.1;

/**
 * @typedef {{
 *   cur: number|null, prev: number|null, change: number|null,
 *   cause: 'era'|'size'|'longer'|'other'|null,
 *   era: { id: string, main: string, endpoint: string, location: string|null } | null,
 *   formsCur: number, formsPrev: number, inTokCur: number|null, inTokPrev: number|null
 * }} FormCostChange
 *   `cur`/`prev` are € per form of the period and of its comparison window; `change` = cur ÷ prev − 1.
 *   `cause` is set only when the form got dearer; `era` names the setup that ran most of the period.
 */

/** Mean request and answer size of the scoped forms of a window. */
function meanSize(ds, period, scope) {
  const hide = hidesInternal(ds, scope);
  let n = 0;
  let inTok = 0;
  let outTok = 0;
  (ds.forms ?? []).forEach((row) => {
    if (!inPeriod(row.t, period) || (hide && isInternal(row.pid, ds))) return;
    n += 1;
    inTok += Number.isFinite(row.inTok) ? row.inTok : 0;
    outTok += Number.isFinite(row.outTok) ? row.outTok : 0;
  });
  return n > 0 ? { inTok: inTok / n, outTok: outTok / n } : { inTok: null, outTok: null };
}

const grew = (cur, prev) => Number.isFinite(cur) && Number.isFinite(prev) && prev > 0 && cur / prev - 1 >= FORM_SIZE_GROWTH;

/**
 * The price of one form against the comparison window and, when it rose, its cause (first match):
 * era (another main model or place) · size (request +10 %) · longer (answer +10 %) · other.
 * Memoised per dataset, period and scope.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {FormCostChange}
 */
export function formCostChange(ds, period, scope) {
  return remember(ds, `formCostChange|${period.key}|${period.effTo}|${scopeKey(scope)}`, () => {
    const summary = summarize(ds, period, scope);
    const cur = summary.unit.costPerFormEur;
    const base = {
      cur, prev: null, change: null, cause: null, era: null,
      formsCur: summary.counts.forms, formsPrev: 0, inTokCur: meanSize(ds, period, scope).inTok, inTokPrev: null,
    };
    const prevPeriod = previousPeriod(period);
    if (!prevPeriod || !comparable(ds, prevPeriod)) return base;
    const before = summarize(ds, prevPeriod, scope);
    const prev = before.unit.costPerFormEur;
    const now = meanSize(ds, period, scope);
    const then = meanSize(ds, prevPeriod, scope);
    const result = { ...base, prev, formsPrev: before.counts.forms, inTokPrev: then.inTok };
    if (!(cur !== null && prev > 0)) return result;
    result.change = cur / prev - 1;
    if (!(result.change > 0)) return result;

    const caveat = compareCaveat(period, prevPeriod);
    if (caveat.modelEraChanged) return { ...result, cause: 'era', era: caveat.currentEra };
    if (grew(now.inTok, then.inTok)) return { ...result, cause: 'size' };
    if (grew(now.outTok, then.outTok)) return { ...result, cause: 'longer' };
    return { ...result, cause: 'other' };
  });
}
