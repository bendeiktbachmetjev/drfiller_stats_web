import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../buildDataset.js';
import { resolvePeriod, monthFactor } from '../period.js';
import { combineBasis, costBasis } from '../core/basis.js';
import { binomialCdf } from '../core/binomial.js';
import { creditsSpent, simulateMeter, simulatedMeterBank, simulatePerVisit } from '../core/credits.js';
import { makeScope } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { capacity, projectScale, sensitivity, SENSITIVITY_KEYS, unitCosts } from '../core/projection.js';
import { netPerCreditEur, unitEconomics } from '../core/unitEconomics.js';
import { normalizeUsageRows } from '../normalize/usage.js';
import { DEFAULT_PLANNING } from '../api/contract.js';
import { PID, benchmark, config, dictationRow, formRow, liveRow, localMs, meterRow, rawBundle, settings, staticPrices } from './fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from './scenario.mjs';

// §5.3.12 money: credits, unit economics and the plan (Appendix C.3 within 1 %), capacity, invariants.

const NOW = localMs('2026-09-23 10:30');
const within = (actual, expected, rel = 0.01, message = '') =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * rel, `${message} ${actual} vs ${expected}`.trim());
const close = (a, b, eps = 1e-9, message = '') => assert.ok(Math.abs(a - b) <= eps, `${message} ${a} ≈ ${b}`.trim());
const context = { config: config(), prices: staticPrices, fx: { usdPerEur: 1.1463 } };
const normalize = (apiRows) => normalizeUsageRows(apiRows, context).rows;
/** A dataset with no usage: the plan uses the assumed form size (Appendix C.3 inputs). */
const emptyDs = (overrides = {}) => buildDataset(rawBundle({ settings: settings(overrides) }), { nowMs: NOW, staticPrices, benchmark });

test('meter simulation: 25 min dictation + 20 min live on one doctor = 4 credits, 5 min carried', () => {
  const rows = normalize([dictationRow('2026-09-23 12:00', { audioSec: 25 * 60 }), liveRow('2026-09-23 13:00', { audioSec: 20 * 60 })]);
  const options = { sinceMs: Date.parse('2026-09-23T08:23Z') };
  const charges = simulateMeter(rows, options).get(PID.top);
  assert.deepEqual(charges.map((c) => c.credits), [2, 2]);
  assert.equal(simulatedMeterBank(rows, options).get(PID.top), 5 * 60000);
});

test('the old per-visit rule: dictation, dictation, form, dictation → 1 credit', () => {
  const rows = normalize([
    dictationRow('2026-09-10 09:00'),
    dictationRow('2026-09-10 09:05'),
    formRow('2026-09-10 09:10'),
    dictationRow('2026-09-10 09:20'),
    liveRow('2026-09-10 09:30'), // live has its own "first one is free"
  ]);
  const charges = simulatePerVisit(rows, { untilMs: Date.parse('2026-09-23T08:23Z') }).get(PID.top);
  assert.equal(charges.reduce((n, c) => n + c.credits, 0), 1);
  assert.equal(charges[0].t, localMs('2026-09-10 09:05'));
});

test('credits spent: stored meter rows win; minutes before the first meter row are simulated; forms 1 each', () => {
  const rows = [
    formRow('2026-09-23 11:30'),
    dictationRow('2026-09-23 11:40', { audioSec: 25 * 60 }), // simulated: 2 credits (the first meter row comes later)
    meterRow('2026-09-23 12:00', { chargedCredits: 2 }),
    dictationRow('2026-09-23 12:30', { audioSec: 30 * 60 }), // not simulated: its meter row says 3
    meterRow('2026-09-23 12:30', { chargedCredits: 3 }),
  ];
  const ds = buildDataset(rawBundle({ rows }), { nowMs: localMs('2026-09-23 14:00'), staticPrices, benchmark });
  const day = resolvePeriod('custom', ds.nowMs, { custom: { from: '2026-09-23', to: '2026-09-23' } });
  const spent = creditsSpent(ds, day, makeScope({ settings: ds.settings }));
  assert.deepEqual(spent, { form: 1, recording: 7, anamnesis: 0, total: 8, recordingBasis: 'mixed' });
  const before = resolvePeriod('custom', ds.nowMs, { custom: { from: '2026-09-01', to: '2026-09-22' } });
  assert.equal(creditsSpent(ds, before, makeScope({ settings: ds.settings })).recordingBasis, 'none');
});

