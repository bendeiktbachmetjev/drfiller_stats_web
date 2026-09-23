import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCosts, SPLITS } from '../costs.js';
import { EMPTY_RESULT, missingBasis } from '../shared.js';
import { buildDataset } from '../../buildDataset.js';
import { loadAll } from '../../load.js';
import { resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { formMonthly } from '../../core/formTrend.js';
import { projectScale } from '../../core/projection.js';
import { makeDemoApi } from '../../../dev/demoData.js';
import { makeScenario, SCENARIO_NOW } from '../../__tests__/scenario.mjs';
import { benchmark, config, formRow, localMs, rawBundle, settings, staticPrices } from '../../__tests__/fixtures.mjs';
import { draftOf, parseAmount, validateDraft } from '../../../pages/costs/invoiceForm.js';

// §7 P3: splits add up; whereWent sums to the total; «Why a form got more expensive» uses formMonthly
// over all time; the cause rule of the answer; the discount for repeated text is listed, never subtracted.

const NOW = Date.parse('2026-09-23T11:30:00Z'); // 14:30 Vilnius
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} ≠ ${b}`);
const scopes = (ds) => [true, false].map((excludeInternal) => makeScope({ excludeInternal, settings: ds.settings }));
const periods = (nowMs) => [
  resolvePeriod('last30', nowMs),
  resolvePeriod('month', nowMs, { offset: -1 }),
  resolvePeriod('allTime', nowMs),
];

const demoCache = new Map();
async function demoDataset(scenario) {
  if (!demoCache.has(scenario)) {
    const api = makeDemoApi(NOW, { scenario });
    demoCache.set(scenario, buildDataset(await loadAll({ demo: api, nowMs: NOW }), { nowMs: NOW, staticPrices, benchmark }));
  }
  return demoCache.get(scenario);
}

/** A dataset of forms only (everything else empty), built from fixture rows. */
const formsDataset = (rows, nowMs = SCENARIO_NOW) =>
  buildDataset(rawBundle({ rows, config: config(), settings: settings() }), { nowMs, staticPrices, benchmark });

const customPeriod = (from, to, nowMs = SCENARIO_NOW) => resolvePeriod('custom', nowMs, { custom: { from, to } });

/** Forms spread over the days of a range (one every 3 hours of the working day). */
function formsOn(days, overrides) {
  const rows = [];
  days.forEach((day) => ['08:00', '11:00', '14:00'].forEach((time) => rows.push(formRow(`${day} ${time}`, overrides))));
  return rows;
}

test('no dataset → EMPTY_RESULT; a period without requests → empty, without throwing', () => {
  assert.equal(computeCosts(null, resolvePeriod('last30', NOW), makeScope()), EMPTY_RESULT);
  const ds = formsDataset([]);
  const result = computeCosts(ds, resolvePeriod('last30', SCENARIO_NOW), makeScope({ settings: ds.settings }));
  assert.equal(result.empty, true);
  assert.equal(result.headline.perForm, null);
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
});

test('every headline key has a basis; shared headlines are the core values (===)', async () => {
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    for (const period of periods(NOW)) {
      for (const scope of scopes(ds)) {
        const result = computeCosts(ds, period, scope);
        assert.deepEqual(missingBasis(result.headline, result.basis), [], `${scenario} ${period.key}`);
        const summary = summarize(ds, period, scope);
        assert.ok(result.headline.total === summary.cost.totalEur, 'costs.total === summary.cost.totalEur');
        assert.ok(result.headline.perForm === summary.unit.costPerFormEur, 'costs.perForm === summary.unit.costPerFormEur');
        assert.ok(
          result.headline.perDoctorPlan === projectScale(ds, period, scope, { scenario: 'plan' }).columns.doctor.costTotalEur,
          'costs.perDoctorPlan === projectScale(plan).columns.doctor.costTotalEur',
        );
        assert.equal(result.headline.formCount, summary.counts.forms);
        assert.equal(result.basis.perDoctorPlan, 'model');
      }
    }
  }
});

test('splits add up: by service = by vendor = by model = total, per bucket and over the period', async () => {
  const datasets = [await demoDataset('today'), await demoDataset('planned'), makeScenario().ds];
  for (const ds of datasets) {
    for (const period of periods(ds.nowMs)) {
      for (const scope of scopes(ds)) {
        const { series } = computeCosts(ds, period, scope);
        const summary = summarize(ds, period, scope);
        series.forEach((row) => {
          if (row.isFuture) {
            assert.equal(row.total, null);
            return;
          }
          Object.entries(SPLITS).forEach(([split, fields]) => {
            close(fields.reduce((acc, field) => acc + row[field], 0), row.total, `${split} ${row.key}`);
          });
        });
        const total = (field) => series.reduce((acc, row) => acc + (row[field] ?? 0), 0);
        close(total('total'), summary.cost.totalEur, `Σ series = summary total (${period.key})`);
        close(total('fixed'), summary.cost.fixedEur, 'Σ server = summary fixed');
        close(total('form'), summary.cost.byFeature.form, 'Σ forms');
        close(total('recording'), summary.cost.byFeature.dictation + summary.cost.byFeature.live, 'Σ recording');
        close(total('gemini'), summary.cost.byProvider.gemini, 'Σ Google');
        close(total('soniox'), summary.cost.byProvider.soniox, 'Σ Soniox');
        close(total('openai'), summary.cost.byProvider.openai, 'Σ OpenAI');
      }
    }
  }
});

test('"Where the money went" rows add up to the total; fixed rows add up to the server cost', async () => {
  for (const ds of [await demoDataset('today'), makeScenario().ds]) {
    for (const period of periods(ds.nowMs)) {
      for (const scope of scopes(ds)) {
        const result = computeCosts(ds, period, scope);
        const summary = summarize(ds, period, scope);
        close(result.tables.whereWent.reduce((acc, row) => acc + row.valueEur, 0), result.headline.total, 'Σ whereWent = total');
        assert.deepEqual(result.tables.whereWent.map((row) => row.key), ['form', 'anamnesis', 'live', 'dictation', 'fixed']);
        close(result.tables.fixed.reduce((acc, row) => acc + row.periodEur, 0), summary.cost.fixedEur, 'Σ fixed rows = fixed');
        const byModel = result.tables.byModel;
        assert.equal(byModel.reduce((acc, row) => acc + row.forms, 0), summary.counts.forms, 'by model: every form once');
        close(byModel.reduce((acc, row) => acc + row.costEur, 0), summary.cost.byFeature.form, 'by model: Σ = form cost');
      }
    }
  }
});

test('"Why a form got more expensive" uses formMonthly over all time, whatever the period', async () => {
  const ds = await demoDataset('today');
  const scope = makeScope({ settings: ds.settings });
  const months = formMonthly(ds, scope);
  const week = computeCosts(ds, resolvePeriod('last7', NOW), scope).tables.formMonthly;
  const all = computeCosts(ds, resolvePeriod('allTime', NOW), scope).tables.formMonthly;
  assert.deepEqual(week.map((row) => row.monthKey), months.map((month) => month.monthKey));
  assert.equal(week[0].monthKey, '2026-03');
  assert.equal(week.at(-1).monthKey, '2026-09');
  week.forEach((row, index) => {
    const month = months[index];
    assert.equal(row.forms, month.forms);
    assert.equal(row.costPerFormEur, month.forms >= 5 ? month.costPerFormEur : null);
    assert.equal(row.costPerFormEur, all[index].costPerFormEur, 'the same numbers for every period');
  });
  assert.deepEqual(week.filter((row) => row.inPeriod).map((row) => row.monthKey), ['2026-09']);
  const takeaway = computeCosts(ds, resolvePeriod('last7', NOW), scope).takeaways.whyUp;
  assert.equal(takeaway?.key, 'costs.takeaway.whyUp', 'August costs ≥ 1.2 × the spring median');
  assert.equal(takeaway.values.fromMonth[1], '2026-03');
  const planned = await demoDataset('planned');
  assert.equal(computeCosts(planned, resolvePeriod('last30', NOW), makeScope({ settings: planned.settings })).takeaways.whyUp, undefined, 'two months of data: no takeaway');
});

test('cause rule of the answer: size, era, longer, other; flat and cheaper', () => {
  const prevDays = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15'];
  const curDays = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22'];
  const period = customPeriod('2026-09-16', '2026-09-22');
  const causeOf = (rows, p = period) => {
    const ds = formsDataset(rows);
    return computeCosts(ds, p, makeScope({ settings: ds.settings })).answer.find((item) => item.key.startsWith('costs.answer.form'));
  };

  const size = causeOf([...formsOn(prevDays, { inTok: 6000 }), ...formsOn(curDays, { inTok: 11441 })]);
  assert.equal(size.key, 'costs.answer.formUp.size');
  assert.equal(size.values.pages[0], 'pages');
  assert.equal(size.values.pages[1], 11441);
  assert.equal(size.tone, 'attention');

  assert.equal(causeOf([...formsOn(prevDays, {}), ...formsOn(curDays, { outTok: 3000 })]).key, 'costs.answer.formUp.longer');
  // Same era (only the backup model was added), same sizes, but a pricier model switched on by hand.
  assert.equal(causeOf([...formsOn(prevDays, {}), ...formsOn(curDays, { model: 'gemini-3.5-flash' })]).key, 'costs.answer.formUp.other');
  assert.equal(causeOf([...formsOn(prevDays, {}), ...formsOn(curDays, {})]).key, 'costs.answer.formFlat');
  const down = causeOf([...formsOn(prevDays, { inTok: 20000 }), ...formsOn(curDays, {})]);
  assert.equal(down.key, 'costs.answer.formDown');
  assert.ok(down.values.delta[1] > 0.1);

  // 27–31 Aug ran Gemini 3.7 Flash on Google Cloud EU; the days before ran 3 Flash direct: another model,
  // even though the request also grew.
  const eraPeriod = customPeriod('2026-08-27', '2026-08-31');
  const era = causeOf(
    [...formsOn(['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25'], { inTok: 6000 }), ...formsOn(['2026-08-27', '2026-08-28', '2026-08-31'], { model: 'gemini-3.7-flash' })],
    eraPeriod,
  );
  assert.equal(era.key, 'costs.answer.formUp.era');
  assert.deepEqual(era.values.model, ['model', 'gemini-3.7-flash']);

  // No comparison window with forms → just the price.
  assert.equal(causeOf(formsOn(curDays, {})).key, 'costs.answer.formOnly');
});

test('the discount for repeated text is shown only with cachedTok rows and never subtracted', () => {
  const { ds, raw } = makeScenario();
  const scope = makeScope({ settings: ds.settings });
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const withCache = computeCosts(ds, period, scope);
  assert.ok(withCache.headline.cacheSavingEur > 0);
  assert.equal(withCache.basis.cacheSavingEur, 'estimate');

  const without = structuredClone(raw);
  without.usage.rows.forEach((row) => delete row.cachedTok);
  const dsWithout = buildDataset(without, { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  const plain = computeCosts(dsWithout, period, makeScope({ settings: dsWithout.settings }));
  assert.equal(plain.headline.cacheSavingEur, null);
  assert.equal(plain.headline.total, withCache.headline.total, 'costs stay at the full list price');

  // 8,000 cached tokens of 3 Flash: (0.50 − 0.05) $ per 1M → $0.0036.
  const expected = (8000 * (0.5 - 0.05)) / 1e6 / ds.fx.usdPerEur;
  close(withCache.headline.cacheSavingEur, expected, 'saving at list price');
  const august = computeCosts(ds, resolvePeriod('month', SCENARIO_NOW, { offset: -1 }), scope);
  assert.equal(august.headline.cacheSavingEur, null, 'no cached rows in August');
});

test('invoices: every month since March, all accounts, newest first; promo answer; paid = invoice − promo', async () => {
  const ds = await demoDataset('today');
  const scope = makeScope({ settings: ds.settings });
  const result = computeCosts(ds, resolvePeriod('last30', NOW), scope);
  const invoices = result.tables.invoices;
  assert.deepEqual(invoices.map((row) => row.month), ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03']);
  const august = invoices.find((row) => row.month === '2026-08');
  close(august.googlePaidEur, 6.8 - 6.1, 'paid to Google');
  close(august.totalEur, 6.8 - 6.1 + 1.96 / ds.fx.usdPerEur + 0.18 / ds.fx.usdPerEur, 'total of the month');
  assert.equal(invoices[0].totalEur, null, 'nothing entered for September → "—"');
  assert.ok(august.googleListEur > 0);
  assert.equal(computeCosts(ds, resolvePeriod('allTime', NOW), makeScope({ excludeInternal: false, settings: ds.settings })).tables.invoices, invoices, 'not bound to period or scope');

  const promo = result.answer.find((item) => item.key === 'costs.answer.promo');
  assert.deepEqual(promo.values, { promo: ['eur', 6.1], month: ['month', '2026-08'] });
  const week = computeCosts(ds, resolvePeriod('last7', NOW), scope);
  assert.equal(week.answer.some((item) => item.key === 'costs.answer.promo'), false, 'no invoice for September yet');
  assert.ok(week.answer.length <= 3 && result.answer.length <= 3);
});

test('fixed month: the Railway invoice when entered (exact), else Settings (estimate)', async () => {
  const ds = await demoDataset('today');
  const scope = makeScope({ settings: ds.settings });
  const august = computeCosts(ds, resolvePeriod('month', NOW, { offset: -1 }), scope);
  assert.equal(august.basis.fixedMonth, 'exact');
  close(august.headline.fixedMonth, 1.96 / ds.fx.usdPerEur, 'August Railway share');
  assert.equal(august.tables.fixed[0].source, 'invoice');
  const september = computeCosts(ds, resolvePeriod('last30', NOW), scope);
  assert.equal(september.basis.fixedMonth, 'estimate');
  assert.equal(september.tables.fixed[0].source, 'settings');
});

test('Soniox check: our estimate next to Soniox, per Vilnius day, only while Soniox was in use', async () => {
  const ds = await demoDataset('today');
  const scope = makeScope({ settings: ds.settings });
  const result = computeCosts(ds, resolvePeriod('last30', NOW), scope);
  const [check] = result.tables.soniox;
  assert.equal(check.status, 'ok');
  assert.equal(check.from, '2026-09-22');
  close(check.oursEur, result.tables.sonioxDays.reduce((acc, day) => acc + day.oursEur, 0), 'Σ days = ours');
  assert.ok(Math.abs(check.diffShare) < 0.05, 'the demo bills 2% more audio than we count');
  const august = computeCosts(ds, resolvePeriod('month', NOW, { offset: -1 }), scope).tables.soniox[0];
  assert.equal(august.status, 'before');
  const { ds: noSoniox } = makeScenario({ mutate: (raw) => { raw.soniox = { status: 'off', range: { from: '', to: '', clamped: false }, days: [], liveSessions: [], totals: { requests: 0, audioMs: 0, costUsd: 0 } }; } });
  assert.equal(computeCosts(noSoniox, resolvePeriod('last30', SCENARIO_NOW), makeScope({ settings: noSoniox.settings })).tables.soniox[0].status, 'off');
});

test('notes: only the rules that applied', () => {
  const { ds } = makeScenario();
  const scope = makeScope({ settings: ds.settings });
  const keys = (period) => computeCosts(ds, period, scope).notes.map((note) => note.key);
  assert.deepEqual(keys(resolvePeriod('last30', SCENARIO_NOW)), ['costs.note.vertexSurcharge', 'costs.note.unknownModel']);
  assert.deepEqual(keys(resolvePeriod('allTime', SCENARIO_NOW)), ['costs.note.vertexSurcharge', 'costs.note.openaiBytes', 'costs.note.unknownModel']);
  assert.deepEqual(keys(customPeriod('2026-09-02', '2026-09-09')), []);
});

test('the internal account follows the scope switch', () => {
  const { ds } = makeScenario();
  const period = resolvePeriod('last30', SCENARIO_NOW);
  const shown = computeCosts(ds, period, makeScope({ excludeInternal: true, settings: ds.settings }));
  const all = computeCosts(ds, period, makeScope({ excludeInternal: false, settings: ds.settings }));
  assert.equal(all.headline.formCount - shown.headline.formCount, 2, 'the two forms of the internal account');
  assert.ok(all.headline.total > shown.headline.total);
});

test('invoice form: amounts as typed, empty = no invoice, clear errors', () => {
  assert.deepEqual(parseAmount(''), { value: null, error: false });
  assert.deepEqual(parseAmount(' 12,50 '), { value: 12.5, error: false });
  assert.deepEqual(parseAmount('€6.8'), { value: 6.8, error: false });
  assert.equal(parseAmount('-1').error, true);
  assert.equal(parseAmount('abc').error, true);
  assert.equal(parseAmount('100001').error, true);
  const draft = draftOf({ month: '2026-08', googleInvoiceEur: 6.8, googlePromoCreditsEur: null, railwayUsd: 1.96, note: 'x' });
  assert.equal(draft.googleInvoiceEur, '6.8');
  assert.equal(draft.googlePromoCreditsEur, '');
  const good = validateDraft({ ...draft, openaiInvoiceUsd: '0,18' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.fields, { googleInvoiceEur: 6.8, googlePromoCreditsEur: null, railwayUsd: 1.96, sonioxInvoiceUsd: null, openaiInvoiceUsd: 0.18, otherEur: null, note: 'x' });
  const bad = validateDraft({ ...draft, otherEur: 'ten', note: 'n'.repeat(501) });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, { otherEur: 'badNumber', note: 'noteTooLong' });
});

test('result is JSON-safe: no uid-like tokens, no emails', async () => {
  const ds = await demoDataset('today');
  const json = JSON.stringify(computeCosts(ds, resolvePeriod('allTime', NOW), makeScope({ settings: ds.settings })));
  assert.doesNotMatch(json, /\b[A-Za-z0-9]{28}\b/);
  assert.doesNotMatch(json, /@/);
  assert.ok(localMs('2026-09-23 14:30') === SCENARIO_NOW);
});
