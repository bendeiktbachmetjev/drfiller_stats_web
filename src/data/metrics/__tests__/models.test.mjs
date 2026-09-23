import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../../dev/demoData.js';
import { loadAll } from '../../load.js';
import { buildDataset } from '../../buildDataset.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarizeHealth } from '../../core/health.js';
import { capacity } from '../../core/projection.js';
import { MODEL_ERAS } from '../../eras.js';
import { missingBasis } from '../shared.js';
import {
  computeModels, fallbackEmptyKey, fallbackReasonOf, HEATMAP_MIN_FORMS, latencyBands, slowCause, WAIT_EDGES,
} from '../models.js';
import { SCENARIO_NOW, makeScenario } from '../../__tests__/scenario.mjs';
import { benchmark, config, formRow, localMs, rawBundle, staticPrices } from '../../__tests__/fixtures.mjs';
import { has } from '../../../copy/index.js';
import { fmt } from '../../../format/format.js';

// P6 acceptance (§7): countOf shape, slow-cause order, scope independence, latency only for Year / All
// time, failures before / after event logging, heatmap threshold, the 404 risk, shared numbers (§6.3).

const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });
const last30 = (ds) => resolvePeriod('last30', ds.nowMs);

const datasetOf = (rows, { nowMs = SCENARIO_NOW, cfg = config() } = {}) =>
  buildDataset(rawBundle({ rows, config: cfg }), { nowMs, staticPrices, benchmark });

const demoDataset = async (scenario, nowMs) => {
  const api = makeDemoApi(nowMs, { scenario });
  return buildDataset(await loadAll({ demo: api, nowMs }), { nowMs, staticPrices, benchmark });
};

test('empty dataset: empty result without throwing; a basis for every headline key', () => {
  const empty = datasetOf([]);
  const result = computeModels(empty, last30(empty), scopeOf(empty));
  assert.equal(result.empty, true);
  assert.equal(result.headline.forms, 0);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
  assert.equal(result.answer[0].key, 'models.answer.noForms');
  assert.equal(computeModels(null, null, null).empty, true);

  const { ds } = makeScenario();
  const full = computeModels(ds, last30(ds), scopeOf(ds));
  assert.equal(full.empty, false);
  assert.deepEqual(missingBasis(full.headline, full.basis), []);
  assert.ok(full.answer.length >= 1 && full.answer.length <= 3);
});

test('fallback "8 of 735": counted among forms since 02.09 and shown with countOf', () => {
  const rows = [];
  for (let i = 0; i < 735; i += 1) {
    const day = 2 + (i % 20);
    const when = `2026-09-${String(day).padStart(2, '0')} ${String(8 + (i % 9)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`;
    rows.push(i < 8 ? formRow(when, { model: 'gemini-3.5-flash-lite', durMs: 28000 }) : formRow(when));
  }
  rows.push(formRow('2026-09-01 10:00', { model: 'gemini-3.5-flash-lite', durMs: 4000 })); // test day: not eligible
  const ds = datasetOf(rows);
  const period = resolvePeriod('month', ds.nowMs);
  const { headline, basis, tables } = computeModels(ds, period, scopeOf(ds));
  assert.equal(headline.fallbackCount, 8);
  assert.equal(headline.fallbackEligible, 735);
  assert.equal(fmt.countOf(headline.fallbackCount, headline.fallbackEligible), '8 of 735');
  assert.equal(basis.fallbackCount, 'estimate', 'recognised by name and dates until B2 marks it');
  assert.equal(tables.fallbackEvents.length, 8);
  assert.ok(tables.fallbackEvents.every((row) => row.reason === 'silent'));
  assert.ok(tables.fallbackEvents.every((row, i, list) => i === 0 || list[i - 1].t >= row.t), 'newest first');
});

