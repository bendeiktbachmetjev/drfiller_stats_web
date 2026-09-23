import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { computeSettings, packMixOf, peakHourShareOf, MIN_PEAK_FORMS, SOURCE_ORDER } from '../settings.js';
import { EMPTY_RESULT, missingBasis } from '../shared.js';
import { buildDataset } from '../../buildDataset.js';
import { loadAll } from '../../load.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { capacity, planningOf, unitCosts } from '../../core/projection.js';
import { DEFAULT_PLANNING, DEFAULT_SETTINGS, PLANNING_LIMITS } from '../../api/contract.js';
import { DASHBOARD_ROW_CAP } from '../../constants.js';
import { makeDemoApi } from '../../../dev/demoData.js';
import { SCENARIO_NOW } from '../../__tests__/scenario.mjs';
import {
  benchmark, config, dictationRow, doctor, formRow, liveRow, localMs, payment, rawBundle, revenue, settings, staticPrices,
} from '../../__tests__/fixtures.mjs';
import {
  FIELDS, applyPreset, defaultDraft, effectsOf, isDirty, parseNumber, presetOf, validateDraft,
} from '../../../pages/settings/planningForm.js';

// §7 P8: measured hints from the last 30 days (incl. the conversation surcharge in `planned`); validation
// mirrors the server ranges of §5.2.3.7; the load line (historyRows, monthsToRowCap); shared numbers ===.

