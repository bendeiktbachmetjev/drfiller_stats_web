import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../api/client.js';
import { ROUTES } from '../api/endpoints.js';
import { WORK_COUNT_KEYS, envelope, errorBody, validate } from '../api/contract.js';
import { loadWorkCounts } from '../load.js';
import { resolvePeriod } from '../period.js';
import {
  buttonLabel, hasWorkCounts, normalizeWorkCounts, personButtons, personMainButtons, scopedWorkTotals, workCountsOf, workCountsQuery,
  workCountsStatus,
} from '../normalize/workCounts.js';
import { has } from '../../copy/index.js';
import { WORK_NOTE_KEYS, workCountsText } from '../../ui/workCountsText.js';
import { makeDemoApi } from '../../dev/demoData.js';
import { demoClinics } from '../../dev/demoClinics.js';
import { demoWorkCounts } from '../../dev/demoWorkCounts.js';

// GET /work-counts (backend routes/adminV2.js + services/stats/peopleCounts.js): what every person did with Dr.
// Filler in one period, by pid. The contract, the normalizer, the scope, the page's note and the load.

const NOW = Date.parse('2026-11-05T10:00:00Z'); // 12:00 Vilnius
const A = 'daaaaaaaaa';
const B = 'dbbbbbbbbb';
const C = 'dccccccccc';
const zeros = () => Object.fromEntries(WORK_COUNT_KEYS.map((key) => [key, 0]));

/** An answer of the backend's shape (its route test's world): two people, an erased account, two buttons. */
const answer = (overrides = {}) => ({
  range: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-23T00:00:00.000Z', open: false },
  fromDay: '2026-09-01',
  toDay: '2026-09-23',
  rows: 4,
  firstDay: '2026-09-20',
  people: [
    { pid: B, days: 1, ...zeros(), presses: 1, buttons: { gen: 1 } },
    { pid: A, days: 1, ...zeros(), forms: 3, formsAuto: 1, services: 2, servicesAuto: 2, fillRuns: 3, rxNew: 4, rxSaved: 3, presses: 6, buttons: { gen: 5, fill: 1 } },
  ],
  deleted: { days: 1, ...zeros(), presses: 2 },
  totals: { people: 2, days: 3, ...zeros(), forms: 3, formsAuto: 1, services: 2, servicesAuto: 2, fillRuns: 3, rxNew: 4, rxSaved: 3, presses: 9 },
  buttons: [
    { id: 'fill', lt: 'Užpildyti E025/a, apžiūrą ar statusą', en: 'Fill the form (E025, exam or status)', n: 1 },
    { id: 'gen', lt: 'Generuoti formas', en: 'Generate forms', n: 8 },
  ],
  ...overrides,
});

test('the contract: the backend’s answer is valid; broken shapes are not', () => {
  assert.equal(ROUTES.workCounts, '/work-counts');
  const ok = validate('workCounts', answer());
  assert.ok(ok.ok, ok.errors.join('; '));
  assert.ok(validate('workCounts', answer({ deleted: null, firstDay: null, people: [], buttons: [] })).ok, 'an empty period');
  assert.ok(validate('workCounts', answer({ people: [{ pid: 'anonymous', days: 1, ...zeros(), buttons: {} }] })).ok, 'a row without an account');
  assert.equal(validate('workCounts', answer({ people: [{ pid: 'D-AAAA', days: 1, ...zeros(), buttons: {} }] })).ok, false, 'a code is not a pid');
  assert.equal(validate('workCounts', answer({ totals: { people: 2, days: 3 } })).ok, false, 'every count in the totals');
  assert.equal(validate('workCounts', answer({ people: [{ pid: A, days: 1, ...zeros(), presses: '6', buttons: {} }] })).ok, false);
  assert.equal(validate('workCounts', answer({ fromDay: '1 Sep' })).ok, false);
  assert.equal(validate('workCounts', answer({ buttons: [{ id: 'gen', n: 'many' }] })).ok, false);
});

