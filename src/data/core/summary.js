// Business numbers of a period (follow the scope). FROZEN CONTRACT 2: the Summary shape (§5.3.7).
// SKELETON — F0-DATA implements summarize(); the empty shape below is final.
import { monthFactor } from '../period.js';

/**
 * @typedef {import('./basis.js').Basis} Basis
 * @typedef {{
 *   counts: { forms: number, dictations: number, liveConversations: number, anamnesisCalls: number, anamnesisRuns: number },
 *   activeDoctors: number, newDoctors: number, payingDoctors: number, payingActiveDoctors: number,
 *   minutes: { dictation: number, live: number, total: number, basis: 'exact'|'estimate' },
 *   cost: { variableEur: number, fixedEur: number, totalEur: number, totalUsd: number, basis: 'exact'|'estimate', estimatedShare: number,
 *           byFeature: { form: number, dictation: number, live: number, anamnesis: number, fixed: number },
 *           byProvider: { gemini: number, soniox: number, openai: number, infra: number },
 *           byModel: Record<string, number>,
 *           byClass: { paid: number, gifted: number, free: number, internal: number, other: number },
 *           byPid: Record<string, number> },
 *   income: { status: 'ok'|'off'|'error'|'test', basis: Basis, grossEur: number, discountEur: number, feeEur: number, refundEur: number,
 *             vatEur: number, disputeEur: number, netEur: number, payments: number, payingDoctors: number, creditsSold: number,
 *             lastPaymentMs: number|null, otherStripeFeesEur: number, byPid: Record<string, number>, unattributedNetEur: number,
 *             inferredLifetime: { purchases: number, eur: number } | null },
 *   resultEur: number|null, resultBasis: Basis, marginPct: number|null,
 *   creditsSpent: { form: number, recording: number, anamnesis: number, total: number, recordingBasis: string },
 *   unit: { costPerFormEur: number|null, costPerFormUsd: number|null, anamnesisCostPerCreditEur: number|null },
 *   balances: { total: number, free: number, byDisplayClass: Record<string, number> },
 *   perDoctorMonthActual: { costEur: number, incomeEur: number, forms: number, recordingMinutes: number } | null,
 *   monthFactor: number
 * }} Summary
 */

/**
 * A zeroed Summary (also what summarize returns for an empty dataset).
 * @param {{ incomeStatus?: 'ok'|'off'|'error'|'test', monthFactor?: number }} [options]
 * @returns {Summary}
 */
export function emptySummary({ incomeStatus = 'off', monthFactor: factor = 0 } = {}) {
  return {
    counts: { forms: 0, dictations: 0, liveConversations: 0, anamnesisCalls: 0, anamnesisRuns: 0 },
    activeDoctors: 0,
    newDoctors: 0,
    payingDoctors: 0,
    payingActiveDoctors: 0,
    minutes: { dictation: 0, live: 0, total: 0, basis: 'exact' },
    cost: {
      variableEur: 0, fixedEur: 0, totalEur: 0, totalUsd: 0, basis: 'exact', estimatedShare: 0,
      byFeature: { form: 0, dictation: 0, live: 0, anamnesis: 0, fixed: 0 },
      byProvider: { gemini: 0, soniox: 0, openai: 0, infra: 0 },
      byModel: {},
      byClass: { paid: 0, gifted: 0, free: 0, internal: 0, other: 0 },
      byPid: {},
    },
    income: {
      status: incomeStatus, basis: incomeStatus === 'ok' ? 'exact' : 'missing', grossEur: 0, discountEur: 0, feeEur: 0,
      refundEur: 0, vatEur: 0, disputeEur: 0, netEur: 0, payments: 0, payingDoctors: 0, creditsSold: 0, lastPaymentMs: null,
      otherStripeFeesEur: 0, byPid: {}, unattributedNetEur: 0, inferredLifetime: null,
    },
    resultEur: null,
    resultBasis: 'missing',
    marginPct: null,
    creditsSpent: { form: 0, recording: 0, anamnesis: 0, total: 0, recordingBasis: 'none' },
    unit: { costPerFormEur: null, costPerFormUsd: null, anamnesisCostPerCreditEur: null },
    balances: { total: 0, free: 0, byDisplayClass: {} },
    perDoctorMonthActual: null,
    monthFactor: factor,
  };
}

/**
 * Business numbers of a period; follows the scope (§2 rule 3). Pure; memoise by ds.id + period.key + scopeKey.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {Summary}
 * @todo F0-DATA
 */
export function summarize(ds, period, scope) {
  return emptySummary({ incomeStatus: ds?.sources?.revenue?.status === 'ok' ? 'ok' : 'off', monthFactor: monthFactor(period) ?? 0 });
}
