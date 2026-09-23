// Business numbers of a period (follow the scope). FROZEN CONTRACT 2: the Summary shape (§5.3.7).
// One function for every number that appears on more than one page (§2 rule 2).
import { inPeriod, monthFactor } from '../period.js';
import { datasetRuns } from './anamnesis.js';
import { combineBasis, costBasis } from './basis.js';
import { creditsSpent } from './credits.js';
import { periodFixedEur } from './fixed.js';
import { incomeOf } from './income.js';
import { remember } from './memo.js';
import { hidesInternal, isInternal, scopeKey, scopedDoctors } from './scope.js';

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
 *   income: import('./income.js').Income,
 *   resultEur: number|null, resultBasis: Basis, marginPct: number|null,
 *   creditsSpent: { form: number, recording: number, anamnesis: number, total: number, recordingBasis: string },
 *   unit: { costPerFormEur: number|null, costPerFormUsd: number|null, anamnesisCostPerCreditEur: number|null },
 *   balances: { total: number, free: number, byDisplayClass: Record<string, number> },
 *   perDoctorMonthActual: { costEur: number, incomeEur: number|null, forms: number, recordingMinutes: number } | null,
 *   monthFactor: number
 * }} Summary
 *   `perDoctorMonthActual.incomeEur` is null while the income is not known.
 */

/**
 * A zeroed Summary (also what summarize returns without a dataset).
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
 * The account with most of the variable cost (Overview and Doctors: 'anonymous' never counts).
 * @param {Record<string, number>} byPid
 * @returns {{ pid: string, costEur: number } | null}
 */
export function topDoctorOf(byPid) {
  let top = null;
  Object.entries(byPid ?? {}).forEach(([pid, costEur]) => {
    if (pid !== 'anonymous' && (!top || costEur > top.costEur)) top = { pid, costEur };
  });
  return top && top.costEur > 0 ? top : null;
}

/** Kinds that are a request of a doctor (activity). Meter and failure rows are not. */
export const REQUEST_KINDS = new Set(['form', 'dictation', 'live', 'anamnesis']);
const MINUTE_ESTIMATE_SHARE = 0.05;

const add = (map, key, amount) => {
  map[key] = (map[key] ?? 0) + amount;
};

/**
 * The vendor a request's cost goes to: Gemini (forms, medical history), Soniox or OpenAI (recording).
 * @param {{ kind: string, provider?: string|null }} row
 * @returns {'gemini'|'soniox'|'openai'}
 */
export const costProviderOf = (row) => {
  if (row.kind === 'form' || row.kind === 'anamnesis') return 'gemini';
  if (row.kind === 'live') return 'soniox';
  return row.provider === 'soniox' ? 'soniox' : 'openai';
};

/**
 * Business numbers of a period; follows the scope (§2 rule 3). Pure and memoised per dataset
 * (period + scope), so every page reads the very same object.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {Summary}
 */
export function summarize(ds, period, scope) {
  if (!ds || !period) return emptySummary({ monthFactor: monthFactor(period) ?? 0 });
  return remember(ds, `summary|${period.key}|${period.effTo}|${scopeKey(scope)}`, () => compute(ds, period, scope));
}