test('normalize: people most presses first, counts checked, buttons listed with labels, erased accounts apart', () => {
  const counts = normalizeWorkCounts(answer());
  assert.equal(counts.valid, true);
  assert.deepEqual(counts.people.map((p) => p.pid), [A, B], 'most presses first');
  assert.deepEqual([counts.fromDay, counts.toDay, counts.firstDay, counts.rows], ['2026-09-01', '2026-09-23', '2026-09-20', 4]);
  const a = counts.byPid.get(A);
  assert.deepEqual([a.days, a.forms, a.formsAuto, a.rxNew, a.rxSaved, a.fillRuns, a.services, a.servicesAuto, a.presses], [1, 3, 1, 4, 3, 3, 2, 2, 6]);
  assert.deepEqual(a.buttons, [{ id: 'gen', n: 5 }, { id: 'fill', n: 1 }], 'a person’s buttons, most first');
  assert.deepEqual(counts.buttons.map((b) => [b.id, b.label, b.n]), [['gen', 'Generate forms', 8], ['fill', 'Fill the form (E025, exam or status)', 1]]);
  assert.deepEqual([counts.deleted.days, counts.deleted.presses], [1, 2]);
  assert.deepEqual([counts.totals.people, counts.totals.days, counts.totals.presses], [2, 3, 9]);
  assert.equal(workCountsOf(counts, 'deleted'), counts.deleted, 'the Doctors table’s “Deleted account” line');
  assert.equal(workCountsOf(counts, C), null, 'no counts');
  assert.equal(workCountsOf(null, A), null);
});

test('normalize: broken entries are dropped, a pid twice is one person, and an unusable answer is null', () => {
  const counts = normalizeWorkCounts(
    answer({
      people: [
        { pid: A, days: 2, ...zeros(), presses: 4, forms: -3, rxNew: Number.NaN, buttons: { gen: 3, x_new_one: 1, broken: 'x', zero: 0 } },
        { pid: A, days: 1, ...zeros(), presses: 2, buttons: { gen: 2 } },
        { pid: 'deleted', days: 1, ...zeros(), presses: 50, buttons: {} },
        { pid: 'not a pid', days: 1, ...zeros(), presses: 9, buttons: {} },
        null,
      ],
      deleted: { days: 0, ...zeros() },
      totals: undefined,
      buttons: [{ id: 'gen', lt: 'Generuoti formas', n: 5 }, { id: 'x_new_one', en: '', lt: '', n: 1 }, { id: '', n: 3 }, { id: 'none', n: 0 }],
    }),
  );
  assert.equal(counts.valid, false, 'the shape broke the contract');
  assert.ok(counts.errors.length > 0);
  assert.deepEqual(counts.people.map((p) => p.pid), [A], 'erased accounts and bad pids are never people');
  const a = counts.byPid.get(A);
  assert.deepEqual([a.days, a.presses, a.forms, a.rxNew], [3, 6, 0, 0], 'added up; a negative or NaN count is 0');
  assert.deepEqual(a.buttons, [{ id: 'gen', n: 5 }, { id: 'x_new_one', n: 1 }]);
  assert.equal(counts.deleted, null, 'an erased line without days or counts is none');
  assert.deepEqual([counts.totals.people, counts.totals.days, counts.totals.presses], [1, 3, 6], 'no totals in the answer: the sum of its people');
  assert.deepEqual(counts.buttons.map((b) => [b.id, b.label]), [['gen', 'Generuoti formas'], ['x_new_one', 'x_new_one']], 'English, else Lithuanian, else the id');
  assert.equal(buttonLabel(counts, 'gen'), 'Generuoti formas');
  assert.equal(buttonLabel(counts, 'not_in_the_list'), 'not_in_the_list', 'an unknown id shows the id');
  assert.deepEqual(personButtons(counts, A), [{ id: 'gen', label: 'Generuoti formas', n: 5 }, { id: 'x_new_one', label: 'x_new_one', n: 1 }]);
  assert.deepEqual(personButtons(counts, 'deleted'), [], 'erased accounts have no button list');
  assert.deepEqual(personButtons(counts, C), []);
  [null, undefined, 'x', [], {}, { people: 'none' }].forEach((bad) => assert.equal(normalizeWorkCounts(bad), null, JSON.stringify(bad)));
});