const NOW = Date.parse('2026-09-23T11:30:00Z'); // 14:30 Vilnius
const close = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} ≠ ${b}`);

const demoCache = new Map();
async function demoDataset(scenario) {
  if (!demoCache.has(scenario)) {
    const api = makeDemoApi(NOW, { scenario });
    demoCache.set(scenario, buildDataset(await loadAll({ demo: api, nowMs: NOW }), { nowMs: NOW, staticPrices, benchmark }));
  }
  return demoCache.get(scenario);
}

const datasetOf = (bundle, nowMs = SCENARIO_NOW) => buildDataset(rawBundle(bundle), { nowMs, staticPrices, benchmark });
const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });

/** Weekday forms of the last 30 days (two doctors), plus old ones and conversations. */
function windowDataset({ internal = false } = {}) {
  const rows = [];
  ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].forEach((day) => {
    ['08:05', '08:20', '08:40', '11:00', '16:10'].forEach((time) => rows.push(formRow(`${day} ${time}`)));
    rows.push(formRow(`${day} 09:00`, { pid: 'dsecondaaa' }));
  });
  // Outside the window (before 25 Aug): must not count.
  ['2026-07-01', '2026-07-02', '2026-08-10'].forEach((day) => rows.push(formRow(`${day} 10:00`)));
  rows.push(liveRow('2026-07-01 10:30', { audioSec: 3000 }));
  rows.push(liveRow('2026-09-22 08:30', { audioSec: 600 }));
  rows.push(dictationRow('2026-09-15 09:30', { audioSec: 90 }));
  const doctors = [
    doctor('dtopdoctor', { class: 'legacy', ...(internal ? { internal: true, internalSource: 'env' } : {}) }),
    doctor('dsecondaaa'),
  ];
  return datasetOf({ rows, doctors });
}

test('no dataset → EMPTY_RESULT; a dataset without history → empty, every headline key has a basis', () => {
  assert.equal(computeSettings(null, resolvePeriod('last30', NOW), makeScope()), EMPTY_RESULT);
  const ds = datasetOf({});
  const result = computeSettings(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  assert.equal(result.empty, true);
  assert.equal(result.headline.measuredVisitsPerDoctorMonth, null);
  assert.equal(result.headline.measuredPeakHourShare, null);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
  assert.equal(result.tables.sources.length, SOURCE_ORDER.length);
});

test('measured hints use the last 30 days only, whatever period the page passes', () => {
  const ds = windowDataset();
  const scope = scopeOf(ds);
  const last30 = resolvePeriod('last30', SCENARIO_NOW);
  const result = computeSettings(ds, last30, scope);
  assert.deepEqual(computeSettings(ds, resolvePeriod('allTime', SCENARIO_NOW), scope).headline, result.headline, 'the page period is ignored');
  // 24 forms and 1 conversation in the window; the July conversation and the old forms do not count.
  assert.equal(result.headline.measuredLiveShare, 1 / 24);
  assert.equal(result.headline.measuredLiveMin, null, 'fewer than 20 conversations → not measured');
  assert.equal(result.headline.measuredDictationMin, null, 'fewer than 20 dictations → not measured');
  assert.equal(result.headline.windowFrom, last30.from);
  assert.equal(result.headline.windowTo, last30.effTo);
  assert.ok(result.notes.some((note) => note.key === 'settings.note.fewConversations' && note.values.n === 1));
  assert.ok(result.notes.some((note) => note.key === 'settings.note.topDoctor'), '20 of 24 forms are one doctor');
});

test('visits per doctor is the core summarize() value and follows the scope; service hints do not', () => {
  const plain = windowDataset();
  const marked = windowDataset({ internal: true });
  const window = resolvePeriod('last30', SCENARIO_NOW);
  const shown = computeSettings(marked, window, scopeOf(marked, true));
  const all = computeSettings(marked, window, scopeOf(marked, false));
  assert.equal(shown.headline.measuredVisitsPerDoctorMonth, summarize(marked, window, scopeOf(marked, true)).perDoctorMonthActual.forms);
  assert.notEqual(shown.headline.measuredVisitsPerDoctorMonth, all.headline.measuredVisitsPerDoctorMonth, 'hiding the busy account changes it');
  ['measuredLiveShare', 'measuredPeakHourShare', 'measuredFormIn', 'measuredConvTokensPerMin', 'historyRows'].forEach((key) =>
    assert.equal(shown.headline[key], all.headline[key], `${key} counts all traffic`),
  );
  assert.equal(computeSettings(plain, window, scopeOf(plain)).headline.internalCount, 0);
  assert.equal(shown.headline.internalCount, 1);
});

test('demo planned: the conversation surcharge is measured (≈ 250 tokens a minute) and equals unitCosts', async () => {
  const ds = await demoDataset('planned');
  const scope = scopeOf(ds);
  const result = computeSettings(ds, resolvePeriod('last30', NOW), scope);
  const uc = unitCosts(ds, ds.settings.planning);
  assert.equal(uc.convBasis, 'exact');
  assert.equal(result.headline.measuredConvTokensPerMin, uc.convTokensPerMin);
  close(result.headline.measuredConvTokensPerMin, 250, 25, 'tokens a minute');
  assert.equal(result.basis.measuredConvTokensPerMin, 'exact');
  assert.equal(result.headline.measuredFormIn, uc.formInTok);
  assert.equal(result.headline.measuredFormOut, uc.formOutTok);
  close(result.headline.measuredLiveMin, 15, 0.5, 'live minutes');
  close(result.headline.measuredVisitsPerDoctorMonth, 400, 20, 'visits per doctor');
  assert.equal(result.headline.measuredFreeShare, 0, 'everyone pays');
  assert.equal(result.tables.packMix.find((row) => row.pack === 'pack1500').share, 1);
  assert.equal(result.headline.measuredPaymentMethod, 'card');
});

test('demo today: suggestion for the busy old-plan account, 5 payments → pack mix 9 % / 91 %, all sources ok', async () => {
  const ds = await demoDataset('today');
  const result = computeSettings(ds, resolvePeriod('last30', NOW), scopeOf(ds));
  assert.equal(result.headline.measuredConvTokensPerMin, null, 'no conversation text yet');
  assert.equal(result.basis.measuredConvTokensPerMin, 'missing');
  const suggest = result.answer.find((item) => item.key === 'settings.answer.suggest');
  assert.ok(suggest, 'the answer asks about the busy account');
  assert.equal(result.tables.internalCandidates[0].suggested, true);
  assert.equal(result.tables.internalCandidates.filter((row) => row.suggested).length, 1);
  const mix = Object.fromEntries(result.tables.packMix.map((row) => [row.pack, row.share]));
  close(mix.pack250, 250 / 2650, 1e-12, 'pack 250');
  close(mix.pack600, 2400 / 2650, 1e-12, 'pack 600');
  assert.equal(mix.pack1500, 0);
  assert.equal(result.headline.measuredPackMix, 5);
  assert.equal(result.answer.at(-1).key, 'settings.answer.sourcesOk');
  close(result.headline.measuredPeakHourShare, 0.149, 0.03, 'busiest hour ≈ 15 %');
  const json = JSON.stringify(result);
  assert.ok(!json.includes('@'), 'no email in the metric output');
  // A Firebase uid mixes letters and digits; the SPEC key 'measuredVisitsPerDoctorMonth' is 28 letters too.
  assert.ok(!/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{28}\b/.test(json), 'no uid-like token');
});

test('the load line: history rows and months to the row cap come from capacity()', async () => {
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    const result = computeSettings(ds, resolvePeriod('last30', NOW), scopeOf(ds));
    const cap = capacity(ds, { planning: planningOf(ds.settings.planning) });
    assert.equal(result.headline.historyRows, ds.rows.length, scenario);
    assert.equal(result.headline.historyRows, cap.dashboard.rowsNow, scenario);
    assert.equal(result.headline.monthsToRowCap, cap.dashboard.s0MonthsToCap, scenario);
    const { s0MonthsToCap, rowsPerVisit } = cap.dashboard;
    const perMonth = DEFAULT_PLANNING.doctorScales[0] * DEFAULT_PLANNING.visitsPerDoctorMonth * rowsPerVisit;
    close(s0MonthsToCap, (DASHBOARD_ROW_CAP - ds.rows.length) / perMonth, 1e-9, `${scenario} months`);
    assert.equal(result.takeaways.load.values.rows, ds.rows.length);
    assert.equal(result.takeaways.load.values.perMonth, perMonth);
    assert.ok(result.headline.dashboardReadsPerLoad >= result.headline.historyRows);
  }
});

test('sources: seven rows in order; Stripe off names its reason and the answer points at it', () => {
  const ds = datasetOf({ rows: [formRow('2026-09-22 10:00')], revenue: { status: 'off', reason: 'no_stripe_key', livemode: null, payments: [], adjustments: [] } });
  const result = computeSettings(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  assert.deepEqual(result.tables.sources.map((row) => row.key), SOURCE_ORDER);
  const stripe = result.tables.sources.find((row) => row.key === 'revenue');
  assert.equal(stripe.ok, false);
  assert.equal(stripe.note, 'no_stripe_key');
  const last = result.answer.at(-1);
  assert.equal(last.key, 'settings.answer.sourcesBad');
  assert.deepEqual(last.values.names, ['sources', ['revenue']]);
  assert.equal(result.headline.measuredPackMix, null);
  assert.equal(result.basis.measuredFreeShare, 'inferred', 'classes come from balances while Stripe is off');
});

test('accounts: server marks are locked, deleted accounts are not listed, no suggestion once one is marked', () => {
  const rows = [formRow('2026-09-22 10:00'), formRow('2026-09-22 11:00', { pid: 'dgoneaaaaa' })];
  const ds = datasetOf({ rows, doctors: [doctor('dtopdoctor', { class: 'legacy', internal: true, internalSource: 'profile' }), doctor('dsecondaaa')] });
  const result = computeSettings(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  const byPid = Object.fromEntries(result.tables.internalCandidates.map((row) => [row.pid, row]));
  assert.equal(byPid.dtopdoctor.locked, true);
  assert.equal(byPid.dtopdoctor.suggested, false);
  assert.equal(byPid.dgoneaaaaa, undefined, 'usage-only pid (deleted account) cannot be marked');
  assert.equal(result.answer[1].key, 'settings.answer.internalOne');
});

test('helpers: busiest hour share and pack mix', () => {
  const forms = [];
  for (let i = 0; i < MIN_PEAK_FORMS; i += 1) forms.push({ isoWeekday: 1 + (i % 5), hour: i % 4 === 0 ? 8 : 10 + (i % 3) });
  forms.push({ isoWeekday: 6, hour: 8 });
  assert.equal(peakHourShareOf(forms), 50 / MIN_PEAK_FORMS, 'weekends are left out');
  assert.equal(peakHourShareOf(forms.slice(0, MIN_PEAK_FORMS - 1)), null);
  const mix = packMixOf([payment('2026-09-01 10:00', { packId: 'pack250', credits: 250 }), payment('2026-09-02 10:00'), { packId: null, credits: null }]);
  assert.equal(mix.payments, 2);
  assert.deepEqual(mix.rows.map((row) => row.credits), [250, 600, 0]);
});

test('the form: the default draft is valid and round-trips to the server defaults', () => {
  const draft = defaultDraft();
  assert.equal(draft.liveShareOfVisits, '100');
  assert.equal(draft.peakHourShare, '15');
  assert.equal(draft.pack1500, '100');
  const result = validateDraft(draft);
  assert.equal(result.ok, true);
  assert.deepEqual(result.planning, { ...DEFAULT_PLANNING, doctorScales: [...DEFAULT_PLANNING.doctorScales], assumedFormTokens: { ...DEFAULT_PLANNING.assumedFormTokens }, packMix: { ...DEFAULT_PLANNING.packMix }, fixedMonthlyUsd: { ...DEFAULT_PLANNING.fixedMonthlyUsd } });
  assert.equal(isDirty(draft, DEFAULT_PLANNING), false);
  assert.equal(isDirty({ ...draft, visitsPerDoctorMonth: '401' }, DEFAULT_PLANNING), true);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber(' 15 % '), 15);
  assert.equal(parseNumber('$1.96'), 1.96);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});

test('validation mirrors the ranges of §5.2.3.7 for every number field', () => {
  FIELDS.filter((field) => field.kind !== 'choice').forEach((field) => {
    const key = field.path[0];
    assert.deepEqual(field.limits, PLANNING_LIMITS[key], `${field.id} uses the contract limits`);
    const scale = field.kind === 'percent' ? 100 : 1;
    const [min, max] = field.limits;
    const draftWith = (value) => {
      const draft = { ...defaultDraft(), [field.id]: String(value * scale) };
      // The pack mix must still add up: move the rest to another pack.
      if (field.path[0] === 'packMix') {
        const others = ['pack250', 'pack600', 'pack1500'].filter((id) => id !== field.id);
        draft[others[0]] = String((1 - Math.min(1, Math.max(0, value))) * 100);
        draft[others[1]] = '0';
      }
      return draft;
    };
    assert.equal(validateDraft(draftWith(min)).ok, true, `${field.id} = min`);
    assert.equal(validateDraft(draftWith(max)).ok, true, `${field.id} = max`);
    const below = validateDraft(draftWith(min - Math.max(0.001, min * 0.01)));
    assert.equal(below.errors[field.id]?.code, 'range', `${field.id} below min`);
    const above = validateDraft(draftWith(max + Math.max(0.001, max * 0.01)));
    assert.equal(above.errors[field.id]?.code, 'range', `${field.id} above max`);
    assert.equal(validateDraft({ ...defaultDraft(), [field.id]: '' }).errors[field.id]?.code, 'number', `${field.id} empty`);
  });
  const badMix = validateDraft({ ...defaultDraft(), pack600: '10' });
  assert.equal(badMix.ok, false);
  assert.equal(badMix.errors.pack1500.code, 'packSum');
  close(badMix.errors.pack1500.sum, 110, 1e-9, 'sum in %');
  assert.equal(validateDraft({ ...defaultDraft(), paymentMethod: 'bitcoin' }).errors.paymentMethod.code, 'choice');
  assert.equal(validateDraft({ ...defaultDraft(), formCostBasis: 'guess' }).errors.formCostBasis.code, 'choice');
});

const backendSettings = fileURLToPath(new URL('../../../../../backend/services/analytics/settings.js', import.meta.url));
test('the form agrees with the backend validator on edge cases', { skip: !existsSync(backendSettings) && 'backend repo not next to admin' }, () => {
  const { validateSettings } = createRequire(import.meta.url)(backendSettings);
  const cases = [
    {},
    { visitsPerDoctorMonth: '0' },
    { visitsPerDoctorMonth: '5000' },
    { scale1: '10001' },
    { peakHourShare: '0.5' },
    { peakHourShare: '1' },
    { pack250: '33.3', pack600: '33.3', pack1500: '33.4' },
    { pack250: '50', pack600: '50', pack1500: '1' },
    { railway: '10000.5' },
    { assumedOut: '200000' },
    { liveMinutesPerVisit: '120.01' },
  ];
  cases.forEach((change) => {
    const ui = validateDraft({ ...defaultDraft(), ...change });
    const body = { ...DEFAULT_SETTINGS, planning: ui.ok ? ui.planning : planningFromDraftLoosely({ ...defaultDraft(), ...change }) };
    assert.equal(validateSettings(body).ok, ui.ok, JSON.stringify(change));
  });
});

/** The planning a broken draft would PUT without the UI check (numbers as typed, % ÷ 100). */
function planningFromDraftLoosely(draft) {
  const planning = JSON.parse(JSON.stringify(DEFAULT_PLANNING));
  FIELDS.forEach((field) => {
    if (field.kind === 'choice') return;
    const value = parseNumber(draft[field.id]) / (field.kind === 'percent' ? 100 : 1);
    let target = planning;
    field.path.slice(0, -1).forEach((key) => (target = target[key]));
    target[field.path.at(-1)] = value;
  });
  return planning;
}

test('presets fill the recording fields; the defaults are "15 min conversation"', () => {
  const draft = defaultDraft();
  assert.equal(presetOf(draft), 'live15');
  const typed = applyPreset(draft, 'typed');
  assert.equal(presetOf(typed), 'typed');
  assert.equal(typed.liveShareOfVisits, '0');
  assert.equal(typed.dictationMinutesPerVisit, '0');
  assert.equal(presetOf(applyPreset(draft, 'dictation1')), 'dictation1');
  const live25 = applyPreset(typed, 'live25');
  assert.equal(presetOf(live25), 'live25');
  assert.equal(live25.liveMinutesPerVisit, '25');
  assert.equal(presetOf({ ...draft, liveShareOfVisits: '50' }), null, 'a mix is nobody’s preset');
});

test('live € effects: form and conversation minute match Appendix C.3; dollars convert at the ECB rate', () => {
  const ds = datasetOf({ config: config() }, localMs('2026-09-23 14:30'));
  const uc = unitCosts(ds, DEFAULT_PLANNING);
  const rates = { inputPerM: uc.mainInputPerM, outputPerM: uc.mainOutputPerM, usdPerEur: ds.fx.usdPerEur };
  const effects = effectsOf(defaultDraft(), rates);
  close(effects.form, 0.007571, 0.0000076, 'form of 11,441 / 986 tokens');
  close(effects.conversation, 0.000109 * 15, 0.0000017 * 15, '15 min of conversation text');
  close(effects.railway, 1.96 / 1.1463, 1e-12, 'Railway share');
  assert.equal(effects.other, 0);
  assert.equal(effectsOf({ ...defaultDraft(), assumedIn: 'x' }, rates).form, null);
  assert.equal(effectsOf(defaultDraft(), null).railway, null);
});

test('pack mix from Stripe counts only live payments', () => {
  const ds = datasetOf({ revenue: revenue([payment('2026-09-10 10:00')], { livemode: false }) });
  const result = computeSettings(ds, resolvePeriod('last30', SCENARIO_NOW), scopeOf(ds));
  assert.equal(result.headline.measuredPackMix, null);
  assert.equal(result.headline.measuredPayments, null);
  assert.equal(result.tables.sources.find((row) => row.key === 'revenue').note, 'test');
  assert.equal(settings().vatPayer, false, 'VAT default off (O4)');
});
