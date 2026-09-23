// How sure a number is (§3.9). A badge marks real inference only; list-price cost is `exact` by definition.
import { ESTIMATE_SHARE } from '../constants.js';

/** Weakest first when combining: missing > inferred > estimate > model > exact. */
const STRENGTH = { exact: 0, model: 1, estimate: 2, inferred: 3, missing: 4 };

/**
 * The weakest basis of the inputs (derived numbers inherit it).
 * @param {...('exact'|'estimate'|'inferred'|'missing'|'model'|null|undefined)} bases
 * @returns {'exact'|'estimate'|'inferred'|'missing'|'model'}
 */
export function combineBasis(...bases) {
  let weakest = 'exact';
  bases.flat().forEach((basis) => {
    if (basis && STRENGTH[basis] > STRENGTH[weakest]) weakest = basis;
  });
  return weakest;
}

/**
 * A cost aggregate is an estimate when its estimated rows reach ESTIMATE_SHARE (5%) of it.
 * @param {Array<{ costEur: number, costBasis: string }>} rows
 * @returns {'exact'|'estimate'}
 */
export function costBasis(rows) {
  let total = 0;
  let estimated = 0;
  (rows ?? []).forEach((row) => {
    const cost = Number.isFinite(row.costEur) ? row.costEur : 0;
    total += cost;
    if (row.costBasis === 'estimated') estimated += cost;
  });
  return total > 0 && estimated / total >= ESTIMATE_SHARE ? 'estimate' : 'exact';
}
