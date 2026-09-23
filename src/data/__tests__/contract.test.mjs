import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../dev/demoData.js';
import { ROUTE_SCHEMAS, SCHEMAS, envelope, validate } from '../api/contract.js';
import { loadAll } from '../load.js';
import { buildDataset } from '../buildDataset.js';
import { resolvePeriod } from '../period.js';
import { makeScope } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { summarizeHealth } from '../core/health.js';
import { summarizeToday } from '../core/today.js';
import { capacity, projectScale, sensitivity, unitCosts } from '../core/projection.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { computeAlerts } from '../core/alerts.js';
import { normalizeUsageRows } from '../normalize/usage.js';
import { COMPUTE } from '../metrics/index.js';
import { missingBasis } from '../metrics/shared.js';
import staticPrices from '../static/prices-2026-09-23.json' with { type: 'json' };
import benchmark from '../static/benchmark-2026-09-23.json' with { type: 'json' };

// FROZEN CONTRACT 1 (§5.2.3): the demo and the mock emit exactly the API shapes; the whole pipeline
// makeDemoApi → loadAll → buildDataset → core → metrics runs for both scenarios without throwing.

const NOW = Date.parse('2026-09-23T07:30:00Z'); // 10:30 Vilnius
const SCENARIOS = ['today', 'planned'];
const DEMO_ROUTES = { usage: 'usage', doctors: 'doctors', revenue: 'revenue', soniox: 'soniox', liveNow: 'liveNow', config: 'config', costsMonthly: 'costs', settings: 'settings' };

test('makeDemoApi output validates against api/contract.js for both scenarios', () => {
  SCENARIOS.forEach((scenario) => {
    const api = makeDemoApi(NOW, { scenario });
    Object.entries(DEMO_ROUTES).forEach(([field, route]) => {
      const schemaName = ROUTE_SCHEMAS[route];
      assert.ok(SCHEMAS[schemaName], `schema ${schemaName}`);
      const { ok, errors } = validate(schemaName, api[field]);
      assert.ok(ok, `${scenario}/${field}: ${errors.join('; ')}`);
    });
    const { ok, errors } = validate('envelope', envelope(api.config, { nowMs: NOW }));
    assert.ok(ok, `envelope: ${errors.join('; ')}`);
  });
});

test('makeDemoApi is deterministic: the same nowMs gives the same output, also from a fresh module (no cache)', async () => {
  SCENARIOS.forEach((scenario) => {
    assert.deepEqual(makeDemoApi(NOW, { scenario }), makeDemoApi(NOW, { scenario }));
  });
  const fresh = await import(`../../dev/demoData.js?fresh=${Date.now()}`);
  assert.equal(JSON.stringify(fresh.makeDemoApi(NOW, { scenario: 'today' })), JSON.stringify(makeDemoApi(NOW, { scenario: 'today' })));
  const later = makeDemoApi(NOW + 3 * 3600000, { scenario: 'today' });
  const earlierIds = new Set(makeDemoApi(NOW, { scenario: 'today' }).usage.rows.map((row) => row.id));
  assert.ok(later.usage.rows.filter((row) => row.t <= NOW).every((row) => earlierIds.has(row.id)), 'moving "now" never changes the past');
});

test('demo settings follow the owner decisions (English, no VAT, list email mode)', () => {
  const api = makeDemoApi(NOW);
  assert.equal(api.settings.settings.lang, 'en');
  assert.equal(api.settings.settings.vatPayer, false);
  assert.equal(api.doctors.emailMode, 'list');
});

test('the pipeline runs end to end for both scenarios and every metric returns an AreaResult', async () => {
  for (const scenario of SCENARIOS) {
    const api = makeDemoApi(NOW, { scenario });
    const raw = await loadAll({ demo: api, nowMs: NOW });
    const ds = buildDataset(raw, { nowMs: NOW, staticPrices, benchmark });
    assert.ok(Object.isFrozen(ds), 'the dataset is frozen');
    const planning = ds.settings.planning;
    const scope = makeScope({ excludeInternal: true, settings: ds.settings });
    ['last7', 'last30', 'month', 'year', 'allTime'].forEach((preset) => {
      const period = resolvePeriod(preset, NOW);
      summarize(ds, period, scope);
      summarizeHealth(ds, period);
      unitEconomics(ds, period, scope, { planning, vatPayer: false, method: planning.paymentMethod });
      const plan = projectScale(ds, period, scope, { planning, vatPayer: false });
      assert.deepEqual(Object.keys(plan.columns).sort(), ['doctor', 'now', 'nowTotal', 's0', 's1', 'visit']);
      sensitivity(ds, period, scope, { planning, vatPayer: false });
      Object.entries(COMPUTE).forEach(([name, compute]) => {
        const result = compute(ds, period, scope, {});
        assert.equal(typeof result.empty, 'boolean', `${name}.empty`);
        ['headline', 'basis', 'tables'].forEach((key) => assert.equal(typeof result[key], 'object', `${name}.${key}`));
        ['answer', 'series', 'notes'].forEach((key) => assert.ok(Array.isArray(result[key]), `${name}.${key}`));
        assert.deepEqual(missingBasis(result.headline, result.basis), [], `${name}: basis for every headline key`);
      });
    });
    unitCosts(ds, planning);
    capacity(ds, { planning });
    const { rows } = normalizeUsageRows(api.liveNow.todayRows, { config: ds.config, prices: ds.prices, fx: ds.fx });
    const today = summarizeToday(rows, ds, NOW);
    assert.equal(today.dayKey, '2026-09-23');
    assert.ok(Array.isArray(computeAlerts({ ds, today, live: api.liveNow, nowMs: NOW })));
  }
});

