// Prices page metric (§4.7): what other models and Google Cloud (Vertex) would cost on OUR forms and how fast
// they would answer. A service page: all traffic, no period — "ours" is always the last 30 days of the current
// model setup (D17), so `period` and `scope` do not change the result.
// Pure: no clock (ds.nowMs), no window, no React, no copy strings, no formatting.
import { MIN_SETUP_FORMS } from '../constants.js';
import { packsOf } from '../core/packs.js';
import { planningOf, unitCosts } from '../core/projection.js';
import { currentSetup, currentSetupForms } from '../core/setup.js';
import { geminiPrice, lookup, shutdownDate } from '../pricing/gemini.js';
import { paymentFeeEur, vatRate } from '../pricing/payments.js';
import { canonicalTranscriptionModel } from '../pricing/transcription.js';
import { EMPTY_RESULT, median } from './shared.js';

/** The combo every option is compared with: today's production setup in the benchmark. */
export const BASE_COMBO_ID = 'gemini-3-flash-preview@direct';
/** The same model on Google Cloud with the setting it needs there (summary row 1). */
export const SAME_MODEL_CLOUD_ID = 'gemini-3-flash-preview@global+minimal';
/** The same model on Google Cloud with today's setting (the "thinking" finding). */
export const SAME_MODEL_CLOUD_LOW_ID = 'gemini-3-flash-preview@global';
/** The 9 options shown before "Show all" (§4.7). */
export const CURATED_COMBOS = Object.freeze([
  'gemini-3-flash-preview@direct',
  'gemini-3-flash-preview@global+minimal',
  'gemini-3.8-flash@direct',
  'gemini-3.5-flash-lite@direct',
  'gemini-3.1-flash-lite@direct+minimal',
  'gemini-3.5-flash-lite@eu',
  'gemini-3.8-flash@eu',
  'gemini-3.5-flash@europe-west3',
  'gemini-2.5-flash@europe-west3',
]);
/** A pick must outlive this day: only a HARD shutdown before it excludes a model ("not before" does not). */
export const MIN_MODEL_LIFETIME_UNTIL = '2027-06-01';
/** Day used for "From 2027" prices. */
export const PRICES_2027_AT = '2027-01-02';
/** |ratio − 1| under this reads "about the same price". */
export const SAME_PRICE_BAND = 0.1;
/** |speed difference| under this reads "about as fast". */
export const SAME_SPEED_MS = 500;
/** Checks of the benchmark's quality score. */
export const QUALITY_CHECKS = 14;
/** Places of the availability table, in column order. */
export const AVAILABILITY_PLACES = Object.freeze(['direct', 'global', 'eu', 'europe-west4', 'europe-west1', 'europe-west3']);
/** Google Cloud places whose servers are in the EU. */
const EU_PLACES = new Set(['eu', 'europe-west1', 'europe-west3', 'europe-west4']);
/** Option filters of the "Options" table. */
export const FILTERS = Object.freeze(['all', 'eu', 'noFailures']);
/** A place counts as failing in the findings when this share of its test requests got no answer. */
const FAILING_SHARE = 0.4;
/** Suffix of a dated model snapshot. */
const DATED = /^-\d{4}-\d{2}-\d{2}$/;

const PICK_RULES = Object.freeze({
  fastestQuality: 0.95,
  cheapestEuQuality: 0.9,
  bestEuMaxSpeedRatio: 1.5,
});

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * The id of an option in the page's output: the benchmark id with '/' for '@' ('gemini-3.8-flash/direct'), so no
 * metric result ever contains an '@' (the privacy scan of §6.3 looks for e-mail addresses).
 * @param {string} benchmarkId e.g. 'gemini-3.8-flash@direct'
 */
export const comboKey = (benchmarkId) => String(benchmarkId ?? '').replace('@', '/');
const CURATED_KEYS = new Set(CURATED_COMBOS.map(comboKey));
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const ratioOf = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : 1);

// ---------------------------------------------------------------------------------------------------
// Words (the page turns these into text)
// ---------------------------------------------------------------------------------------------------

/**
 * How a price compares with now (§4.7 word rules): within ±10 % → same; ≥ 1.10 → more (×r); ≤ 0.90 → less (−p).
 * @param {number|null} ratio price ÷ price now
 * @returns {{ kind: 'same'|'more'|'less', ratio: number, cut: number } | null} cut = 1 − ratio (share cheaper)
 */
export function priceWord(ratio) {
  if (!isNum(ratio)) return null;
  // The tiny epsilon keeps 0.90 and 1.10 themselves outside the band despite binary floating point.
  if (Math.abs(ratio - 1) < SAME_PRICE_BAND - 1e-9) return { kind: 'same', ratio, cut: 1 - ratio };
  return { kind: ratio > 1 ? 'more' : 'less', ratio, cut: 1 - ratio };
}

