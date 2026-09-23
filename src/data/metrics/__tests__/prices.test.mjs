import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoApi } from '../../../dev/demoData.js';
import { loadAll } from '../../load.js';
import { buildDataset } from '../../buildDataset.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { planningOf, unitCosts } from '../../core/projection.js';
import { sectionById } from '../../../app/nav.js';
import { missingBasis } from '../shared.js';
import {
  BASE_COMBO_ID, CURATED_COMBOS, SAME_MODEL_CLOUD_ID, comboKey, computePrices, oursOf, pickCombos, priceWord, projectCombo, speedWord,
} from '../prices.js';
import { SCENARIO_NOW } from '../../__tests__/scenario.mjs';
import { benchmark, config, formRow, rawBundle, settings, staticPrices } from '../../__tests__/fixtures.mjs';
import { has } from '../../../copy/index.js';

// P9 acceptance (§7): the base option is ours (ratios 1); curated 9 rows, today's highlighted, sorted by price
// compared to now; the ± 10 % / ± 0.5 s words; "From 2027" doubles 3.6–3.8; the picks on the real benchmark
// (lower-bound rule, 2.5 Flash out by its hard shutdown); the summary card from projectCombo; no period picker.

const last30 = (ds) => resolvePeriod('last30', ds.nowMs);
const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });
const combo = (id) => benchmark.combos.find((c) => c.id === id);
const base = combo(BASE_COMBO_ID);

