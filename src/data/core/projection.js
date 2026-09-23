// The plan: unit costs (D17), scale projection, sensitivity and capacity (§5.3.7, Appendix C.3).
// FROZEN CONTRACT 2: ScaleResult, Capacity. Unit prices are service-like (current setup, last 30 days,
// all traffic); the "now" column follows the period and the scope through summarize().
import { DEFAULT_PLANNING } from '../api/contract.js';
import {
  DASHBOARD_ROW_CAP, DEFAULT_ANAMNESIS_RUN, MIN_ANAMNESIS_RUNS, MIN_CONVERSATION_FORMS, MIN_DICTATIONS_FOR_SHARE,
  MIN_DAYS_FOR_MONTH, MIN_RECORDINGS_FOR_MEASURED, MIN_SETUP_FORMS, PACK_IDS, PACK_SIZES, PLAN,
} from '../constants.js';
import { ANAMNESIS_CREDITS_SINCE_MS, SONIOX_SINCE_MS } from '../eras.js';
import { monthFactor } from '../period.js';
import { geminiPrice } from '../pricing/gemini.js';
import { canonicalTranscriptionModel, perMinuteUsd } from '../pricing/transcription.js';
import { median } from '../metrics/shared.js';
import { datasetRuns } from './anamnesis.js';
import { binomialQuantile, largestSafeN } from './binomial.js';
import { remember } from './memo.js';
import { creditMoney, packsOf } from './packs.js';
import { scopeKey } from './scope.js';
import { currentSetup, currentSetupForms } from './setup.js';
import { summarize } from './summary.js';

const DAY_MS = 86400000;

/** Scenario presets (§3.8). `measured` = last-30-day mix; `plan` = the three planning fields. */
export const SCENARIOS = Object.freeze({
  typed: Object.freeze({ liveShare: 0, liveMin: 0, dictMin: 0 }),
  dictation1: Object.freeze({ liveShare: 0, liveMin: 0, dictMin: 1 }),
  live15: Object.freeze({ liveShare: 1, liveMin: 15, dictMin: 0 }),
  live25: Object.freeze({ liveShare: 1, liveMin: 25, dictMin: 0 }),
  measured: null,
  plan: null,
});

/**
 * @typedef {{ doctors: number|null, visits: number|null, creditsSpent: number|null, grossEur: number|null, vatEur: number|null,
 *   feeEur: number|null, netEur: number|null, costGeminiFormsEur: number, costSonioxEur: number, costOpenaiEur: number,
 *   costAnamnesisEur: number, costFixedEur: number, costTotalEur: number, resultEur: number|null, marginPct: number|null }} ScaleColumn
 * @typedef {{
 *   perDoctorPeak: number,
 *   soniox: { limit: number, meanDoctors: number|null, limitDoctors: number|null, s0: { mean: number, p95: number }, s1: { mean: number, p95: number } },
 *   firestore: { s0Writes: number, s1Writes: number, free: number, s0Eur: number, s1Eur: number },
 *   railway: { s0Gb: number, s1Gb: number, s0Eur: number, s1Eur: number },
 *   dashboard: { rowsNow: number, rowsPerVisit: number, s0MonthsToCap: number|null, s1MonthsToCap: number|null, cap: 150000 }
 * }} Capacity
 *   meanDoctors / limitDoctors are null when nobody records live conversations (no stream limit to reach).
 * @typedef {{ id: string, liveShare: number, liveMin: number, dictMin: number, measured: boolean, fallback?: boolean }} Scenario
 * @typedef {{
 *   scenario: { id: string, liveShare: number, liveMin: number, dictMin: number, pack: string, packMix: object, vatPayer: boolean,
 *     method: string, freeShare: number, visitsPerDoctorMonth: number },
 *   unit: { visitCostEur: number, visitCredits: number, visitNetEur: number, basis: import('./basis.js').Basis },
 *   columns: Record<'now'|'nowTotal'|'visit'|'doctor'|'s0'|'s1', ScaleColumn>,
 *   now: { factor: number, hidden: boolean, incomeBasis: import('./basis.js').Basis },
 *   scales: [number, number],
 *   capacity: Capacity,
 *   warnings: Array<'SONIOX_STREAM_LIMIT'|'FEW_FORMS_ASSUMED'|'MEASURED_FALLBACK'|'DASHBOARD_ROWS'>,
 *   chips: Array<{ key: string, values?: object }>
 * }} ScaleResult
 *   chips: one copy key per assumption chip (visits · scenario · pack · VAT · free share), values with fmt hints.
 * @typedef {{ formCostEur: number, formBasis: 'exact'|'model', formsUsed: number, formInTok: number, formOutTok: number,
 *   convPerMinEur: number, convTokensPerMin: number, convBasis: 'exact'|'model', convFormsUsed: number,
 *   livePerMinEur: number, dictationPerMinEur: number, sonioxFilePerMinEur: number, openaiPerMinEur: number,
 *   openaiShare: number, openaiShareMeasured: boolean, anamnesisRunEur: number, anamnesisRunCredits: number,
 *   anamnesisBasis: 'exact'|'model', mainModel: string, mainInputPerM: number, mainOutputPerM: number,
 *   basis: import('./basis.js').Basis, warnings: string[], notes: Array<{ key: string }> }} UnitCosts
 */