/**
 * How a speed compares with now: within ±0.5 s → same; otherwise slower / faster by |Δ|.
 * @param {number|null} deltaMs expected − ours
 * @returns {{ kind: 'same'|'slower'|'faster', ms: number } | null}
 */
export function speedWord(deltaMs) {
  if (!isNum(deltaMs)) return null;
  if (Math.abs(deltaMs) < SAME_SPEED_MS) return { kind: 'same', ms: Math.abs(deltaMs) };
  return { kind: deltaMs > 0 ? 'slower' : 'faster', ms: Math.abs(deltaMs) };
}

// ---------------------------------------------------------------------------------------------------
// Our own forms
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {{ inTok: number, outTok: number, speedMs: number, forms: number, measured: boolean,
 *   eurPerForm: number|null, basis: 'exact'|'model' }} Ours
 *   eurPerForm: the plan's form price (unitCosts) when today's setup is the base combo, else null
 */

/**
 * Our forms (§4.7 method): current-setup forms of the last 30 days, all traffic, no conversation text, on the base
 * model via the Google API. Fewer than 20 → the assumed form size from Settings and the test's own speed.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {object} base the base combo of the benchmark
 * @param {object} [planning] settings.planning
 * @returns {Ours}
 */
export function oursOf(ds, base, planning = ds?.settings?.planning) {
  const plan = planningOf(planning);
  const setup = currentSetup(ds);
  const rows = currentSetupForms(ds, ds.nowMs).filter((row) => row.model === base.model && row.endpoint === 'direct');
  const measured = rows.length >= MIN_SETUP_FORMS;
  const testSpeedMs = isNum(base.latencySec?.p50) ? base.latencySec.p50 * 1000 : null;
  const speed = measured ? median(rows.map((row) => row.durMs)) : null;
  const setupIsBase = setup.main === base.model && setup.endpoint === 'direct';
  return {
    inTok: measured ? mean(rows.map((row) => row.inTok)) : plan.assumedFormTokens.in,
    outTok: measured ? mean(rows.map((row) => row.outTok)) : plan.assumedFormTokens.out,
    speedMs: isNum(speed) ? speed : testSpeedMs,
    forms: rows.length,
    measured,
    eurPerForm: setupIsBase ? unitCosts(ds, planning).formCostEur : null,
    basis: measured ? 'exact' : 'model',
  };
}

// ---------------------------------------------------------------------------------------------------
// One option projected onto our forms
// ---------------------------------------------------------------------------------------------------

const outputOf = (combo) => (combo?.tokens?.outAvg ?? 0) + (combo?.tokens?.thinkingAvg ?? 0);

/**
 * List price of an option on a day; the benchmark's own price when the model is missing from the price table.
 * @returns {{ inPerM: number, outPerM: number, known: boolean }}
 */
export function comboPrice(prices, combo, at) {
  const vertex = combo.endpoint !== 'direct';
  const price = geminiPrice(prices, combo.model, { at, platform: vertex ? 'vertex' : 'direct', endpoint: vertex ? combo.endpoint : undefined });
  if (price.known || !combo.pricePerM) return { inPerM: price.inputPerM, outPerM: price.outputPerM, known: price.known };
  return { inPerM: combo.pricePerM.in, outPerM: combo.pricePerM.out, known: false };
}

/** USD of one of our forms priced as `combo` (token shape adjusted by the test's in/out ratios). */
const shapeUsd = (combo, base, ours, price) =>
  (ours.inTok * ratioOf(combo.tokens?.inAvg, base.tokens?.inAvg) * price.inPerM +
    ours.outTok * ratioOf(outputOf(combo), outputOf(base)) * price.outPerM) /
  1e6;

/**
 * @typedef {{
 *   id: string, key: string, model: string, endpoint: string, thinking: object|null, role: string, eu: boolean,
 *   isBase: boolean, isFallback: boolean, known: boolean,
 *   eurPerForm: number, usdPerForm: number, eurPerForm2027: number, priceRatio: number|null, priceRatio2027: number|null,
 *   speedRatio: number|null,
 *   expectedMs: number|null, speedDeltaMs: number|null, perDoctorEur: number|null, scaleEur: Array<number|null>,
 *   qualityScore: number|null, checks: number|null, runs: number, ok: number, failed: number, over25: number,
 *   shutdown: string|null, lastsLongEnough: boolean,
 *   priceWord: ReturnType<typeof priceWord>, speedWord: ReturnType<typeof speedWord>
 * }} ProjectedCombo
 */

