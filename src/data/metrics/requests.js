// Requests page metric (§4.4): what one request of each kind costs, how big the forms are and what
// makes them big, and the medical history summary runs. Business scope (follows the account switch).
// Shared numbers are picked from the F0 core (§2 rule 2): form count, cost per form, run count.
import { CHARS_PER_PAGE, CHARS_PER_TOKEN } from '../constants.js';
import { datasetRuns } from '../core/anamnesis.js';
import { combineBasis, costBasis } from '../core/basis.js';
import { unitCosts } from '../core/projection.js';
import { hidesInternal, isInternal, scopedRows } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { EMPTY_RESULT, inPeriod, median, rowsIn, share, sum } from './shared.js';

/** A form request above this many tokens counts as big (≈ 30 pages). */
export const BIG_REQUEST_TOKENS = 20000;
/** The base-token fit needs at least this many forms with a known length of the doctor's words. */
export const MIN_FORMS_FOR_FIT = 200;
/** Below this many conversations the price of a conversation is a forecast. */
export const MIN_CONVERSATIONS_MEASURED = 20;
/** A doctor group is shown on its own only with at least this many doctors (smaller ones fold into "Others"). */
export const PRIVACY_MIN_DOCTORS = 3;
/** The doctor's text is cut at this many characters. */
export const CAPPED_CHARS = 3000;
export const PRICIEST_ROWS = 20;
export const RUN_ROWS = 100;
/** Typical lengths priced in "What one request costs". */
export const CONVERSATION_MINUTES = 15;
export const DICTATION_MINUTES = 1;
/** First Vilnius day of the medical history summary (empty states name it). */
export const ANAMNESIS_SINCE = '2026-09-02';
/** Upper bounds of the size buckets in tokens; a bucket is (previous edge, edge], the last one is open. */
export const SIZE_EDGES = Object.freeze([8000, 10000, 12000, 15000, 20000, 30000]);
export const SEGMENTS = Object.freeze(['specialty', 'detail']);

const OTHER = 'other';

/** Printed pages of text for a token count (≈ 1,800 characters a page). */
export const pagesOf = (tokens) => (Number.isFinite(tokens) ? (tokens * CHARS_PER_TOKEN) / CHARS_PER_PAGE : null);

const mean = (values) => {
  const list = values.filter(Number.isFinite);
  return list.length ? sum(list) / list.length : null;
};

/** Length of everything the doctor said or typed: own text plus conversation text. */
const wordsOf = (row) => (Number.isFinite(row.chars) ? row.chars + (Number.isFinite(row.convChars) ? row.convChars : 0) : null);

/**
 * Intercept of the least-squares line `inTok ~ doctor's words` (§4.4 `baseTokens`): the text that goes to
 * the model in every form whatever the doctor says (our instructions + the patient's history).
 * @param {Array<{ inTok: number, chars: number|null, convChars: number|null }>} forms
 * @returns {{ baseTokens: number|null, used: number }} null under MIN_FORMS_FOR_FIT forms or without spread
 */
export function baseTokenFit(forms) {
  const points = (forms ?? []).map((row) => [wordsOf(row), row.inTok]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < MIN_FORMS_FOR_FIT) return { baseTokens: null, used: points.length };
  const mx = mean(points.map(([x]) => x));
  const my = mean(points.map(([, y]) => y));
  let sxx = 0;
  let sxy = 0;
  points.forEach(([x, y]) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  });
  if (!(sxx > 0)) return { baseTokens: null, used: points.length };
  // A falling line (longer words, smaller request) says the words do not matter: the fixed part is the mean.
  return { baseTokens: Math.min(my, Math.max(0, my - (sxy / sxx) * mx)), used: points.length };
}

