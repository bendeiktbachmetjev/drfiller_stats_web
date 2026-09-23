import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../../buildDataset.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { unitCosts } from '../../core/projection.js';
import { costBasis } from '../../core/basis.js';
import { missingBasis, rowsIn } from '../shared.js';
import {
  BIG_REQUEST_TOKENS, CONVERSATION_MINUTES, MIN_FORMS_FOR_FIT, baseTokenFit, computeRequests, segmentRows, sizeBuckets,
} from '../requests.js';
import { fmt } from '../../../format/format.js';
import { PID, anamnesisRow, benchmark, doctor, formRow, liveRow, localMs, rawBundle, staticPrices } from '../../__tests__/fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from '../../__tests__/scenario.mjs';

// §7 P4: byType rows and their basis; the base-token fit needs ≥ 200 forms; size-bucket labels carry
// pages; bySegment is not rendered with < 2 groups of ≥ 3 doctors; anamnesis run grouping.

const last30 = resolvePeriod('last30', SCENARIO_NOW);
const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });
const rowOf = (result, key) => result.tables.byType.find((row) => row.key === key);
const datasetOf = (rows, doctors = []) => buildDataset(rawBundle({ rows, doctors }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });

test('contract: a basis for every headline key; shared headlines are the core values; empty data does not throw', () => {
  const { ds } = makeScenario();
  const scope = scopeOf(ds);
  const result = computeRequests(ds, last30, scope);
  const summary = summarize(ds, last30, scope);
  assert.equal(result.empty, false);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
  assert.equal(result.headline.anamRuns, summary.counts.anamnesisRuns);
  assert.equal(rowOf(result, 'form').unitEur, summary.unit.costPerFormEur);
  assert.equal(rowOf(result, 'form').count, summary.counts.forms);

  const empty = datasetOf([]);
  assert.equal(computeRequests(empty, last30, scopeOf(empty)).empty, true);
  assert.equal(computeRequests(null, last30, null).empty, true);
  const quiet = resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-03-10', to: '2026-03-12' } });
  assert.equal(computeRequests(ds, quiet, scope).empty, true);
});

test('byType: measured rows from the period, forecasts marked model, sorted by price', () => {
  const { ds } = makeScenario();
  const scope = scopeOf(ds);
  const summary = summarize(ds, last30, scope);
  const uc = unitCosts(ds, ds.settings.planning);
  const result = computeRequests(ds, last30, scope);
  const forms = rowsIn(ds.forms, last30).filter((row) => row.pid !== PID.internal);

  // Form: the core's cost per form; the unknown model (priced as an estimate) makes ≥ 5 % of it.
  assert.equal(rowOf(result, 'form').basis, costBasis(forms));
  assert.equal(rowOf(result, 'form').basis, 'estimate');
  // Dictation: the period's € per minute (one Soniox dictation of 2 min).
  const dictation = rowOf(result, 'dictation');
  assert.equal(dictation.measured, true);
  assert.ok(Math.abs(dictation.unitEur - summary.cost.byFeature.dictation / summary.minutes.dictation) < 1e-12);
  // Conversation: 1 conversation < 20 → 15 min of Soniox live + conversation text, a forecast.
  const live = rowOf(result, 'live');
  assert.equal(live.basis, 'model');
  assert.ok(Math.abs(live.unitEur - (uc.livePerMinEur + uc.convPerMinEur) * CONVERSATION_MINUTES) < 1e-12);
  // Medical history summary: one new-way run (two calls 3 min apart) → its cost; no old PDF row.
  const anam = rowOf(result, 'anamnesis');
  assert.equal(anam.count, 1);
  assert.equal(anam.basis, 'exact');
  assert.equal(rowOf(result, 'summaryV1'), undefined);
  const prices = result.tables.byType.map((row) => row.unitEur);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a), 'most expensive first');
  assert.equal(result.answer[0].key, 'requests.answer.byType');
});