/**
 * One benchmark option projected onto our own forms (§4.7 method).
 * - price: our mean tokens × the option's in/out ratios against the base option × its list price
 *   (×1.1 off `global` on Google Cloud for stable Gemini 3+), converted once with `fx`;
 * - when `ours.eurPerForm` is known (today's setup is the base option), every price is scaled so that the base
 *   option costs exactly that plan price (the shared form price); ratios are unchanged by the scaling;
 * - speed: our usual time × the option's speed ratio in the test.
 * @param {object} combo a benchmark combo
 * @param {object} base the base combo (today's setup)
 * @param {Ours} ours our forms
 * @param {object} prices price snapshot
 * @param {{ usdPerEur: number }} fx
 * @param {{ at?: number|string, prices2027?: boolean, visits?: number|null, scales?: number[] }} [opts]
 *   `at` = today (ds.nowMs); `prices2027` prices every option on 02.01.2027 instead
 * @returns {ProjectedCombo}
 */
export function projectCombo(combo, base, ours, prices, fx, opts = {}) {
  const { at, prices2027 = false, visits = null, scales = [] } = opts;
  const usdPerEur = fx?.usdPerEur ?? 1.1463;
  const today = comboPrice(prices, combo, at);
  const in2027 = comboPrice(prices, combo, PRICES_2027_AT);
  const baseToday = shapeUsd(base, base, ours, comboPrice(prices, base, at));
  // Our plan price of a form, when known, fixes the level; the test decides only the ratios.
  const toEur = (usd) => (isNum(ours.eurPerForm) && baseToday > 0 ? ours.eurPerForm * (usd / baseToday) : usd / usdPerEur);

  const usdToday = shapeUsd(combo, base, ours, today);
  const usd2027 = shapeUsd(combo, base, ours, in2027);
  const base2027 = shapeUsd(base, base, ours, comboPrice(prices, base, PRICES_2027_AT));
  const usdShown = prices2027 ? usd2027 : usdToday;
  const baseShown = prices2027 ? base2027 : baseToday;
  const eurPerForm = toEur(usdShown);
  const eurPerForm2027 = toEur(usd2027);
  const priceRatio = baseShown > 0 ? usdShown / baseShown : null;
  const priceRatio2027 = base2027 > 0 ? usd2027 / base2027 : null;

  const speedRatio = isNum(combo.vsProduction?.p50Ratio) ? combo.vsProduction.p50Ratio : null;
  const expectedMs = isNum(ours.speedMs) && isNum(speedRatio) ? ours.speedMs * speedRatio : null;
  const speedDeltaMs = isNum(expectedMs) ? expectedMs - ours.speedMs : null;
  const perDoctorEur = isNum(visits) ? eurPerForm * visits : null;
  const qualityScore = isNum(combo.quality?.avgScore) ? combo.quality.avgScore : null;
  const runs = combo.runs ?? 0;
  const ok = combo.ok ?? 0;
  const shutdown = shutdownDate(prices, combo.model, combo.endpoint === 'direct' ? 'direct' : 'vertex');

  const id = comboKey(combo.id);
  return {
    id,
    key: id,
    model: combo.model,
    endpoint: combo.endpoint,
    thinking: combo.thinkingConfig ?? null,
    role: combo.role ?? 'candidate',
    eu: Boolean(combo.euDataResidency),
    isBase: combo.id === base.id,
    isFallback: combo.role === 'production-fallback',
    known: today.known,
    eurPerForm,
    usdPerForm: eurPerForm * usdPerEur,
    eurPerForm2027,
    priceRatio,
    priceRatio2027,
    speedRatio,
    expectedMs,
    speedDeltaMs,
    perDoctorEur,
    scaleEur: scales.map((n) => (isNum(perDoctorEur) ? perDoctorEur * n : null)),
    qualityScore,
    checks: isNum(qualityScore) ? Math.round(qualityScore * QUALITY_CHECKS) : null,
    runs,
    ok,
    failed: Math.max(0, runs - ok),
    over25: combo.latencySec?.over25s ?? 0,
    shutdown,
    lastsLongEnough: !shutdown || shutdown >= MIN_MODEL_LIFETIME_UNTIL,
    priceWord: priceWord(priceRatio),
    speedWord: speedWord(speedDeltaMs),
  };
}

// ---------------------------------------------------------------------------------------------------
// Picks
// ---------------------------------------------------------------------------------------------------

const byThen = (...keys) => (a, b) => {
  for (const key of keys) {
    const diff = key(a) - key(b);
    if (diff) return diff;
  }
  return 0;
};

