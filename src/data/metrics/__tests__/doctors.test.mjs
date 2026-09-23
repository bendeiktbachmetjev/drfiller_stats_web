import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDoctors, matchesSearch, CLASS_ORDER } from '../doctors.js';
import { EMPTY_RESULT, missingBasis } from '../shared.js';
import { buildDataset } from '../../buildDataset.js';
import { loadAll } from '../../load.js';
import { monthFactor, resolvePeriod } from '../../period.js';
import { makeScope } from '../../core/scope.js';
import { summarize } from '../../core/summary.js';
import { paymentMoney } from '../../core/income.js';
import { projectScale } from '../../core/projection.js';
import { makeDemoApi } from '../../../dev/demoData.js';
import { makeScenario, SCENARIO_NOW } from '../../__tests__/scenario.mjs';
import { PID, benchmark, config, doctor, formRow, localMs, rawBundle, revenue, settings, staticPrices } from '../../__tests__/fixtures.mjs';

// §7 P7: numbering by signup; class precedence incl. "purchase not found" while Stripe is on; "Paid" is
// net income; Σ per-doctor result rule; byClass = summary; the "Is this your account?" rule; cost per
// month = cost × monthFactor. Plus the §4.0 contract: a basis per headline key, empty data, shared === core.

const NOW = Date.parse('2026-09-23T11:30:00Z'); // 14:30 Vilnius
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} ≠ ${b}`);
const scopeOf = (ds, excludeInternal = true) => makeScope({ excludeInternal, settings: ds.settings });
const last30 = resolvePeriod('last30', SCENARIO_NOW);
const september = resolvePeriod('month', SCENARIO_NOW);
const allTime = resolvePeriod('allTime', SCENARIO_NOW);
const rowOf = (result, pid) => result.tables.doctors.find((row) => row.pid === pid);
const offRevenue = (raw) => {
  raw.revenue = { ...raw.revenue, status: 'off', reason: 'no_stripe_key', livemode: null, payments: [], adjustments: [] };
  raw.sources.revenue = { ...raw.sources.revenue, status: 'off' };
};

const demoCache = new Map();
async function demoDataset(scenario) {
  if (!demoCache.has(scenario)) {
    const api = makeDemoApi(NOW, { scenario });
    demoCache.set(scenario, buildDataset(await loadAll({ demo: api, nowMs: NOW }), { nowMs: NOW, staticPrices, benchmark }));
  }
  return demoCache.get(scenario);
}

test('no dataset → EMPTY_RESULT; a period without requests → empty, without throwing', () => {
  assert.equal(computeDoctors(null, last30, makeScope()), EMPTY_RESULT);
  const ds = buildDataset(rawBundle({ doctors: [doctor(PID.free)] }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  const result = computeDoctors(ds, last30, scopeOf(ds));
  assert.equal(result.empty, true);
  assert.equal(result.headline.active, 0);
  assert.equal(result.headline.topShare, null);
  assert.deepEqual(result.tables.doctors, [], 'nobody active → the active view is empty');
  assert.equal(computeDoctors(ds, last30, scopeOf(ds), { view: 'all' }).tables.doctors.length, 1, 'the all view still lists the account');
  assert.deepEqual(missingBasis(result.headline, result.basis), []);
});

test('every headline key has a basis; shared headlines are the core values (===), demo scenarios', async () => {
  for (const scenario of ['today', 'planned']) {
    const ds = await demoDataset(scenario);
    for (const period of [resolvePeriod('last30', NOW), resolvePeriod('month', NOW, { offset: -1 }), resolvePeriod('allTime', NOW)]) {
      for (const excludeInternal of [true, false]) {
        const scope = scopeOf(ds, excludeInternal);
        const result = computeDoctors(ds, period, scope);
        const summary = summarize(ds, period, scope);
        const label = `${scenario} ${period.key} ${excludeInternal}`;
        assert.deepEqual(missingBasis(result.headline, result.basis), [], label);
        assert.ok(result.headline.active === summary.activeDoctors, `doctors.active === summary.activeDoctors (${label})`);
        assert.ok(result.headline.paying === summary.payingActiveDoctors, `doctors.paying === summary.payingActiveDoctors (${label})`);
        assert.ok(
          result.headline.planPerDoctorEur === projectScale(ds, period, scope, { scenario: 'plan' }).columns.doctor.costTotalEur,
          `doctors.planPerDoctorEur === projectScale(plan).columns.doctor.costTotalEur (${label})`,
        );
        assert.equal(result.tables.doctors.length, summary.activeDoctors, `the active view has one row per active doctor (${label})`);
        CLASS_ORDER.forEach((key, index) => {
          assert.equal(result.tables.byClass[index].key, key);
          assert.ok(result.tables.byClass[index].valueEur === summary.cost.byClass[key], `byClass.${key} === summary (${label})`);
        });
        const json = JSON.stringify(result);
        assert.ok(!json.includes('@'), `no email in the AreaResult (${label})`);
        assert.ok(!/\b[A-Za-z0-9]{28}\b/.test(json), `no uid-like token (${label})`);
      }
    }
  }
});

test('"Doctor NN" follows the signup order; deleted accounts get no number', () => {
  const { ds } = makeScenario();
  const rows = computeDoctors(ds, allTime, scopeOf(ds, false), { view: 'all' }).tables.doctors;
  const numbered = rows.filter((row) => row.no !== null).sort((a, b) => a.no - b.no);
  assert.deepEqual(
    numbered.map((row) => row.pid),
    [PID.top, PID.internal, PID.payer, PID.bought, PID.gifted, PID.free, PID.noCredits],
    'numbered by signupAt ascending',
  );
  assert.deepEqual(numbered.map((row) => row.noText), ['01', '02', '03', '04', '05', '06', '07']);
  const deleted = rows.find((row) => row.pid === 'deleted');
  assert.equal(deleted.no, null);
  assert.equal(deleted.class, 'deleted');
  assert.equal(deleted.code, '—');
});

test('class precedence: internal → paid → purchase not found (Stripe on); Stripe off keeps "paying (by balance)"', () => {
  const { ds } = makeScenario();
  const all = computeDoctors(ds, allTime, scopeOf(ds, false), { view: 'all' });
  assert.equal(rowOf(all, PID.internal).class, 'internal');
  assert.equal(rowOf(all, PID.payer).class, 'paid', 'a live Stripe payment wins over the API class');
  assert.equal(rowOf(all, PID.bought).class, 'bought_unverified', 'looks bought, no payment in Stripe');
  assert.equal(rowOf(all, PID.bought).displayClass, 'gifted');
  assert.equal(rowOf(all, PID.top).class, 'legacy');
  assert.equal(all.basis.paying, 'exact');

  const { ds: off } = makeScenario({ mutate: offRevenue });
  const offResult = computeDoctors(off, allTime, scopeOf(off, false), { view: 'all' });
  assert.equal(rowOf(offResult, PID.payer).class, 'bought_inferred');
  assert.equal(rowOf(offResult, PID.bought).class, 'bought_inferred');
  assert.equal(rowOf(offResult, PID.payer).displayClass, 'paid');
  assert.equal(offResult.basis.paying, 'inferred');
  assert.equal(rowOf(offResult, PID.payer).paidNetEur, null, 'no income without Stripe');
  assert.equal(rowOf(offResult, PID.payer).resultEur, null);
  const bought = offResult.tables.funnel.find((step) => step.key === 'bought');
  assert.deepEqual([bought.value, bought.basis], [2, 'inferred'], 'bought guessed from balances');
  assert.ok(offResult.notes.some((note) => note.key === 'doctors.note.noIncome'));
});

test('"Paid" is the net income of the doctor\'s payments (after fee, refund and dispute), not the gross', () => {
  const { ds, raw } = makeScenario();
  const result = computeDoctors(ds, september, scopeOf(ds), { view: 'all' });
  const payer = rowOf(result, PID.payer);
  const payments = raw.revenue.payments.filter((payment) => payment.pid === PID.payer);
  const nets = payments.map((payment) => paymentMoney(payment, { prices: ds.prices, vatPayer: false }).netEur);
  const gross = payments.reduce((acc, payment) => acc + payment.grossCents / 100, 0);
  close(payer.paidNetEur, nets.reduce((a, b) => a + b, 0) - 24, 'net of fee and refund, minus the €24 dispute');
  assert.ok(payer.paidNetEur < gross, 'less than what the doctor paid');
  close(payer.resultEur, payer.paidNetEur - payer.costEur, 'result = paid − cost');
  assert.ok(payer.paidNetEur === summarize(ds, september, scopeOf(ds)).income.byPid[PID.payer]);
});

test('Σ per-doctor result + unattributed − fixed = summary.resultEur; Σ paid + unattributed = income.netEur', async () => {
  const cases = [];
  const { ds } = makeScenario();
  cases.push([ds, september], [ds, allTime], [ds, last30]);
  for (const scenario of ['today', 'planned']) {
    const demo = await demoDataset(scenario);
    cases.push([demo, resolvePeriod('last30', NOW)], [demo, resolvePeriod('allTime', NOW)]);
  }
  cases.forEach(([set, period]) => {
    [true, false].forEach((excludeInternal) => {
      const scope = scopeOf(set, excludeInternal);
      const summary = summarize(set, period, scope);
      const rows = computeDoctors(set, period, scope, { view: 'all' }).tables.doctors;
      const sum = (key) => rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);
      const label = `${period.key} ${excludeInternal}`;
      close(sum('costEur'), summary.cost.variableEur, `Σ cost = variable cost (${label})`);
      close(sum('paidNetEur') + summary.income.unattributedNetEur, summary.income.netEur, `Σ paid (${label})`);
      close(sum('resultEur') + summary.income.unattributedNetEur - summary.cost.fixedEur, summary.resultEur, `Σ result (${label})`);
    });
  });
});

test('byClass sums to the variable cost and names the largest part', () => {
  const { ds } = makeScenario();
  const scope = scopeOf(ds, false);
  const result = computeDoctors(ds, allTime, scope);
  const summary = summarize(ds, allTime, scope);
  close(result.tables.byClass.reduce((acc, part) => acc + part.valueEur, 0), summary.cost.variableEur, 'Σ byClass');
  const lead = [...result.tables.byClass].sort((a, b) => b.valueEur - a.valueEur)[0];
  assert.equal(result.takeaways.byClass.key, `doctors.byClass.lead.${lead.key}`);
});

test('"Is this your account?": only without any internal account, for a legacy account above half of all forms', () => {
  const noInternal = (raw) => {
    raw.doctors.doctors = raw.doctors.doctors.map((d) => ({ ...d, internal: false, internalSource: null }));
  };
  const { ds: withEnvMark } = makeScenario();
  assert.deepEqual(computeDoctors(withEnvMark, last30, scopeOf(withEnvMark)).tables.suggestion, [], 'an env mark exists → no question');

  const { ds } = makeScenario({ mutate: noInternal });
  const [row] = computeDoctors(ds, last30, scopeOf(ds)).tables.suggestion;
  assert.equal(row.pid, PID.top);
  assert.ok(row.share > 0.5);
  assert.equal(row.totalForms, ds.forms.length, 'all forms, all time, all traffic');
  assert.equal(row.forms, ds.forms.filter((form) => form.pid === PID.top).length);

  const { ds: notLegacy } = makeScenario({
    mutate: (raw) => {
      noInternal(raw);
      raw.doctors.doctors = raw.doctors.doctors.map((d) => (d.pid === PID.top ? { ...d, class: 'gifted' } : d));
    },
  });
  assert.deepEqual(computeDoctors(notLegacy, last30, scopeOf(notLegacy)).tables.suggestion, [], 'only the legacy (old plan) account');

  const { ds: marked } = makeScenario({
    mutate: (raw) => {
      noInternal(raw);
      raw.settings = { settings: settings({ internalPids: [PID.free] }) };
    },
  });
  assert.deepEqual(computeDoctors(marked, last30, scopeOf(marked)).tables.suggestion, [], 'a mark made in the UI also counts');

  const thin = buildDataset(
    rawBundle({
      rows: [formRow('2026-09-20 09:00'), formRow('2026-09-20 10:00', { pid: PID.free }), formRow('2026-09-20 11:00', { pid: PID.free })],
      doctors: [doctor(PID.top, { class: 'legacy' }), doctor(PID.free)],
    }),
    { nowMs: SCENARIO_NOW, staticPrices, benchmark },
  );
  assert.deepEqual(computeDoctors(thin, last30, scopeOf(thin)).tables.suggestion, [], 'a third of the forms is not enough');
});

test('cost per month = cost × monthFactor; hidden (null) under 7 days, with a note', () => {
  const { ds } = makeScenario();
  const scope = scopeOf(ds, false);
  const result = computeDoctors(ds, last30, scope, { view: 'all' });
  const factor = monthFactor(last30);
  result.tables.doctors.forEach((row) => close(row.costPerMonthEur, row.costEur * factor, `${row.pid} per month`));
  const top = rowOf(result, result.headline.topPid);
  close(result.headline.topPerMonthEur, top.costEur * factor, 'the busiest doctor per month');

  const week = resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-09-21', to: '2026-09-23' } });
  const short = computeDoctors(ds, week, scope, { view: 'all' });
  assert.ok(short.tables.doctors.every((row) => row.costPerMonthEur === null));
  assert.equal(short.headline.topPerMonthEur, null);
  assert.ok(short.notes.some((note) => note.key === 'doctors.note.shortPeriod'));
});

test('the scope hides "my and test" accounts; the top share and the answer follow it', () => {
  const { ds } = makeScenario();
  const hidden = computeDoctors(ds, september, scopeOf(ds, true), { view: 'all' });
  const shown = computeDoctors(ds, september, scopeOf(ds, false), { view: 'all' });
  assert.equal(rowOf(hidden, PID.internal), undefined);
  assert.equal(rowOf(shown, PID.internal).internalSource, 'env');
  assert.equal(shown.headline.doctorsAll, hidden.headline.doctorsAll + 1);
  assert.equal(hidden.headline.topPid, PID.top);
  close(hidden.headline.topShare, summarize(ds, september, scopeOf(ds, true)).cost.byPid[PID.top] / summarize(ds, september, scopeOf(ds, true)).cost.variableEur, 'top share');
  assert.deepEqual(hidden.answer[0].values.top, ['doctor', PID.top]);
  assert.equal(hidden.answer[1].key, 'doctors.answer.funnel');
});

test('views, search and muted rows', () => {
  const { ds } = makeScenario();
  const scope = scopeOf(ds, false);
  const all = computeDoctors(ds, september, scope, { view: 'all' });
  const active = computeDoctors(ds, september, scope, { view: 'active' });
  assert.ok(active.tables.doctors.every((row) => row.active && !row.muted));
  assert.ok(all.tables.doctors.some((row) => row.muted), 'accounts without a request in the period are muted');
  assert.deepEqual(
    all.tables.doctors.map((row) => row.costEur),
    [...all.tables.doctors.map((row) => row.costEur)].sort((a, b) => b - a),
    'default order: cost, highest first',
  );
  const byEmail = computeDoctors(ds, september, scope, { view: 'all', search: 'DPAYER' });
  assert.deepEqual(byEmail.tables.doctors.map((row) => row.pid), [PID.payer], 'email match, case-insensitive');
  const byCode = computeDoctors(ds, september, scope, { view: 'all', search: 'd-gift' });
  assert.deepEqual(byCode.tables.doctors.map((row) => row.pid), [PID.gifted]);
  assert.equal(byCode.headline.doctorsAll, all.headline.doctorsAll, 'the count on "All" ignores the search');
  assert.ok(matchesSearch({ pid: 'x', specialty: 'Kardiologija' }, 'kardio', ds));
  assert.ok(!matchesSearch({ pid: 'x', specialty: null, code: 'D-AAAA' }, 'zzz', ds));
});

test('funnel: signed up ⊇ made a request ⊇ active in the last 30 days; bought = Stripe payers', () => {
  const { ds } = makeScenario();
  const funnel = computeDoctors(ds, september, scopeOf(ds, false)).tables.funnel;
  const value = Object.fromEntries(funnel.map((step) => [step.key, step.value]));
  assert.equal(value.registered, 7, 'accounts with a sign-in account');
  assert.equal(value.used, 6, 'every account but the one without a balance made a request');
  assert.ok(value.active30 <= value.used && value.used <= value.registered);
  assert.equal(value.bought, 1, 'one doctor with live Stripe payments');
});

test('the busiest doctor above half of the costs adds the note; fixed costs are named when income is known', () => {
  const ds = buildDataset(
    rawBundle({
      rows: [formRow('2026-09-20 09:00'), formRow('2026-09-20 10:00'), formRow('2026-09-20 11:00', { pid: PID.free })],
      doctors: [doctor(PID.top, { class: 'legacy', signupAt: localMs('2026-03-01 09:00') }), doctor(PID.free)],
      revenue: revenue([]),
      config: config(),
    }),
    { nowMs: SCENARIO_NOW, staticPrices, benchmark },
  );
  const result = computeDoctors(ds, last30, scopeOf(ds));
  assert.ok(result.headline.topShare > 0.5);
  assert.ok(result.notes.some((note) => note.key === 'doctors.note.oneDoctor'));
  assert.equal(result.notes.some((note) => note.key === 'doctors.note.fixed'), summarize(ds, last30, scopeOf(ds)).cost.fixedEur > 0);
});