const datasetOf = async (scenario, nowMs = NOW) => {
  const api = makeDemoApi(nowMs, { scenario });
  return { api, ds: buildDataset(await loadAll({ demo: api, nowMs }), { nowMs, staticPrices, benchmark }) };
};

test('demo bands (Appendix C.4): fallback 0.5–2 %, top user 80–92 %, September prompt ±15 % of 11.6k, classes 25/7/5/4', async () => {
  const { api, ds } = await datasetOf('today');
  const health = summarizeHealth(ds, resolvePeriod('allTime', NOW));
  assert.ok(health.fallbackShare >= 0.005 && health.fallbackShare <= 0.02, `fallback ${health.fallbackShare}`);
  const perDoctor = new Map();
  ds.forms.forEach((row) => perDoctor.set(row.pid, (perDoctor.get(row.pid) ?? 0) + 1));
  const topShare = Math.max(...perDoctor.values()) / ds.forms.length;
  assert.ok(topShare >= 0.8 && topShare <= 0.92, `top user ${topShare}`);
  const september = ds.forms.filter((row) => row.monthKey === '2026-09');
  const promptMean = september.reduce((acc, row) => acc + row.inTok, 0) / september.length;
  assert.ok(Math.abs(promptMean - 11600) <= 0.15 * 11600, `September prompt ${promptMean}`);
  const classes = {};
  api.doctors.doctors.filter((d) => d.exists.credits).forEach((d) => { classes[d.class] = (classes[d.class] ?? 0) + 1; });
  assert.deepEqual(classes, { legacy: 4, gifted: 7, bought_inferred: 5, free: 25 });
  assert.deepEqual(api.doctors.counts, { auth: 44, creditDocs: 41, profiles: 37 });
  assert.equal(api.revenue.payments.length, 5);
  assert.equal(api.revenue.webhook.notCredited, 1);
  const last30 = summarize(ds, resolvePeriod('last30', NOW), makeScope({ settings: ds.settings }));
  assert.equal(last30.activeDoctors, 6);
  assert.ok(last30.cost.totalEur > 9 && last30.cost.totalEur < 15, `last 30 days cost ${last30.cost.totalEur}`);
  assert.equal(last30.balances.free, 31798, 'free balances of Appendix C.3');
  assert.ok(api.doctors.doctors.every((d) => /^doctor\d+@example\.test$/.test(d.email)), 'list mode: every doctor has an email (O2)');
  assert.ok(api.doctors.doctors.every((d) => !d.internal), 'no account is marked internal');
});

test('the planned scenario: 100 paying doctors, conversation text measured, B2 fields, open conversations', async () => {
  const { api, ds } = await datasetOf('planned');
  assert.equal(api.doctors.doctors.length, 100);
  const last30 = summarize(ds, resolvePeriod('last30', NOW), makeScope({ settings: ds.settings }));
  assert.equal(last30.payingActiveDoctors, 100);
  assert.ok(last30.counts.liveConversations / last30.counts.forms > 0.9);
  const uc = unitCosts(ds, ds.settings.planning);
  assert.equal(uc.formBasis, 'exact');
  assert.equal(uc.convBasis, 'exact');
  assert.ok(Math.abs(uc.convTokensPerMin - 250) < 25, `measured ${uc.convTokensPerMin} tokens a minute`);
  assert.ok(ds.v2LoggingSince.forms !== null && ds.v2LoggingSince.events !== null);
  assert.ok(api.liveNow.openCount > 0);
});

test('demo later in the day: the first meter rows and failures after 23.09 11:23', async () => {
  const afternoon = Date.parse('2026-09-23T12:30:00Z');
  const { ds } = await datasetOf('today', afternoon);
  assert.ok(ds.meter.length >= 1 && ds.failures.length === 2);
  assert.deepEqual(ds.failures.map((row) => row.failure.group).sort(), ['refusal', 'service']);
  const day = resolvePeriod('custom', afternoon, { custom: { from: '2026-09-23', to: '2026-09-23' } });
  assert.equal(summarizeHealth(ds, day).serviceFailures, 1);
});