/**
 * The three picks of the answer (§4.7), from today's prices. Only a HARD shutdown date before
 * MIN_MODEL_LIFETIME_UNTIL excludes an option (`shutdownDirect` / `vertexShutdown`; "not before" dates do not):
 * - fastest: lowest expected time with quality ≥ 0.95 and every test request answered;
 * - cheapestEu: lowest € with servers in the EU, at most one request unanswered, quality ≥ 0.90;
 * - bestEu: highest quality with servers in the EU, every request answered, none over 25 s and at most 1.5× our
 *   time (ties → cheaper); `bestEuRunnerUp` = the next one in that order.
 * @param {ProjectedCombo[]} projected
 * @returns {{ fastest: ProjectedCombo|null, cheapestEu: ProjectedCombo|null, bestEu: ProjectedCombo|null, bestEuRunnerUp: ProjectedCombo|null }}
 */
export function pickCombos(projected) {
  const alive = projected.filter((p) => p.lastsLongEnough && isNum(p.speedRatio) && isNum(p.qualityScore));
  const first = (list, compare) => [...list].sort(compare)[0] ?? null;
  const fastest = first(
    alive.filter((p) => p.qualityScore >= PICK_RULES.fastestQuality && p.ok === p.runs),
    byThen((p) => p.speedRatio, (p) => p.eurPerForm),
  );
  const cheapestEu = first(
    alive.filter((p) => p.eu && p.ok >= p.runs - 1 && p.qualityScore >= PICK_RULES.cheapestEuQuality),
    byThen((p) => p.eurPerForm, (p) => p.speedRatio),
  );
  const bestPool = alive
    .filter((p) => p.eu && p.ok === p.runs && p.over25 === 0 && p.speedRatio <= PICK_RULES.bestEuMaxSpeedRatio)
    .sort(byThen((p) => -p.qualityScore, (p) => p.eurPerForm));
  return { fastest, cheapestEu, bestEu: bestPool[0] ?? null, bestEuRunnerUp: bestPool[1] ?? null };
}

// ---------------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------------

/** A combo as text values for the page: `['combo', { model, endpoint, thinking }]`. */
const comboRef = (p) => ['combo', { model: p.model, endpoint: p.endpoint, thinking: p.thinking }];

/**
 * Where each model runs (§4.7 #availability): one row per model, one cell per place.
 * @param {{ availability?: object[] }} benchmark
 * @returns {Array<{ key: string, model: string, places: Record<string, { available: boolean, sec: number|null } | null> }>}
 */
export function availabilityRows(benchmark) {
  const rows = new Map();
  (benchmark?.availability ?? []).forEach((probe) => {
    if (!rows.has(probe.model)) rows.set(probe.model, { key: probe.model, model: probe.model, places: Object.fromEntries(AVAILABILITY_PLACES.map((p) => [p, null])) });
    if (!AVAILABILITY_PLACES.includes(probe.endpoint)) return;
    rows.get(probe.model).places[probe.endpoint] = { available: Boolean(probe.available), sec: isNum(probe.tinyRequestSec) ? probe.tinyRequestSec : null };
  });
  return [...rows.values()];
}

/**
 * Facts under the availability table: the current main model with no EU place; EU countries without any 3.x model.
 * @param {ReturnType<typeof availabilityRows>} rows
 * @param {string} mainModel
 */
export function availabilityFacts(rows, mainModel) {
  const facts = [];
  const main = rows.find((row) => row.model === mainModel);
  if (main && ![...EU_PLACES].some((place) => main.places[place]?.available)) {
    facts.push({ key: 'prices.availability.fact.mainNoEu', values: { model: ['model', mainModel] }, tone: 'attention' });
  }
  const tested = (place) => rows.some((row) => row.places[place] !== null);
  const no3x = ['europe-west4', 'europe-west1', 'europe-west3'].filter(
    (place) => tested(place) && !rows.some((row) => row.model.startsWith('gemini-3') && row.places[place]?.available),
  );
  if (no3x.length) facts.push({ key: 'prices.availability.fact.no3x', values: { places: ['placesIn', no3x] }, tone: 'neutral' });
  return facts;
}

/**
 * The places of one model whose test requests mostly got no answer (≥ 40 %), on Google Cloud.
 * @param {ProjectedCombo[]} projected
 * @returns {{ model: string, failed: number, runs: number, places: string[] } | null} the worst model
 */
export function failingOnCloud(projected) {
  const groups = new Map();
  projected
    .filter((p) => p.endpoint !== 'direct' && p.runs > 0 && p.failed / p.runs >= FAILING_SHARE)
    .forEach((p) => {
      const group = groups.get(p.model) ?? { model: p.model, failed: 0, runs: 0, places: [] };
      group.failed += p.failed;
      group.runs += p.runs;
      group.places.push(p.endpoint);
      groups.set(p.model, group);
    });
  return [...groups.values()].sort((a, b) => b.failed - a.failed || a.model.localeCompare(b.model))[0] ?? null;
}