test('net per credit (Appendix C.3): no VAT and with VAT, plan = packMix-weighted', () => {
  const options = (vatPayer, packMix = DEFAULT_PLANNING.packMix) => ({ vatPayer, method: 'card_eea_standard', prices: staticPrices, packs: config().billing.packs, packMix });
  within(netPerCreditEur('pack250', options(false)), 0.04824);
  within(netPerCreditEur('pack600', options(false)), 0.03898);
  within(netPerCreditEur('pack1500', options(false)), 0.02938);
  within(netPerCreditEur('pack250', options(true)), 0.03956);
  within(netPerCreditEur('pack600', options(true)), 0.03204);
  within(netPerCreditEur('pack1500', options(true)), 0.02417);
  within(netPerCreditEur('plan', options(false)), 0.02938, 0.01, 'the default plan is pack 1500');
  const mixed = netPerCreditEur('plan', options(false, { pack250: 0.5, pack600: 0, pack1500: 0.5 }));
  close(mixed, (netPerCreditEur('pack250', options(false)) + netPerCreditEur('pack1500', options(false))) / 2, 1e-12);
});

test('unit costs and visits reproduce Appendix C.3 within 1 %', () => {
  const ds = emptyDs();
  const uc = unitCosts(ds, ds.settings.planning);
  assert.equal(uc.formBasis, 'model');
  assert.deepEqual(uc.warnings, ['FEW_FORMS_ASSUMED']);
  within(uc.formCostEur, 0.007571);
  within(uc.convPerMinEur, 0.000109);
  within(uc.livePerMinEur, 0.001745);
  within(uc.dictationPerMinEur, 0.001454);

  const period = resolvePeriod('last30', NOW);
  const scope = makeScope({ settings: ds.settings });
  const ue = unitEconomics(ds, period, scope, { planning: ds.settings.planning, vatPayer: false });
  const visit = Object.fromEntries(ue.visitTypes.map((v) => [v.id, v]));
  within(visit.typed.costEur, 0.00757);
  within(visit.dictation1.costEur, 0.00902);
  within(visit.live15.costEur, 0.03538);
  within(visit.live25.costEur, 0.05392);
  assert.deepEqual(['typed', 'dictation1', 'live15', 'live25'].map((id) => Math.round(visit[id].credits * 10) / 10), [1, 1.1, 2.5, 3.5]);
  within(visit.live15.netEur, 0.07345);
  within(visit.live15.leftEur, 0.03807);
  within(visit.live15.shareLeft, 0.518);
  assert.deepEqual(visit.live15.doctorPaysEur, { min: 2.5 * 0.03, max: 2.5 * 0.05 });
  assert.equal(visit.measured.basis, 'missing', 'fewer than 20 recordings in the period');
  within(ue.perCredit.live10.costEur, 10 * (0.001745 + 0.000109));
  within(ue.perCredit.form.leftEur, 0.02938 - 0.007571);
});

test('the plan at 1, 100 and 300 doctors reproduces Appendix C.3 within 1 %', () => {
  const ds = emptyDs();
  const plan = projectScale(ds, resolvePeriod('last30', NOW), makeScope({ settings: ds.settings }), { planning: ds.settings.planning, vatPayer: false });
  const { doctor, s0, s1 } = plan.columns;
  within(doctor.netEur, 29.38);
  within(doctor.costTotalEur, 14.15);
  within(doctor.resultEur, 15.23);
  within(s0.netEur, 2938.0);
  within(s0.costTotalEur, 1416.8);
  within(s0.resultEur, 1521);
  within(s1.resultEur, 4567);
  within(plan.capacity.firestore.s1Eur, 0.16, 0.05, 'Firestore writes at 300 doctors');
  close(s0.costGeminiFormsEur + s0.costSonioxEur + s0.costOpenaiEur + s0.costAnamnesisEur + s0.costFixedEur, s0.costTotalEur, 1e-9);
  assert.deepEqual(plan.scales, [100, 300]);
  assert.deepEqual(plan.chips.map((chip) => chip.key).slice(0, 4), ['common.plan.chip.visits', 'common.scenario.live', 'common.plan.packSingle', 'common.vatWord.off']);
  assert.ok(['common.plan.chip.free', 'common.plan.chip.noFree'].includes(plan.chips[4].key), 'free share: a share, or "no free use" at 0');
  assert.ok(plan.warnings.includes('SONIOX_STREAM_LIMIT'));
});