test('main buttons: the server marks them; each person’s presses of them; an older server’s answer has none', () => {
  const marked = answer({
    people: [
      { pid: B, days: 1, ...zeros(), presses: 1, buttons: { gen: 1 } },
      { pid: A, days: 1, ...zeros(), presses: 9, buttons: { gen: 5, x_fill: 3, tlk_chip: 1 } },
    ],
    buttons: [
      { id: 'gen', lt: 'Generuoti formas', en: 'Generate forms', n: 6, main: false },
      { id: 'x_fill', lt: 'Express: Užpildyti visus', en: 'Express: fill all prescriptions', n: 3, main: true },
      { id: 'tlk_chip', lt: 'TLK pasiūlymas (pridėti diagnozę)', en: 'TLK suggestion chip (add a diagnosis)', n: 1, main: true },
    ],
  });
  assert.ok(validate('workCounts', marked).ok);
  assert.equal(validate('workCounts', answer({ buttons: [{ id: 'gen', n: 1, main: 'yes' }] })).ok, false, 'main is true or false');
  const counts = normalizeWorkCounts(marked);
  assert.deepEqual([...counts.main].sort(), ['tlk_chip', 'x_fill']);
  assert.deepEqual([counts.byPid.get(A).mainPresses, counts.byPid.get(B).mainPresses], [4, 0]);
  assert.deepEqual(
    personMainButtons(counts, A),
    [{ id: 'x_fill', label: 'Express: fill all prescriptions', n: 3 }, { id: 'tlk_chip', label: 'TLK suggestion chip (add a diagnosis)', n: 1 }],
    'only the main ones, most first',
  );
  assert.deepEqual(personMainButtons(counts, 'deleted'), [], 'erased accounts have no button list');
  assert.deepEqual(counts.buttons.map((b) => [b.id, b.main]), [['gen', false], ['x_fill', true], ['tlk_chip', true]]);
  // An older server marks no button: nobody's count of the main ones is known ("—")
  const old = normalizeWorkCounts(answer());
  assert.equal(old.main, null);
  assert.equal(old.byPid.get(A).mainPresses, null);
  assert.deepEqual(personMainButtons(old, A), []);
  // Nothing pressed in the period: nothing to mark, so 0
  const none = normalizeWorkCounts(answer({ people: [{ pid: A, days: 1, ...zeros(), forms: 2, buttons: {} }], buttons: [] }));
  assert.equal(none.byPid.get(A).mainPresses, 0);
});

test('the query: the period’s Vilnius days as instants, `to` exclusive; a running period up to now; nothing before it begins', () => {
  const period = resolvePeriod('last30', NOW);
  assert.deepEqual(workCountsQuery(period), { from: '2026-10-06T21:00:00.000Z', to: '2026-11-05T22:00:00.000Z' });
  assert.deepEqual(workCountsQuery(period, NOW), { from: '2026-10-06T21:00:00.000Z' }, 'still running: up to now, no `to`');
  const custom = resolvePeriod('custom', NOW, { custom: { from: '2026-10-01', to: '2026-10-31' } });
  assert.deepEqual(workCountsQuery(custom, NOW), { from: '2026-09-30T21:00:00.000Z', to: '2026-10-31T22:00:00.000Z' }, 'summer time to winter time');
  // The 25-hour day (25 Oct 2026): at 00:30 tomorrow's midnight is 24.5 h away, more than the server takes as `to`
  const longDay = Date.parse('2026-10-24T21:30:00Z');
  const today = resolvePeriod('custom', longDay, { custom: { from: '2026-10-25', to: '2026-10-25' } });
  assert.ok(today.effToMs - longDay > 24 * 3600000);
  assert.deepEqual(workCountsQuery(today, longDay), { from: '2026-10-24T21:00:00.000Z' });
  assert.equal(workCountsQuery({ fromMs: 10, effToMs: 10 }, NOW), null);
  assert.equal(workCountsQuery(null, NOW), null);
});

test('the business scope: hidden people leave the totals and the buttons; erased accounts stay', () => {
  const counts = normalizeWorkCounts(answer());
  assert.deepEqual(scopedWorkTotals(counts, null), { ...counts.totals, buttons: counts.buttons }, 'nobody hidden: the server’s totals');
  const scoped = scopedWorkTotals(counts, (pid) => pid === A);
  assert.deepEqual([scoped.people, scoped.days, scoped.presses, scoped.forms, scoped.rxNew, scoped.fillRuns], [1, 2, 3, 0, 0, 0]);
  assert.deepEqual(scoped.buttons.map((b) => [b.id, b.n]), [['gen', 3]], 'gen 8 − 5; fill 1 − 1 leaves the list');
  assert.equal(scopedWorkTotals(null, null), null);
  assert.ok(hasWorkCounts(scoped) && !hasWorkCounts(zeros()) && !hasWorkCounts(null));
});