function compute(ds, period, scope) {
  const summary = emptySummary({ monthFactor: monthFactor(period) ?? 0 });
  const planning = scope?.planning ?? ds.settings?.planning;
  const hide = hidesInternal(ds, scope);
  const keep = (pid) => !(hide && isInternal(pid, ds));
  const displayClassOf = (pid) => ds.doctors?.get?.(pid)?.displayClass ?? 'other';

  const { counts, minutes, cost } = summary;
  const active = new Set();
  const rowsIn = [];
  let formUsd = 0;
  let variableUsd = 0;
  let estimatedEur = 0;
  let estimatedMinutes = 0;
  let anamnesisCredits = 0;

  (ds.rows ?? []).forEach((row) => {
    if (!inPeriod(row.t, period) || !keep(row.pid)) return;
    rowsIn.push(row);
    if (!REQUEST_KINDS.has(row.kind)) return;
    const audioMin = Number.isFinite(row.audioSec) ? row.audioSec / 60 : 0;
    switch (row.kind) {
      case 'form':
        counts.forms += 1;
        formUsd += row.costUsd;
        break;
      case 'dictation':
        counts.dictations += 1;
        minutes.dictation += audioMin;
        break;
      case 'live':
        counts.liveConversations += 1;
        minutes.live += audioMin;
        break;
      default:
        counts.anamnesisCalls += 1;
        anamnesisCredits += Number.isFinite(row.credits) ? row.credits : 0;
    }
    if (row.audioBasis === 'bytes_estimate') estimatedMinutes += audioMin;
    if (row.pid !== 'anonymous') active.add(row.pid);
    cost.byFeature[row.kind] += row.costEur;
    cost.byProvider[costProviderOf(row)] += row.costEur;
    add(cost.byModel, row.model ?? 'unknown', row.costEur);
    add(cost.byPid, row.pid, row.costEur);
    add(cost.byClass, displayClassOf(row.pid), row.costEur);
    cost.variableEur += row.costEur;
    variableUsd += row.costUsd;
    if (row.costBasis === 'estimated') estimatedEur += row.costEur;
  });

  counts.anamnesisRuns = datasetRuns(ds).filter((run) => keep(run.pid) && inPeriod(run.startMs, period)).length;
  minutes.total = minutes.dictation + minutes.live;
  minutes.basis = minutes.total > 0 && estimatedMinutes / minutes.total >= MINUTE_ESTIMATE_SHARE ? 'estimate' : 'exact';

  cost.fixedEur = periodFixedEur(ds, period, planning);
  cost.byFeature.fixed = cost.fixedEur;
  cost.byProvider.infra = cost.fixedEur;
  cost.totalEur = cost.variableEur + cost.fixedEur;
  cost.totalUsd = variableUsd + cost.fixedEur * (ds.fx?.usdPerEur ?? 1);
  cost.basis = costBasis(rowsIn);
  cost.estimatedShare = cost.variableEur > 0 ? estimatedEur / cost.variableEur : 0;

  const doctors = scopedDoctors(ds, scope);
  summary.activeDoctors = active.size;
  summary.newDoctors = doctors.filter((doctor) => Number.isFinite(doctor.signupAt) && inPeriod(doctor.signupAt, period)).length;
  summary.payingDoctors = doctors.filter((doctor) => doctor.displayClass === 'paid').length;
  summary.payingActiveDoctors = [...active].filter((pid) => displayClassOf(pid) === 'paid').length;

  const income = incomeOf(ds, period, scope);
  summary.income = income;
  const incomeOk = income.status === 'ok';
  summary.resultEur = incomeOk ? income.netEur - cost.totalEur : null;
  summary.resultBasis = incomeOk ? combineBasis(income.basis, cost.basis) : 'missing';
  summary.marginPct = incomeOk && income.netEur > 0 ? summary.resultEur / income.netEur : null;

  summary.creditsSpent = creditsSpent(ds, period, scope);
  summary.unit = {
    costPerFormEur: counts.forms > 0 ? cost.byFeature.form / counts.forms : null,
    costPerFormUsd: counts.forms > 0 ? formUsd / counts.forms : null,
    anamnesisCostPerCreditEur: anamnesisCredits > 0 ? cost.byFeature.anamnesis / anamnesisCredits : null,
  };

  const balances = summary.balances;
  doctors.forEach((doctor) => {
    const available = doctor.credits?.available;
    if (!Number.isFinite(available)) return;
    balances.total += available;
    add(balances.byDisplayClass, doctor.displayClass, available);
  });
  balances.free = balances.total - (balances.byDisplayClass.paid ?? 0);

  const factor = summary.monthFactor;
  if (summary.activeDoctors > 0 && period.effDays >= 1 && factor > 0) {
    const perDoctor = (x) => (x / summary.activeDoctors) * factor;
    summary.perDoctorMonthActual = {
      costEur: perDoctor(cost.variableEur),
      incomeEur: incomeOk ? perDoctor(income.netEur) : null,
      forms: perDoctor(counts.forms),
      recordingMinutes: perDoctor(minutes.total),
    };
  }
  return summary;
}

/**
 * What the hidden accounts change (§3.4 HiddenNote): the period's cost and result WITH the "my and test"
 * accounts, from the same summarize(). null when the scope hides nothing or nothing changes.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {{ costEur: number, resultEur: number|null } | null} resultEur is null while the income is not known
 */
export function hiddenImpact(ds, period, scope) {
  if (!ds || !period || !scope || !hidesInternal(ds, scope)) return null;
  const shown = summarize(ds, period, scope);
  const all = summarize(ds, period, { ...scope, excludeInternal: false });
  const incomeOk = all.income?.status === 'ok';
  const resultEur = incomeOk ? all.resultEur : null;
  if (all.cost.totalEur === shown.cost.totalEur && resultEur === (incomeOk ? shown.resultEur : null)) return null;
  return { costEur: all.cost.totalEur, resultEur };
}