test('slow-cause rules apply in order', () => {
  const e3 = MODEL_ERAS.find((era) => era.id === 'e3');
  const sept = localMs('2026-09-10 09:00');
  const row = (overrides) => ({ t: sept, role: 'main', durMs: 16000, inTok: 10000, outTok: 900, endpoint: 'direct', fallbackReason: null, ...overrides });

  assert.deepEqual(
    [
      row({ role: 'fallback', fallbackReason: 'http_503', durMs: 6000 }),
      row({ role: 'fallback', durMs: 28000, inTok: 30000 }),
      row({ role: 'fallback', durMs: 6000 }),
      row({ t: e3.fromMs + 3600000, endpoint: 'vertex', inTok: 30000 }),
      row({ t: e3.fromMs + 3600000, endpoint: 'direct', inTok: 30000 }), // B2 says direct: not the era's setup
      row({ inTok: 25000, outTok: 2000 }),
      row({ outTok: 2000 }),
      row({ durMs: 20000, outTok: 1000 }), // 50 tokens a second
      row({ durMs: 16000, outTok: 1400 }), // 87.5 tokens a second
    ].map((r) => slowCause(r).cause),
    ['fallbackReason', 'fallbackSilent', 'fallbackError', 'era', 'bigRequest', 'bigRequest', 'longAnswer', 'slowModel', 'unclear'],
  );
  assert.equal(slowCause(row({ t: e3.fromMs + 3600000, endpoint: 'vertex' })).era, 'vertexEu');
  assert.equal(slowCause(row({ durMs: 20000, outTok: 1000 })).tokensPerSec, 50);

  assert.deepEqual(fallbackReasonOf({ durMs: 6000, fallbackReason: 'timeout' }), { reason: 'b2', kind: 'timeout' });
  assert.deepEqual(fallbackReasonOf({ durMs: 27000, fallbackReason: null }, 25000), { reason: 'silent', kind: null });
  assert.deepEqual(fallbackReasonOf({ durMs: 12000, fallbackReason: null }, 25000), { reason: 'error', kind: null });

  const { ds } = makeScenario();
  const { tables } = computeModels(ds, resolvePeriod('allTime', ds.nowMs), scopeOf(ds));
  assert.ok(tables.slow.length > 0 && tables.slow.every((r) => r.durMs > 15000));
  assert.equal(tables.slow.find((r) => r.role === 'fallback').cause, 'fallbackSilent');
});

test('service numbers ignore the scope switch; shared numbers are the core values (===)', () => {
  const { ds } = makeScenario();
  ['last30', 'allTime'].forEach((preset) => {
    const period = resolvePeriod(preset, ds.nowMs);
    const on = computeModels(ds, period, scopeOf(ds, true));
    const off = computeModels(ds, period, scopeOf(ds, false));
    assert.deepEqual(on.headline, off.headline, preset);
    assert.deepEqual(on.tables.slow, off.tables.slow);
    assert.deepEqual(on.tables.waitHist, off.tables.waitHist);

    const health = summarizeHealth(ds, period);
    assert.equal(on.headline.p50Ms, health.p50Ms);
    assert.equal(on.headline.over15Share, health.over15Share);
    assert.equal(on.headline.fallbackCount, health.fallbackCount);
    assert.equal(on.headline.serviceFailures, health.serviceFailures);
  });
  const { tables } = computeModels(ds, last30(ds), scopeOf(ds));
  const soniox = tables.risks.find((row) => row.key === 'sonioxLimit');
  const cap = capacity(ds, { planning: ds.settings.planning }).soniox;
  assert.equal(soniox.values.meanDoctors, cap.meanDoctors);
  assert.equal(soniox.values.limitDoctors, cap.limitDoctors);
  assert.equal(soniox.values.limit, cap.limit);
});

test('wait histogram: 9 fixed buckets holding every form; p50 / p90 points need 5 forms', () => {
  const { ds } = makeScenario();
  const period = resolvePeriod('allTime', ds.nowMs);
  const { tables, series, headline } = computeModels(ds, period, scopeOf(ds));
  assert.equal(tables.waitHist.length, WAIT_EDGES.length);
  assert.equal(tables.waitHist.reduce((acc, row) => acc + row.count, 0), headline.forms);
  assert.deepEqual(tables.waitHist.filter((row) => row.slow).map((row) => row.fromMs), [15000, 20000, 25000, 30000]);
  assert.equal(tables.waitHist.find((row) => row.fallbackBar).fromMs, 25000);
  series.forEach((row) => {
    if (row.forms < 5) assert.equal(row.p50Ms, null, row.key);
  });
});

test('latency by month is drawn only for Year and All time', () => {
  const { ds } = makeScenario();
  const lengths = Object.fromEntries(
    ['last7', 'last30', 'month', 'year', 'allTime'].map((preset) => [preset, computeModels(ds, resolvePeriod(preset, ds.nowMs), scopeOf(ds)).tables.latency.length]),
  );
  assert.equal(lengths.last7, 0);
  assert.equal(lengths.last30, 0);
  assert.equal(lengths.month, 0);
  assert.ok(lengths.year > 0 && lengths.allTime > 0);
  const allTime = computeModels(ds, resolvePeriod('allTime', ds.nowMs), scopeOf(ds));
  assert.deepEqual(latencyBands(allTime.tables.latency).map((band) => [band.fromKey, band.toKey, band.era]), [['2026-08', '2026-09', 'vertexEu']]);
  assert.deepEqual(allTime.notes.map((note) => note.key), ['models.note.vertexEra', 'models.note.testDay']);

  // A B2 row that says "direct" inside the Vertex-EU week did not run on that setup: no note.
  const direct = datasetOf([formRow('2026-08-28 10:00', { endpoint: 'direct', fallbackUsed: false })]);
  assert.deepEqual(computeModels(direct, resolvePeriod('allTime', direct.nowMs), scopeOf(direct)).notes, []);
});