const bucketLabel = (index) => {
  const from = index > 0 ? SIZE_EDGES[index - 1] : null;
  const to = index < SIZE_EDGES.length ? SIZE_EDGES[index] : null;
  const pages = (tokens) => Math.round(pagesOf(tokens));
  const position = from === null ? 'first' : to === null ? 'last' : 'middle';
  const values = {};
  if (from !== null) Object.assign(values, { from: from / 1000, fromPages: pages(from) });
  if (to !== null) Object.assign(values, { to: to / 1000, toPages: pages(to) });
  return {
    label: { key: `requests.size.pages.${position}`, values: { from: values.fromPages, to: values.toPages } },
    detail: { key: `requests.size.tokens.${position}`, values: { from: values.from, to: values.to } },
    fromTok: from,
    toTok: to,
  };
};

/**
 * Forms per size bucket with their share of forms and of the form cost.
 * @param {Array<{ inTok: number, costEur: number }>} forms
 */
export function sizeBuckets(forms) {
  const list = forms ?? [];
  const counts = SIZE_EDGES.map(() => 0).concat(0);
  const costs = counts.slice();
  list.forEach((row) => {
    const index = SIZE_EDGES.findIndex((edge) => row.inTok <= edge);
    const at = index === -1 ? SIZE_EDGES.length : index;
    counts[at] += 1;
    costs[at] += row.costEur;
  });
  const totalCost = sum(costs);
  return counts.map((n, index) => ({
    key: `size${index}`,
    ...bucketLabel(index),
    forms: n,
    formShare: share(n, list.length) ?? 0,
    costEur: costs[index],
    costShare: share(costs[index], totalCost) ?? 0,
  }));
}

/**
 * Mean € per form by doctor group. A group stands alone with ≥ PRIVACY_MIN_DOCTORS doctors; the rest fold
 * into "Others". Rows only when at least two groups stand alone (§4.4), else [].
 * @param {object[]} forms period forms of the scope
 * @param {{ doctors?: Map<string, object> }} ds
 * @param {'specialty'|'detail'} segment
 * @returns {{ rows: object[], groups: number }} groups = how many groups stand alone
 */
export function segmentRows(forms, ds, segment) {
  const groupOf = (pid) => {
    const doctor = ds?.doctors?.get?.(pid);
    const value = segment === 'detail' ? doctor?.detailLevel : doctor?.specialization;
    return typeof value === 'string' && value.trim() ? value.trim() : OTHER;
  };
  const byGroup = new Map();
  (forms ?? []).forEach((row) => {
    const group = groupOf(row.pid);
    const entry = byGroup.get(group) ?? { group, forms: 0, costEur: 0, inTok: 0, pids: new Set() };
    entry.forms += 1;
    entry.costEur += row.costEur;
    entry.inTok += row.inTok;
    entry.pids.add(row.pid);
    byGroup.set(group, entry);
  });
  const standing = [...byGroup.values()].filter((entry) => entry.group !== OTHER && entry.pids.size >= PRIVACY_MIN_DOCTORS);
  if (standing.length < 2) return { rows: [], groups: standing.length };

  const other = { group: OTHER, forms: 0, costEur: 0, inTok: 0, pids: new Set() };
  byGroup.forEach((entry) => {
    if (standing.includes(entry)) return;
    other.forms += entry.forms;
    other.costEur += entry.costEur;
    other.inTok += entry.inTok;
    entry.pids.forEach((pid) => other.pids.add(pid));
  });
  const toRow = (entry) => ({
    key: `${segment}:${entry.group}`,
    group: entry.group,
    isOther: entry.group === OTHER,
    forms: entry.forms,
    doctors: entry.pids.size,
    costEur: entry.costEur,
    meanEur: entry.costEur / entry.forms,
    meanTok: entry.inTok / entry.forms,
    meanPages: pagesOf(entry.inTok / entry.forms),
  });
  const rows = standing.map(toRow).sort((a, b) => b.meanEur - a.meanEur);
  if (other.forms > 0) rows.push(toRow(other));
  return { rows, groups: standing.length };
}