/** @returns {ScaleColumn} */
export const emptyColumn = () => ({
  doctors: null, visits: null, creditsSpent: null, grossEur: null, vatEur: null, feeEur: null, netEur: null,
  costGeminiFormsEur: 0, costSonioxEur: 0, costOpenaiEur: 0, costAnamnesisEur: 0, costFixedEur: 0, costTotalEur: 0,
  resultEur: null, marginPct: null,
});

/** @returns {Capacity} */
export const emptyCapacity = (limit = 10) => ({
  perDoctorPeak: 0,
  soniox: { limit, meanDoctors: 0, limitDoctors: 0, s0: { mean: 0, p95: 0 }, s1: { mean: 0, p95: 0 } },
  firestore: { s0Writes: 0, s1Writes: 0, free: 20000, s0Eur: 0, s1Eur: 0 },
  railway: { s0Gb: 0, s1Gb: 0, s0Eur: 0, s1Eur: 0 },
  dashboard: { rowsNow: 0, rowsPerVisit: 0, s0MonthsToCap: null, s1MonthsToCap: null, cap: DASHBOARD_ROW_CAP },
});

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Planning with every missing field taken from the server defaults (§5.2.3.7).
 * @param {object|null|undefined} planning
 * @returns {import('../api/contract.js').Planning}
 */
