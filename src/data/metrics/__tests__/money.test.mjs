import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../../dev/demoData.js';
import { loadAll } from '../../load.js';
import { buildDataset } from '../../buildDataset.js';
import { monthFactor, resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { capacity, projectScale } from '../../core/projection.js';
import { unitEconomics } from '../../core/unitEconomics.js';
import { EMPTY_RESULT, missingBasis } from '../shared.js';
import { SCALE_ROWS, anatomyRows, computeMoney } from '../money.js';
import { benchmark, rawBundle, staticPrices } from '../../__tests__/fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from '../../__tests__/scenario.mjs';

// §7 P2: the Money page metric. Shared numbers are the core's own values; the page only picks and arranges.

const NOW = SCENARIO_NOW;
const close = (a, b, eps = 1e-6, message = '') => assert.ok(Math.abs(a - b) <= eps, `${message} ${a} ≈ ${b}`.trim());
const scopeOf = (ds, extra = {}) => makeScope({ settings: ds.settings, ...extra });
const last30 = resolvePeriod('last30', NOW);

const demoDs = async (scenario, mutate) => {
  const api = makeDemoApi(NOW, { scenario });
  mutate?.(api);
  return buildDataset(await loadAll({ demo: api, nowMs: NOW }), { nowMs: NOW, staticPrices, benchmark });
};
const offRevenue = (revenue) => ({ ...revenue, status: 'off', reason: 'no_stripe_key', livemode: null, payments: [], adjustments: [] });

let todayPromise = null;
const today = () => (todayPromise ??= demoDs('today'));

test('shared headlines are the core values (===); every headline key has a basis', async () => {
  const ds = await today();
  const scope = scopeOf(ds);
  const r = computeMoney(ds, last30, scope);
  const s = summarize(ds, last30, scope);
  assert.equal(r.headline.result, s.resultEur);
  assert.equal(r.headline.net, s.income.netEur);
  assert.equal(r.headline.margin, s.marginPct);
  assert.equal(r.headline.creditsSpent, s.creditsSpent.total);
  assert.equal(r.headline.balances, s.balances.total);
  assert.equal(r.headline.freeBalances, s.balances.free);
  assert.deepEqual(missingBasis(r.headline, r.basis), []);
  const now = projectScale(ds, last30, scope, { scenario: 'plan' }).columns.now;
  r.tables.scaleTable.forEach((row) => assert.equal(row.now, now[row.key], `scaleTable ${row.key}`));
  const cap = capacity(ds, { planning: scope.planning, scenario: 'plan' });
  assert.equal(r.tables.capacity.find((row) => row.key === 'soniox').value, cap.soniox.s0.p95);
});

test('money series: income − cost = result in every bucket; the buckets add up to the summary', () => {
  const { ds } = makeScenario(); // refund, dispute, account fee, an internal account
  const september = resolvePeriod('month', NOW);
  [true, false].forEach((excludeInternal) => {
    const scope = scopeOf(ds, { excludeInternal });
    const r = computeMoney(ds, september, scope);
    const s = summarize(ds, september, scope);
    let income = 0;
    let cost = 0;
    r.moneySeries.filter((bucket) => !bucket.isFuture).forEach((bucket) => {
      close(bucket.result, bucket.income - bucket.cost, 1e-12, bucket.key);
      close(bucket.cost, bucket.costForm + bucket.costRecording + bucket.costAnamnesis + bucket.costFixed, 1e-12);
      income += bucket.income;
      cost += bucket.cost;
    });
    close(income, s.income.netEur, 1e-9, 'Σ income');
    close(cost, s.cost.totalEur, 1e-9, 'Σ cost');
    assert.equal(r.moneySeries[0].granularity, 'week', 'money charts use weeks up to 90 days');
  });
});

test('scale table: "now" is the summary converted to a month, hidden under 7 days', async () => {
  const ds = await today();
  const scope = scopeOf(ds);
  const r = computeMoney(ds, last30, scope);
  const s = summarize(ds, last30, scope);
  const factor = monthFactor(last30);
  const row = (key) => r.tables.scaleTable.find((line) => line.key === key);
  assert.deepEqual(r.tables.scaleTable.map((line) => line.key), [...SCALE_ROWS]);
  close(row('netEur').now, s.income.netEur * factor, 1e-9);
  close(row('costTotalEur').now, s.cost.totalEur * factor, 1e-9);
  close(row('resultEur').now, s.resultEur * factor, 1e-9);
  assert.equal(r.tables.scaleSteps.length, 13);
  assert.equal(r.projection.now.hidden, false);
  const threeDays = resolvePeriod('custom', NOW, { custom: { from: '2026-09-21', to: '2026-09-23' } });
  assert.equal(computeMoney(ds, threeDays, scope).projection.now.hidden, true);
});

test('sensitivity: sorted by |difference|, the top 3 that matter become sentences', async () => {
  const ds = await today();
  const rows = computeMoney(ds, last30, scopeOf(ds)).tables.sensitivity;
  assert.equal(rows.length, 6);
  rows.slice(1).forEach((row, i) => assert.ok(Math.abs(rows[i].diffEur) >= Math.abs(row.diffEur), 'sorted by |diff|'));
  const top = rows.filter((row) => row.top);
  assert.equal(top.length, 3);
  assert.deepEqual(top, rows.slice(0, 3));
  top.forEach((row) => {
    assert.equal(row.line.key, row.diffEur >= 0 ? 'money.sensitivity.more' : 'money.sensitivity.less', 'the sign picks the words');
    assert.equal(row.line.values.change.key, `money.sensitivity.change.${row.key}`);
    assert.deepEqual(row.line.values.diff, ['eur', Math.abs(row.diffEur)], 'the amount is the change, without a sign');
  });
});

test('capacity: a row only when a limit is reached at one of the two scales', async () => {
  const ds = await today();
  // The default plan (15 min conversation in every visit): 79 conversations at once at 100 doctors > 10.
  const plan = computeMoney(ds, last30, scopeOf(ds)).tables.capacity;
  assert.deepEqual(plan.find((row) => row.key === 'soniox'), { key: 'soniox', n: 100, value: plan[0].value, limit: 10, ratio: plan[0].value / 10 });
  assert.ok(plan.some((row) => row.key === 'dashboard'));
  // Typing only at 5 and 10 doctors: nothing is reached, so no row at all.
  const small = scopeOf(ds);
  small.planning = { ...ds.settings.planning, doctorScales: [5, 10] };
  assert.deepEqual(computeMoney(ds, last30, small, { scenario: 'typed' }).tables.capacity, []);

  const planned = await demoDs('planned');
  const keys = computeMoney(planned, last30, scopeOf(planned)).tables.capacity.map((row) => row.key);
  assert.ok(keys.includes('soniox') && keys.includes('dashboard'), keys.join());
});

test('anatomy: the parts of one credit add up to 100 %; a loss draws the whole bar red', async () => {
  const ds = await today();
  const rows = computeMoney(ds, last30, scopeOf(ds)).tables.anatomy;
  assert.deepEqual(rows.map((row) => row.key), ['form', 'live10', 'dictation10', 'anamnesis1']);
  rows.forEach((row) => {
    close(row.shares.vatFee + row.shares.cost + row.shares.left, 1, 1e-9, row.key);
    assert.equal(row.negative, false);
  });
  const credit = { priceEur: 0.03, vatEur: 0, feeEur: 0.0006, netEur: 0.0294 };
  const loss = anatomyRows({
    form: { ...credit, costEur: 0.01, leftEur: 0.0194, shareLeft: 0.66 },
    live10: { ...credit, costEur: 0.04, leftEur: -0.0106, shareLeft: -0.36 },
    dictation10: { ...credit, costEur: 0.01, leftEur: 0.0194, shareLeft: 0.66 },
    anamnesis1: { ...credit, costEur: 0.01, leftEur: 0.0194, shareLeft: 0.66 },
  }).find((row) => row.key === 'live10');
  assert.equal(loss.negative, true);
  assert.deepEqual(loss.shares, { vatFee: 0, cost: 1, left: 0 });
});

test('the money chart gives way to a sentence when there is no income', async () => {
  const ds = await today();
  const scope = scopeOf(ds);
  assert.equal(computeMoney(ds, last30, scope).takeaways.moneyChart, undefined, 'one purchase in the last 30 days: drawn');
  const quiet = resolvePeriod('custom', NOW, { custom: { from: '2026-09-10', to: '2026-09-20' } });
  const r = computeMoney(ds, quiet, scope);
  assert.equal(r.takeaways.moneyChart.key, 'money.moneyChart.none');
  assert.equal(r.answer[0].key, 'money.answer.noPaymentsLast');
  assert.ok(r.moneySeries.every((bucket) => bucket.income === 0));
});

test('Stripe off: purchases guessed from balances (≤ €108.50, indirect) and "—" for income; test mode: no income', async () => {
  const off = await demoDs('today', (api) => {
    api.revenue = offRevenue(api.revenue);
  });
  const r = computeMoney(off, last30, scopeOf(off));
  assert.equal(r.headline.incomeStatus, 'off');
  assert.equal(r.headline.inferredEur, 108.5);
  assert.equal(r.headline.inferredPurchases, 5);
  assert.equal(r.basis.inferredEur, 'inferred');
  ['gross', 'net', 'result', 'margin', 'creditsSold'].forEach((key) => {
    assert.equal(r.headline[key], null, key);
    assert.equal(r.basis[key], 'missing', key);
  });
  assert.equal(r.answer[0].key, 'money.answer.revenueOff');
  assert.equal(r.takeaways.moneyChart.key, 'money.moneyChart.noIncome');
  assert.ok(r.moneySeries.every((bucket) => bucket.income === null || bucket.isFuture));

  const testMode = await demoDs('today', (api) => {
    api.revenue = { ...api.revenue, livemode: false };
  });
  const t = computeMoney(testMode, last30, scopeOf(testMode));
  assert.equal(t.headline.incomeStatus, 'test');
  assert.equal(t.headline.net, null);
  assert.equal(t.headline.inferredEur, null);
  assert.deepEqual(t.tables.payments, []);
  assert.equal(t.answer[0].key, 'money.answer.revenueTest');
});

test('the pack switch starts on "as planned"; unknown choices fall back to the plan', async () => {
  const ds = await today();
  const scope = scopeOf(ds);
  const byDefault = computeMoney(ds, last30, scope);
  assert.deepEqual(computeMoney(ds, last30, scope, { pack: 'plan', scenario: 'plan' }).tables.anatomy, byDefault.tables.anatomy);
  assert.deepEqual(computeMoney(ds, last30, scope, { pack: 'pack42', scenario: 'nope' }).tables.visitTypes, byDefault.tables.visitTypes);
  const plan = unitEconomics(ds, last30, scope, { pack: 'plan' }).perCredit.form;
  assert.equal(byDefault.tables.anatomy[0].priceEur, plan.priceEur);
  const pack250 = computeMoney(ds, last30, scope, { pack: 'pack250' }).tables.anatomy[0];
  close(pack250.priceEur, 0.05, 1e-12, 'pack 250: €12.50 / 250');
});

test('purchases: one did not get its credits (demo); VAT changes income only', async () => {
  const ds = await today();
  const scope = scopeOf(ds);
  const r = computeMoney(ds, last30, scope);
  assert.equal(r.headline.notCredited, 1);
  assert.equal(r.tables.payments.length, 1);
  assert.equal(r.tables.payments[0].credited, 'no');
  assert.ok(!JSON.stringify(r).includes('@'), 'no email in the metric output');
  const vat = computeMoney(ds, last30, { ...scope, vatPayer: true });
  assert.ok(vat.headline.net < r.headline.net);
  assert.ok(vat.tables.payments[0].vatEur > 0);
  assert.equal(vat.headline.cost, r.headline.cost);
});

test('an empty dataset returns empty: true without throwing', () => {
  const ds = buildDataset(rawBundle(), { nowMs: NOW, staticPrices, benchmark });
  const r = computeMoney(ds, last30, scopeOf(ds));
  assert.equal(r.empty, true);
  assert.deepEqual(missingBasis(r.headline, r.basis), []);
  assert.equal(computeMoney(null, last30, null), EMPTY_RESULT);
});