test('failures: not recorded before the first event row (proxies), service / refusal split after', async () => {
  const { ds } = makeScenario();
  const august = resolvePeriod('month', ds.nowMs, { offset: -1 });
  const before = computeModels(ds, august, scopeOf(ds));
  assert.equal(before.headline.serviceFailures, null);
  assert.equal(before.basis.serviceFailures, 'missing');
  assert.deepEqual(before.tables.failuresRecent, []);
  assert.deepEqual(before.tables.proxies.map((row) => row.key), ['fallback', 'over25', 'maxTokens', 'emptyDictation', 'reconnects']);
  assert.ok(before.series.every((row) => row.serviceFailures === null));

  const noEvents = datasetOf([formRow('2026-09-20 09:00')]);
  const off = computeModels(noEvents, last30(noEvents), scopeOf(noEvents));
  assert.equal(off.headline.serviceFailures, null);
  assert.equal(off.answer.at(-1).key, 'models.answer.risk404', 'the 404 risk comes first');

  const after = computeModels(ds, last30(ds), scopeOf(ds));
  assert.equal(after.headline.serviceFailures, 1);
  assert.equal(after.headline.refusals, 1);
  assert.deepEqual(after.tables.failuresByKind.map((row) => row.kind), ['timeout']);
  assert.deepEqual(after.tables.refusalsByKind.map((row) => row.kind), ['no_credits']);
  assert.deepEqual(after.tables.failuresRecent.map((row) => [row.activity, row.group]), [['dictation', 'refusal'], ['form', 'service']]);

  // The demo "today" gets its first failures after 23.09 11:23: one service failure and one refusal.
  const demo = await demoDataset('today', Date.parse('2026-09-23T12:30:00Z'));
  const demoAfter = computeModels(demo, resolvePeriod('last7', demo.nowMs), scopeOf(demo));
  assert.equal(demoAfter.headline.serviceFailures, 1);
  assert.equal(demoAfter.headline.refusals, 1);
  const demoBefore = computeModels(demo, resolvePeriod('month', demo.nowMs, { offset: -1 }), scopeOf(demo));
  assert.equal(demoBefore.headline.serviceFailures, null);
});

test('the failure rate in the answer: n of N requests since logging began', async () => {
  const demo = await demoDataset('planned', Date.parse('2026-09-23T07:30:00Z'));
  const period = resolvePeriod('last30', demo.nowMs);
  const withFallback404 = { ...demo, config: { ...demo.config, gemini: { ...demo.config.gemini, fallbackOn404: true } } };
  const result = computeModels(withFallback404, period, scopeOf(demo));
  const line = result.answer.find((item) => item.key === 'models.answer.failures');
  assert.ok(line, 'with the 404 fallback on, the third line reports failures');
  const health = summarizeHealth(demo, period);
  assert.equal(line.values.n, health.serviceFailures);
  assert.ok(Math.abs(line.values.n / line.values.N - health.serviceFailureRate) < 1e-12);
});

test('heatmap needs 200 forms; the takeaway names the busiest hour', async () => {
  const { ds } = makeScenario();
  const small = computeModels(ds, last30(ds), scopeOf(ds));
  assert.ok(small.headline.forms < HEATMAP_MIN_FORMS);
  assert.deepEqual(small.tables.heatmap, []);
  assert.equal(small.takeaways.heatmap, undefined);

  const demo = await demoDataset('today', Date.parse('2026-09-23T07:30:00Z'));
  const big = computeModels(demo, last30(demo), scopeOf(demo));
  assert.ok(big.headline.forms >= HEATMAP_MIN_FORMS);
  assert.equal(big.tables.heatmap.length, 7);
  assert.ok(big.tables.heatmap.every((row) => row.counts.length === 17));
  const [, day] = big.takeaways.heatmap.values.day;
  const hour = Number(big.takeaways.heatmap.values.hour);
  const cell = big.tables.heatmap[day - 1].counts[hour - 6];
  assert.equal(cell, Math.max(...big.tables.heatmap.flatMap((row) => row.counts)));
  assert.ok(Math.abs(big.takeaways.heatmap.values.share[1] - cell / big.tables.heatmap[day - 1].total) < 1e-12);
});

