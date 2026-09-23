import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../../buildDataset.js';
import { loadAll } from '../../load.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { healthWord, summarizeHealth } from '../../core/health.js';
import { projectScale } from '../../core/projection.js';
import { unitEconomics } from '../../core/unitEconomics.js';
import { computeAlerts } from '../../core/alerts.js';
import { summarizeToday } from '../../core/today.js';
import { normalizeUsageRows } from '../../normalize/usage.js';
import { makeDemoApi } from '../../../dev/demoData.js';
import { EMPTY_RESULT, missingBasis } from '../shared.js';
import { COST_PARTS, OVERVIEW_RULES, computeOverview } from '../overview.js';
import { computeCosts } from '../costs.js';
import { formCostChange } from '../../core/formCostChange.js';
import {
  PID, anamnesisRow, benchmark, doctor, formRow, localMs, payment, rawBundle, revenue, settings, staticPrices,
} from '../../__tests__/fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from '../../__tests__/scenario.mjs';

// §7 P1: verdict rule order, plan line, facts ≤ 2, alerts ≤ 3 / none on a quiet day, hero null without
// Stripe, the health word, shared headlines === the core, sums of the series and the cost split.

const NOW = localMs('2026-09-23 14:30');
const close = (a, b, message = '') => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${message} ${a} ≈ ${b}`.trim());

/** A dataset from row builders; every source ok unless `rev` says otherwise. */
const dataset = ({ rows = [], doctors = [], rev = revenue([]), set = settings(), nowMs = NOW } = {}) =>
  buildDataset(rawBundle({ rows, doctors, revenue: rev, settings: set }), { nowMs, staticPrices, benchmark });

const run = (ds, { preset = 'last30', excludeInternal = true, nowMs = ds.nowMs, custom } = {}) => {
  const period = resolvePeriod(preset, nowMs, custom ? { custom } : {});
  const scope = makeScope({ excludeInternal, settings: ds.settings });
  return { period, scope, result: computeOverview(ds, period, scope) };
};

const forms = (n, when, overrides = {}) => Array.from({ length: n }, (_, i) => formRow(when + i * 60000, overrides));

const DOCTORS = [
  doctor(PID.payer, { class: 'bought_inferred' }),
  doctor(PID.gifted, { class: 'gifted' }),
  doctor(PID.free, { class: 'free' }),
];

const demoDataset = async (scenario, nowMs = NOW) =>
  buildDataset(await loadAll({ demo: makeDemoApi(nowMs, { scenario }), nowMs }), { nowMs, staticPrices, benchmark });

test('no dataset → EMPTY_RESULT; a period without requests → empty, no throw, a basis for every headline key', () => {
  const period = resolvePeriod('last30', NOW);
  assert.equal(computeOverview(null, period, makeScope()), EMPTY_RESULT);

  const nothing = run(dataset()).result;
  assert.equal(nothing.empty, true);
  assert.deepEqual(missingBasis(nothing.headline, nothing.basis), []);

  const { ds } = makeScenario();
  const quiet = run(ds, { preset: 'custom', custom: { from: '2026-03-10', to: '2026-03-12' }, nowMs: SCENARIO_NOW }).result;
  assert.equal(quiet.empty, true);
  const busy = run(ds, { nowMs: SCENARIO_NOW }).result;
  assert.equal(busy.empty, false);
  assert.deepEqual(missingBasis(busy.headline, busy.basis), []);
});

test('shared headlines are the core numbers (===), with the switch on and off', () => {
  const { ds } = makeScenario();
  [true, false].forEach((excludeInternal) => {
    const { period, scope, result } = run(ds, { excludeInternal, nowMs: SCENARIO_NOW });
    const summary = summarize(ds, period, scope);
    const health = summarizeHealth(ds, period);
    const h = result.headline;
    assert.equal(h.result, summary.resultEur);
    assert.equal(h.cost, summary.cost.totalEur);
    assert.equal(h.forms, summary.counts.forms);
    assert.equal(h.active, summary.activeDoctors);
    assert.equal(h.payingActive, summary.payingActiveDoctors);
    assert.equal(h.over15Share, health.over15Share);
    assert.equal(h.p50Ms, health.p50Ms);
    assert.equal(h.fallbackCount, health.fallbackCount);
    assert.equal(h.health, health.word);
    assert.equal(result.projection, projectScale(ds, period, scope));
    assert.equal(result.projection.columns.doctor.costTotalEur, projectScale(ds, period, scope).columns.doctor.costTotalEur);
    const units = unitEconomics(ds, period, scope).perCredit;
    const fact = result.facts.find((item) => item.key === 'overview.fact.units');
    assert.equal(fact.values.cents[1], units.form.leftEur);
    assert.equal(fact.values.pct[1], units.form.shareLeft);
    assert.equal(fact.values.cents2[1], units.live10.leftEur);
    assert.equal(fact.values.pct2[1], units.live10.shareLeft);
  });
});

test('scope: hiding my and test accounts changes business numbers only, never the health tile', () => {
  const { ds } = makeScenario();
  const hidden = run(ds, { excludeInternal: true, nowMs: SCENARIO_NOW }).result.headline;
  const all = run(ds, { excludeInternal: false, nowMs: SCENARIO_NOW }).result.headline;
  assert.equal(all.forms - hidden.forms, 2, 'the internal account made two forms');
  ['health', 'healthForms', 'p50Ms', 'over15', 'over15Share', 'fallbackCount', 'serviceFailures'].forEach((key) => assert.equal(hidden[key], all[key], key));
});

test('verdict: revenue off → the hero is null and the answer says income is not visible', () => {
  const ds = dataset({ rows: forms(3, localMs('2026-09-20 09:00'), { pid: PID.gifted }), doctors: DOCTORS, rev: revenue([], { status: 'off', livemode: null, reason: 'no_stripe_key' }) });
  const { result } = run(ds);
  assert.equal(result.headline.result, null);
  assert.equal(result.headline.income, null);
  assert.equal(result.basis.result, 'missing');
  assert.equal(result.basis.payingActive, 'inferred');
  assert.equal(result.answer[0].key, 'overview.verdict.revenueOff');
  assert.ok(result.series.every((row) => row.resultEur === null), 'no result sparkline without income');
});

test('verdict rule order: plus → no income, all free → no income → minus', () => {
  const paidEarlier = payment('2026-07-01 10:00', { pid: PID.payer });
  const plus = run(dataset({ rows: forms(5, localMs('2026-09-20 09:00'), { pid: PID.payer }), doctors: DOCTORS, rev: revenue([payment('2026-09-10 10:00', { pid: PID.payer })]) })).result;
  assert.equal(plus.answer[0].key, 'overview.verdict.plus');
  assert.equal(plus.answer[0].tone, 'good');
  assert.ok(plus.headline.result >= 0);

  const allFree = run(dataset({ rows: forms(5, localMs('2026-09-20 09:00'), { pid: PID.gifted }), doctors: DOCTORS, rev: revenue([paidEarlier]) })).result;
  assert.equal(allFree.answer[0].key, 'overview.verdict.noIncomeAll');
  assert.deepEqual(allFree.answer[0].values.freeWho, { key: 'overview.freeWho.gifted' });

  const rows = [...forms(5, localMs('2026-09-20 09:00'), { pid: PID.gifted }), ...forms(5, localMs('2026-09-21 09:00'), { pid: PID.payer })];
  const some = run(dataset({ rows, doctors: DOCTORS, rev: revenue([paidEarlier]) })).result;
  assert.equal(some.answer[0].key, 'overview.verdict.noIncome');
  const [hint, freeShare] = some.answer[0].values.freeShare;
  assert.equal(hint, 'pct');
  assert.ok(freeShare > 0.4 && freeShare < OVERVIEW_RULES.allFreeShare, `free share ${freeShare}`);

  const small = payment('2026-09-10 10:00', { pid: PID.payer, grossCents: 100, subtotalCents: 100, feeCents: 27, netCents: 73 });
  const minus = run(dataset({ rows: forms(5, localMs('2026-09-20 09:00'), { pid: PID.payer }), doctors: DOCTORS, rev: revenue([small]) })).result;
  assert.equal(minus.answer[0].key, 'overview.verdict.minus');
  close(minus.answer[0].values.loss[1], -minus.headline.result, 'loss');
});

test('verdict: "who worked for free" names my and test accounts only while they are counted', () => {
  const doctors = [...DOCTORS, doctor(PID.internal, { internal: true, internalSource: 'env' })];
  const rows = [...forms(5, localMs('2026-09-20 09:00'), { pid: PID.internal }), ...forms(5, localMs('2026-09-21 09:00'), { pid: PID.gifted })];
  const ds = dataset({ rows, doctors });
  assert.deepEqual(run(ds, { excludeInternal: false }).result.answer[0].values.freeWho, { key: 'overview.freeWho.internal' });
  assert.deepEqual(run(ds, { excludeInternal: true }).result.answer[0].values.freeWho, { key: 'overview.freeWho.gifted' });
});

test('the plan line is always second and names both scales', () => {
  const set = settings({ planning: { ...settings().planning, doctorScales: [50, 200] } });
  const ds = dataset({ rows: forms(5, localMs('2026-09-20 09:00'), { pid: PID.gifted }), doctors: DOCTORS, set });
  const { period, scope, result } = run(ds);
  assert.equal(result.answer.length, 2);
  const [, plan] = result.answer;
  const projection = projectScale(ds, period, scope);
  assert.equal(plan.key, 'overview.verdict.plan');
  assert.equal(plan.values.s0, 50);
  assert.equal(plan.values.s1, 200);
  assert.deepEqual(plan.values.r0, ['eurSigned', projection.columns.s0.resultEur]);
  assert.deepEqual(plan.values.r1, ['eurSigned', projection.columns.s1.resultEur]);
  assert.equal(typeof plan.values.scenario.key, 'string', 'the scenario is a copy item');
});

test('health word: ok under 2 % slow forms, slow in between, bad from 5 % (all traffic)', () => {
  const day = localMs('2026-09-21 08:00');
  const wordFor = (slow) => {
    const rows = [...forms(100 - slow, day), ...forms(slow, day + 200 * 60000, { durMs: 16000 })];
    const { period, result } = run(dataset({ rows, doctors: [doctor(PID.top, { class: 'gifted' })] }));
    assert.equal(result.headline.health, healthWord(summarizeHealth(dataset({ rows }), period)));
    return result.headline.health;
  };
  assert.equal(wordFor(1), 'ok');
  assert.equal(wordFor(3), 'slow');
  assert.equal(wordFor(6), 'bad');
});

test('health word: slow forms of a test era stay in the numbers but do not make the word "bad" (real-data M1)', () => {
  // 10 slow forms in the Vertex-EU week (non-standard) + 90 fast standard forms, all in the last 30 days.
  const rows = [...forms(10, localMs('2026-08-28 09:00'), { durMs: 20000 }), ...forms(90, localMs('2026-09-10 09:00'))];
  const { result } = run(dataset({ rows, doctors: [doctor(PID.top, { class: 'gifted' })] }));
  assert.equal(result.headline.over15, 10, 'the sub-line still counts every slow form');
  assert.equal(result.headline.health, 'ok');
});

test('health word: failures make it "bad" only from 3 and 0.5% of requests', () => {
  assert.equal(healthWord({ over15Share: 0, fallbackShare: 0, serviceFailures: 3, serviceFailureRate: 0.001 }), 'slow');
  assert.equal(healthWord({ over15Share: 0, fallbackShare: 0, serviceFailures: 3, serviceFailureRate: 0.01 }), 'bad');
  assert.equal(healthWord({ over15Share: 0, fallbackShare: 0, serviceFailures: 2, serviceFailureRate: 0.5 }), 'slow');
  assert.equal(healthWord({ over15Share: 0, fallbackShare: 0, serviceFailures: 0, serviceFailureRate: 0 }), 'ok');
});

test('facts: at most two, slots in order (units → cost driver → concentration → liability)', async () => {
  const order = ['overview.fact.units', 'overview.fact.formCostUp', 'overview.fact.topDoctor', 'overview.fact.freeCredits'];
  const slotOf = (key) => order.findIndex((prefix) => key.startsWith(prefix));
  const check = (facts) => {
    assert.ok(facts.length <= OVERVIEW_RULES.maxFacts, `${facts.length} facts`);
    facts.forEach((fact, i) => i > 0 && assert.ok(slotOf(fact.key) > slotOf(facts[i - 1].key), 'slot order'));
  };
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    ['last7', 'last30', 'month', 'allTime'].forEach((preset) => check(run(ds, { preset }).result.facts));
  }
  // Concentration and liability both fire here; only the first two slots that fire are shown.
  const top = doctor(PID.gifted, { class: 'gifted', credits: { available: 5000, used: 10, total: 15, consistent: false } });
  const facts = run(dataset({ rows: forms(30, localMs('2026-09-20 09:00'), { pid: PID.gifted }), doctors: [top] })).result.facts;
  assert.deepEqual(facts.map((fact) => fact.key), ['overview.fact.units', 'overview.fact.topDoctor']);
  assert.deepEqual(facts[1].values.name, ['doctor', PID.gifted]);
});

test('cost driver: request size, another model, longer answers', () => {
  const doctors = [doctor(PID.top, { class: 'gifted' })];
  const factOf = (rows, nowMs = NOW) =>
    run(dataset({ rows, doctors, nowMs }), { preset: 'last7' }).result.facts.find((f) => f.key.startsWith('overview.fact.formCostUp'));
  // 17–23 Sep against 10–16 Sep: the same model setup in both weeks.
  const before = forms(25, localMs('2026-09-11 08:00'));
  const size = factOf([...before, ...forms(25, localMs('2026-09-21 08:00'), { inTok: 22882 })]);
  assert.equal(size.key, 'overview.fact.formCostUp.size');
  assert.equal(size.values.pages[0], 'pages');
  assert.ok(size.values.cur[1] >= size.values.prev[1] * (1 + OVERVIEW_RULES.formCostRise));
  assert.equal(factOf([...before, ...forms(25, localMs('2026-09-21 08:00'), { outTok: 1972 })]).key, 'overview.fact.formCostUp.longer');
  assert.equal(factOf([...before, ...forms(25, localMs('2026-09-21 08:00'))]), undefined, 'same price → no sentence');
  assert.equal(factOf([...forms(5, localMs('2026-09-11 08:00')), ...forms(25, localMs('2026-09-21 08:00'), { inTok: 22882 })]), undefined, 'too few forms to compare');
  // 28 Aug – 3 Sep (Gemini 3.7 Flash, Google Cloud EU) against 21–27 Aug (Gemini 3 Flash direct).
  const era = factOf([...forms(25, localMs('2026-08-22 08:00')), ...forms(25, localMs('2026-08-29 08:00'), { model: 'gemini-3.7-flash' })], localMs('2026-09-03 12:00'));
  assert.equal(era.key, 'overview.fact.formCostUp.era');
  assert.deepEqual(era.values.era.values.model, ['model', 'gemini-3.7-flash']);
  assert.deepEqual(era.values.era.values.where, ['endpoint', { endpoint: 'vertex', location: 'eu' }]);
});

test('Overview and Costs name the same cause of a dearer form (one shared core, code-review M2)', () => {
  const doctors = [doctor(PID.top, { class: 'gifted' })];
  const cases = [
    { rows: [...forms(25, localMs('2026-09-11 08:00')), ...forms(25, localMs('2026-09-21 08:00'), { inTok: 22882 })], cause: 'size' },
    { rows: [...forms(25, localMs('2026-09-11 08:00')), ...forms(25, localMs('2026-09-21 08:00'), { outTok: 1972 })], cause: 'longer' },
    { rows: [...forms(25, localMs('2026-08-22 08:00')), ...forms(25, localMs('2026-08-29 08:00'), { model: 'gemini-3.7-flash' })], cause: 'era', nowMs: localMs('2026-09-03 12:00') },
  ];
  cases.forEach(({ rows, cause, nowMs = NOW }) => {
    const ds = dataset({ rows, doctors, nowMs });
    const { period, scope, result } = run(ds, { preset: 'last7' });
    const costs = computeCosts(ds, period, scope);
    assert.equal(result.facts.find((f) => f.key.startsWith('overview.fact.formCostUp')).key, `overview.fact.formCostUp.${cause}`);
    assert.equal(costs.answer.find((a) => a.key.startsWith('costs.answer.formUp')).key, `costs.answer.formUp.${cause}`);
    assert.equal(formCostChange(ds, period, scope).cause, cause);
  });
});

test('series and cost split add up to the summary; sparkline fields per bucket', async () => {
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    ['last30', 'month', 'allTime'].forEach((preset) => {
      const { period, scope, result } = run(ds, { preset });
      const summary = summarize(ds, period, scope);
      const health = summarizeHealth(ds, period);
      const sumOf = (field) => result.series.reduce((acc, row) => acc + (row[field] ?? 0), 0);
      close(sumOf('resultEur'), summary.resultEur, `${scenario} ${preset} result`);
      assert.equal(sumOf('forms'), summary.counts.forms);
      assert.equal(sumOf('slowCount'), health.over15);
      assert.ok(result.series.filter((row) => row.isFuture).every((row) => row.resultEur === null && row.forms === null));
      const split = result.tables.costByFeature;
      assert.deepEqual(split.map((row) => row.key), COST_PARTS);
      close(split.reduce((acc, row) => acc + row.valueEur, 0), summary.cost.totalEur, 'split');
    });
  }
});

test('notes: the Vertex EU week only when the period holds its forms; the 90-day cut', () => {
  const { ds } = makeScenario();
  assert.deepEqual(run(ds, { nowMs: SCENARIO_NOW }).result.notes, [{ key: 'overview.note.vertexEra' }]);
  assert.deepEqual(run(ds, { preset: 'last7', nowMs: SCENARIO_NOW }).result.notes, []);
  const limited = buildDataset(
    rawBundle({ rows: forms(3, localMs('2026-09-20 09:00')), sources: { usage: { status: 'limited', fetchedAt: 0, cacheAgeMs: 0 } } }),
    { nowMs: NOW, staticPrices, benchmark },
  );
  assert.deepEqual(run(limited).result.notes, [{ key: 'overview.note.limited' }]);
});

test('alerts: at most three; nothing fires on a quiet day (then the list is not rendered)', async () => {
  for (const scenario of ['today', 'planned']) {
    const api = makeDemoApi(NOW, { scenario });
    const ds = await demoDataset(scenario);
    const { rows } = normalizeUsageRows(api.liveNow.todayRows, { config: ds.config, prices: ds.prices, fx: ds.fx });
    const alerts = computeAlerts({ ds, today: summarizeToday(rows, ds, NOW), live: api.liveNow, nowMs: NOW });
    assert.ok(alerts.length <= 3, `${scenario}: ${alerts.length} alerts`);
  }
  const saturday = localMs('2026-09-26 12:00');
  const ds = dataset({ rows: forms(3, localMs('2026-09-25 10:00')), doctors: [doctor(PID.top)], nowMs: saturday });
  assert.deepEqual(computeAlerts({ ds, today: summarizeToday([], ds, saturday), live: { openCount: 0 }, nowMs: saturday }), []);
});

test('an expensive medical history run alone makes the cost split name it', () => {
  const ds = dataset({ rows: [anamnesisRow('2026-09-15 11:00', { costUsd: 2, credits: 5, pid: PID.gifted })], doctors: DOCTORS });
  const split = Object.fromEntries(run(ds).result.tables.costByFeature.map((row) => [row.key, row.valueEur]));
  assert.ok(split.anamnesis > 1.7 && split.form === 0 && split.recording === 0 && split.fixed > 0);
});
