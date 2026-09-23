import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../../dev/demoData.js';
import { loadAll } from '../../load.js';
import { buildDataset } from '../../buildDataset.js';
import { resolvePeriod, previousPeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { unitEconomics } from '../../core/unitEconomics.js';
import { capacity } from '../../core/projection.js';
import { COLORS } from '../../../charts/theme.js';
import { MINUTES_SERIES, PROVIDER_COLORS } from '../../../pages/recording/series.js';
import { SCENARIO_NOW, makeScenario } from '../../__tests__/scenario.mjs';
import { PID, benchmark, liveRow, localMs, rawBundle, staticPrices } from '../../__tests__/fixtures.mjs';
import { missingBasis } from '../shared.js';
import { chartIsThin, computeRecording, creditsDeltaHidden, isThin, peakOverlap, peakStreams, withRecordingRows } from '../recording.js';

// §7 P5: thin rule, peak overlap, capacity numbers, credits delta across the billing era, the 10-minute unit
// from unitEconomics, series colours; plus the §4.0 page contract (basis per headline, empty dataset, === core).

const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });
const planningOf = (ds) => ds.settings.planning;

const demoDataset = async (scenario, nowMs = Date.parse('2026-09-23T12:30:00Z')) => {
  const raw = await loadAll({ demo: makeDemoApi(nowMs, { scenario }), nowMs });
  return buildDataset(raw, { nowMs, staticPrices, benchmark });
};