const failuresWhere = (projected, cloud) =>
  projected
    .filter((p) => (p.endpoint !== 'direct') === cloud)
    .reduce((acc, p) => ({ failed: acc.failed + p.failed, runs: acc.runs + p.runs }), { failed: 0, runs: 0 });

/** Six test findings (§4.7 #findings); numbers come from the same projections as the table. */
function findingsOf({ prices, projectedById, picks }) {
  const factor = prices?.VERTEX?.nonGlobalFactor ?? 1.1;
  const findings = [{ key: 'prices.findings.vertexNoGain', values: { pct: ['pct', factor - 1] }, tone: 'neutral' }];

  const { fastest } = picks;
  if (fastest) {
    const rises = isNum(fastest.priceRatio2027) && fastest.eurPerForm2027 > fastest.eurPerForm * (1 + SAME_PRICE_BAND);
    findings.push({
      key: rises ? 'prices.findings.fastest2027' : 'prices.findings.fastest',
      values: { name: comboRef(fastest), checks: fastest.checks, total: QUALITY_CHECKS, times: ['times', fastest.priceRatio2027] },
      tone: 'neutral',
    });
  }

  const low = projectedById.get(comboKey(SAME_MODEL_CLOUD_LOW_ID));
  if (low && (low.priceWord?.kind === 'more' || low.speedWord?.kind === 'slower')) {
    findings.push({ key: 'prices.findings.thinking', values: { time: ['sec', low.expectedMs], times: ['times', low.priceRatio] }, tone: 'attention' });
  }

  const failing = failingOnCloud([...projectedById.values()]);
  if (failing) {
    findings.push({
      key: 'prices.findings.failing',
      values: { name: ['model', failing.model], n: failing.failed, total: failing.runs, places: ['placesShort', failing.places] },
      tone: 'attention',
    });
  }

  const cloud = failuresWhere([...projectedById.values()], true);
  const direct = failuresWhere([...projectedById.values()], false);
  if (cloud.runs > 0 && direct.runs > 0) {
    findings.push({ key: 'prices.findings.failures', values: { cloudFailed: cloud.failed, cloudRuns: cloud.runs, directFailed: direct.failed, directRuns: direct.runs }, tone: 'neutral' });
  }
  findings.push({ key: 'prices.findings.fallbackPlace', tone: 'quiet' });
  return findings;
}

/** Rows of the three-line "If we move to Vertex — in short" card (§4.7 #summary). */
function vertexSummaryOf({ projectedById, picks, scales }) {
  const rows = [];
  const same = projectedById.get(comboKey(SAME_MODEL_CLOUD_ID));
  if (same) {
    rows.push({ key: 'prices.vertex.same', values: { price: ['priceSay', same.priceWord], speed: ['speedSay', same.speedWord] }, tone: 'neutral' });
  }
  const base = projectedById.get(comboKey(BASE_COMBO_ID));
  const { cheapestEu, bestEu, bestEuRunnerUp } = picks;
  if (cheapestEu) {
    const simpler = base && isNum(base.qualityScore) && cheapestEu.qualityScore < base.qualityScore;
    rows.push({
      key: simpler ? 'prices.vertex.cheapestEuSimpler' : 'prices.vertex.cheapestEu',
      values: { name: comboRef(cheapestEu), cost: ['eurUnit', cheapestEu.eurPerForm], vsNow: ['priceVsNow', cheapestEu.priceWord], time: ['sec', cheapestEu.expectedMs] },
      tone: 'neutral',
    });
  }
  if (bestEu && base) {
    const diff = scales.map((n) => (isNum(bestEu.perDoctorEur) && isNum(base.perDoctorEur) ? (bestEu.perDoctorEur - base.perDoctorEur) * n : null));
    const row = {
      key: 'prices.vertex.bestEu',
      values: {
        name: comboRef(bestEu), cost: ['eurUnit', bestEu.eurPerForm], vsNow: ['priceVsNow', bestEu.priceWord], time: ['sec', bestEu.expectedMs],
        s0: scales[0], s1: scales[1], diff0: ['eurSigned', diff[0]], diff1: ['eurSigned', diff[1]],
      },
      tone: 'neutral',
    };
    if (bestEuRunnerUp && bestEu.qualityScore - bestEuRunnerUp.qualityScore <= 1 / QUALITY_CHECKS) {
      const tie = bestEu.checks === bestEuRunnerUp.checks;
      row.sub = {
        key: tie ? 'prices.vertex.bestEuTie' : 'prices.vertex.bestEuNarrow',
        values: { runner: comboRef(bestEuRunnerUp), checks: bestEu.checks, total: QUALITY_CHECKS },
      };
    }
    rows.push(row);
  }
  return rows;
}