const stepOf = (row) => {
  const info = row.anamnesis ?? {};
  if (info.step === 'summary') return 'summary';
  if (info.step === 'narrative') return 'narrative';
  return info.tier === 'strong' ? 'extractStrong' : 'extractFast';
};

/** Cost of the medical history summary by step (calls and €), steps without calls left out. */
function stepRows(anamnesisRows) {
  const steps = ['extractFast', 'extractStrong', 'narrative', 'summary'].map((key) => ({ key, calls: 0, costEur: 0 }));
  const byKey = new Map(steps.map((step) => [step.key, step]));
  anamnesisRows.forEach((row) => {
    const step = byKey.get(stepOf(row));
    step.calls += 1;
    step.costEur += row.costEur;
  });
  return steps.filter((step) => step.calls > 0);
}

/** One table row per run, newest first, at most RUN_ROWS. */
function runRows(runs, rowsByKey, netPerCreditEur) {
  return [...runs]
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, RUN_ROWS)
    .map((run) => {
      const firstDur = rowsByKey.get(run.rowKeys[0])?.durMs;
      const durMs = run.endMs - run.startMs + (Number.isFinite(firstDur) ? firstDur : 0);
      return {
        key: run.rowKeys[0],
        startMs: run.startMs,
        pid: run.pid,
        version: run.version,
        calls: run.calls,
        docs: run.docs,
        facts: run.version === 'v2' ? run.facts : null,
        durMs: durMs > 0 ? durMs : null,
        costEur: run.costEur,
        credits: run.credits,
        left: run.credits > 0 && netPerCreditEur > 0 ? 1 - run.costEur / (run.credits * netPerCreditEur) : null,
        capped: run.capped,
      };
    });
}

/**
 * The price of one request of each kind (§4.4 "What one request costs"), sorted by price, most expensive first.
 * Measured from the period where it can be; otherwise the plan unit price (basis `model`).
 */
function byTypeRows({ summary, forms, dictations, lives, runsV1, runsV2, uc }) {
  const { counts, cost, minutes } = summary;
  const rows = [];

  rows.push({
    key: 'form',
    unitEur: counts.forms > 0 ? summary.unit.costPerFormEur : uc.formCostEur,
    basis: counts.forms > 0 ? costBasis(forms) : 'model',
    count: counts.forms,
    totalEur: cost.byFeature.form,
    measured: counts.forms > 0,
  });

  const dictationMeasured = counts.dictations > 0 && minutes.dictation > 0;
  rows.push({
    key: 'dictation',
    minutes: DICTATION_MINUTES,
    unitEur: (dictationMeasured ? cost.byFeature.dictation / minutes.dictation : uc.sonioxFilePerMinEur) * DICTATION_MINUTES,
    basis: dictationMeasured ? costBasis(dictations) : 'model',
    count: counts.dictations,
    totalMinutes: minutes.dictation,
    totalEur: cost.byFeature.dictation,
    measured: dictationMeasured,
  });

  const liveMeasured = counts.liveConversations >= MIN_CONVERSATIONS_MEASURED && minutes.live > 0;
  const livePerMin = liveMeasured ? cost.byFeature.live / minutes.live : uc.livePerMinEur;
  rows.push({
    key: 'live',
    minutes: CONVERSATION_MINUTES,
    unitEur: (livePerMin + uc.convPerMinEur) * CONVERSATION_MINUTES,
    basis: liveMeasured ? combineBasis(costBasis(lives), uc.convBasis === 'exact' ? 'exact' : 'model') : 'model',
    count: counts.liveConversations,
    totalEur: cost.byFeature.live,
    measured: liveMeasured,
  });

  rows.push({
    key: 'anamnesis',
    unitEur: median(runsV2.map((run) => run.costEur)),
    basis: runsV2.length > 0 ? 'exact' : 'missing',
    count: runsV2.length,
    totalEur: sum(runsV2.map((run) => run.costEur)),
    measured: runsV2.length > 0,
  });

  if (runsV1.length > 0) {
    rows.push({
      key: 'summaryV1',
      unitEur: median(runsV1.map((run) => run.costEur)),
      basis: 'exact',
      count: runsV1.length,
      totalEur: sum(runsV1.map((run) => run.costEur)),
      measured: true,
    });
  }

  const rank = (row) => (Number.isFinite(row.unitEur) ? row.unitEur : -Infinity);
  return rows.sort((a, b) => rank(b) - rank(a));
}