test('an empty dataset gives empty: true without throwing; no dataset gives EMPTY_RESULT', () => {
  const ds = buildDataset(rawBundle(), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const result = computeRecording(ds, period, scopeOf(ds));
  assert.equal(result.empty, true);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
  assert.equal(result.headline.peakStreams, 0, 'the period reaches the live era: 0 of 10, not "—"');
  assert.equal(result.answer[0].key, 'recording.answer.thin');
  assert.equal(computeRecording(null, period, null).empty, true);
});

test('every headline key has a basis and shared headlines are the core values (===)', () => {
  const { ds } = makeScenario();
  ['last30', 'allTime', 'last7'].forEach((preset) => {
    [true, false].forEach((excludeInternal) => {
      const period = resolvePeriod(preset, SCENARIO_NOW);
      const scope = scopeOf(ds, excludeInternal);
      const result = computeRecording(ds, period, scope);
      const summary = summarize(ds, period, scope);
      const live10 = unitEconomics(ds, period, scope).perCredit.live10;
      const cap = capacity(ds, { planning: planningOf(ds) });
      assert.deepEqual(missingBasis(result.headline, result.basis), [], preset);
      assert.equal(result.headline.minutes, summary.minutes.total);
      assert.equal(result.headline.credits, summary.creditsSpent.recording);
      assert.equal(result.headline.cost, summary.cost.byFeature.dictation + summary.cost.byFeature.live);
      assert.equal(result.headline.cost10Eur, live10.costEur);
      assert.equal(result.headline.net1Eur, live10.netEur);
      assert.equal(result.headline.left10Eur, live10.leftEur);
      assert.equal(result.headline.margin10, live10.shareLeft);
      assert.equal(result.headline.meanDoctors, cap.soniox.meanDoctors);
      assert.equal(result.headline.safeDoctors, cap.soniox.limitDoctors);
    });
  });
});

test('meanDoctors 14 and safeDoctors 11 with the default plan; the answer names them', () => {
  const { ds } = makeScenario();
  const result = computeRecording(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  assert.equal(result.headline.meanDoctors, 14);
  assert.equal(result.headline.safeDoctors, 11);
  const limit = result.answer.find((item) => item.key === 'recording.answer.limit');
  assert.deepEqual(limit.values, { limit: 10, mean: 14, safe: 11 });
  const rows = Object.fromEntries(result.tables.limit.map((row) => [row.key, row]));
  assert.equal(rows.mean.doctors, 14);
  assert.equal(rows.safe.doctors, 11);
  assert.equal(rows.safe.enough, true);
  assert.equal(rows.mean.enough, false, '14 doctors: the busy hours go over 10');
  assert.deepEqual([rows.s0.doctors, rows.s0.p95, rows.s0.enough], [100, 79, false]);
  assert.deepEqual([rows.s1.doctors, rows.s1.p95, rows.s1.enough], [300, 227, false]);
});

test('the 10-minute unit comes from unitEconomics().perCredit.live10 (C.3: €0.0185 cost, pack 1500 net €0.0294)', () => {
  const { ds } = makeScenario();
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const result = computeRecording(ds, period, scopeOf(ds));
  assert.ok(Math.abs(result.headline.cost10Eur - 10 * (0.001745 + 0.000109)) < 0.0002, String(result.headline.cost10Eur));
  assert.ok(Math.abs(result.headline.net1Eur - 0.02938) < 0.0003);
  const unit = result.answer.find((item) => item.key === 'recording.answer.unit');
  assert.deepEqual(unit.values.cost10, ['eurUnit', result.headline.cost10Eur]);
  assert.deepEqual(unit.values.net1, ['eurUnit', result.headline.net1Eur]);
  assert.deepEqual(unit.values.left, ['eurUnit', result.headline.left10Eur]);
  const vat = computeRecording(ds, period, { ...scopeOf(ds), vatPayer: true });
  assert.ok(vat.headline.net1Eur < result.headline.net1Eur, 'the VAT setting lowers what a credit brings');
  assert.equal(vat.headline.cost10Eur, result.headline.cost10Eur, 'VAT never changes costs');
});

test('thin rule: fewer than 20 recordings since 22.09 17:00 → the sentence with the dates; the chart waits too', () => {
  const { ds } = makeScenario();
  const last30 = resolvePeriod('last30', SCENARIO_NOW);
  const result = computeRecording(ds, last30, scopeOf(ds));
  assert.equal(result.headline.recordingsSinceSoniox, 2, 'one Soniox dictation + one conversation');
  assert.deepEqual(result.answer[0], { key: 'recording.answer.thin', values: { n: 2 }, tone: 'neutral' });
  assert.equal(chartIsThin(last30, 2), true);
  assert.equal(result.tables.recordings.length, 2, 'every recording is listed under the sentence');
  const allTime = resolvePeriod('allTime', SCENARIO_NOW);
  assert.equal(chartIsThin(allTime, 2), false, '"Show all time" draws the OpenAI history');
  assert.equal(isThin(allTime, 2), true, 'the answer still says it is too early');
  const august = resolvePeriod('month', SCENARIO_NOW, { offset: -1 });
  assert.equal(isThin(august, 0), false, 'a period before Soniox has no thin sentence');
  assert.equal(isThin(last30, 20), false);
  assert.equal(computeRecording(ds, august, scopeOf(ds)).answer[0].key, 'recording.answer.volume');
});

test('the planned scenario draws the chart and fills the tables', async () => {
  const ds = await demoDataset('planned');
  const period = resolvePeriod('last30', ds.nowMs);
  const result = computeRecording(ds, period, scopeOf(ds));
  assert.equal(result.empty, false);
  assert.equal(result.answer[0].key, 'recording.answer.volume');
  assert.equal(chartIsThin(period, result.headline.recordingsSinceSoniox), false);
  assert.ok(result.series.filter((row) => row.live > 0).length >= 3, 'at least 3 non-zero buckets');
  assert.ok(result.headline.peakStreams > 10, 'a hundred doctors run more conversations than Soniox allows');
  const now = result.tables.limit.find((row) => row.key === 'now');
  assert.equal(now.enough, false);
  assert.ok(result.tables.sessions.length > 1000);
  assert.ok(result.tables.sessions[0].t >= result.tables.sessions[1].t, 'newest first');
  const json = JSON.stringify(result);
  assert.ok(!/\b[A-Za-z0-9]{28}\b/.test(json), 'no uid-like token');
  assert.ok(!json.includes('@'), 'no email in the metric (the page resolves names)');
});

test('the demo "today" scenario is thin in 30 days and every source row has a place', async () => {
  const ds = await demoDataset('today');
  const period = resolvePeriod('last30', ds.nowMs);
  const result = computeRecording(ds, period, scopeOf(ds));
  assert.equal(result.answer[0].key, 'recording.answer.thin');
  assert.equal(chartIsThin(period, result.headline.recordingsSinceSoniox), true);
  assert.ok(result.tables.reconcile.length > 0, 'Soniox days to check against');
  const confirmed = result.tables.sessions.filter((row) => row.confirmedMin !== null);
  assert.equal(confirmed.length, result.tables.sessions.length, 'every conversation matched in Soniox by its reference');
});

test('peak overlap: [t − length, t] intervals; touching ones do not overlap', () => {
  assert.equal(peakOverlap([]), 0);
  assert.equal(peakOverlap([[0, 10], [5, 15], [8, 20], [30, 40]]), 3);
  assert.equal(peakOverlap([[0, 10], [10, 20]]), 1, 'one ends as the next starts');
  assert.equal(peakOverlap([[0, 10], [0, 10]]), 2);
  const at = (text, min) => ({ t: localMs(text), audioSec: min * 60 });
  // 10:00–10:15, 10:10–10:30, 10:12–10:20 → three at 10:12; 11:00–11:05 alone.
  assert.equal(peakStreams([at('2026-09-23 10:15', 15), at('2026-09-23 10:30', 20), at('2026-09-23 10:20', 8), at('2026-09-23 11:05', 5)]), 3);

  const { ds } = makeScenario({
    mutate: (raw) => {
      raw.usage.rows.push(
        liveRow('2026-09-23 12:00', { audioSec: 1200, pid: PID.payer }),
        liveRow('2026-09-23 12:10', { audioSec: 1200, pid: PID.gifted }),
      );
    },
  });
  const result = computeRecording(ds, resolvePeriod('last7', SCENARIO_NOW), scopeOf(ds));
  assert.equal(result.headline.peakStreams, 2, '11:40–12:00 and 11:50–12:10 overlap');
  assert.equal(result.headline.conversations, 3);
});

test('service numbers count all traffic; business numbers follow the switch', () => {
  const { ds } = makeScenario({
    mutate: (raw) => {
      raw.usage.rows.push(liveRow('2026-09-23 12:30', { audioSec: 600, pid: PID.internal }));
    },
  });
  const period = resolvePeriod('last7', SCENARIO_NOW);
  const hidden = computeRecording(ds, period, scopeOf(ds, true));
  const shown = computeRecording(ds, period, scopeOf(ds, false));
  assert.equal(shown.headline.minutes - hidden.headline.minutes, 10, 'the internal conversation is business volume');
  ['conversations', 'peakStreams', 'sonioxShare', 'carriedMin', 'meanDoctors'].forEach((key) =>
    assert.equal(hidden.headline[key], shown.headline[key], key),
  );
  assert.deepEqual(hidden.tables.sessions, shown.tables.sessions);
});

test('credits Δ is hidden when the two periods were billed by different rules', () => {
  const last30 = resolvePeriod('last30', SCENARIO_NOW);
  assert.equal(creditsDeltaHidden(last30, previousPeriod(last30)), true, 'this period reaches the minute meter, the one before does not');
  const august = resolvePeriod('month', SCENARIO_NOW, { offset: -1 });
  assert.equal(creditsDeltaHidden(august, previousPeriod(august)), false, 'July against August: the same old rule');
  const soon = resolvePeriod('last30', SCENARIO_NOW + 20 * 86400000);
  assert.equal(creditsDeltaHidden(soon, previousPeriod(soon)), true, 'mostly the meter now, only the old rule before');
  const later = resolvePeriod('last30', SCENARIO_NOW + 60 * 86400000);
  assert.equal(creditsDeltaHidden(later, previousPeriod(later)), false, 'both windows on the minute meter');
  assert.equal(creditsDeltaHidden(last30, null), false, 'nothing to compare with');
});

test('series: minutes per bucket in the colours rec / rec-light / fallback', () => {
  const { ds } = makeScenario();
  const period = resolvePeriod('allTime', SCENARIO_NOW);
  const result = computeRecording(ds, period, scopeOf(ds, false));
  const total = (field) => result.series.reduce((acc, row) => acc + (row[field] ?? 0), 0);
  assert.equal(total('live'), 15);
  assert.equal(total('dictationSoniox'), 2);
  assert.ok(Math.abs(total('dictationOpenai') - 1.5) < 1e-9, 'the OpenAI dictation with bytes only: 90 s from the file size');
  assert.deepEqual(
    MINUTES_SERIES.map((s) => [s.key, s.color]),
    [['live', COLORS.rec], ['dictationSoniox', COLORS['rec-light']], ['dictationOpenai', COLORS.fallback]],
  );
  assert.deepEqual(PROVIDER_COLORS, { soniox: COLORS.rec, openai: COLORS.fallback });
  assert.equal(result.takeaways.minutesChart.key, 'recording.take.switch');
});

test('plan rows: recording cost = Soniox + OpenAI; income only in plan columns', () => {
  const { ds } = makeScenario();
  const result = computeRecording(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  const { columns } = result.projection;
  ['now', 'doctor', 's0', 's1'].forEach((id) => assert.equal(columns[id].recordingCostEur, columns[id].costSonioxEur + columns[id].costOpenaiEur, id));
  assert.equal(columns.now.recordingIncomeEur, null, 'income is not split by feature');
  // One doctor, 400 visits × 15 min conversation = 600 credits for minutes at €0.02938 (C.3).
  assert.ok(Math.abs(columns.doctor.recordingIncomeEur - 600 * 0.02938) < 0.2, String(columns.doctor.recordingIncomeEur));
  assert.ok(Math.abs(columns.doctor.recordingCostEur - 400 * 15 * 0.001745) < 0.1);
  const bare = withRecordingRows({ scenario: { liveShare: 0, liveMin: 0, dictMin: 0 }, columns: { s0: { visits: 10, creditsSpent: 10, netEur: 1, costSonioxEur: 0, costOpenaiEur: 0 } } });
  assert.equal(bare.columns.s0.recordingIncomeEur, 0, 'typing only: nothing earned from recording');
});