test('what the page says: loading, why the counts are missing, an empty period, counts that start later', () => {
  const period = resolvePeriod('last30', NOW);
  const counts = normalizeWorkCounts(answer({ firstDay: '2026-10-20' }));
  const error = (code, status = null) => ({ status: 'error', counts: null, error: { code, status } });
  assert.equal(workCountsStatus(null, period), 'loading');
  assert.equal(workCountsStatus({ status: 'idle', counts: null }, period), 'loading');
  assert.equal(workCountsStatus({ status: 'loading', counts: null }, period), 'loading');
  assert.equal(workCountsStatus(error('TOO_MANY_ROWS', 413), period), 'tooMany');
  assert.equal(workCountsStatus(error('BAD_RANGE', 400), period), 'badRange');
  assert.equal(workCountsStatus(error('SERVER', 404), period), 'notYet', 'a server without the route yet');
  assert.equal(workCountsStatus(error('NETWORK'), period), 'failed');
  assert.equal(workCountsStatus(error('SCHEMA'), period), 'failed');
  assert.equal(workCountsStatus({ status: 'ready', counts }, period), 'partial', 'the first count after the period’s first day');
  assert.equal(workCountsStatus({ status: 'ready', counts: normalizeWorkCounts(answer({ firstDay: period.from })) }, period), 'ok');
  const empty = normalizeWorkCounts(answer({ people: [], deleted: null, firstDay: null, buttons: [], totals: { people: 0, days: 0, ...zeros() } }));
  assert.equal(workCountsStatus({ status: 'ready', counts: empty }, period), 'none');
  const hiddenAll = scopedWorkTotals(normalizeWorkCounts(answer({ deleted: null, totals: { people: 2, days: 2, ...zeros(), presses: 7, forms: 3 } })), () => true);
  assert.equal(workCountsStatus({ status: 'ready', counts }, period, hiddenAll), 'none', 'everyone counted is hidden by the switch');

  Object.values(WORK_NOTE_KEYS).forEach((key) => assert.ok(has(key), key));
  assert.equal(workCountsText('ok'), null);
  assert.match(workCountsText('partial', { firstDay: '2026-10-20' }), /^The first counts in this period are from 20 Oct 2026\. Counting for people outside clinics starts when their extension updates/);
  assert.match(workCountsText('none'), /older periods show little or nothing/);
  assert.match(workCountsText('tooMany'), /shorter period/);
});

// The load: the page's period as from/to, the envelope unwrapped, failures as DataError codes
const fakeClient = (answerOf, calls = []) =>
  createClient({
    baseUrl: '',
    getKey: () => 'dev',
    fetchImpl: async (url) => {
      const parsed = new URL(url, 'http://x');
      calls.push(`${parsed.pathname.replace('/api/admin/v2', '')}${parsed.search}`);
      const [status, body] = answerOf(calls.length);
      return { ok: status < 400, status, json: async () => body };
    },
  });

test('loadWorkCounts: asks for the period, normalizes; 413 and 400 are not retried, 5xx once; an unusable answer is SCHEMA', async () => {
  const period = resolvePeriod('last7', NOW);
  const calls = [];
  const { counts, cacheAgeMs } = await loadWorkCounts({ client: fakeClient(() => [200, envelope(answer(), { nowMs: NOW, ageMs: 1200 })], calls), period, nowMs: NOW });
  assert.deepEqual(calls, ['/work-counts?from=2026-10-29T22%3A00%3A00.000Z'], 'the last 7 days run up to now');
  assert.equal(counts.byPid.get(A).presses, 6);
  assert.equal(cacheAgeMs, 1200);
  const past = resolvePeriod('custom', NOW, { custom: { from: '2026-10-01', to: '2026-10-31' } });
  const closed = [];
  await loadWorkCounts({ client: fakeClient(() => [200, envelope(answer(), { nowMs: NOW })], closed), period: past, nowMs: NOW });
  assert.deepEqual(closed, ['/work-counts?from=2026-09-30T21%3A00%3A00.000Z&to=2026-10-31T22%3A00%3A00.000Z'], 'a past period: its own end');

  for (const [status, code] of [[413, 'TOO_MANY_ROWS'], [400, 'BAD_RANGE']]) {
    const tries = [];
    await assert.rejects(loadWorkCounts({ client: fakeClient(() => [status, errorBody(code, 'no')], tries), period, nowMs: NOW }), (err) => err.code === code);
    assert.equal(tries.length, 1, `${code}: asked once`);
  }
  const retried = [];
  const second = await loadWorkCounts({
    client: fakeClient((n) => (n === 1 ? [502, errorBody('INTERNAL', 'busy')] : [200, envelope(answer(), { nowMs: NOW })]), retried),
    period,
    nowMs: NOW,
  });
  assert.equal(retried.length, 2, 'a 5xx is retried once');
  assert.equal(second.counts.people.length, 2);
  await assert.rejects(loadWorkCounts({ client: fakeClient(() => [200, envelope({ people: 'none' }, { nowMs: NOW })]), period, nowMs: NOW }), (err) => err.code === 'SCHEMA');
  await assert.rejects(loadWorkCounts({ client: fakeClient(() => [404, { success: false, error: 'Not found' }]), period, nowMs: NOW }), (err) => err.status === 404);
  await assert.rejects(loadWorkCounts({ client: fakeClient(() => [200, envelope(answer())]), period: { fromMs: 5, effToMs: 5 }, nowMs: NOW }), (err) => err.code === 'BAD_RANGE');
  const demo = await loadWorkCounts({ demo: answer(), period, nowMs: NOW });
  assert.equal(demo.counts.totals.presses, 9, 'a ready demo answer');
});