test('byType: 20 conversations are measured; an old PDF summary gets its own row; no runs → "—"', () => {
  const lives = Array.from({ length: 20 }, (_, i) => liveRow(localMs('2026-09-23 06:00') + i * 60000, { audioSec: 600 }));
  const { ds } = makeScenario({ mutate: (raw) => raw.usage.rows.push(...lives, anamnesisRow('2026-09-03 10:00', { action: 'anamnesis_summary', credits: undefined, costUsd: 0.02 })) });
  const scope = scopeOf(ds);
  const summary = summarize(ds, last30, scope);
  const uc = unitCosts(ds, ds.settings.planning);
  const result = computeRequests(ds, last30, scope);
  const live = rowOf(result, 'live');
  assert.equal(live.measured, true);
  const perMin = summary.cost.byFeature.live / summary.minutes.live;
  assert.ok(Math.abs(live.unitEur - (perMin + uc.convPerMinEur) * CONVERSATION_MINUTES) < 1e-12);
  const v1 = rowOf(result, 'summaryV1');
  assert.equal(v1.count, 1);
  assert.equal(rowOf(result, 'anamnesis').count, 1, 'the new-way row counts only new-way runs');
  assert.equal(result.headline.anamRuns, 2);

  const noRuns = computeRequests(ds, resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-09-20', to: '2026-09-23' } }), scope);
  assert.equal(rowOf(noRuns, 'anamnesis').unitEur, null);
  assert.equal(noRuns.tables.byType.at(-1).key, 'anamnesis', 'an unknown price sinks to the bottom');
  assert.equal(noRuns.answer[0].key, 'requests.answer.byTypeNoAnam');
  assert.equal(noRuns.headline.anamCostPerRun, null);
  assert.equal(noRuns.basis.anamCostPerRun, 'missing');
});

test('base-token fit needs at least 200 forms and finds where the line starts', () => {
  const forms = (n) => Array.from({ length: n }, (_, i) => ({ inTok: 10000 + 0.4 * (i * 7 % 900), chars: i * 7 % 900, convChars: null }));
  assert.equal(baseTokenFit(forms(MIN_FORMS_FOR_FIT - 1)).baseTokens, null);
  const fit = baseTokenFit(forms(MIN_FORMS_FOR_FIT));
  assert.ok(Math.abs(fit.baseTokens - 10000) < 1e-6, `intercept ${fit.baseTokens}`);
  // Conversation text counts as the doctor's words.
  const withTalk = forms(MIN_FORMS_FOR_FIT).map((row, i) => (i % 2 ? { ...row, convChars: 5000, inTok: row.inTok + 0.4 * 5000 } : row));
  assert.ok(Math.abs(baseTokenFit(withTalk).baseTokens - 10000) < 1e-6);
  assert.equal(baseTokenFit(forms(MIN_FORMS_FOR_FIT).map((row) => ({ ...row, chars: 50 }))).baseTokens, null, 'no spread → no line');
  const falling = forms(MIN_FORMS_FOR_FIT).map((row) => ({ ...row, inTok: 10000 - 0.4 * row.chars }));
  const meanTok = falling.reduce((acc, row) => acc + row.inTok, 0) / falling.length;
  assert.ok(Math.abs(baseTokenFit(falling).baseTokens - meanTok) < 1e-6, 'a falling line never puts the fixed part above the mean');

  const { ds } = makeScenario();
  const result = computeRequests(ds, last30, scopeOf(ds));
  assert.equal(result.headline.baseTokens, null, 'the scenario has fewer than 200 forms');
  assert.equal(result.basis.baseTokens, 'missing');
});

test('size buckets: labels carry pages, the buckets add up, "big" is the part over 20k tokens', () => {
  const sizes = [5000, 8000, 8001, 10000, 11000, 12000, 14000, 15000, 18000, 20000, 20001, 25000, 30000, 31000];
  const forms = sizes.map((inTok) => ({ inTok, costEur: inTok / 1e6 }));
  const buckets = sizeBuckets(forms);
  const labels = buckets.map((bucket) => fmt.textOf(bucket.label));
  labels.forEach((label) => assert.match(label, /\bpages\b/));
  assert.deepEqual(labels, ['Up to 12 pages', '12–15 pages', '15–18 pages', '18–23 pages', '23–30 pages', '30–45 pages', 'Over 45 pages']);
  assert.deepEqual(buckets.map((bucket) => fmt.textOf(bucket.detail)), [
    'up to 8k tokens', '8–10k tokens', '10–12k tokens', '12–15k tokens', '15–20k tokens', '20–30k tokens', 'over 30k tokens',
  ]);
  assert.deepEqual(buckets.map((bucket) => bucket.forms), [2, 2, 2, 2, 2, 3, 1]);
  assert.ok(Math.abs(buckets.reduce((acc, b) => acc + b.costShare, 0) - 1) < 1e-12);
  const bigForms = sizes.filter((n) => n > BIG_REQUEST_TOKENS).length;
  assert.equal(buckets[5].forms + buckets[6].forms, bigForms);
});

test('bySegment: shown only when two groups have 3 doctors or more; small groups fold into "Others"', () => {
  const doctors = new Map();
  const forms = [];
  const add = (pid, specialization, detailLevel, n = 2) => {
    doctors.set(pid, { pid, specialization, detailLevel });
    for (let i = 0; i < n; i += 1) forms.push({ pid, inTok: 12000, costEur: specialization === 'Kardiologija' ? 0.01 : 0.008 });
  };
  ['dkarda', 'dkardb', 'dkardc'].forEach((pid) => add(pid, 'Kardiologija', 'detailed'));
  ['dneura', 'dneurb'].forEach((pid) => add(pid, 'Neurologija', 'concise'));
  const ds = { doctors };
  assert.deepEqual(segmentRows(forms, ds, 'specialty').rows, [], 'one group of 3 + one of 2 → not rendered');
  assert.equal(segmentRows(forms, ds, 'specialty').groups, 1);

  add('dneurc', 'Neurologija', 'concise');
  add('dpeda', 'Pediatrija', null, 4);
  add('dnone', null, 'detailed');
  const { rows, groups } = segmentRows(forms, ds, 'specialty');
  assert.equal(groups, 2);
  assert.deepEqual(rows.map((row) => row.group), ['Kardiologija', 'Neurologija', 'other']);
  assert.deepEqual(rows.map((row) => row.doctors), [3, 3, 2]);
  assert.ok(Math.abs(rows[0].meanEur - 0.01) < 1e-12);
  assert.equal(rows.at(-1).isOther, true);
  assert.deepEqual(segmentRows(forms, ds, 'detail').rows.map((row) => row.group), ['detailed', 'concise', 'other']);
});

test('anamnesis runs: calls of one doctor with breaks under 10 min are one run; every old PDF call is a run', () => {
  const other = 'dotheraaaa';
  const rows = [
    formRow('2026-09-15 08:00'),
    anamnesisRow('2026-09-15 10:00', { costUsd: 0.01, credits: 2 }),
    anamnesisRow('2026-09-15 10:05', { tier: 'strong', costUsd: 0.02, credits: 3 }),
    anamnesisRow('2026-09-15 10:04', { pid: other, costUsd: 0.01, credits: 1 }),
    anamnesisRow('2026-09-15 10:14', { action: 'anamnesis_narrative', tier: null, costUsd: 0.03, credits: 4 }),
    anamnesisRow('2026-09-15 10:24', { costUsd: 0.01, credits: 1 }), // exactly 10 min later → a new run
    anamnesisRow('2026-09-03 09:00', { action: 'anamnesis_summary', costUsd: 0.02, credits: undefined }),
    anamnesisRow('2026-09-03 09:02', { action: 'anamnesis_summary', costUsd: 0.02, credits: undefined }),
  ];
  const ds = datasetOf(rows, [doctor(PID.top), doctor(other)]);
  const scope = scopeOf(ds);
  const result = computeRequests(ds, last30, scope);
  assert.equal(result.headline.anamRuns, 5);
  assert.equal(result.headline.anamRuns, summarize(ds, last30, scope).counts.anamnesisRuns);
  const runs = result.tables.anamRuns;
  assert.equal(runs.length, 5);
  const first = runs.find((run) => run.pid === PID.top && run.calls === 3);
  assert.ok(first, 'the 10:00, 10:05 and 10:14 calls are one run');
  assert.equal(first.credits, 9);
  assert.equal(runs.filter((run) => run.version === 'v1').length, 2);
  // Tiles use the new-way runs (3): medians of cost and credits.
  assert.equal(result.headline.anamCreditsPerRun, 1);
  assert.deepEqual(result.tables.anamSteps.map((step) => [step.key, step.calls]), [['extractFast', 3], ['extractStrong', 1], ['narrative', 1], ['summary', 2]]);
});

test('scope and privacy: internal accounts drop out; no email, uid or @ in the result', () => {
  const { ds } = makeScenario();
  const hidden = computeRequests(ds, last30, scopeOf(ds, true));
  const all = computeRequests(ds, last30, scopeOf(ds, false));
  assert.ok(hidden.tables.priciest.every((row) => row.pid !== PID.internal));
  assert.ok(all.tables.priciest.some((row) => row.pid === PID.internal));
  const json = JSON.stringify(all);
  assert.ok(!json.includes('@'));
  assert.ok(!/\b[A-Za-z0-9]{28}\b/.test(json));
});
