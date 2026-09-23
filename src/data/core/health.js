// Service numbers of a period: all traffic, ignores the scope (§2 rule 3). FROZEN CONTRACT 2: Health.
// SKELETON — F0-DATA implements summarizeHealth().

/**
 * @typedef {{
 *   forms: number, p50Ms: number|null, p90Ms: number|null, over15: number, over15Share: number|null,
 *   over25: number, over25Share: number|null, mainP50Ms: number|null,
 *   fallbackEligible: number, fallbackCount: number, fallbackShare: number|null, fallbackBasis: import('./basis.js').Basis,
 *   fallbackWaitP50Ms: number|null,
 *   serviceFailures: number|null, serviceFailureRate: number|null, refusals: number|null,
 *   failuresByKind: Record<string, number>, refusalsByKind: Record<string, number>,
 *   word: 'ok'|'slow'|'bad'
 * }} Health
 */

/** @returns {Health} */
export function emptyHealth() {
  return {
    forms: 0, p50Ms: null, p90Ms: null, over15: 0, over15Share: null, over25: 0, over25Share: null, mainP50Ms: null,
    fallbackEligible: 0, fallbackCount: 0, fallbackShare: null, fallbackBasis: 'estimate', fallbackWaitP50Ms: null,
    serviceFailures: null, serviceFailureRate: null, refusals: null, failuresByKind: {}, refusalsByKind: {},
    word: 'ok',
  };
}

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @returns {Health}
 * @todo F0-DATA
 */
export function summarizeHealth(ds, period) {
  return emptyHealth();
}