/** The answer (§4.7): what the same model on Google Cloud changes, then the fastest and the cheapest EU pick. */
function answerOf({ projectedById, picks }) {
  const answer = [];
  const same = projectedById.get(comboKey(SAME_MODEL_CLOUD_ID));
  if (same?.priceWord && same?.speedWord) {
    const price = same.priceWord.kind;
    const speed = same.speedWord.kind;
    if (price === 'same' && speed !== 'faster') answer.push({ key: 'prices.answer.vertex', tone: 'neutral' });
    else if (price === 'same') answer.push({ key: 'prices.answer.vertexBitFaster', values: { time: ['sec', same.speedWord.ms] }, tone: 'neutral' });
    else answer.push({ key: 'prices.answer.vertexSameModel', values: { price: ['priceSay', same.priceWord], speed: ['speedSay', same.speedWord] }, tone: 'neutral' });
  }
  const { fastest, cheapestEu } = picks;
  if (fastest && cheapestEu) answer.push({ key: 'prices.answer.picks', values: { fastest: comboRef(fastest), cheapestEu: comboRef(cheapestEu) }, tone: 'neutral' });
  else if (fastest) answer.push({ key: 'prices.answer.fastest', values: { fastest: comboRef(fastest) }, tone: 'neutral' });
  else if (cheapestEu) answer.push({ key: 'prices.answer.cheapestEu', values: { cheapestEu: comboRef(cheapestEu) }, tone: 'neutral' });
  return answer;
}

/**
 * "Options" rows (§4.7 #whatif): the filter, then the curated 9 unless `showAll`. The base option is always kept
 * as the reference row. Sorted by "Price compared to now", ascending.
 * @param {ProjectedCombo[]} projected
 * @param {{ filter?: string, showAll?: boolean }} opts
 * @returns {{ rows: ProjectedCombo[], total: number }} total = rows passing the filter
 */
export function whatIfRows(projected, { filter = 'all', showAll = false } = {}) {
  const passes = (p) => {
    if (p.isBase) return true;
    if (filter === 'eu') return p.eu;
    if (filter === 'noFailures') return p.failed === 0;
    return true;
  };
  const filtered = projected.filter(passes);
  const shown = showAll ? filtered : filtered.filter((p) => CURATED_KEYS.has(p.id));
  const byPrice = byThen((p) => (isNum(p.priceRatio) ? p.priceRatio : Infinity), (p) => (isNum(p.speedRatio) ? p.speedRatio : Infinity));
  return { rows: [...shown].sort(byPrice), total: filtered.length };
}

/** A model's USD of one of our forms at its Google API price (the "Models" price list). */
const modelFormUsd = (prices, model, ours, at) => {
  const price = geminiPrice(prices, model, { at, platform: 'direct' });
  return (ours.inTok * price.inputPerM + ours.outTok * price.outputPerM) / 1e6;
};

/**
 * "Models" price list: Google API prices, the Google Cloud EU surcharge, one of our forms, 2027, status, shutdown.
 * @returns {object[]}
 */
export function priceListModels(prices, ours, { fx, at, baseModel }) {
  const usdPerEur = fx?.usdPerEur ?? 1.1463;
  const baseUsd = modelFormUsd(prices, baseModel, ours, at);
  const toEur = (usd) => (isNum(ours.eurPerForm) && baseUsd > 0 ? ours.eurPerForm * (usd / baseUsd) : usd / usdPerEur);
  const factor = prices?.VERTEX?.nonGlobalFactor ?? 1.1;
  return Object.entries(prices?.GEMINI ?? {}).map(([model, entry]) => {
    const today = geminiPrice(prices, model, { at, platform: 'direct' });
    const later = geminiPrice(prices, model, { at: PRICES_2027_AT, platform: 'direct' });
    const inEu = (entry.vertexLocations ?? []).some((place) => EU_PLACES.has(place));
    let cloudEu = 'none';
    if (inEu) cloudEu = entry.status !== 'preview' && !entry.noVertexRegionalSurcharge ? 'surcharge' : 'same';
    const formEur = toEur(modelFormUsd(prices, model, ours, at));
    const changes = later.inputPerM !== today.inputPerM || later.outputPerM !== today.outputPerM;
    return {
      key: model,
      model,
      inPerM: today.inputPerM,
      outPerM: today.outputPerM,
      cloudEu,
      surcharge: factor - 1,
      formEur,
      formUsd: formEur * usdPerEur,
      formEur2027: changes ? toEur(modelFormUsd(prices, model, ours, PRICES_2027_AT)) : null,
      status: entry.status ?? null,
      shutdownDirect: entry.shutdownDirect ?? null,
      vertexShutdown: entry.vertexShutdown ?? null,
      vertexNotBefore: entry.vertexRetiresNotBefore ?? null,
      source: entry.source ?? prices?.SOURCES?.geminiApi ?? null,
      isMain: model === baseModel,
    };
  });
}