export function planningOf(planning) {
  const p = isObject(planning) ? planning : {};
  const nested = (key) => ({ ...DEFAULT_PLANNING[key], ...(isObject(p[key]) ? p[key] : {}) });
  const scales = Array.isArray(p.doctorScales) && p.doctorScales.length === 2 ? p.doctorScales : DEFAULT_PLANNING.doctorScales;
  return {
    ...DEFAULT_PLANNING,
    ...p,
    doctorScales: [scales[0], scales[1]],
    assumedFormTokens: nested('assumedFormTokens'),
    packMix: nested('packMix'),
    fixedMonthlyUsd: nested('fixedMonthlyUsd'),
  };
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const planKey = (plan) => JSON.stringify(plan);

// ---------------------------------------------------------------------------------------------------
// Unit costs (D17)
// ---------------------------------------------------------------------------------------------------

/**
 * Unit prices of the plan: current model setup, last 30 days, all traffic (D17). Memoised per dataset.
 * - form: mean cost of ≥ 20 current-setup forms without conversation text, else the assumed tokens
 *   priced on the main model today (basis model, warning FEW_FORMS_ASSUMED);
 * - conversation surcharge per minute: measured from ≥ 20 forms with conversation text and ≥ 20 live
 *   conversations, else `conversationTokensPerMinute` (extra output tokens are ignored);
 * - dictation per minute: Soniox file price, blended with OpenAI by the measured share (≥ 20 dictations);
 * - medical history summary: median run of the last 30 days (≥ 5 runs), else of all runs since billing began,
 *   else DEFAULT_ANAMNESIS_RUN.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {object} planning
 * @returns {UnitCosts}
 */
export function unitCosts(ds, planning) {
  const plan = planningOf(planning);
  if (!ds?.prices) return emptyUnitCosts(plan);
  const key = `unitCosts|${planKey({ basis: plan.formCostBasis, assumed: plan.assumedFormTokens, tpm: plan.conversationTokensPerMinute })}`;
  return remember(ds, key, () => computeUnitCosts(ds, plan));
}

const emptyUnitCosts = (plan) => ({
  formCostEur: 0, formBasis: 'model', formsUsed: 0, formInTok: plan.assumedFormTokens.in, formOutTok: plan.assumedFormTokens.out,
  convPerMinEur: 0, convTokensPerMin: plan.conversationTokensPerMinute, convBasis: 'model', convFormsUsed: 0,
  livePerMinEur: 0, dictationPerMinEur: 0, sonioxFilePerMinEur: 0, openaiPerMinEur: 0, openaiShare: 0, openaiShareMeasured: false,
  anamnesisRunEur: 0, anamnesisRunCredits: DEFAULT_ANAMNESIS_RUN.credits, anamnesisBasis: 'model', mainModel: '',
  mainInputPerM: 0, mainOutputPerM: 0, basis: 'model', warnings: [], notes: [],
});

function computeUnitCosts(ds, plan) {
  const nowMs = ds.nowMs;
  const fx = ds.fx?.usdPerEur ?? 1.1463;
  const setup = currentSetup(ds);
  const price = geminiPrice(ds.prices, setup.main, { at: nowMs, platform: setup.endpoint, endpoint: setup.location ?? 'global' });
  const warnings = [];
  const notes = [];

  const forms = currentSetupForms(ds, nowMs);
  const measuredForms = plan.formCostBasis === 'measured' && forms.length >= MIN_SETUP_FORMS;
  let formInTok = plan.assumedFormTokens.in;
  let formOutTok = plan.assumedFormTokens.out;
  let formCostEur;
  if (measuredForms) {
    formInTok = mean(forms.map((row) => row.inTok));
    formOutTok = mean(forms.map((row) => row.outTok));
    formCostEur = mean(forms.map((row) => row.costEur));
  } else {
    formCostEur = (formInTok * price.inputPerM + formOutTok * price.outputPerM) / 1e6 / fx;
    if (plan.formCostBasis === 'measured') warnings.push('FEW_FORMS_ASSUMED');
  }

  const since30 = nowMs - 30 * DAY_MS;
  const recent = (rows) => (rows ?? []).filter((row) => row.t >= since30 && row.t <= nowMs);
  const convForms = currentSetupForms(ds, nowMs, { conversation: 'with' });
  const lives = recent(ds.lives).filter((row) => Number.isFinite(row.audioSec) && row.audioSec > 0);
  let convTokensPerMin = plan.conversationTokensPerMinute;
  let convBasis = 'model';
  if (convForms.length >= MIN_CONVERSATION_FORMS && lives.length >= MIN_CONVERSATION_FORMS && forms.length > 0) {
    const extraTokens = mean(convForms.map((row) => row.inTok)) - mean(forms.map((row) => row.inTok));
    const liveMinutes = mean(lives.map((row) => row.audioSec / 60));
    if (liveMinutes > 0) {
      convTokensPerMin = Math.max(0, extraTokens / liveMinutes);
      convBasis = 'exact';
    }
  }

  const transcription = ds.config?.transcription ?? {};
  const livePerMinEur = perMinuteUsd(ds.prices, canonicalTranscriptionModel(ds.config?.live?.rtModel) ?? 'soniox-rt:stt-rt-v5') / fx;
  const sonioxFilePerMinEur = perMinuteUsd(ds.prices, canonicalTranscriptionModel(transcription.sonioxModel) ?? 'soniox:stt-async-v5') / fx;
  const openaiPerMinEur = perMinuteUsd(ds.prices, transcription.openaiModel ?? 'gpt-4o-mini-transcribe-2025-12-15') / fx;
  const dictations = recent(ds.dictations).filter((row) => row.t >= SONIOX_SINCE_MS);
  const openaiShareMeasured = dictations.length >= MIN_DICTATIONS_FOR_SHARE;
  let openaiShare = transcription.provider === 'openai' ? 1 : 0;
  if (openaiShareMeasured) openaiShare = dictations.filter((row) => row.provider === 'openai').length / dictations.length;
  else if (openaiShare === 0) notes.push({ key: 'common.note.openaiShareAssumed' });

  const runs = datasetRuns(ds).filter((run) => run.startMs >= ANAMNESIS_CREDITS_SINCE_MS && run.startMs <= nowMs);
  const recentRuns = runs.filter((run) => run.startMs >= since30);
  const pool = recentRuns.length >= MIN_ANAMNESIS_RUNS ? recentRuns : runs;
  const runCredits = pool.length ? median(pool.map((run) => run.credits)) : null;
  const anamnesisMeasured = pool.length > 0 && runCredits > 0;

  return {
    formCostEur,
    formBasis: measuredForms ? 'exact' : 'model',
    formsUsed: forms.length,
    formInTok,
    formOutTok,
    convPerMinEur: (convTokensPerMin * price.inputPerM) / 1e6 / fx,
    convTokensPerMin,
    convBasis,
    convFormsUsed: convForms.length,
    livePerMinEur,
    dictationPerMinEur: openaiShare * openaiPerMinEur + (1 - openaiShare) * sonioxFilePerMinEur,
    sonioxFilePerMinEur,
    openaiPerMinEur,
    openaiShare,
    openaiShareMeasured,
    anamnesisRunEur: anamnesisMeasured ? median(pool.map((run) => run.costEur)) : DEFAULT_ANAMNESIS_RUN.usd / fx,
    anamnesisRunCredits: anamnesisMeasured ? runCredits : DEFAULT_ANAMNESIS_RUN.credits,
    anamnesisBasis: anamnesisMeasured ? 'exact' : 'model',
    mainModel: setup.main,
    mainInputPerM: price.inputPerM,
    mainOutputPerM: price.outputPerM,
    basis: measuredForms && convBasis === 'exact' ? 'exact' : 'model',
    warnings,
    notes,
  };
}

// ---------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------

/**
 * The visit mix of a summary (forms, recordings, minutes), or null under 20 recordings.
 * @param {import('./summary.js').Summary} summary
 * @returns {Scenario|null}
 */
export function scenarioOfMix(summary) {
  const forms = summary?.counts?.forms ?? 0;
  const lives = summary?.counts?.liveConversations ?? 0;
  const recordings = lives + (summary?.counts?.dictations ?? 0);
  if (forms <= 0 || recordings < MIN_RECORDINGS_FOR_MEASURED) return null;
  const liveShare = Math.min(1, lives / forms);
  const liveMin = lives > 0 ? summary.minutes.live / lives : 0;
  const dictMin = liveShare < 1 ? summary.minutes.dictation / forms / (1 - liveShare) : 0;
  return { id: 'measured', liveShare, liveMin, dictMin, measured: true };
}

const measuredMix = (ds) => {
  const nowMs = ds?.nowMs ?? 0;
  const since = nowMs - 30 * DAY_MS;
  const counts = { forms: 0, dictations: 0, liveConversations: 0 };
  const minutes = { dictation: 0, live: 0 };
  (ds?.rows ?? []).forEach((row) => {
    if (row.t < since || row.t > nowMs) return;
    const min = Number.isFinite(row.audioSec) ? row.audioSec / 60 : 0;
    if (row.kind === 'form') counts.forms += 1;
    else if (row.kind === 'dictation') {
      counts.dictations += 1;
      minutes.dictation += min;
    } else if (row.kind === 'live') {
      counts.liveConversations += 1;
      minutes.live += min;
    }
  });
  return scenarioOfMix({ counts, minutes });
};

/**
 * A scenario's visit shape.
 * - typed / dictation1 / live15 / live25: fixed presets;
 * - plan: the three planning fields;
 * - measured: the last-30-day mix, all traffic; under 20 recordings it falls back to the plan
 *   (`fallback: true`, warning MEASURED_FALLBACK).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {string} id a key of SCENARIOS
 * @param {object} planning
 * @returns {Scenario}
 */
export function resolveScenario(ds, id, planning) {
  const preset = SCENARIOS[id];
  if (preset) return { id, ...preset, measured: false };
  const plan = planningOf(planning);
  const fromPlan = { liveShare: plan.liveShareOfVisits, liveMin: plan.liveMinutesPerVisit, dictMin: plan.dictationMinutesPerVisit };
  if (id === 'measured') {
    const mix = measuredMix(ds);
    return mix ?? { id: 'measured', ...fromPlan, measured: false, fallback: true };
  }
  return { id: 'plan', ...fromPlan, measured: false };
}

/**
 * Copy key + values of a scenario label, derived from its fields (§3.8): the presets have their own
 * label; otherwise "{liveMin} min conversation", "{dictMin} min dictation", "typing only" or
 * "{liveMin} min conversation in {share} of visits".
 * @param {Scenario} scenario
 * @returns {{ key: string, values?: object }}
 */
export function scenarioLabel(scenario) {
  if (['typed', 'dictation1', 'live15', 'live25'].includes(scenario?.id)) return { key: `common.scenario.${scenario.id}` };
  const { liveShare = 0, liveMin = 0, dictMin = 0 } = scenario ?? {};
  if (liveShare >= 1) return { key: 'common.scenario.live', values: { min: Math.round(liveMin) } };
  if (liveShare <= 0 && dictMin > 0) return { key: 'common.scenario.dictation', values: { min: Number.isInteger(dictMin) ? dictMin : ['dec', dictMin] } };
  if (liveShare <= 0) return { key: 'common.scenario.typed' };
  return { key: 'common.scenario.mixed', values: { min: Math.round(liveMin), share: ['pct', liveShare] } };
}

// ---------------------------------------------------------------------------------------------------
// One visit
// ---------------------------------------------------------------------------------------------------

/**
 * Credits and variable cost of one visit of a scenario (§5.3.7 projection formulas).
 * @param {Scenario} sc
 * @param {UnitCosts} uc
 * @param {import('../api/contract.js').Planning} plan
 * @returns {{ credits: number, recordingMin: number, costEur: number,
 *   parts: { forms: number, soniox: number, openai: number, anamnesis: number } }}
 */
export function visitUnit(sc, uc, plan) {
  const recordingMin = sc.liveShare * sc.liveMin + (1 - sc.liveShare) * sc.dictMin;
  const runsPerVisit = plan.visitsPerDoctorMonth > 0 ? plan.anamnesisRunsPerDoctorMonth / plan.visitsPerDoctorMonth : 0;
  const liveMinutes = sc.liveShare * sc.liveMin;
  const dictationMinutes = (1 - sc.liveShare) * sc.dictMin;
  const parts = {
    forms: uc.formCostEur + liveMinutes * uc.convPerMinEur,
    soniox: liveMinutes * uc.livePerMinEur + dictationMinutes * uc.sonioxFilePerMinEur * (1 - uc.openaiShare),
    openai: dictationMinutes * uc.openaiPerMinEur * uc.openaiShare,
    anamnesis: runsPerVisit * uc.anamnesisRunEur,
  };
  return {
    credits: 1 + recordingMin / 10 + runsPerVisit * uc.anamnesisRunCredits,
    recordingMin,
    costEur: parts.forms + parts.soniox + parts.openai + parts.anamnesis,
    parts,
  };
}

// ---------------------------------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------------------------------

const firestoreWritesPerDay = (n, plan) => (n * plan.visitsPerDoctorMonth) / plan.workdaysPerMonth * PLAN.firestoreWritesPerVisit;

const firestoreUsdMonth = (n, plan, prices) => {
  const free = prices?.FIRESTORE?.freePerDay?.writes ?? 20000;
  const per100k = prices?.FIRESTORE?.per100k?.writes ?? 0.099;
  return (Math.max(0, firestoreWritesPerDay(n, plan) - free) * per100k) / 1e5 * plan.workdaysPerMonth;
};

const egressGbMonth = (n, plan, sc) => (n * plan.visitsPerDoctorMonth * (1 - sc.liveShare) * sc.dictMin * PLAN.dictationMbPerMinute) / 1024;

/** Fixed cost of N doctors in a month (€): the planning fixed costs, Railway egress, Firestore writes. */
const fixedEurAt = (n, plan, sc, ds) => {
  const fx = ds?.fx?.usdPerEur ?? 1.1463;
  const egressPerGb = ds?.prices?.RAILWAY?.egressPerGb ?? 0.05;
  const usd = plan.fixedMonthlyUsd.railway + plan.fixedMonthlyUsd.other + egressGbMonth(n, plan, sc) * egressPerGb + firestoreUsdMonth(n, plan, ds?.prices);
  return usd / fx;
};

const planColumn = ({ doctors, visits, unit, money, freeShare, fixedEur }) => {
  const paying = 1 - freeShare;
  const credits = unit.credits * visits;
  const cost = {
    costGeminiFormsEur: unit.parts.forms * visits,
    costSonioxEur: unit.parts.soniox * visits,
    costOpenaiEur: unit.parts.openai * visits,
    costAnamnesisEur: unit.parts.anamnesis * visits,
    costFixedEur: fixedEur,
  };
  const costTotalEur = cost.costGeminiFormsEur + cost.costSonioxEur + cost.costOpenaiEur + cost.costAnamnesisEur + cost.costFixedEur;
  const netEur = credits * money.netEur * paying;
  const resultEur = netEur - costTotalEur;
  return {
    doctors,
    visits,
    creditsSpent: credits,
    grossEur: credits * money.priceEur * paying,
    vatEur: credits * money.vatEur * paying,
    feeEur: credits * money.feeEur * paying,
    netEur,
    ...cost,
    costTotalEur,
    resultEur,
    marginPct: netEur > 0 ? resultEur / netEur : null,
  };
};

const nowColumns = (summary, factor) => {
  const ok = summary.income.status === 'ok';
  const total = {
    doctors: summary.activeDoctors,
    visits: summary.counts.forms,
    creditsSpent: summary.creditsSpent.total,
    grossEur: ok ? summary.income.grossEur : null,
    vatEur: ok ? summary.income.vatEur : null,
    feeEur: ok ? summary.income.feeEur : null,
    netEur: ok ? summary.income.netEur : null,
    costGeminiFormsEur: summary.cost.byFeature.form,
    costSonioxEur: summary.cost.byProvider.soniox,
    costOpenaiEur: summary.cost.byProvider.openai,
    costAnamnesisEur: summary.cost.byFeature.anamnesis,
    costFixedEur: summary.cost.byFeature.fixed,
    costTotalEur: summary.cost.totalEur,
    resultEur: summary.resultEur,
    marginPct: summary.marginPct,
  };
  const scaled = { ...total };
  Object.keys(total).forEach((key) => {
    if (key === 'doctors' || key === 'marginPct' || total[key] === null) return;
    scaled[key] = total[key] * factor;
  });
  return { now: scaled, nowTotal: total };
};

const packChip = (pack, plan) => {
  // Pack sizes are names ('pack 1500'), not amounts: a string keeps the thousands separator out.
  if (pack !== 'plan') return { key: 'common.plan.packSingle', values: { pack: String(PACK_SIZES[pack]) } };
  const used = PACK_IDS.filter((id) => plan.packMix[id] > 0);
  return used.length === 1 ? { key: 'common.plan.packSingle', values: { pack: String(PACK_SIZES[used[0]]) } } : { key: 'common.plan.packMix' };
};

/**
 * Assumption chips under a projection (§3.8): visits · scenario · pack · VAT · free share.
 * @returns {Array<{ key: string, values?: object }>}
 */
export function planChips({ plan, scenario, pack, vatPayer }) {
  return [
    { key: 'common.plan.chip.visits', values: { n: plan.visitsPerDoctorMonth } },
    scenarioLabel(scenario),
    packChip(pack, plan),
    { key: vatPayer ? 'common.vatWord.on' : 'common.vatWord.off' },
    { key: 'common.plan.chip.free', values: { share: ['pct', plan.freeShare] } },
  ];
}

function project(ds, period, scope, { scenario, plan, vatPayer, pack, uc }) {
  const sc = resolveScenario(ds, scenario, plan);
  const method = plan.paymentMethod;
  const money = creditMoney(pack, { vatPayer, method, prices: ds?.prices, packs: packsOf(ds), packMix: plan.packMix });
  const unit = visitUnit(sc, uc, plan);
  const [n0, n1] = plan.doctorScales;
  const visitsPerDoctor = plan.visitsPerDoctorMonth;
  const column = (doctors, visits, fixedEur) => planColumn({ doctors, visits, unit, money, freeShare: plan.freeShare, fixedEur });

  const summary = ds && period ? summarize(ds, period, scope) : null;
  const factor = monthFactor(period) ?? 0;
  const { now, nowTotal } = summary ? nowColumns(summary, factor) : { now: emptyColumn(), nowTotal: emptyColumn() };
  const cap = capacityFor(ds, plan, sc);

  const warnings = [...uc.warnings];
  if (sc.fallback) warnings.push('MEASURED_FALLBACK');
  if (cap.soniox.s0.p95 > cap.soniox.limit || cap.soniox.s1.p95 > cap.soniox.limit) warnings.push('SONIOX_STREAM_LIMIT');
  const soonest = [cap.dashboard.s0MonthsToCap, cap.dashboard.s1MonthsToCap].filter((m) => m !== null);
  if (soonest.some((months) => months <= 12)) warnings.push('DASHBOARD_ROWS');

  const visit = column(1, 1, 0);
  return {
    scenario: {
      id: sc.id, liveShare: sc.liveShare, liveMin: sc.liveMin, dictMin: sc.dictMin, pack, packMix: { ...plan.packMix }, vatPayer,
      method, freeShare: plan.freeShare, visitsPerDoctorMonth: visitsPerDoctor,
    },
    unit: { visitCostEur: visit.costTotalEur, visitCredits: unit.credits, visitNetEur: visit.netEur, basis: 'model' },
    columns: {
      now,
      nowTotal,
      visit,
      doctor: column(1, visitsPerDoctor, 0),
      s0: column(n0, n0 * visitsPerDoctor, fixedEurAt(n0, plan, sc, ds)),
      s1: column(n1, n1 * visitsPerDoctor, fixedEurAt(n1, plan, sc, ds)),
    },
    now: { factor, hidden: !(period?.effDays >= MIN_DAYS_FOR_MONTH), incomeBasis: summary ? summary.income.basis : 'missing' },
    scales: [n0, n1],
    capacity: cap,
    warnings,
    chips: planChips({ plan, scenario: sc, pack, vatPayer }),
  };
}

/**
 * Today next to the plan, per month (§4.2 D): the "now" column is the period's summarize() × monthFactor
 * (null income rows while the income is not known); visit / doctor are variable costs only; s0 / s1 add
 * the fixed costs of that many doctors. Memoised per dataset.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @param {{ scenario?: string, planning?: object, vatPayer?: boolean, pack?: string }} [options]
 * @returns {ScaleResult}
 */
export function projectScale(ds, period, scope, { scenario = 'plan', planning, vatPayer, pack = 'plan' } = {}) {
  const plan = planningOf(planning ?? scope?.planning ?? ds?.settings?.planning);
  const vat = vatPayer ?? scope?.vatPayer ?? false;
  const run = () => project(ds, period, scope, { scenario, plan, vatPayer: vat, pack, uc: unitCosts(ds, plan) });
  if (!ds) return run();
  const key = `projectScale|${period?.key}|${period?.effTo}|${scopeKey(scope)}|${planKey({ scenario, plan, vat, pack })}`;
  return remember(ds, key, run);
}

// ---------------------------------------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------------------------------------

/** The one-change variants of §4.2 D, in the order they are listed. */
export const SENSITIVITY_KEYS = Object.freeze(['pack600', 'model38in2027', 'vat', 'live25', 'free10', 'paypal']);

const MODEL_2027 = { model: 'gemini-3.8-flash', at: '2027-01-02' };

const unitCostsOnModel = (uc, ds, { model, at }) => {
  const fx = ds?.fx?.usdPerEur ?? 1.1463;
  const price = geminiPrice(ds?.prices, model, { at, platform: 'direct', endpoint: 'global' });
  return {
    ...uc,
    formCostEur: (uc.formInTok * price.inputPerM + uc.formOutTok * price.outputPerM) / 1e6 / fx,
    convPerMinEur: (uc.convTokensPerMin * price.inputPerM) / 1e6 / fx,
    warnings: [],
  };
};

/**
 * What moves the monthly result most at `scales[0]` doctors (§4.2 D): the plan with one assumption
 * changed at a time. Sorted by |difference|, largest first.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @param {{ planning?: object, vatPayer?: boolean }} [options]
 * @returns {Array<{ key: string, resultEur: number, diffEur: number }>}
 */
export function sensitivity(ds, period, scope, { planning, vatPayer } = {}) {
  const plan = planningOf(planning ?? scope?.planning ?? ds?.settings?.planning);
  const vat = vatPayer ?? scope?.vatPayer ?? false;
  const uc = unitCosts(ds, plan);
  const base = { scenario: 'plan', plan, vatPayer: vat, pack: 'plan', uc };
  const resultOf = (options) => project(ds, period, scope, { ...base, ...options }).columns.s0.resultEur;
  const baseResult = resultOf({});
  const variants = {
    pack600: { pack: 'pack600' },
    model38in2027: { uc: unitCostsOnModel(uc, ds, MODEL_2027) },
    vat: { vatPayer: true },
    live25: { plan: { ...plan, liveMinutesPerVisit: 25 } },
    free10: { plan: { ...plan, freeShare: Math.min(1, plan.freeShare + 0.1) } },
    paypal: { plan: { ...plan, paymentMethod: 'paypal' } },
  };
  return SENSITIVITY_KEYS.map((key) => {
    const resultEur = resultOf(variants[key]);
    return { key, resultEur, diffEur: resultEur - baseResult };
  }).sort((a, b) => Math.abs(b.diffEur) - Math.abs(a.diffEur));
}

// ---------------------------------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------------------------------

function capacityFor(ds, plan, sc) {
  const [n0, n1] = plan.doctorScales;
  const limit = plan.sonioxStreamLimit;
  const perDoctorPeak = (plan.visitsPerDoctorMonth / plan.workdaysPerMonth) * plan.peakHourShare * sc.liveShare * sc.liveMin / 60;
  const p = Math.min(1, perDoctorPeak);
  const streams = (n) => ({ mean: n * p, p95: binomialQuantile(Math.min(n, PLAN.maxBinomialDoctors), p, PLAN.soniox95) });
  const fx = ds?.fx?.usdPerEur ?? 1.1463;
  const egressPerGb = ds?.prices?.RAILWAY?.egressPerGb ?? 0.05;
  const rowsNow = ds?.rows?.length ?? 0;
  const rowsPerVisit = 1 + sc.liveShare + (1 - sc.liveShare) * (sc.dictMin > 0 ? 1 : 0) + 1;
  const monthsToCap = (n) => {
    const perMonth = n * plan.visitsPerDoctorMonth * rowsPerVisit;
    return perMonth > 0 ? Math.max(0, DASHBOARD_ROW_CAP - rowsNow) / perMonth : null;
  };
  return {
    perDoctorPeak,
    soniox: {
      limit,
      meanDoctors: p > 0 ? Math.floor(limit / p + 1e-9) : null,
      limitDoctors: p > 0 ? largestSafeN(p, limit, { risk: 1 - PLAN.soniox95, maxN: PLAN.maxBinomialDoctors }) : null,
      s0: streams(n0),
      s1: streams(n1),
    },
    firestore: {
      s0Writes: firestoreWritesPerDay(n0, plan),
      s1Writes: firestoreWritesPerDay(n1, plan),
      free: ds?.prices?.FIRESTORE?.freePerDay?.writes ?? 20000,
      s0Eur: firestoreUsdMonth(n0, plan, ds?.prices) / fx,
      s1Eur: firestoreUsdMonth(n1, plan, ds?.prices) / fx,
    },
    railway: {
      s0Gb: egressGbMonth(n0, plan, sc),
      s1Gb: egressGbMonth(n1, plan, sc),
      s0Eur: (egressGbMonth(n0, plan, sc) * egressPerGb) / fx,
      s1Eur: (egressGbMonth(n1, plan, sc) * egressPerGb) / fx,
    },
    dashboard: { rowsNow, rowsPerVisit, s0MonthsToCap: monthsToCap(n0), s1MonthsToCap: monthsToCap(n1), cap: DASHBOARD_ROW_CAP },
  };
}

/**
 * Where we hit a limit (§5.3.7 capacity formulas, D22): Soniox streams in the busiest hour as a binomial
 * (mean and the 95th percentile — 19 of 20 peak hours), Firestore writes, Railway egress, dashboard rows.
 * Defaults: p = 0.714 per doctor, meanDoctors 14, limitDoctors 11, p95 79 at 100 doctors.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {{ planning?: object, scenario?: string }} [options]
 * @returns {Capacity}
 */
export function capacity(ds, { planning, scenario = 'plan' } = {}) {
  const plan = planningOf(planning ?? ds?.settings?.planning);
  const run = () => capacityFor(ds, plan, resolveScenario(ds, scenario, plan));
  if (!ds) return run();
  return remember(ds, `capacity|${scenario}|${planKey(plan)}`, run);
}