test('risk of the trial-version main model: attention while a 404 does not switch to the backup, protected after', () => {
  const open = makeScenario().ds;
  const risksOpen = computeModels(open, last30(open), scopeOf(open)).tables.risks;
  assert.equal(risksOpen[0].key, 'main', 'attention rows come first');
  assert.equal(risksOpen[0].tone, 'attention');
  assert.equal(risksOpen[0].status, 'previewOpen');

  const safe = makeScenario({ mutate: (raw) => { raw.config.gemini.fallbackOn404 = true; } }).ds;
  const result = computeModels(safe, last30(safe), scopeOf(safe));
  const main = result.tables.risks.find((row) => row.key === 'main');
  assert.equal(main.tone, 'neutral');
  assert.equal(main.status, 'previewSafe');
  assert.equal(main.happens, 'mainGoneSafe');
  assert.ok(!result.answer.some((item) => item.key === 'models.answer.risk404'));
  assert.equal(result.tables.nowCard.find((row) => row.key.startsWith('models.now.fallback')).key, 'models.now.fallback404');

  const dated = result.tables.risks.filter((row) => row.tone !== 'attention' && row.date);
  assert.deepEqual(dated.map((row) => row.date), [...dated.map((row) => row.date)].sort(), 'then by date');
  assert.ok(result.tables.risks.some((row) => row.what === 'priceRise' && row.models.includes('gemini-3.8-flash')));
});

test('fallback table empty text names the start of the backup model', () => {
  assert.equal(fallbackEmptyKey(resolvePeriod('month', SCENARIO_NOW, { offset: -1 })), 'models.fallbackEvents.before');
  assert.equal(fallbackEmptyKey(resolvePeriod('last30', SCENARIO_NOW)), 'models.fallbackEvents.empty');
});

test('every copy key the page builds from metric values exists; no email or uid in the output', async () => {
  const demo = await demoDataset('planned', Date.parse('2026-09-23T07:30:00Z'));
  const { ds } = makeScenario();
  const results = [computeModels(ds, resolvePeriod('allTime', ds.nowMs), scopeOf(ds)), computeModels(demo, last30(demo), scopeOf(demo))];
  const keys = new Set();
  results.forEach((result) => {
    [...result.answer, ...result.notes, ...result.tables.nowCard, ...Object.values(result.takeaways)].forEach((item) => keys.add(item.key));
    result.tables.slow.forEach((row) => {
      keys.add(`models.cause.${row.cause}`);
      if (row.reason) keys.add(`models.reason.${row.reason}`);
      if (row.era) keys.add(`models.era.${row.era}`);
    });
    result.tables.fallbackEvents.forEach((row) => keys.add(row.reason === 'b2' ? `models.reason.${row.kind}` : `models.fbReason.${row.reason}`));
    result.tables.modelTable.forEach((row) => keys.add(`models.role.${row.role}`));
    result.tables.eras.forEach((row) => row.note && keys.add(`models.eraNote.${row.note}`));
    result.tables.failuresRecent.forEach((row) => keys.add(`models.activity.${row.activity}`));
    result.tables.proxies.forEach((row) => keys.add(`models.proxy.${row.key}`));
    result.tables.risks.forEach((row) => {
      if (row.what !== 'priceRise') keys.add(`models.risk.what.${row.what}`);
      keys.add(`models.risk.status.${row.status}`);
      if (['notAnnounced', 'notBefore', 'doctors', 'noLive'].includes(row.dateKind)) keys.add(`models.risk.date.${row.dateKind}`);
      if (row.happens) keys.add(`models.risk.happens.${row.happens}`);
      if (row.todo) keys.add(`models.risk.todo.${row.todo}`);
    });
    const json = JSON.stringify(result);
    assert.ok(!json.includes('@'), 'no email in the metric output');
    assert.ok(!/\b[A-Za-z0-9]{28}\b/.test(json), 'no uid-like token');
  });
  ['timeout', 'http_429', 'http_500', 'http_503', 'http_504', 'overloaded', 'model_not_found', 'unknown'].forEach((kind) => keys.add(`models.reason.${kind}`));
  ['vertexEu', 'testDay', 'test'].forEach((era) => keys.add(`models.era.${era}`));
  ['main', 'fallback', 'switch'].forEach((role) => keys.add(`models.role.${role}`));
  ['form', 'dictation', 'live', 'anamnesis', 'other'].forEach((activity) => keys.add(`models.activity.${activity}`));
  const missing = [...keys].filter((key) => !has(key));
  assert.deepEqual(missing, []);
});
