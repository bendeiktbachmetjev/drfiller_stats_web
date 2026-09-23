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

test('makeDemoApi is deterministic: the same nowMs gives the same output', () => {
  SCENARIOS.forEach((scenario) => {
    assert.deepEqual(makeDemoApi(NOW, { scenario }), makeDemoApi(NOW, { scenario }));
  });
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

test.todo('demo bands (F0-DATA): fallback 0.5–2 %, top user 80–92 %, Sept prompt mean ±15 % of 11.6k, class mix 25/7/5/4');