test('capacity (D22): p 0.714, mean 14 doctors, 11 without refusals, p95 79 at 100 and 227 at 300', () => {
  const cap = capacity(emptyDs(), { planning: DEFAULT_PLANNING });
  within(cap.perDoctorPeak, 0.7143, 0.001);
  assert.equal(cap.soniox.meanDoctors, 14);
  assert.equal(cap.soniox.limitDoctors, 11);
  assert.equal(cap.soniox.s0.p95, 79);
  assert.equal(cap.soniox.s1.p95, 227);
  within(1 - binomialCdf(11, cap.perDoctorPeak, 10), 0.025, 0.05, 'P(> 10) at 11 doctors ≈ 2.5 %');
  within(1 - binomialCdf(12, cap.perDoctorPeak, 10), 0.102, 0.05, 'P(> 10) at 12 doctors ≈ 10.2 %');
  assert.equal(cap.dashboard.rowsPerVisit, 3);
  assert.equal(capacity(emptyDs(), { planning: DEFAULT_PLANNING, scenario: 'typed' }).soniox.meanDoctors, null, 'no live conversations → no stream limit');
});

test('conversation tokens are counted once: form cost from forms without conversation, surcharge per minute measured', () => {
  const rows = [];
  for (let i = 0; i < 25; i += 1) {
    const t = localMs('2026-09-10 08:00') + i * 3600000;
    rows.push(formRow(t, { inTok: 11000 }));
    rows.push(liveRow(t + 60000, { audioSec: 900 }));
    rows.push(formRow(t + 120000, { inTok: 14750, convChars: 9000 }));
  }
  const ds = buildDataset(rawBundle({ rows }), { nowMs: NOW, staticPrices, benchmark });
  const uc = unitCosts(ds, ds.settings.planning);
  assert.deepEqual([uc.formBasis, uc.formsUsed, uc.convBasis, uc.convFormsUsed], ['exact', 25, 'exact', 25]);
  close(uc.convTokensPerMin, (14750 - 11000) / 15, 1e-9);
  close(uc.formInTok, 11000, 1e-9, 'conversation forms are not in the form price');
  close(uc.formCostEur, (11000 * 0.5 + 986 * 3) / 1e6 / 1.1463, 1e-12);
});

test('medical history runs in the plan raise both income and cost per visit', () => {
  const plain = emptyDs();
  const withRuns = emptyDs({ planning: { ...DEFAULT_PLANNING, anamnesisRunsPerDoctorMonth: 8 } });
  const project = (ds) => projectScale(ds, resolvePeriod('last30', NOW), makeScope({ settings: ds.settings }), { planning: ds.settings.planning, vatPayer: false });
  const a = project(plain);
  const b = project(withRuns);
  within(b.unit.visitCredits, 2.5 + (8 / 400) * 7, 1e-9, 'default run: 7 credits');
  assert.ok(b.unit.visitNetEur > a.unit.visitNetEur);
  assert.ok(b.columns.s0.costAnamnesisEur > 0);
});

