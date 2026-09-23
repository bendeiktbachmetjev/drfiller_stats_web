// Overview page metric (§4.1): the verdict, the five tiles, the plan row, at most two "In short" facts
// and the notes that applied. Shared numbers are picked from the F0 core (summarize, summarizeHealth,
// projectScale, unitEconomics) and passed on as they are, so every page shows the very same values
// (§2 rule 2, §6.3). Business numbers follow the scope; the health tile counts all traffic.
import { HEALTH, MIN_EVENTS_FOR_CHART } from '../constants.js';
import { MODEL_ERAS } from '../eras.js';
import { buildBuckets, inPeriod } from '../period.js';
import { combineBasis } from '../core/basis.js';
import { bucketFixedEur } from '../core/fixed.js';
import { formCostChange } from '../core/formCostChange.js';
import { summarizeHealth } from '../core/health.js';
import { incomeOf } from '../core/income.js';
import { projectScale, scenarioLabel } from '../core/projection.js';
import { hidesInternal, internalCount, isInternal } from '../core/scope.js';
import { REQUEST_KINDS, summarize, topDoctorOf } from '../core/summary.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { EMPTY_RESULT, makeSeries, share } from './shared.js';

/** Thresholds of the verdict and the "In short" facts (§4.1). */
export const OVERVIEW_RULES = Object.freeze({
  /** "All the costs went to free accounts" from this share of the variable cost. */
  allFreeShare: 0.995,
  /** A form got more expensive: cost per form at least +20 % against the comparison window. */
  formCostRise: 0.2,
  /** Both windows need this many forms before a price change is worth a sentence. */
  minFormsToCompare: MIN_EVENTS_FOR_CHART,
  /** One doctor behind at least half of the variable cost. */
  topDoctorShare: 0.5,
  /** Gifted and free credits on balances worth a sentence. */
  freeCreditsMin: 1000,
  maxFacts: 2,
});

/** Order of the cost split on the cost tile (identity, never rank). */
export const COST_PARTS = Object.freeze(['form', 'recording', 'anamnesis', 'fixed']);

const VERTEX_EU_ERA = MODEL_ERAS.find((era) => era.note === 'vertexEu');
const CENT = 0.005;

const eur = (value) => ['eur', value];

// ---------------------------------------------------------------------------------------------------
// Verdict (AnswerBlock): first matching rule, then the plan line
// ---------------------------------------------------------------------------------------------------

/**
 * Share of the variable cost that no paying doctor caused (§4.1): 1 − paid ÷ variable.
 * @param {import('../core/summary.js').Summary} summary
 * @returns {number|null} null when there is no variable cost
 */
export function freeCostShare(summary) {
  const paid = share(summary.cost.byClass.paid, summary.cost.variableEur);
  return paid === null ? null : 1 - paid;
}

/**
 * Who worked for free: "your own and test accounts and …" while such accounts are marked and counted,
 * else only the doctors on gifted and free credits.
 * @returns {{ key: string }}
 */
export const freeWhoOf = (ds, scope) =>
  internalCount(ds) > 0 && !hidesInternal(ds, scope) ? { key: 'overview.freeWho.internal' } : { key: 'overview.freeWho.gifted' };

/**
 * The plan line (always the second sentence): result per month at both planned scales.
 * `scenario` is a nested copy item; the page turns it into words.
 * @param {import('../core/projection.js').ScaleResult} projection
 */
export function planLine(projection) {
  const [s0, s1] = projection.scales;
  return {
    key: 'overview.verdict.plan',
    values: {
      scenario: scenarioLabel(projection.scenario),
      s0,
      s1,
      r0: ['eurSigned', projection.columns.s0.resultEur],
      r1: ['eurSigned', projection.columns.s1.resultEur],
    },
    tone: 'neutral',
  };
}

/**
 * The first sentence of the answer (§4.1 verdict table, first match). `{period}` is added by the page.
 * @param {import('../core/summary.js').Summary} summary
 * @param {{ key: string }} freeWho
 */
export function verdictLine(summary, freeWho) {
  const { income, cost } = summary;
  const costEur = cost.totalEur;
  if (income.status !== 'ok') return { key: 'overview.verdict.revenueOff', values: { cost: eur(costEur) }, tone: 'attention' };
  if (summary.resultEur >= 0) {
    return { key: 'overview.verdict.plus', values: { result: eur(summary.resultEur), income: eur(income.netEur), cost: eur(costEur) }, tone: 'good' };
  }
  const noIncome = income.payments === 0 && Math.abs(income.netEur) < CENT;
  if (noIncome) {
    const freeShare = freeCostShare(summary);
    if (freeShare !== null && freeShare >= OVERVIEW_RULES.allFreeShare) {
      return { key: 'overview.verdict.noIncomeAll', values: { cost: eur(costEur), freeWho }, tone: 'attention' };
    }
    return { key: 'overview.verdict.noIncome', values: { cost: eur(costEur), freeShare: ['pct', freeShare], freeWho }, tone: 'attention' };
  }
  return {
    key: 'overview.verdict.minus',
    values: { loss: eur(-summary.resultEur), income: eur(income.netEur), cost: eur(costEur) },
    tone: 'attention',
  };
}