function answerOf({ summary, byType, promptMean, baseShare, wordsMean }) {
  if (summary.counts.forms === 0) return [];
  const find = (key) => byType.find((row) => row.key === key);
  const anam = find('anamnesis')?.unitEur ?? find('summaryV1')?.unitEur ?? null;
  const values = {
    anam: ['eurUnit', anam],
    live: ['eurUnit', find('live').unitEur],
    form: ['eurUnit', find('form').unitEur],
    // Share of what requests cost (the server share is not a request), so "far more forms" adds up.
    share: ['pct', share(summary.cost.byFeature.form, summary.cost.variableEur)],
  };
  const answer = [{ key: Number.isFinite(anam) ? 'requests.answer.byType' : 'requests.answer.byTypeNoAnam', values, tone: 'neutral' }];
  answer.push({ key: 'requests.answer.size', values: { pages: ['pages', promptMean], tokens: ['tokens', promptMean] }, tone: 'neutral' });
  if (Number.isFinite(baseShare) && Number.isFinite(wordsMean)) {
    answer.push({
      key: baseShare >= 0.8 ? 'requests.answer.base.most' : 'requests.answer.base.part',
      values: { share: ['pct', baseShare], chars: ['int', wordsMean] },
      tone: 'neutral',
    });
  }
  return answer;
}

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {{ segment?: 'specialty'|'detail' }} [opts] which doctor groups `tables.bySegment` compares
 * @returns {import('./shared.js').AreaResult}
 *   headline: promptMean, outputMean, baseTokens, baseShare, bigShare, bigCostShare (tokens, shares 0..1),
 *     anamRuns (=== summary.counts.anamnesisRuns), anamCostPerRun (€, median of the new-way runs, else of all),
 *     anamCreditsPerRun, anamNetPerRun (€ the credits bring, plan packs), anamLeft (share kept).
 *   tables: byType, sizeBuckets, bySegment (+ segmentGroups), priciest, anamSteps, anamRuns.
 */