/**
 * "Transcription" price list: $ per hour, € per 10 minutes, and all planned recording of one doctor for a month
 * at this service. Dated snapshots fold into their family row (their shutdown date is kept).
 * @returns {object[]}
 */
export function priceListTranscription(prices, { fx, planning, config }) {
  const plan = planningOf(planning);
  const usdPerEur = fx?.usdPerEur ?? 1.1463;
  const minutesPerVisit = plan.liveShareOfVisits * plan.liveMinutesPerVisit + (1 - plan.liveShareOfVisits) * plan.dictationMinutesPerVisit;
  const minutesPerDoctor = plan.visitsPerDoctorMonth * minutesPerVisit;
  const table = prices?.TRANSCRIPTION ?? {};
  const ids = Object.keys(table);
  // A dated snapshot ('gpt-4o-mini-transcribe-2025-03-20') folds into its family row.
  const familyOf = (id) => ids.find((other) => other !== id && id.startsWith(`${other}-`) && DATED.test(id.slice(other.length))) ?? null;
  const inUse = new Set(
    [config?.transcription?.sonioxModel, config?.live?.rtModel].map(canonicalTranscriptionModel).filter(Boolean),
  );
  const backup = config?.transcription?.fallback === 'openai' ? lookup(table, config?.transcription?.openaiModel).key : null;
  const rows = new Map();
  ids.forEach((id) => {
    if (familyOf(id)) return;
    const entry = table[id];
    const soniox = entry.kind === 'async' || entry.kind === 'rt';
    rows.set(id, {
      key: id,
      id,
      kind: entry.kind ?? null,
      perHourUsd: entry.perMinute * 60,
      per10Eur: (entry.perMinute * 10) / usdPerEur,
      perDoctorMonthEur: (entry.perMinute * minutesPerDoctor) / usdPerEur,
      minutesPerDoctor,
      eu: soniox ? 'onRequest' : null,
      limit: entry.concurrentStreamsDefault ?? null,
      shutdown: entry.shutdown ?? null,
      source: entry.source ?? null,
      tag: inUse.has(id) ? 'now' : backup === id ? 'backup' : null,
    });
  });
  ids.forEach((id) => {
    const family = familyOf(id);
    if (!family || !rows.has(family)) return;
    const row = rows.get(family);
    if (table[id].shutdown && !row.shutdown) row.shutdown = table[id].shutdown;
  });
  return [...rows.values()];
}

/**
 * "Payments and server": the fee of every payment method on every pack.
 * @returns {object[]}
 */
export function priceListPayments(prices, packs) {
  return Object.entries(prices?.PAYMENT_FEES ?? {}).map(([method, fee]) => {
    const row = { key: method, method, pct: fee.pct, fixed: fee.fixed, stripePart: fee.stripePart ?? null, paypalPart: fee.paypalPart ?? null, source: fee.source ?? null };
    packs.forEach((pack) => {
      row[pack.id] = paymentFeeEur(prices, pack.priceEur, method);
    });
    return row;
  });
}

/** VAT, server, database and card extras under the payments table (text items; 'rate' / 'usdRate' are exact page formats). */
function otherCostsOf(prices, { vatPayer, fx }) {
  const usdPerEur = fx?.usdPerEur ?? 1.1463;
  const items = [{ key: vatPayer ? 'prices.other.vatOn' : 'prices.other.vatOff', values: { rate: ['rate', vatRate(prices)] } }];
  const railway = prices?.RAILWAY;
  if (railway) {
    items.push({
      key: 'prices.other.railway',
      values: { plan: railway.plan ?? '', usd: ['usdRate', railway.monthlyUsd], incl: ['usdRate', railway.includedUsageUsd], share: ['usd', railway.drfillerShareUsd], eur: ['eur', railway.drfillerShareUsd / usdPerEur] },
    });
  }
  const firestore = prices?.FIRESTORE;
  if (firestore) {
    items.push({
      key: 'prices.other.firestore',
      values: {
        reads: firestore.freePerDay?.reads, writes: firestore.freePerDay?.writes, gib: firestore.freeStorageGiB,
        readPrice: ['usdRate', firestore.per100k?.reads], writePrice: ['usdRate', firestore.per100k?.writes],
      },
    });
  }
  const extras = prices?.PAYMENT_EXTRAS;
  if (extras) items.push({ key: 'prices.other.extras', values: { conversion: ['rate', extras.fxConversionPct], dispute: ['eur', extras.disputeFeeEur] } });
  return items;
}