// ---------------------------------------------------------------------------------------------------
// "In short" facts: one per slot, slots in order, at most two
// ---------------------------------------------------------------------------------------------------

/** Slot "units": what one form and 10 minutes of conversation leave us (plan pack, §4.1). */
function unitsFact(units) {
  if (!(units.netPerCreditEur > 0)) return null;
  const { form, live10 } = units.perCredit;
  return {
    key: 'overview.fact.units',
    values: { cents: ['eurUnit', form.leftEur], pct: ['pct', form.shareLeft], cents2: ['eurUnit', live10.leftEur], pct2: ['pct', live10.shareLeft] },
    tone: 'neutral',
    link: '/money',
  };
}

/**
 * Slot "cost driver": a form got ≥ 20 % dearer than in the comparison window (both windows ≥ 20 forms).
 * The cause comes from the shared core (formCostChange), so Costs names the same one.
 */
function formCostFact(ds, period, scope) {
  const change = formCostChange(ds, period, scope);
  const enough = change.formsCur >= OVERVIEW_RULES.minFormsToCompare && change.formsPrev >= OVERVIEW_RULES.minFormsToCompare;
  if (!enough || !(change.change >= OVERVIEW_RULES.formCostRise)) return null;

  const values = { prev: ['eurUnit', change.prev], cur: ['eurUnit', change.cur] };
  const base = { tone: 'attention', link: '/costs' };
  if (change.cause === 'era' && change.era) {
    const { main, endpoint, location } = change.era;
    const name = { key: 'overview.era', values: { model: ['model', main], where: ['endpoint', { endpoint, location }] } };
    return { key: 'overview.fact.formCostUp.era', values: { ...values, era: name }, ...base };
  }
  if (change.cause === 'size') return { key: 'overview.fact.formCostUp.size', values: { ...values, pages: ['pages', change.inTokCur] }, ...base };
  if (change.cause === 'longer') return { key: 'overview.fact.formCostUp.longer', values, ...base };
  return null;
}

/** Slot "concentration": one doctor behind at least half of the variable cost. */
function topDoctorFact(summary) {
  const top = topDoctorOf(summary.cost.byPid);
  const topShare = top ? share(top.costEur, summary.cost.variableEur) : null;
  if (!(topShare >= OVERVIEW_RULES.topDoctorShare)) return null;
  return { key: 'overview.fact.topDoctor', values: { share: ['pct', topShare], name: ['doctor', top.pid] }, tone: 'quiet', link: '/doctors' };
}

/** Slot "liability": gifted and free credits on balances, priced as forms. */
function freeCreditsFact(summary, units) {
  const free = summary.balances.free;
  if (!(free > OVERVIEW_RULES.freeCreditsMin)) return null;
  return {
    key: 'overview.fact.freeCredits',
    values: { credits: ['int', free], costForms: eur(free * units.perCredit.form.costEur) },
    tone: 'quiet',
    link: '/money',
  };
}

/**
 * "In short" (§4.1): first match per slot, slots in the order units → cost driver → concentration →
 * liability, at most two.
 */
export function factsOf(ds, period, scope, summary, units) {
  const slots = [
    () => unitsFact(units),
    () => formCostFact(ds, period, scope),
    () => topDoctorFact(summary),
    () => freeCreditsFact(summary, units),
  ];
  const facts = [];
  for (const slot of slots) {
    if (facts.length >= OVERVIEW_RULES.maxFacts) break;
    const fact = slot();
    if (fact) facts.push(fact);
  }
  return facts;
}

// ---------------------------------------------------------------------------------------------------
// Series (sparklines), cost split, notes
// ---------------------------------------------------------------------------------------------------

/**
 * Per bucket of the period: result (income − cost, null while the income is unknown), scoped forms and
 * forms over 15 s (all traffic). Summed over the buckets they give the summary's totals.
 */
