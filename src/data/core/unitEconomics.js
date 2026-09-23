// What one credit brings and costs (§5.3.7 "unitEconomics rows"). SKELETON — F0-DATA implements it.

/**
 * Net € per credit of a pack after the payment fee and (if we pay it) VAT. 'plan' = packMix-weighted.
 * @param {'plan'|'pack250'|'pack600'|'pack1500'} pack
 * @param {{ vatPayer: boolean, method: string, prices: object, packs: Array<{ id: string, credits: number, priceEur: number }>,
 *   packMix: { pack250: number, pack600: number, pack1500: number } }} options
 * @returns {number}
 * @todo F0-DATA
 */
export function netPerCreditEur(pack, options) {
  return 0;
}

/**
 * @typedef {{ priceEur: number, vatEur: number, feeEur: number, netEur: number, costEur: number, leftEur: number, shareLeft: number|null }} CreditRow
 * @typedef {{
 *   netPerCreditEur: number,
 *   perCredit: { form: CreditRow, live10: CreditRow, dictation10: CreditRow, anamnesis1: CreditRow },
 *   visitTypes: Array<{ id: 'typed'|'dictation1'|'live15'|'live25'|'measured', credits: number, doctorPaysEur: { min: number, max: number },
 *     costEur: number, netEur: number, leftEur: number, shareLeft: number|null, basis: import('./basis.js').Basis }>
 * }} UnitEconomics
 */

const zeroRow = () => ({ priceEur: 0, vatEur: 0, feeEur: 0, netEur: 0, costEur: 0, leftEur: 0, shareLeft: null });

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @param {{ pack?: string, planning: object, vatPayer: boolean, method: string }} options
 * @returns {UnitEconomics}
 * @todo F0-DATA
 */
export function unitEconomics(ds, period, scope, { pack = 'plan', planning, vatPayer, method } = {}) {
  return {
    netPerCreditEur: 0,
    perCredit: { form: zeroRow(), live10: zeroRow(), dictation10: zeroRow(), anamnesis1: zeroRow() },
    visitTypes: [],
  };
}