test('"now" column = summarize × monthFactor; hidden under 7 days', () => {
  const { ds } = makeScenario();
  const scope = makeScope({ excludeInternal: false, settings: ds.settings });
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const summary = summarize(ds, period, scope);
  const plan = projectScale(ds, period, scope, { planning: ds.settings.planning, vatPayer: false });
  const factor = monthFactor(period);
  close(plan.columns.now.costTotalEur, summary.cost.totalEur * factor);
  close(plan.columns.now.netEur, summary.income.netEur * factor);
  close(plan.columns.now.resultEur, summary.resultEur * factor);
  close(plan.columns.now.visits, summary.counts.forms * factor);
  assert.equal(plan.columns.nowTotal.costTotalEur, summary.cost.totalEur);
  const now = plan.columns.now;
  close(now.costGeminiFormsEur + now.costSonioxEur + now.costOpenaiEur + now.costAnamnesisEur + now.costFixedEur, summary.cost.totalEur * factor);
  assert.equal(plan.now.hidden, false);
  const short = resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-09-20', to: '2026-09-23' } });
  assert.equal(projectScale(ds, short, scope, { planning: ds.settings.planning }).now.hidden, true);
  assert.equal(summarize(ds, period, scope), summary, 'memoised: every page reads the same object');
  assert.ok(Object.isFrozen(summary.cost.byFeature));
});

test('summary invariants on the scenario: splits add up, per-doctor results, scope and VAT', () => {
  const { ds } = makeScenario();
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const all = summarize(ds, period, makeScope({ excludeInternal: false, settings: ds.settings }));
  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  close(sum(all.cost.byProvider), all.cost.totalEur);
  close(sum(all.cost.byFeature), all.cost.totalEur);
  close(sum(all.cost.byModel) + all.cost.fixedEur, all.cost.totalEur);
  close(sum(all.cost.byClass), all.cost.variableEur);
  const perDoctorResult = Object.keys({ ...all.cost.byPid, ...all.income.byPid }).reduce((acc, pid) => acc + (all.income.byPid[pid] ?? 0) - (all.cost.byPid[pid] ?? 0), 0);
  close(perDoctorResult + all.income.unattributedNetEur - all.cost.fixedEur, all.resultEur);
  assert.equal(all.cost.basis, 'estimate', 'the unknown model and the OpenAI byte estimate are over 5 %');

  const hidden = summarize(ds, period, makeScope({ excludeInternal: true, settings: ds.settings }));
  assert.equal(all.counts.forms - hidden.counts.forms, 2, 'only the internal rows go');
  assert.equal(hidden.cost.byClass.internal, 0);
  close(hidden.cost.fixedEur, all.cost.fixedEur);

  const withVat = summarize(ds, period, { ...makeScope({ excludeInternal: false, settings: ds.settings }), vatPayer: true });
  close(withVat.cost.totalEur, all.cost.totalEur);
  assert.ok(withVat.income.netEur < all.income.netEur);
  assert.equal(all.balances.free, all.balances.total - all.balances.byDisplayClass.paid);
  assert.equal(all.counts.anamnesisRuns, 1);
});

test('sensitivity: the six one-change variants at scales[0], sorted by the size of the difference', () => {
  const ds = emptyDs();
  const rows = sensitivity(ds, resolvePeriod('last30', NOW), makeScope({ settings: ds.settings }), { planning: ds.settings.planning, vatPayer: false });
  assert.deepEqual(rows.map((r) => r.key).sort(), [...SENSITIVITY_KEYS].sort());
  rows.forEach((row, i) => assert.ok(i === 0 || Math.abs(rows[i - 1].diffEur) >= Math.abs(row.diffEur)));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.diffEur]));
  assert.ok(byKey.pack600 > 0 && byKey.vat < 0 && byKey.model38in2027 < 0 && byKey.free10 < 0 && byKey.paypal < 0 && byKey.live25 > 0);
});

test('basis: weakest input wins; a cost is an estimate from 5 % estimated parts', () => {
  assert.equal(combineBasis('exact', 'model'), 'model');
  assert.equal(combineBasis('model', 'estimate'), 'estimate');
  assert.equal(combineBasis('estimate', 'inferred'), 'inferred');
  assert.equal(combineBasis('inferred', 'missing', 'exact'), 'missing');
  assert.equal(combineBasis(), 'exact');
  assert.equal(costBasis([{ costEur: 95, costBasis: 'computed' }, { costEur: 4.99, costBasis: 'estimated' }]), 'exact');
  assert.equal(costBasis([{ costEur: 95, costBasis: 'computed' }, { costEur: 5, costBasis: 'estimated' }]), 'estimate');
});