export function overviewSeries(ds, period, scope, summary) {
  const { rows, indexOf } = makeSeries(period, ['resultEur', 'forms', 'slowCount']);
  const buckets = buildBuckets(period);
  const hide = hidesInternal(ds, scope);
  const planning = scope?.planning ?? ds.settings?.planning;
  const costs = rows.map(() => 0);

  (ds.rows ?? []).forEach((row) => {
    if (!REQUEST_KINDS.has(row.kind) || (hide && isInternal(row.pid, ds))) return;
    const i = indexOf(row.t);
    if (i < 0 || rows[i].isFuture) return;
    costs[i] += row.costEur;
    if (row.kind === 'form') rows[i].forms += 1;
  });
  (ds.forms ?? []).forEach((row) => {
    if (!(row.durMs > HEALTH.slowMs)) return;
    const i = indexOf(row.t);
    if (i >= 0 && !rows[i].isFuture) rows[i].slowCount += 1;
  });

  const incomeOk = summary.income.status === 'ok';
  rows.forEach((row, i) => {
    if (row.isFuture) return;
    row.resultEur = incomeOk
      ? incomeOf(ds, buckets[i], scope).netEur - costs[i] - bucketFixedEur(ds, buckets[i], period, planning)
      : null;
  });
  return rows;
}

/** The cost tile's split in its fixed order: forms · recording · medical history · server. */
export const costByFeature = (summary) => {
  const { byFeature } = summary.cost;
  const value = { form: byFeature.form, recording: byFeature.dictation + byFeature.live, anamnesis: byFeature.anamnesis, fixed: byFeature.fixed };
  return COST_PARTS.map((key) => ({ key, valueEur: value[key] }));
};

/** Notes that really applied: the Vertex-EU week inside the period; a history cut to 90 days. */
export function notesOf(ds, period) {
  const notes = [];
  const inVertexWeek = (row) => row.t >= VERTEX_EU_ERA.fromMs && row.t < VERTEX_EU_ERA.toMs && inPeriod(row.t, period);
  if (VERTEX_EU_ERA && (ds.forms ?? []).some(inVertexWeek)) notes.push({ key: 'overview.note.vertexEra' });
  if (ds.sources?.usage?.status === 'limited') notes.push({ key: 'overview.note.limited' });
  return notes;
}

// ---------------------------------------------------------------------------------------------------
// The page result
// ---------------------------------------------------------------------------------------------------

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Headline values are the core's own numbers (=== summary / health, §6.3). `answer`, `facts` values
 * may hold nested copy items `{ key, values }` and the page-level hints `['doctor', pid]` and
 * `['endpoint', { endpoint, location }]`; `{period}` is filled by the page.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] page-local, JSON-serialisable (none yet)
 * @returns {import('./shared.js').AreaResult}
 */
export function computeOverview(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const summary = summarize(ds, period, scope);
  const health = summarizeHealth(ds, period);
  const projection = projectScale(ds, period, scope);
  const units = unitEconomics(ds, period, scope);
  const { counts, cost, income } = summary;
  const requests = counts.forms + counts.dictations + counts.liveConversations + counts.anamnesisCalls;
  const payersBasis = income.status === 'ok' ? 'exact' : 'inferred';

  return {
    empty: requests === 0 && income.payments === 0,
    headline: {
      result: summary.resultEur,
      income: income.status === 'ok' ? income.netEur : null,
      cost: cost.totalEur,
      payingActive: summary.payingActiveDoctors,
      active: summary.activeDoctors,
      paidCostShare: share(cost.byClass.paid, cost.variableEur),
      forms: counts.forms,
      health: health.word,
      healthForms: health.forms,
      p50Ms: health.p50Ms,
      over15: health.over15,
      over15Share: health.over15Share,
      fallbackCount: health.fallbackCount,
      fallbackEligible: health.fallbackEligible,
      serviceFailures: health.serviceFailures,
    },
    basis: {
      result: summary.resultBasis,
      income: income.basis,
      cost: cost.basis,
      payingActive: payersBasis,
      active: 'exact',
      paidCostShare: payersBasis,
      forms: 'exact',
      health: combineBasis('exact', health.fallbackBasis),
      healthForms: 'exact',
      p50Ms: 'exact',
      over15: 'exact',
      over15Share: 'exact',
      fallbackCount: health.fallbackBasis,
      fallbackEligible: health.fallbackBasis,
      serviceFailures: health.serviceFailures === null ? 'missing' : 'exact',
    },
    answer: [verdictLine(summary, freeWhoOf(ds, scope)), planLine(projection)],
    facts: factsOf(ds, period, scope, summary, units),
    series: overviewSeries(ds, period, scope, summary),
    tables: { costByFeature: costByFeature(summary) },
    takeaways: {},
    projection,
    notes: notesOf(ds, period),
  };
}