// ---------------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------------

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * `period` and `scope` do not change the result: "ours" is always the last 30 days of the current setup, all traffic.
 * `empty` is true only when there is nothing to price: no usage rows at all, or no benchmark; the page then keeps
 * the test and price lists (they do not depend on our forms) and shows an empty state for the rest.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {{ filter?: 'all'|'eu'|'noFailures', prices2027?: boolean, showAll?: boolean, priceTab?: string }} [opts]
 *   page-local, JSON-serialisable; `priceTab` only chooses a view, every price list is always built
 * @returns {import('./shared.js').AreaResult}
 */
export function computePrices(ds, period, scope, opts = {}) {
  if (!ds) return EMPTY_RESULT;
  const combos = ds.benchmark?.combos ?? [];
  const base = combos.find((combo) => combo.id === BASE_COMBO_ID);
  if (!base) return { ...EMPTY_RESULT, notes: [{ key: 'prices.note.noTest' }] };

  const { filter = 'all', prices2027 = false, showAll = false } = opts;
  const plan = planningOf(ds.settings?.planning);
  const setup = currentSetup(ds);
  const ours = oursOf(ds, base, ds.settings?.planning);
  const common = { at: ds.nowMs, visits: plan.visitsPerDoctorMonth, scales: plan.doctorScales };

  // Picks, the summary card and the findings always use today's prices; the table follows the 2026/2027 switch.
  const today = combos.map((combo) => projectCombo(combo, base, ours, ds.prices, ds.fx, common));
  const shown = prices2027 ? combos.map((combo) => projectCombo(combo, base, ours, ds.prices, ds.fx, { ...common, prices2027: true })) : today;
  const projectedById = new Map(today.map((p) => [p.id, p]));
  const picks = pickCombos(today);
  const safeFilter = FILTERS.includes(filter) ? filter : 'all';
  const whatIf = whatIfRows(shown, { filter: safeFilter, showAll });

  const availability = availabilityRows(ds.benchmark);
  const baseRow = projectedById.get(comboKey(BASE_COMBO_ID));
  const empty = (ds.rows?.length ?? 0) === 0;

  const notes = [];
  if (!ours.measured) notes.push({ key: 'prices.note.fewForms', values: { n: ours.forms, min: MIN_SETUP_FORMS } });
  if (setup.main !== base.model || setup.endpoint !== 'direct') {
    notes.push({ key: 'prices.note.setupChanged', values: { model: ['model', setup.main], place: ['place', setup.endpoint === 'direct' ? 'direct' : setup.location ?? 'global'] } });
  }
  if (today.some((p) => !p.known)) notes.push({ key: 'prices.note.unknownPrice' });

  const oursBasis = ours.measured ? 'exact' : 'model';
  return {
    empty,
    headline: {
      oursEurPerForm: ours.eurPerForm ?? baseRow?.eurPerForm ?? null,
      oursP50Ms: ours.speedMs,
      oursForms: ours.forms,
      oursPerDoctorEur: baseRow?.perDoctorEur ?? null,
      fastestId: picks.fastest?.id ?? null,
      cheapestEuId: picks.cheapestEu?.id ?? null,
      bestEuId: picks.bestEu?.id ?? null,
    },
    basis: {
      oursEurPerForm: oursBasis,
      oursP50Ms: oursBasis,
      oursForms: 'exact',
      oursPerDoctorEur: 'model',
      fastestId: 'exact',
      cheapestEuId: 'exact',
      bestEuId: 'exact',
    },
    answer: empty ? [{ key: 'prices.answer.noForms', tone: 'neutral' }] : answerOf({ projectedById, picks }),
    series: [],
    tables: {
      caveat: [{
        key: 'prices.benchCaveat',
        values: { date: ['date', ds.benchmark?.meta?.generatedAt ?? null], n: combos.reduce((acc, c) => acc + (c.runs ?? 0), 0), runs: base.runs ?? 0 },
      }],
      vertexSummary: vertexSummaryOf({ projectedById, picks, scales: plan.doctorScales }),
      whatIf: whatIf.rows,
      whatIfFiltered: whatIfRows(shown, { filter: safeFilter, showAll: true }).rows,
      availability,
      availabilityFacts: availabilityFacts(availability, setup.main),
      findings: findingsOf({ prices: ds.prices, projectedById, picks }),
      pricesModels: priceListModels(ds.prices, ours, { fx: ds.fx, at: ds.nowMs, baseModel: base.model }),
      pricesTranscription: priceListTranscription(ds.prices, { fx: ds.fx, planning: ds.settings?.planning, config: ds.config }),
      pricesPayments: priceListPayments(ds.prices, packsOf(ds)),
      pricesOther: otherCostsOf(ds.prices, { vatPayer: Boolean(ds.settings?.vatPayer), fx: ds.fx }),
      checked: [{ key: ds.pricesOrigin === 'server' ? 'prices.checked.server' : 'prices.checked.static', values: { date: ['date', ds.prices?.CHECKED_AT ?? null] } }],
    },
    notes,
  };
}