export function computeRequests(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const segment = SEGMENTS.includes(opts.segment) ? opts.segment : 'specialty';
  const summary = summarize(ds, period, scope);
  const { counts } = summary;
  if (counts.forms + counts.dictations + counts.liveConversations + counts.anamnesisCalls === 0) return EMPTY_RESULT;

  const planning = scope?.planning ?? ds.settings?.planning;
  const uc = unitCosts(ds, planning);
  const netPerCreditEur = unitEconomics(ds, period, scope).netPerCreditEur;
  const inScope = (rows) => rowsIn(scopedRows(rows, ds, scope), period);
  const forms = inScope(ds.forms);
  const anamnesisRows = inScope(ds.anamnesis);

  const hide = hidesInternal(ds, scope);
  const runs = datasetRuns(ds).filter((run) => !(hide && isInternal(run.pid, ds)) && inPeriod(run.startMs, period));
  const runsV1 = runs.filter((run) => run.version === 'v1');
  const runsV2 = runs.filter((run) => run.version === 'v2');
  const unitRuns = runsV2.length > 0 ? runsV2 : runs;

  const promptMean = mean(forms.map((row) => row.inTok));
  const outputMean = mean(forms.map((row) => row.outTok));
  const wordsMean = mean(forms.map(wordsOf));
  const fit = baseTokenFit(forms);
  const baseShare = Number.isFinite(fit.baseTokens) && promptMean > 0 ? Math.min(1, fit.baseTokens / promptMean) : null;
  const big = forms.filter((row) => row.inTok > BIG_REQUEST_TOKENS);
  const formCostBasis = costBasis(forms);

  const anamCostPerRun = median(unitRuns.map((run) => run.costEur));
  const anamCreditsPerRun = median(unitRuns.map((run) => run.credits));
  const anamNetPerRun = Number.isFinite(anamCreditsPerRun) && anamCreditsPerRun > 0 ? anamCreditsPerRun * netPerCreditEur : null;
  const anamLeft = Number.isFinite(anamCostPerRun) && anamNetPerRun > 0 ? 1 - anamCostPerRun / anamNetPerRun : null;

  const byType = byTypeRows({ summary, forms, dictations: inScope(ds.dictations), lives: inScope(ds.lives), runsV1, runsV2, uc });
  const bySegment = segmentRows(forms, ds, segment);
  const otherSegment = segmentRows(forms, ds, segment === 'specialty' ? 'detail' : 'specialty');
  const rowsByKey = new Map(anamnesisRows.map((row) => [row.key, row]));
  const hasFit = Number.isFinite(fit.baseTokens);

  const notes = [];
  const testDay = forms.filter((row) => row.role === 'switch').length;
  if (testDay > 0) notes.push({ key: 'requests.note.testDay', values: { n: testDay } });
  const capped = forms.filter((row) => Number.isFinite(row.chars) && row.chars >= CAPPED_CHARS).length;
  if (capped > 0) notes.push({ key: 'requests.note.capped', values: { n: capped } });

  return {
    empty: false,
    headline: {
      promptMean,
      outputMean,
      baseTokens: fit.baseTokens,
      baseShare,
      bigShare: forms.length ? big.length / forms.length : null,
      bigCostShare: share(sum(big.map((row) => row.costEur)), sum(forms.map((row) => row.costEur))),
      anamRuns: counts.anamnesisRuns,
      anamCostPerRun,
      anamCreditsPerRun,
      anamNetPerRun,
      anamLeft,
    },
    basis: {
      promptMean: 'exact',
      outputMean: 'exact',
      baseTokens: hasFit ? 'estimate' : 'missing',
      baseShare: hasFit ? 'estimate' : 'missing',
      bigShare: 'exact',
      bigCostShare: formCostBasis,
      anamRuns: 'estimate',
      anamCostPerRun: Number.isFinite(anamCostPerRun) ? 'exact' : 'missing',
      anamCreditsPerRun: Number.isFinite(anamCreditsPerRun) ? 'exact' : 'missing',
      anamNetPerRun: Number.isFinite(anamNetPerRun) ? 'model' : 'missing',
      anamLeft: Number.isFinite(anamLeft) ? 'model' : 'missing',
    },
    answer: answerOf({ summary, byType, promptMean, baseShare, wordsMean }),
    series: [],
    tables: {
      byType,
      sizeBuckets: forms.length ? sizeBuckets(forms) : [],
      bySegment: bySegment.rows,
      segmentGroups: [
        { key: segment, groups: bySegment.groups, shown: bySegment.rows.length > 0 },
        { key: segment === 'specialty' ? 'detail' : 'specialty', groups: otherSegment.groups, shown: otherSegment.rows.length > 0 },
      ],
      priciest: [...forms]
        .sort((a, b) => b.costEur - a.costEur)
        .slice(0, PRICIEST_ROWS)
        .map((row) => ({
          key: row.key,
          t: row.t,
          pid: row.pid,
          model: row.model,
          inTok: row.inTok,
          pages: pagesOf(row.inTok),
          outTok: row.outTok,
          chars: row.chars,
          durMs: row.durMs,
          costEur: row.costEur,
        })),
      anamSteps: stepRows(anamnesisRows),
      anamRuns: runRows(runs, rowsByKey, netPerCreditEur),
      fit: [{ key: 'fit', used: fit.used, needed: MIN_FORMS_FOR_FIT, wordsMean }],
    },
    notes,
  };
}
