// What one credit brings and costs (§5.3.7 "unitEconomics rows", Appendix C.3).
import { creditMoney, packsOf } from './packs.js';
import { planningOf, resolveScenario, scenarioOfMix, unitCosts, visitUnit } from './projection.js';
import { summarize } from './summary.js';

/**
 * Net € per credit of a pack after the payment fee and (if we pay it) VAT. 'plan' = packMix-weighted.
 * No VAT: 250 / 600 / 1500 → €0.04824 / €0.03898 / €0.02938 (Appendix C.3).
 * @param {'plan'|'pack250'|'pack600'|'pack1500'} pack
 * @param {{ vatPayer: boolean, method: string, prices: object, packs: Array<{ id: string, credits: number, priceEur: number }>,
 *   packMix: { pack250: number, pack600: number, pack1500: number } }} options
 * @returns {number}
 */
export function netPerCreditEur(pack, options) {
  return creditMoney(pack, options).netEur;
}

/**
 * @typedef {{ priceEur: number, vatEur: number, feeEur: number, netEur: number, costEur: number, leftEur: number, shareLeft: number|null }} CreditRow
 * @typedef {{ id: 'typed'|'dictation1'|'live15'|'live25'|'measured', credits: number|null, doctorPaysEur: { min: number, max: number } | null,
 *   costEur: number|null, netEur: number|null, leftEur: number|null, shareLeft: number|null, basis: import('./basis.js').Basis }} VisitType
 *   The `measured` row is all null (basis missing) while the period has fewer than 20 recordings.
 * @typedef {{
 *   netPerCreditEur: number,
 *   money: import('./packs.js').CreditMoney,
 *   perCredit: { form: CreditRow, live10: CreditRow, dictation10: CreditRow, anamnesis1: CreditRow },
 *   visitTypes: VisitType[]
 * }} UnitEconomics
 */

const creditRow = (money, costEur) => {
  const leftEur = money.netEur - costEur;
  return { ...money, costEur, leftEur, shareLeft: money.netEur > 0 ? leftEur / money.netEur : null };
};

/**
 * One credit of each kind and the visit types, for a pack (plan = mix) and the VAT setting. Costs are the
 * plan unit costs (D17: current setup, last 30 days, all traffic); only the `measured` visit follows the
 * selected period and scope.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @param {{ pack?: string, planning?: object, vatPayer?: boolean, method?: string }} [options]
 * @returns {UnitEconomics}
 */
export function unitEconomics(ds, period, scope, { pack = 'plan', planning, vatPayer, method } = {}) {
  const plan = planningOf(planning ?? scope?.planning ?? ds?.settings?.planning);
  const packs = packsOf(ds);
  const money = creditMoney(pack, {
    vatPayer: vatPayer ?? scope?.vatPayer ?? false,
    method: method ?? plan.paymentMethod,
    prices: ds?.prices,
    packs,
    packMix: plan.packMix,
  });
  const uc = unitCosts(ds, plan);
  const perCredit = {
    form: creditRow(money, uc.formCostEur),
    live10: creditRow(money, 10 * (uc.livePerMinEur + uc.convPerMinEur)),
    dictation10: creditRow(money, 10 * uc.dictationPerMinEur),
    anamnesis1: creditRow(money, uc.anamnesisRunCredits > 0 ? uc.anamnesisRunEur / uc.anamnesisRunCredits : 0),
  };

  const grossPerCredit = packs.map((p) => p.priceEur / p.credits);
  const visitRow = (id, scenario, basis) => {
    const unit = visitUnit(scenario, uc, plan);
    const netEur = unit.credits * money.netEur;
    const leftEur = netEur - unit.costEur;
    return {
      id,
      credits: unit.credits,
      doctorPaysEur: { min: unit.credits * Math.min(...grossPerCredit), max: unit.credits * Math.max(...grossPerCredit) },
      costEur: unit.costEur,
      netEur,
      leftEur,
      shareLeft: netEur > 0 ? leftEur / netEur : null,
      basis,
    };
  };
  const visitTypes = ['typed', 'dictation1', 'live15', 'live25'].map((id) => visitRow(id, resolveScenario(ds, id, plan), 'model'));

  const summary = ds && period ? summarize(ds, period, scope) : null;
  const measured = summary ? scenarioOfMix(summary) : null;
  visitTypes.push(
    measured
      ? visitRow('measured', measured, 'estimate')
      : { id: 'measured', credits: null, doctorPaysEur: null, costEur: null, netEur: null, leftEur: null, shareLeft: null, basis: 'missing' },
  );

  return { netPerCreditEur: money.netEur, money, perCredit, visitTypes };
}
