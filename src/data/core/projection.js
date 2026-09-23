// The plan: unit costs (D17), scale projection, sensitivity and capacity (§5.3.7).
// FROZEN CONTRACT 2: ScaleResult, Capacity. SKELETON — F0-DATA implements the formulas; shapes are final.

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
 *   soniox: { limit: number, meanDoctors: number, limitDoctors: number, s0: { mean: number, p95: number }, s1: { mean: number, p95: number } },
 *   firestore: { s0Writes: number, s1Writes: number, free: 20000, s0Eur: number, s1Eur: number },
 *   railway: { s0Gb: number, s1Gb: number, s0Eur: number, s1Eur: number },
 *   dashboard: { rowsNow: number, rowsPerVisit: number, s0MonthsToCap: number|null, s1MonthsToCap: number|null, cap: 150000 }
 * }} Capacity
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
 * @typedef {{ formCostEur: number, formBasis: string, formsUsed: number, convPerMinEur: number, convTokensPerMin: number,
 *   convBasis: string, livePerMinEur: number, dictationPerMinEur: number, openaiShare: number, anamnesisRunEur: number,
 *   anamnesisRunCredits: number, basis: import('./basis.js').Basis }} UnitCosts
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
  dashboard: { rowsNow: 0, rowsPerVisit: 0, s0MonthsToCap: null, s1MonthsToCap: null, cap: 150000 },
});

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {string} id a key of SCENARIOS
 * @param {object} planning
 * @returns {{ id: string, liveShare: number, liveMin: number, dictMin: number, measured: boolean }}
 * @todo F0-DATA (measured needs the last-30-day mix; plan reads the planning fields)
 */
export function resolveScenario(ds, id, planning) {
  const preset = SCENARIOS[id];
  if (preset) return { id, ...preset, measured: false };
  return {
    id: 'plan',
    liveShare: planning?.liveShareOfVisits ?? 1,
    liveMin: planning?.liveMinutesPerVisit ?? 15,
    dictMin: planning?.dictationMinutesPerVisit ?? 1,
    measured: false,
  };
}

/**
 * Unit prices of the plan (D17, all traffic, current setup, last 30 days).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {object} planning
 * @returns {UnitCosts}
 * @todo F0-DATA
 */
export function unitCosts(ds, planning) {
  return {
    formCostEur: 0, formBasis: 'model', formsUsed: 0, convPerMinEur: 0, convTokensPerMin: planning?.conversationTokensPerMinute ?? 0,
    convBasis: 'model', livePerMinEur: 0, dictationPerMinEur: 0, openaiShare: 0, anamnesisRunEur: 0, anamnesisRunCredits: 0, basis: 'model',
  };
}

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @param {{ scenario: string, planning: object, vatPayer: boolean, pack?: string }} options
 * @returns {ScaleResult}
 * @todo F0-DATA
 */
export function projectScale(ds, period, scope, { scenario = 'plan', planning, vatPayer = false, pack = 'plan' } = {}) {
  const resolved = resolveScenario(ds, scenario, planning);
  const scales = planning?.doctorScales ?? [100, 300];
  return {
    scenario: {
      id: resolved.id, liveShare: resolved.liveShare, liveMin: resolved.liveMin, dictMin: resolved.dictMin, pack,
      packMix: planning?.packMix ?? null, vatPayer, method: planning?.paymentMethod ?? 'card_eea_standard',
      freeShare: planning?.freeShare ?? 0, visitsPerDoctorMonth: planning?.visitsPerDoctorMonth ?? 400,
    },
    unit: { visitCostEur: 0, visitCredits: 0, visitNetEur: 0, basis: 'model' },
    columns: { now: emptyColumn(), nowTotal: emptyColumn(), visit: emptyColumn(), doctor: emptyColumn(), s0: emptyColumn(), s1: emptyColumn() },
    now: { factor: 0, hidden: true, incomeBasis: 'missing' },
    scales: [scales[0], scales[1]],
    capacity: emptyCapacity(planning?.sonioxStreamLimit ?? 10),
    warnings: [],
    chips: [],
  };
}

/**
 * What moves the result most at scales[0] (§4.2 D).
 * @returns {Array<{ key: string, resultEur: number, diffEur: number }>}
 * @todo F0-DATA
 */
export function sensitivity(ds, period, scope, { planning, vatPayer } = {}) {
  return [];
}

/**
 * Where we hit a limit (binomial Soniox p95, Firestore writes, Railway egress, dashboard rows).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {{ planning: object, scenario?: string }} options
 * @returns {Capacity}
 * @todo F0-DATA
 */
export function capacity(ds, { planning, scenario = 'plan' } = {}) {
  return emptyCapacity(planning?.sonioxStreamLimit ?? 10);
}