test('the demo answer: the contract for both scenarios; counting starts later outside clinics; erased accounts apart', () => {
  ['today', 'planned'].forEach((scenario) => {
    const api = makeDemoApi(NOW, { scenario });
    const clinicPids = demoClinics(api, NOW).flatMap((clinic) => clinic.pids);
    ['last7', 'last30', 'month', 'allTime'].forEach((preset) => {
      const period = resolvePeriod(preset, NOW);
      const data = demoWorkCounts(api, { fromMs: period.fromMs, toMs: period.effToMs, nowMs: NOW, clinicPids });
      const shape = validate('workCounts', data);
      assert.ok(shape.ok, `${scenario}/${preset}: ${shape.errors.join('; ')}`);
      const pids = new Set(api.doctors.doctors.map((d) => d.pid));
      assert.ok(data.people.every((p) => pids.has(p.pid)), 'only demo doctors');
      WORK_COUNT_KEYS.forEach((key) => {
        const sum = data.people.reduce((n, p) => n + p[key], 0) + (data.deleted?.[key] ?? 0);
        assert.equal(data.totals[key], sum, `${scenario}/${preset}: totals.${key}`);
      });
      assert.equal(data.buttons.reduce((n, b) => n + b.n, 0), data.totals.presses, 'every press is on a button');
      assert.equal(data.totals.days, data.people.reduce((n, p) => n + p.days, 0) + (data.deleted?.days ?? 0));
      assert.deepEqual(demoWorkCounts(api, { fromMs: period.fromMs, toMs: period.effToMs, nowMs: NOW, clinicPids }), data, 'the same day, the same numbers');
    });
  });
  const api = makeDemoApi(NOW, { scenario: 'today' });
  const clinicPids = demoClinics(api, NOW).flatMap((clinic) => clinic.pids);
  // Before the server counted personal rows (8 days ago, 28 Oct): only the clinics' people, from 18 days ago
  const early = resolvePeriod('custom', NOW, { custom: { from: '2026-10-01', to: '2026-10-27' } });
  const october = demoWorkCounts(api, { fromMs: early.fromMs, toMs: early.effToMs, nowMs: NOW, clinicPids });
  assert.equal(october.firstDay, '2026-10-18', 'the clinics’ people from 18 days ago');
  assert.ok(october.people.length > 0 && october.people.every((p) => clinicPids.includes(p.pid)), 'nobody outside the clinics yet');
  const late = resolvePeriod('custom', NOW, { custom: { from: '2026-10-28', to: '2026-10-30' } });
  const serverOnly = demoWorkCounts(api, { fromMs: late.fromMs, toMs: late.effToMs, nowMs: NOW, clinicPids }).people.filter((p) => !clinicPids.includes(p.pid));
  assert.ok(serverOnly.length > 0 && serverOnly.every((p) => p.presses === 0 && p.forms > 0), 'outside clinics, before their extension updated: the server’s forms only');
  const last30 = resolvePeriod('last30', NOW);
  const recent = demoWorkCounts(api, { fromMs: last30.fromMs, toMs: last30.effToMs, nowMs: NOW, clinicPids });
  const outside = recent.people.filter((p) => !clinicPids.includes(p.pid));
  assert.ok(outside.length >= 2, 'people outside clinics, counted since their update');
  assert.ok(outside.some((p) => p.forms === 0 && p.rxNew > 0), 'one person used only Dr. Filler Express (no request)');
  assert.ok(recent.people.some((p) => p.formsAuto > 0 && p.fillRuns > 0 && p.services > 0), 'an Express user');
  assert.ok(recent.deleted && !recent.people.some((p) => p.pid === 'deleted'), 'an erased account: counted, never a person');
  const september = resolvePeriod('custom', NOW, { custom: { from: '2026-09-01', to: '2026-09-30' } });
  const before = demoWorkCounts(api, { fromMs: september.fromMs, toMs: september.effToMs, nowMs: NOW, clinicPids });
  assert.deepEqual([before.people.length, before.firstDay, before.totals.presses, before.deleted], [0, null, 0, null], 'an older period: nothing');
});
