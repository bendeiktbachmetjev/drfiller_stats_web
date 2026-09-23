import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../buildDataset.js';
import { resolvePeriod } from '../period.js';
import { makeScope } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { summarizeHealth } from '../core/health.js';
import { summarizeToday } from '../core/today.js';
import { computeAlerts, isWorkingDay, previousWorkingDay } from '../core/alerts.js';
import { normalizeUsageRows } from '../normalize/usage.js';
import { benchmark, config, dictationRow, formRow, localMs, rawBundle, revenue, staticPrices } from './fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from './scenario.mjs';

// §5.3.12 today: the live strip counts today's rows with the page code (D20); alerts (§3.10).

const close = (a, b, eps = 1e-12, message = '') => assert.ok(Math.abs(a - b) <= eps, `${message} ${a} ≈ ${b}`.trim());

test('summarizeToday on the scenario day equals summarize / summarizeHealth of that day', () => {
  const { ds } = makeScenario();
  const todayRows = ds.rows.filter((row) => row.dayKey === '2026-09-23');
  const today = summarizeToday(todayRows, ds, SCENARIO_NOW);
  const day = resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-09-23', to: '2026-09-23' } });
  const summary = summarize(ds, day, makeScope({ excludeInternal: false, settings: ds.settings }));
  const health = summarizeHealth(ds, day);
  assert.equal(today.dayKey, '2026-09-23');
  assert.equal(today.forms, summary.counts.forms);
  assert.equal(today.fallback, health.fallbackCount);
  assert.equal(today.over15, health.over15);
  close(today.recordingMinutes, summary.minutes.total);
  close(today.costEur, summary.cost.variableEur);
  assert.equal(today.conversations, 1);
  assert.equal(today.lastAt.form, localMs('2026-09-23 10:10'));
});

