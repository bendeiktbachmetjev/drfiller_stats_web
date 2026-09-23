import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../dev/demoData.js';
import { loadAll } from '../load.js';
import { buildDataset } from '../buildDataset.js';
import { inPeriod, resolvePeriod } from '../period.js';
import { isInternal, makeScope } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { summarizeHealth } from '../core/health.js';
import { summarizeToday } from '../core/today.js';
import { capacity, planningOf, projectScale, unitCosts } from '../core/projection.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { normalizeUsageRows } from '../normalize/usage.js';
import { COMPUTE } from '../metrics/index.js';
import { makeDelta } from '../metrics/shared.js';
import { benchmark, staticPrices } from './fixtures.mjs';

// SPEC §6.3: numbers that appear on two pages are the very same core values; totals add up across splits;
// the scope switch and the VAT switch move only what they should; no AreaResult leaks an id or an email.
// 3 periods × both scope settings × both demo scenarios. The owner's own account (the busiest one, O3) is
// marked internal, so "Without my and test accounts" really removes rows.

const NOW = Date.parse('2026-09-23T11:30:00Z'); // 14:30 Vilnius
const EPS = 1e-9;
const close = (a, b, message, eps = EPS) =>
  assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${message}: ${a} ≈ ${b}`);
const sumOf = (values) => values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

const PERIODS = {
  last30: resolvePeriod('last30', NOW),
  aug2026: resolvePeriod('month', NOW, { offset: -1 }),
  allTime: resolvePeriod('allTime', NOW),
};
const SCOPES = { withoutMine: true, allAccounts: false };
const COST_ROWS = ['costGeminiFormsEur', 'costSonioxEur', 'costOpenaiEur', 'costAnamnesisEur', 'costFixedEur'];

/** The busiest account (most forms) = the owner's own account in the demo (Appendix C.4, ≈ 87 %). */
const busiestPid = (api) => {
  const forms = new Map();
  api.usage.rows.forEach((row) => {
    if (row.action !== 'ai_processing' || !row.pid) return;
    forms.set(row.pid, (forms.get(row.pid) ?? 0) + 1);
  });
  return [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const cache = new Map();
/** Both demo scenarios, with the busiest account marked "mine" through settings (like the Doctors page does). */
const demo = (scenario) => {
  if (!cache.has(scenario)) {
    cache.set(scenario, (async () => {
      const api = makeDemoApi(NOW, { scenario });
      const internalPid = busiestPid(api);
      api.settings = { ...api.settings, settings: { ...api.settings.settings, internalPids: [internalPid] } };
      const ds = buildDataset(await loadAll({ demo: api, nowMs: NOW }), { nowMs: NOW, staticPrices, benchmark });
      return { api, ds, internalPid };
    })());
  }
  return cache.get(scenario);
};

/** Runs `check` for every scenario × period × scope, naming the case in failures. */
async function eachCase(check) {
  for (const scenario of ['today', 'planned']) {
    const { ds, api, internalPid } = await demo(scenario);
    for (const [periodName, period] of Object.entries(PERIODS)) {
      for (const [scopeName, excludeInternal] of Object.entries(SCOPES)) {
        const scope = makeScope({ excludeInternal, settings: ds.settings });
        check({ ds, api, internalPid, period, scope, label: `${scenario}/${periodName}/${scopeName}` });
      }
    }
  }
}

test('the demo marks the owner account internal, so the scope switch has an effect', async () => {
  for (const scenario of ['today', 'planned']) {
    const { ds, internalPid } = await demo(scenario);
    assert.ok(isInternal(internalPid, ds), `${scenario}: ${internalPid} internal`);
    const on = summarize(ds, PERIODS.allTime, makeScope({ excludeInternal: true, settings: ds.settings }));
    const off = summarize(ds, PERIODS.allTime, makeScope({ excludeInternal: false, settings: ds.settings }));
    assert.ok(on.counts.forms < off.counts.forms, `${scenario}: fewer forms without my accounts`);
  }
});

test('cost splits add up: by provider = by feature = by model + fixed = total', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const { cost } = summarize(ds, period, scope);
    close(sumOf(Object.values(cost.byProvider)), cost.totalEur, `${label} byProvider`);
    close(sumOf(Object.values(cost.byFeature)), cost.totalEur, `${label} byFeature`);
    close(sumOf(Object.values(cost.byModel)) + cost.fixedEur, cost.totalEur, `${label} byModel + fixed`);
    close(sumOf(Object.values(cost.byPid)), cost.variableEur, `${label} byPid`);
  });
});

test('scale table: "now" = summarize × monthFactor, its five cost rows = total × monthFactor, nowTotal = summarize', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const s = summarize(ds, period, scope);
    const plan = projectScale(ds, period, scope);
    const { now, nowTotal } = plan.columns;
    const f = s.monthFactor;
    close(plan.now.factor, f, `${label} factor`);
    close(sumOf(COST_ROWS.map((key) => now[key])), s.cost.totalEur * f, `${label} Σ now cost rows`);
    close(now.costTotalEur, s.cost.totalEur * f, `${label} now.costTotalEur`);
    close(now.costGeminiFormsEur, s.cost.byFeature.form * f, `${label} now.form`);
    close(now.costAnamnesisEur, s.cost.byFeature.anamnesis * f, `${label} now.anamnesis`);
    close(now.visits, s.counts.forms * f, `${label} now.visits`);
    close(now.creditsSpent, s.creditsSpent.total * f, `${label} now.credits`);
    assert.equal(now.doctors, s.activeDoctors, `${label} now.doctors`);
    assert.equal(nowTotal.costTotalEur, s.cost.totalEur, `${label} nowTotal.cost`);
    assert.equal(nowTotal.visits, s.counts.forms, `${label} nowTotal.visits`);
    assert.equal(nowTotal.resultEur, s.resultEur, `${label} nowTotal.result`);
    if (s.resultEur === null) assert.equal(now.resultEur, null, `${label} now.result unknown`);
    else close(now.resultEur, s.resultEur * f, `${label} now.result`);
  });
});

test('forms: main + backup + switch roles = forms (health and summary agree)', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const forms = ds.forms.filter((row) => inPeriod(row.t, period));
    const byRole = (role) => forms.filter((row) => row.role === role).length;
    assert.equal(byRole('main') + byRole('fallback') + byRole('switch'), forms.length, `${label} roles`);
    assert.equal(summarizeHealth(ds, period).forms, forms.length, `${label} health.forms`);
    if (!scope.excludeInternal) assert.equal(summarize(ds, period, scope).counts.forms, forms.length, `${label} summary.forms`);
  });
});

test('money: income − cost = result per money bucket and in total; buckets add up to the summary', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const s = summarize(ds, period, scope);
    const money = COMPUTE.money(ds, period, scope, {});
    const buckets = money.moneySeries.filter((bucket) => !bucket.isFuture);
    if (s.income.status === 'ok') {
      close(s.income.netEur - s.cost.totalEur, s.resultEur, `${label} total result`);
      buckets.forEach((bucket) => close(bucket.income - bucket.cost, bucket.result, `${label} bucket ${bucket.key}`));
      close(sumOf(buckets.map((bucket) => bucket.income)), s.income.netEur, `${label} Σ income`, 1e-6);
    } else {
      assert.equal(s.resultEur, null, `${label} result unknown without income`);
    }
    close(sumOf(buckets.map((bucket) => bucket.cost)), s.cost.totalEur, `${label} Σ cost`, 1e-6);
  });
});

test('per doctor: Σ result + unattributed − fixed = result; Σ paid + unattributed = income', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const s = summarize(ds, period, scope);
    const rows = COMPUTE.doctors(ds, period, scope, { view: 'all' }).tables.doctors;
    close(sumOf(rows.map((row) => row.costEur)), s.cost.variableEur, `${label} Σ cost`, 1e-6);
    if (s.income.status !== 'ok') return;
    close(sumOf(rows.map((row) => row.resultEur)) + s.income.unattributedNetEur - s.cost.fixedEur, s.resultEur, `${label} Σ result`, 1e-6);
    close(sumOf(rows.map((row) => row.paidNetEur)) + s.income.unattributedNetEur, s.income.netEur, `${label} Σ paid`, 1e-6);
  });
});

test('shared headlines are the core values (===), table of §6.3', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const s = summarize(ds, period, scope);
    const h = summarizeHealth(ds, period);
    const planning = scope.planning;
    const units = unitEconomics(ds, period, scope);
    const plan = projectScale(ds, period, scope);
    const cap = capacity(ds, { planning });
    const r = Object.fromEntries(Object.keys(COMPUTE).map((id) => [id, COMPUTE[id](ds, period, scope, id === 'doctors' ? { view: 'all' } : {})]));
    const eq = (actual, expected, name) => assert.equal(actual, expected, `${label} ${name}`);

    eq(r.overview.headline.result, s.resultEur, 'overview.result');
    eq(r.money.headline.result, s.resultEur, 'money.result');
    eq(r.overview.headline.cost, s.cost.totalEur, 'overview.cost');
    eq(r.costs.headline.total, s.cost.totalEur, 'costs.total');
    eq(r.overview.headline.forms, s.counts.forms, 'overview.forms');
    eq(r.overview.headline.active, s.activeDoctors, 'overview.active');
    eq(r.doctors.headline.active, s.activeDoctors, 'doctors.active');
    eq(r.overview.headline.payingActive, s.payingActiveDoctors, 'overview.payingActive');
    eq(r.doctors.headline.paying, s.payingActiveDoctors, 'doctors.paying');
    eq(r.overview.headline.over15Share, h.over15Share, 'overview.over15Share');
    eq(r.models.headline.over15Share, h.over15Share, 'models.over15Share');
    eq(r.overview.headline.p50Ms, h.p50Ms, 'overview.p50Ms');
    eq(r.models.headline.p50Ms, h.p50Ms, 'models.p50Ms');
    eq(r.overview.headline.fallbackCount, h.fallbackCount, 'overview.fallbackCount');
    eq(r.models.headline.fallbackCount, h.fallbackCount, 'models.fallbackCount');
    eq(r.overview.headline.health, h.word, 'overview.health');
    eq(r.money.headline.net, s.income.status === 'ok' ? s.income.netEur : null, 'money.net');
    eq(r.money.headline.creditsSpent, s.creditsSpent.total, 'money.creditsSpent');
    eq(r.money.headline.balances, s.balances.total, 'money.balances');
    eq(r.money.headline.freeBalances, s.balances.free, 'money.freeBalances');
    eq(r.recording.headline.credits, s.creditsSpent.recording, 'recording.credits');
    eq(r.recording.headline.minutes, s.minutes.total, 'recording.minutes');
    eq(r.recording.headline.cost, s.cost.byFeature.dictation + s.cost.byFeature.live, 'recording.cost');
    const live10 = units.perCredit.live10;
    eq(r.recording.headline.cost10Eur, live10.costEur, 'recording.cost10Eur');
    eq(r.recording.headline.net1Eur, live10.netEur, 'recording.net1Eur');
    eq(r.recording.headline.left10Eur, live10.leftEur, 'recording.left10Eur');
    eq(r.recording.headline.margin10, live10.shareLeft, 'recording.margin10');
    eq(r.requests.headline.anamRuns, s.counts.anamnesisRuns, 'requests.anamRuns');
    eq(r.costs.headline.perForm, s.unit.costPerFormEur, 'costs.perForm');

    const unitsFact = r.overview.facts.find((fact) => fact.key === 'overview.fact.units');
    if (unitsFact) {
      eq(unitsFact.values.cents[1], units.perCredit.form.leftEur, 'overview units fact (form)');
      eq(unitsFact.values.cents2[1], live10.leftEur, 'overview units fact (live10)');
    }

    const byClass = Object.fromEntries(r.doctors.tables.byClass.map((row) => [row.key, row.valueEur]));
    Object.entries(s.cost.byClass).forEach(([key, value]) => eq(byClass[key] ?? 0, value, `doctors.byClass.${key}`));

    const now = projectScale(ds, period, scope, { scenario: 'plan' }).columns.now;
    r.money.tables.scaleTable.forEach((row) => eq(row.now, now[row.key], `money.scaleTable.${row.key}`));

    const perDoctor = plan.columns.doctor.costTotalEur;
    eq(r.overview.projection.columns.doctor.costTotalEur, perDoctor, 'overview.projection doctor');
    eq(r.costs.headline.perDoctorPlan, perDoctor, 'costs.perDoctorPlan');
    eq(r.doctors.headline.planPerDoctorEur, perDoctor, 'doctors.planPerDoctorEur');

    eq(r.recording.headline.meanDoctors, cap.soniox.meanDoctors, 'recording.meanDoctors');
    eq(r.recording.headline.safeDoctors, cap.soniox.limitDoctors, 'recording.safeDoctors');
    const sonioxRisk = r.models.tables.risks.find((row) => row.key === 'sonioxLimit');
    eq(sonioxRisk.values.meanDoctors, cap.soniox.meanDoctors, 'models.risks soniox meanDoctors');
    eq(sonioxRisk.values.limitDoctors, cap.soniox.limitDoctors, 'models.risks soniox limitDoctors');
    const sonioxCapacity = r.money.tables.capacity.find((row) => row.key === 'soniox');
    if (sonioxCapacity) eq(sonioxCapacity.value, sonioxCapacity.n === plan.scales[0] ? cap.soniox.s0.p95 : cap.soniox.s1.p95, 'money.capacity soniox');
  });
});

test('Prices: our form price is unitCosts(); the base row per doctor is "forms only", unlike Costs\' plan per doctor', async () => {
  for (const scenario of ['today', 'planned']) {
    const { ds } = await demo(scenario);
    const scope = makeScope({ excludeInternal: true, settings: ds.settings });
    const uc = unitCosts(ds, ds.settings.planning);
    const prices = COMPUTE.prices(ds, PERIODS.last30, scope, {});
    if (uc.formsUsed >= 20) assert.equal(prices.headline.oursEurPerForm, uc.formCostEur, `${scenario} oursEurPerForm`);
    const visits = planningOf(ds.settings.planning).visitsPerDoctorMonth;
    close(prices.headline.oursPerDoctorEur, uc.formCostEur * visits, `${scenario} forms only per doctor`);
    const costsPerDoctor = COMPUTE.costs(ds, PERIODS.last30, scope, {}).headline.perDoctorPlan;
    if (scenario === 'planned') assert.notEqual(prices.headline.oursPerDoctorEur, costsPerDoctor, 'different numbers by design');
  }
});

test('the scope switch removes only rows of internal accounts; service numbers ignore it', async () => {
  for (const scenario of ['today', 'planned']) {
    const { ds, internalPid } = await demo(scenario);
    for (const [periodName, period] of Object.entries(PERIODS)) {
      const label = `${scenario}/${periodName}`;
      const on = makeScope({ excludeInternal: true, settings: ds.settings });
      const off = makeScope({ excludeInternal: false, settings: ds.settings });
      const a = summarize(ds, period, on);
      const b = summarize(ds, period, off);
      const mine = ds.rows.filter((row) => inPeriod(row.t, period) && row.pid === internalPid);
      assert.equal(a.counts.forms, b.counts.forms - mine.filter((row) => row.kind === 'form').length, `${label} forms`);
      close(a.cost.variableEur, b.cost.variableEur - sumOf(mine.map((row) => row.costEur)), `${label} variable cost`, 1e-6);
      assert.equal(a.cost.fixedEur, b.cost.fixedEur, `${label} fixed cost`);
      assert.equal(a.cost.byPid[internalPid], undefined, `${label} internal pid gone`);
      Object.keys(a.cost.byPid).forEach((pid) => close(a.cost.byPid[pid], b.cost.byPid[pid], `${label} ${pid}`));

      assert.deepEqual(COMPUTE.models(ds, period, on, {}).headline, COMPUTE.models(ds, period, off, {}).headline, `${label} models`);
    }
    const planA = unitCosts(ds, makeScope({ excludeInternal: true, settings: ds.settings }).planning);
    const planB = unitCosts(ds, makeScope({ excludeInternal: false, settings: ds.settings }).planning);
    assert.deepEqual(planA, planB, `${scenario} unitCosts`);
  }
});

test('the VAT switch changes only income numbers', async () => {
  await eachCase(({ ds, period, scope, label }) => {
    const noVat = summarize(ds, period, { ...scope, vatPayer: false });
    const vat = summarize(ds, period, { ...scope, vatPayer: true });
    assert.deepEqual(vat.cost, noVat.cost, `${label} cost`);
    assert.deepEqual(vat.counts, noVat.counts, `${label} counts`);
    assert.deepEqual(vat.minutes, noVat.minutes, `${label} minutes`);
    assert.deepEqual(vat.creditsSpent, noVat.creditsSpent, `${label} credits`);
    const planNoVat = projectScale(ds, period, scope, { vatPayer: false }).columns;
    const planVat = projectScale(ds, period, scope, { vatPayer: true }).columns;
    ['doctor', 's0', 's1'].forEach((column) =>
      COST_ROWS.concat('costTotalEur').forEach((key) => assert.equal(planVat[column][key], planNoVat[column][key], `${label} ${column}.${key}`)));
    if (noVat.income.status === 'ok' && noVat.income.grossEur > 0) {
      assert.equal(noVat.income.vatEur, 0, `${label} no VAT`);
      assert.ok(vat.income.netEur < noVat.income.netEur, `${label} VAT lowers the net income`);
    }
  });
});

test('summarizeToday on the last demo day equals summarize / summarizeHealth of that day', async () => {
  for (const scenario of ['today', 'planned']) {
    const { ds, api } = await demo(scenario);
    const { rows } = normalizeUsageRows(api.liveNow.todayRows, { config: ds.config, prices: ds.prices, fx: ds.fx });
    const today = summarizeToday(rows, ds, NOW);
    const day = resolvePeriod('custom', NOW, { custom: { from: today.dayKey, to: today.dayKey } });
    const s = summarize(ds, day, makeScope({ excludeInternal: false, settings: ds.settings }));
    const h = summarizeHealth(ds, day);
    assert.equal(today.forms, s.counts.forms, `${scenario} forms`);
    assert.equal(today.fallback, h.fallbackCount, `${scenario} fallback`);
    assert.equal(today.over15, h.over15, `${scenario} over15`);
    close(today.recordingMinutes, s.minutes.total, `${scenario} recording minutes`, 1e-9);
    close(today.costEur, s.cost.variableEur, `${scenario} cost`, 1e-9);
  }
});

test('deltas keep their unit: a small sum of money changes in €, a unit price in %, and the direction follows the sign', () => {
  assert.deepEqual(makeDelta(7.2, 2.9, { kind: 'money' }), { kind: 'eur', value: 4.3, dir: 'up', prev: 2.9 });
  assert.equal(makeDelta(1351, 63, { kind: 'money' }).kind, 'pct');
  assert.deepEqual(makeDelta(0.0081, 0.0076, { kind: 'pctAlways' }), { kind: 'pct', value: 6.6, dir: 'up', prev: 0.0076 });
  assert.equal(makeDelta(0.0081, 0, { kind: 'pctAlways' }), null);
  assert.equal(makeDelta(11.76, 16.15, { kind: 'eur' }).dir, 'down');
});

// Firebase uids are 28 letters and digits with at least one of each (a pure-letter key name is not one).
const UID_LIKE = /\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{28}\b/;

test('privacy: no AreaResult carries a uid-like token, an "@" or a raw session id', async () => {
  for (const scenario of ['today', 'planned']) {
    const { ds } = await demo(scenario);
    const sessionRefs = new Set(ds.lives.map((row) => row.live?.sessionRef).filter(Boolean));
    for (const [periodName, period] of Object.entries(PERIODS)) {
      for (const excludeInternal of [true, false]) {
        const scope = makeScope({ excludeInternal, settings: ds.settings });
        Object.entries(COMPUTE).forEach(([id, compute]) => {
          const json = JSON.stringify(compute(ds, period, scope, id === 'doctors' ? { view: 'all' } : {}));
          const label = `${scenario}/${periodName}/${id}`;
          assert.doesNotMatch(json, UID_LIKE, `${label}: uid-like token`);
          assert.ok(!json.includes('@'), `${label}: "@" (an email)`);
          assert.equal(json.split(/[^A-Za-z0-9]+/).find((token) => sessionRefs.has(token)), undefined, `${label}: a session id`);
        });
      }
    }
  }
});