/** 30 September forms of the current setup (main model, Google API), 11,441 in / 986 out, 5.2 s. */
const septemberForms = (n = 30, overrides = {}) =>
  Array.from({ length: n }, (_, i) => formRow(`2026-09-${String(3 + (i % 20)).padStart(2, '0')} ${String(8 + (i % 9)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, overrides));

const datasetOf = (rows, { cfg = config(), set = settings() } = {}) =>
  buildDataset(rawBundle({ rows, config: cfg, settings: set }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });

const demoDataset = async (scenario) => {
  const api = makeDemoApi(SCENARIO_NOW, { scenario });
  return buildDataset(await loadAll({ demo: api, nowMs: SCENARIO_NOW }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
};

test('empty: null or no usage rows → empty without throwing; no test → empty; a basis for every headline key', () => {
  assert.equal(computePrices(null, null, null).empty, true);

  const none = datasetOf([]);
  const result = computePrices(none, last30(none), scopeOf(none));
  assert.equal(result.empty, true);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
  assert.equal(result.answer[0].key, 'prices.answer.noForms');
  assert.ok(result.tables.availability.length > 0, 'the test and price lists do not need our forms');

  const noTest = buildDataset(rawBundle({ rows: septemberForms() }), { nowMs: SCENARIO_NOW, staticPrices, benchmark: { meta: {}, availability: [], combos: [] } });
  assert.equal(computePrices(noTest, last30(noTest), scopeOf(noTest)).empty, true);

  const ds = datasetOf(septemberForms());
  const full = computePrices(ds, last30(ds), scopeOf(ds));
  assert.equal(full.empty, false);
  assert.deepEqual(missingBasis(full.headline, full.basis), []);
  assert.ok(full.answer.length >= 1 && full.answer.length <= 3);
});

test('projectCombo on the base option returns our own cost and time (ratios 1)', () => {
  const ds = datasetOf(septemberForms());
  const ours = oursOf(ds, base);
  assert.equal(ours.measured, true);
  assert.equal(ours.forms, 30);
  assert.equal(ours.inTok, 11441);
  assert.equal(ours.outTok, 986);
  assert.equal(ours.speedMs, 5200);
  const plan = planningOf(ds.settings.planning);
  const p = projectCombo(base, base, ours, ds.prices, ds.fx, { at: ds.nowMs, visits: plan.visitsPerDoctorMonth, scales: plan.doctorScales });
  assert.equal(p.priceRatio, 1);
  assert.equal(p.speedRatio, 1);
  assert.equal(p.eurPerForm, ours.eurPerForm);
  assert.equal(p.eurPerForm, unitCosts(ds, ds.settings.planning).formCostEur);
  assert.equal(p.expectedMs, 5200);
  assert.equal(p.speedDeltaMs, 0);
  assert.deepEqual(p.priceWord.kind, 'same');
  assert.deepEqual(p.speedWord.kind, 'same');
  // Appendix C.3: 11,441 / 986 tokens on the main model = $0.008679 = €0.007571.
  assert.ok(Math.abs(p.eurPerForm - 0.007571) < 0.000001, String(p.eurPerForm));
  assert.equal(p.perDoctorEur, p.eurPerForm * 400);
  assert.deepEqual(p.scaleEur, [p.eurPerForm * 400 * 100, p.eurPerForm * 400 * 300]);
});

test('the method: token shape ratios × list price; ×1.1 off "any country" only for stable models; speed = ours × ratio', () => {
  const ds = datasetOf(septemberForms());
  const ours = oursOf(ds, base);
  const at = { at: ds.nowMs };
  const lite = projectCombo(combo('gemini-3.5-flash-lite@eu'), base, ours, ds.prices, ds.fx, at);
  const inRatio = 9814 / 9329;
  const outRatio = 1260 / 1310;
  const usd = (11441 * inRatio * 0.33 + 986 * outRatio * 2.75) / 1e6;
  const baseUsd = (11441 * 0.5 + 986 * 3) / 1e6;
  assert.ok(Math.abs(lite.priceRatio - usd / baseUsd) < 1e-12);
  assert.ok(Math.abs(lite.expectedMs - 5200 * 0.78) < 1e-9);
  // The same model on "any country" keeps its price: no regional factor on a trial model.
  const same = projectCombo(combo(SAME_MODEL_CLOUD_ID), base, ours, ds.prices, ds.fx, at);
  const sameUsd = (11441 * (9814 / 9329) * 0.5 + 986 * (1225 / 1310) * 3) / 1e6;
  assert.ok(Math.abs(same.priceRatio - sameUsd / baseUsd) < 1e-12);
  // Thinking tokens count as answer: "thinks a little" on Google Cloud costs more than twice as much.
  const low = projectCombo(combo('gemini-3-flash-preview@global'), base, ours, ds.prices, ds.fx, at);
  assert.ok(low.priceRatio > 2, String(low.priceRatio));
});

test('price and speed words: ± 10 % and ± 0.5 s', () => {
  assert.equal(priceWord(1).kind, 'same');
  assert.equal(priceWord(1.099).kind, 'same');
  assert.equal(priceWord(0.901).kind, 'same');
  assert.equal(priceWord(1.1).kind, 'more');
  assert.equal(priceWord(3.49).kind, 'more');
  assert.equal(priceWord(0.9).kind, 'less');
  assert.ok(Math.abs(priceWord(0.78).cut - 0.22) < 1e-12);
  assert.equal(priceWord(null), null);
  assert.equal(speedWord(0).kind, 'same');
  assert.equal(speedWord(499).kind, 'same');
  assert.equal(speedWord(-499).kind, 'same');
  assert.deepEqual(speedWord(500), { kind: 'slower', ms: 500 });
  assert.deepEqual(speedWord(-745), { kind: 'faster', ms: 745 });
});

test('Options: curated 9 rows, today highlighted, sorted by price compared to now; filters; show all 23', () => {
  const ds = datasetOf(septemberForms());
  const { tables } = computePrices(ds, last30(ds), scopeOf(ds));
  assert.equal(tables.whatIf.length, 9);
  assert.deepEqual([...tables.whatIf.map((r) => r.id)].sort(), CURATED_COMBOS.map(comboKey).sort());
  const now = tables.whatIf.filter((r) => r.isBase);
  assert.equal(now.length, 1);
  assert.equal(now[0].id, comboKey(BASE_COMBO_ID));
  assert.equal(tables.whatIf.find((r) => r.isFallback).id, 'gemini-3.5-flash-lite/direct');
  const ratios = tables.whatIf.map((r) => r.priceRatio);
  assert.deepEqual(ratios, [...ratios].sort((a, b) => a - b), 'ascending price compared to now');
  assert.equal(tables.whatIfFiltered.length, 23);

  const all = computePrices(ds, last30(ds), scopeOf(ds), { showAll: true }).tables.whatIf;
  assert.equal(all.length, 23);

  const eu = computePrices(ds, last30(ds), scopeOf(ds), { filter: 'eu' }).tables;
  assert.ok(eu.whatIf.every((r) => r.eu || r.isBase), 'EU options plus today’s setup for comparison');
  assert.equal(eu.whatIf.filter((r) => r.eu).length, 4);
  assert.equal(eu.whatIfFiltered.length, 10);

  const clean = computePrices(ds, last30(ds), scopeOf(ds), { filter: 'noFailures', showAll: true }).tables.whatIf;
  assert.ok(clean.every((r) => r.failed === 0));
  assert.equal(clean.length, 23 - 5, 'five options left requests unanswered');
});

test('"From 2027" doubles the price of Gemini 3.6–3.8 and leaves the others alone', () => {
  const ds = datasetOf(septemberForms());
  const now = computePrices(ds, last30(ds), scopeOf(ds), { showAll: true }).tables.whatIf;
  const later = computePrices(ds, last30(ds), scopeOf(ds), { showAll: true, prices2027: true }).tables.whatIf;
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const a = byId(now);
  const b = byId(later);
  ['gemini-3.8-flash/direct', 'gemini-3.8-flash/eu', 'gemini-3.7-flash/eu', 'gemini-3.8-flash/global'].forEach((id) => {
    assert.ok(Math.abs(b.get(id).eurPerForm / a.get(id).eurPerForm - 2) < 1e-9, id);
    assert.ok(Math.abs(a.get(id).eurPerForm2027 / a.get(id).eurPerForm - 2) < 1e-9, `${id} 2027 column`);
  });
  ['gemini-3-flash-preview/direct', 'gemini-3.5-flash-lite/eu', 'gemini-3.5-flash/europe-west3'].forEach((id) => {
    assert.equal(b.get(id).eurPerForm, a.get(id).eurPerForm, id);
  });
  assert.equal(b.get(comboKey(BASE_COMBO_ID)).priceRatio, 1);
});

test('picks on the real benchmark: 3.8 Flash direct · 3.5 Flash-Lite EU only · 3.5 Flash Frankfurt', () => {
  const ds = datasetOf(septemberForms());
  const result = computePrices(ds, last30(ds), scopeOf(ds));
  assert.equal(result.headline.fastestId, 'gemini-3.8-flash/direct');
  assert.equal(result.headline.cheapestEuId, 'gemini-3.5-flash-lite/eu');
  assert.equal(result.headline.bestEuId, 'gemini-3.5-flash/europe-west3');

  // Lower-bound rule: 3.5 Flash's Google Cloud "not before 19 May 2027" does not exclude it; 2.5 Flash in Frankfurt
  // (quality 1.00, faster, cheaper) is out only because of its hard 31 Mar 2027 shutdown.
  const all = result.tables.whatIfFiltered;
  const frankfurt25 = all.find((r) => r.id === 'gemini-2.5-flash/europe-west3');
  assert.equal(frankfurt25.shutdown, '2027-03-31');
  assert.equal(frankfurt25.lastsLongEnough, false);
  assert.equal(all.find((r) => r.id === 'gemini-3.5-flash/europe-west3').lastsLongEnough, true);
  const withoutRule = pickCombos(all.map((r) => ({ ...r, lastsLongEnough: true })));
  assert.equal(withoutRule.bestEu.id, 'gemini-2.5-flash/europe-west3', 'the shutdown rule is what keeps 2.5 Flash out');
});

test('the three summary rows are filled from projectCombo', () => {
  const ds = datasetOf(septemberForms());
  const { tables } = computePrices(ds, last30(ds), scopeOf(ds));
  const byId = new Map(tables.whatIfFiltered.map((r) => [r.id, r]));
  const [same, cheapest, best] = tables.vertexSummary;
  assert.equal(same.key, 'prices.vertex.same');
  const sameModel = byId.get(comboKey(SAME_MODEL_CLOUD_ID));
  assert.deepEqual(same.values.price, ['priceSay', sameModel.priceWord]);
  assert.deepEqual(same.values.speed, ['speedSay', sameModel.speedWord]);
  const lite = byId.get('gemini-3.5-flash-lite/eu');
  assert.equal(cheapest.key, 'prices.vertex.cheapestEuSimpler', 'its quality is below today’s');
  assert.deepEqual(cheapest.values.cost, ['eurUnit', lite.eurPerForm]);
  assert.deepEqual(cheapest.values.time, ['sec', lite.expectedMs]);
  const frankfurt = byId.get('gemini-3.5-flash/europe-west3');
  const now = byId.get(comboKey(BASE_COMBO_ID));
  assert.equal(best.key, 'prices.vertex.bestEu');
  assert.deepEqual(best.values.cost, ['eurUnit', frankfurt.eurPerForm]);
  assert.deepEqual(best.values.diff0, ['eurSigned', (frankfurt.perDoctorEur - now.perDoctorEur) * 100]);
  assert.deepEqual(best.values.diff1, ['eurSigned', (frankfurt.perDoctorEur - now.perDoctorEur) * 300]);
  // 0.93 against 0.92: both round to 13 of 14 checks, so the sub-line says "barely ahead".
  assert.equal(best.sub.key, 'prices.vertex.bestEuTie');
  [same, cheapest, best, best.sub].forEach((row) => assert.ok(has(row.key), row.key));
});

test('fewer than 20 of our forms: assumed form size, the test’s own time, basis "forecast", a note', () => {
  const ds = datasetOf(septemberForms(12, { inTok: 20000, durMs: 9000 }));
  const result = computePrices(ds, last30(ds), scopeOf(ds));
  const ours = oursOf(ds, base);
  assert.equal(ours.measured, false);
  assert.equal(ours.inTok, 11441, 'Settings → assumed form size');
  assert.equal(ours.speedMs, 7330, 'the test’s own time for today’s setup');
  assert.equal(result.basis.oursEurPerForm, 'model');
  assert.equal(result.basis.oursP50Ms, 'model');
  assert.equal(result.headline.oursForms, 12);
  assert.ok(result.notes.some((n) => n.key === 'prices.note.fewForms'));
});

test('service page: the period and the scope switch change nothing; shared numbers come from unitCosts', async () => {
  const ds = await demoDataset('today');
  const a = computePrices(ds, last30(ds), scopeOf(ds, true));
  const b = computePrices(ds, resolvePeriod('allTime', ds.nowMs), scopeOf(ds, false));
  assert.deepEqual(a.headline, b.headline);
  assert.equal(a.headline.oursEurPerForm, unitCosts(ds, ds.settings.planning).formCostEur, '§6.3: prices.oursEurPerForm');
  const plan = planningOf(ds.settings.planning);
  const baseRow = a.tables.whatIf.find((r) => r.isBase);
  assert.equal(baseRow.perDoctorEur, unitCosts(ds, ds.settings.planning).formCostEur * plan.visitsPerDoctorMonth, '§6.3: base row forms only per doctor');
  assert.equal(a.headline.oursPerDoctorEur, baseRow.perDoctorEur);
  assert.ok(!/@/.test(JSON.stringify(a)), '§6.3 privacy scan: no "@" anywhere in the result');
});

test('availability, findings and price lists come from the test and the price table', () => {
  const ds = datasetOf(septemberForms());
  const { tables } = computePrices(ds, last30(ds), scopeOf(ds));
  assert.equal(tables.availability.length, 8);
  const main = tables.availability.find((r) => r.model === 'gemini-3-flash-preview');
  assert.deepEqual(main.places.direct, { available: true, sec: 2.05 });
  assert.equal(main.places.eu.available, false);
  assert.deepEqual(tables.availabilityFacts.map((f) => f.key), ['prices.availability.fact.mainNoEu', 'prices.availability.fact.no3x']);
  assert.deepEqual(tables.availabilityFacts[1].values.places, ['placesIn', ['europe-west4', 'europe-west1']]);

  const findings = new Map(tables.findings.map((f) => [f.key, f]));
  assert.equal(tables.findings.length, 6);
  assert.deepEqual(findings.get('prices.findings.failures').values, { cloudFailed: 8, cloudRuns: 80, directFailed: 0, directRuns: 35 });
  assert.equal(findings.get('prices.findings.failing').values.name[1], 'gemini-3.5-flash');
  assert.equal(findings.get('prices.findings.failing').values.n, 5);
  assert.equal(findings.get('prices.findings.failing').values.total, 10);
  assert.equal(findings.get('prices.findings.thinking').tone, 'attention');
  tables.findings.forEach((f) => assert.ok(has(f.key), f.key));

  const models = new Map(tables.pricesModels.map((r) => [r.model, r]));
  assert.equal(models.get('gemini-3-flash-preview').formEur, computePrices(ds, last30(ds), scopeOf(ds)).headline.oursEurPerForm);
  assert.equal(models.get('gemini-3-flash-preview').cloudEu, 'none');
  assert.equal(models.get('gemini-3.5-flash-lite').cloudEu, 'surcharge');
  assert.equal(models.get('gemini-2.5-flash').cloudEu, 'same');
  assert.ok(Math.abs(models.get('gemini-3.8-flash').formEur2027 / models.get('gemini-3.8-flash').formEur - 2) < 1e-9);
  assert.equal(models.get('gemini-3.5-flash').formEur2027, null);

  const services = new Map(tables.pricesTranscription.map((r) => [r.id, r]));
  assert.ok(!services.has('gpt-4o-mini-transcribe-2025-03-20'), 'a dated snapshot folds into its family');
  assert.equal(services.get('gpt-4o-mini-transcribe').shutdown, '2027-01-20');
  assert.ok(services.has('gemini-3.5-transcribe-live'), 'a different service is not a snapshot');
  assert.equal(services.get('soniox-rt:stt-rt-v5').tag, 'now');
  assert.equal(services.get('gpt-4o-mini-transcribe').tag, 'backup');
  // Plan: 400 visits × 15 min of conversation = 6,000 min × $0.002 = $12 → €10.47.
  assert.ok(Math.abs(services.get('soniox-rt:stt-rt-v5').perDoctorMonthEur - 12 / 1.1463) < 1e-9);

  const fees = new Map(tables.pricesPayments.map((r) => [r.method, r]));
  assert.deepEqual([fees.get('card_eea_standard').pack250, fees.get('card_eea_standard').pack600, fees.get('card_eea_standard').pack1500], [0.44, 0.61, 0.93]);
  assert.deepEqual([fees.get('paypal').pack250, fees.get('paypal').pack600, fees.get('paypal').pack1500], [0.9, 1.31, 2.07]);
});

test('a different setup today: compared with the tested setup, and said so', () => {
  const cfg = config({ gemini: { ...config().gemini, main: 'gemini-3.8-flash' } });
  const ds = datasetOf(septemberForms(30, { model: 'gemini-3.8-flash' }), { cfg });
  const result = computePrices(ds, last30(ds), scopeOf(ds));
  assert.ok(result.notes.some((n) => n.key === 'prices.note.setupChanged'));
  assert.equal(result.tables.whatIf.find((r) => r.isBase).priceRatio, 1);
  result.notes.forEach((n) => assert.ok(has(n.key), n.key));
});

test('no period picker on the page: Prices does not use the period', () => {
  assert.equal(sectionById('prices').usesPeriod, false);
  assert.equal(sectionById('prices').service, true);
});

test('both demo scenarios: the same picks, every text key exists', async () => {
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    const result = computePrices(ds, last30(ds), scopeOf(ds));
    assert.equal(result.empty, false, scenario);
    assert.equal(result.headline.fastestId, 'gemini-3.8-flash/direct', scenario);
    assert.equal(result.headline.cheapestEuId, 'gemini-3.5-flash-lite/eu', scenario);
    assert.equal(result.headline.bestEuId, 'gemini-3.5-flash/europe-west3', scenario);
    const keys = [
      ...result.answer, ...result.notes, ...result.tables.vertexSummary, ...result.tables.findings, ...result.tables.availabilityFacts,
      ...result.tables.pricesOther, ...result.tables.checked, ...result.tables.caveat,
    ].map((item) => item.key);
    keys.forEach((key) => assert.ok(has(key), `${scenario}: ${key}`));
    result.tables.whatIfFiltered.forEach((row) => assert.ok(has(`prices.comboNote.${row.id}`), row.id));
  }
});