test('failures of the last hour: service and refusals apart; null before event logging exists', () => {
  const { ds } = makeScenario();
  const today = summarizeToday(ds.rows.filter((row) => row.dayKey === '2026-09-23'), ds, SCENARIO_NOW);
  assert.equal(today.serviceFailuresLastHour, 1);
  assert.equal(today.refusalsLastHour, 1);
  const later = summarizeToday(ds.rows, ds, localMs('2026-09-23 15:30'));
  assert.deepEqual([later.serviceFailuresLastHour, later.refusalsLastHour], [0, 0], 'older than an hour');

  const quiet = buildDataset(rawBundle({ rows: [formRow('2026-09-23 09:00')] }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  const quietToday = summarizeToday(quiet.rows, quiet, SCENARIO_NOW);
  assert.equal(quietToday.serviceFailuresLastHour, null);
  assert.equal(quietToday.refusalsLastHour, null);
  assert.equal(summarizeToday([], quiet, SCENARIO_NOW).forms, 0);
});

test('OpenAI dictations count only after Soniox took over', () => {
  const rows = normalizeUsageRows(
    [dictationRow('2026-09-23 09:00', { model: 'gpt-4o-mini-transcribe-2025-12-15', provider: 'openai' }), dictationRow('2026-09-23 09:10')],
    { config: config(), prices: staticPrices, fx: { usdPerEur: 1.1463 } },
  ).rows;
  const today = summarizeToday(rows, null, SCENARIO_NOW);
  assert.deepEqual([today.dictations, today.openaiDictations], [2, 1]);
});

const liveNow = (openCount = 0) => ({ now: SCENARIO_NOW, dayKey: '2026-09-23', liveEnabled: true, openCount, startedToday: 0, open: [], limits: { streamsDefault: 10, maxOpenPerDoctor: 2, maxSessionSeconds: 3600, dailyCap: 20 }, todayRows: [] });

test('alerts: attention first, rule order, at most 3; keys and links of §3.10', () => {
  const { ds } = makeScenario();
  const today = {
    ...summarizeToday([], ds, SCENARIO_NOW),
    forms: 20, over15: 3, fallback: 4, serviceFailuresLastHour: 3, openaiDictations: 2, anamnesisCostUsd: 21,
  };
  const alerts = computeAlerts({ ds, today, live: liveNow(9), nowMs: SCENARIO_NOW });
  assert.deepEqual(alerts.map((a) => a.key), ['notCredited', 'fallbackToday', 'slowToday']);
  assert.deepEqual(alerts[0], {
    key: 'notCredited', tone: 'attention', values: { n: 1, payments: { key: 'common.unit.payment.one' } }, link: '/money#payments',
  });
  assert.deepEqual(alerts[2].values, { pct: ['pct', 0.15] });

  const calm = computeAlerts({ ds, today: summarizeToday([], ds, SCENARIO_NOW), live: liveNow(0), nowMs: SCENARIO_NOW });
  assert.deepEqual(calm.map((a) => a.key), ['notCredited']);
  const noStripe = makeScenario({ mutate: (raw) => { raw.revenue = null; raw.sources.revenue = { status: 'error', fetchedAt: null, cacheAgeMs: null }; } }).ds;
  const quiet = computeAlerts({ ds: noStripe, today: null, live: null, nowMs: SCENARIO_NOW });
  assert.deepEqual(quiet.map((a) => [a.key, a.tone]), [['revenueDown', 'quiet']]);
});

test('alerts: live near the limit, anamnesis cap, OpenAI dictations, test mode, stale prices, shutdown dates', () => {
  const { ds } = makeScenario({
    mutate: (raw) => {
      raw.revenue = revenue([], { livemode: false });
      raw.config = config({ transcription: { ...config().transcription, openaiModel: 'gpt-4o-mini-transcribe-2025-03-20' } });
    },
  });
  const base = summarizeToday([], ds, SCENARIO_NOW);
  const keys = (today, live, nowMs = SCENARIO_NOW) => computeAlerts({ ds, today, live, nowMs }).map((a) => a.key);
  assert.deepEqual(keys(base, liveNow(8)), ['stripeTestMode', 'liveNearLimit']);
  assert.deepEqual(keys({ ...base, anamnesisCostUsd: 20, openaiDictations: 2 }, liveNow(0)), ['stripeTestMode', 'anamCap', 'openaiDictation']);
  assert.deepEqual(keys(base, null, localMs('2026-12-05 09:00')), ['stripeTestMode', 'lifecycleSoon', 'pricesStale']);
  const lifecycle = computeAlerts({ ds, today: base, live: null, nowMs: localMs('2026-12-05 09:00') }).find((a) => a.key === 'lifecycleSoon');
  assert.deepEqual(lifecycle.values, { d: 46, model: ['model', 'gpt-4o-mini-transcribe-2025-03-20'] });
});

test('alerts: silence only on a working day after a busy working day, 11:00–18:00', () => {
  assert.equal(isWorkingDay('2026-09-21'), true);
  assert.equal(isWorkingDay('2026-09-26'), false, 'Saturday');
  assert.equal(isWorkingDay('2026-11-02'), false, 'All Souls Day');
  assert.equal(previousWorkingDay('2026-09-21'), '2026-09-18', 'Monday → Friday');
  assert.equal(previousWorkingDay('2026-11-03'), '2026-10-30', 'over the weekend and 02.11');
  const busyFriday = Array.from({ length: 10 }, (_, i) => formRow(localMs('2026-09-18 09:00') + i * 60000));
  const ds = buildDataset(rawBundle({ rows: busyFriday }), { nowMs: localMs('2026-09-21 12:00'), staticPrices, benchmark });
  const silent = (nowMs) => computeAlerts({ ds, today: summarizeToday([], ds, nowMs), live: null, nowMs }).map((a) => a.key);
  assert.deepEqual(silent(localMs('2026-09-21 12:00')), ['silence']);
  assert.deepEqual(silent(localMs('2026-09-21 10:59')), [], 'before 11:00');
  assert.deepEqual(silent(localMs('2026-09-22 12:00')), [], 'Monday had no forms');
});
