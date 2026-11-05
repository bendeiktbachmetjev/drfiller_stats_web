import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_KEYS, COUNT_PARTS, QUALITY_KEYS, countItems, countingNotes, dailyRows, driverRows, filterWorkers, guessedWorkers, hasWork, healthOf, normalizeWork,
  partsOf, queryFrom, roleRows, specialtyRows, workTiles, workersParam,
} from '../work.js';
import { has, t } from '../../../copy/index.js';
import { resolvePeriod } from '../../period.js';

// The Work and time view (spec v1 §7.2, §10): the answer of GET /clinics/:id/work is checked and arranged
// here, without React. The numbers below are invented.

const A = 'daaaaaaaaa';
const B = 'dbbbbbbbbb';
const C = 'dccccccccc';
const CLINIC = 'c1a2b3c4d5e6f7a8b';

const answer = (over = {}) => ({
  clinic: { id: CLINIC, name: 'Testo klinika', billing: 'invoice', statsShown: false, hourEur: { nurse: 20, admin: 0, other: 900 }, markupPct: 30 },
  from: '2026-10-01',
  to: '2026-10-31',
  today: '2026-11-05',
  firstWorkDay: '2026-10-10',
  model: { version: 'v1', constants: { EDIT: { v: 0.05, lo: 0.02, hi: 0.15, unit: 'share', en: 'Share of the text retyped', lt: 'Perrašoma dalis' }, R_rev: { v: 946, lt: 'Skaitymo greitis' } } },
  rates: { doctor: { eur: 38.56, lo: 36.1, hi: 42.03, src: 'https://example.test/vlk' }, nurse: { eur: 18.95 } },
  totals: { savedMin: 130, spentMin: 300, byHandMin: 460, valueEur: 61.5, paidEur: 12.4, ourCostEur: 9.6, forms: 120, formsAuto: 30, inserts: 100, services: 12, servicesByCode: { 4259: 2, 3665: 8, 1: 2, 9999: 1, 3199: 0 }, presses: 700 },
  parts: [
    { key: 'type', en: 'Typing the text', side: 'hand', min: 300 },
    { key: 'fields', lt: 'Formos laukai', side: 'hand', min: 160 },
    { key: 'read', en: 'Reading and fixing', side: 'df', min: 250 },
    { key: 'press', side: 'df', min: 50 },
    { key: 'bad', side: 'middle', min: 5 },
  ],
  byRole: [
    { role: 'nurse', workers: 1, savedMin: 40, perWorkerDayMin: 4, rateEur: 20, valueEur: 13.33 },
    { role: 'doctor', workers: 2, savedMin: 90, perWorkerDayMin: 6.4, rateEur: 38.56, valueEur: 48.17 },
  ],
  bySpecialty: [{ spec: 'Kardiologija', workers: 1, savedMin: 30, valueEur: 19.28 }, { spec: null, workers: 2, savedMin: 100, valueEur: null }],
  byWorker: [
    { pid: B, role: 'nurse', guessed: false, spec: 'Kita', ex: false, statsOff: false, member: true, days: 10, forms: 40, savedMin: 40, valueEur: 13.33, paidEur: 3 },
    { pid: A, email: 'a@example.test', role: 'doctor', guessed: true, spec: 'Kardiologija', ex: false, statsOff: false, member: true, days: 14, forms: 70, formsAuto: 30, savedMin: 90, valueEur: null, paidEur: 8 },
    { pid: C, role: 'doctor', guessed: false, ex: false, statsOff: true, member: false, days: 3, forms: 10, savedMin: 0, valueEur: null, paidEur: 1.4 },
    { pid: 'not-a-pid', forms: 5 },
  ],
  byActivity: [
    { key: 'e025', en: 'E025 visit records', count: 80, savedMin: 40 },
    { key: 'ref', lt: 'Siuntimai', count: 0, savedMin: 0 },
    { key: 'limit', en: 'Not counted: the day rule (30 min)', count: null, savedMin: -30, perUnitMin: null },
  ],
  daily: [
    { day: '2026-10-12', savedMin: 50, spentMin: 100 },
    { day: '2026-10-10', savedMin: 30, spentMin: 80 },
    { day: '2026-10-12', savedMin: 10, spentMin: 20 },
    { day: '2026-10-20', savedMin: 40, spentMin: 100 },
    { day: 'yesterday', savedMin: 999, spentMin: 999 },
  ],
  buttons: [{ id: 'gen', en: 'Generate forms', n: 120 }, { id: 'x_rx', lt: 'Express: Receptai', n: 300 }, { id: 'zero', n: 0 }],
  range: { lowMin: 60, highMin: 170, drivers: [{ key: 'R_rev', swingMin: -20 }, { key: 'EDIT', swingMin: 45 }, { key: 'K_unknown', swingMin: 5 }] },
  health: {
    versions: [{ pid: A, app: '3.2.190', lastDay: '2026-10-30' }, { pid: B, app: '3.2.191', lastDay: '2026-10-31' }],
    quality: { dup: 3, bad: 1 },
    checks: { formsVsBilling: [{ day: '2026-10-12', pid: A, gen: 11, billed: 12 }, { day: 'bad' }], insertsOverForms: 2, daysCapped: 1 },
  },
  ...over,
});

test('the answer is checked: bad rows and fields left out, lists sorted, labels in English first', () => {
  const work = normalizeWork(answer());
  assert.equal(work.clinic.id, CLINIC);
  assert.deepEqual(work.clinic.hourEur, { nurse: 20 }, 'only valid own rates (above 0, at most 500)');
  assert.deepEqual(work.parts.map((p) => [p.key, p.label]), [['type', 'Typing the text'], ['fields', 'Formos laukai'], ['read', 'Reading and fixing'], ['press', 'press']]);
  assert.deepEqual(work.byRole.map((r) => r.role), ['doctor', 'nurse'], 'roles in the registry order');
  assert.deepEqual(work.bySpecialty.map((r) => r.spec), ['Kita', 'Kardiologija'], 'no specialty = Kita; most saved first');
  assert.deepEqual(work.byWorker.map((w) => w.pid), [A, B, C], 'most saved first; a bad pid is dropped');
  assert.equal(work.byWorker[1].formsAuto, 0, 'missing numbers are 0');
  assert.equal(work.byWorker[2].member, false);
  assert.deepEqual(work.daily, [
    { day: '2026-10-10', savedMin: 30, spentMin: 80, byHandMin: 110 },
    { day: '2026-10-12', savedMin: 60, spentMin: 120, byHandMin: 180 },
    { day: '2026-10-20', savedMin: 40, spentMin: 100, byHandMin: 140 },
  ], 'one row a day, by date; by hand = saved + spent when the answer has no number');
  assert.deepEqual(work.buttons.map((b) => [b.id, b.label, b.n]), [['x_rx', 'Express: Receptai', 300], ['gen', 'Generate forms', 120]]);
  assert.deepEqual(work.totals.servicesByCode, [{ code: '1', n: 2 }, { code: '3665', n: 8 }, { code: '4259', n: 2 }, { code: '9999', n: 1 }], 'registry order, unknown codes after, zeros out');
  assert.equal(work.byActivity[0].perUnitMin, 0.5, 'minutes each time worked out when the answer has none');
  assert.deepEqual(work.byActivity.map((a) => [a.key, a.count]), [['e025', 80], ['limit', null]], 'an activity with nothing in it has no line; the day rule’s cut has no count');
  assert.deepEqual(work.range.drivers.map((d) => [d.key, d.swingMin]), [['EDIT', 45], ['R_rev', 20], ['K_unknown', 5]], 'swings as sizes, largest first');
  assert.deepEqual(work.health.quality, { dup: 3, bad: 1, later: 0, skip: 0, lost: 0, capped: 0 });
  assert.equal(work.health.checks.formsVsBilling.length, 1);
  assert.deepEqual(work.health.versions.map((v) => v.pid), [B, A], 'the newest day first');
  assert.equal(work.model.constants.EDIT.label, 'Share of the text retyped');
  assert.equal(work.model.constants.R_rev.label, 'Skaitymo greitis');
  assert.equal(work.rates.nurse.eur, 18.95);
});

test('anything that is not an answer gives an empty report; the model and rates may come as lists', () => {
  [null, undefined, 'x', [], { totals: 'x', daily: 'x', byWorker: {}, health: null }].forEach((input) => {
    const work = normalizeWork(input);
    assert.equal(hasWork(work), false);
    assert.deepEqual([work.byWorker, work.daily, work.buttons, work.range], [[], [], [], null]);
    assert.equal(work.totals.inserts, null, 'inserts unknown, not 0');
  });
  const work = normalizeWork({ model: { v: 'v2', constants: [{ key: 'SHARE', value: 0.4, en: 'Share typed' }] }, rates: [{ role: 'admin', eur: 9.91 }, { role: 'boss', eur: 99 }] });
  assert.equal(work.model.version, 'v2');
  assert.deepEqual([work.model.constants.SHARE.v, work.model.constants.SHARE.label], [0.4, 'Share typed']);
  assert.deepEqual(Object.keys(work.rates), ['admin']);
});

test('tiles: never below ≈ 0; the per-saved-hour prices only from one saved hour on', () => {
  const work = normalizeWork(answer());
  const tiles = workTiles(work);
  assert.equal(tiles.savedMin, 130);
  assert.equal(Math.round(tiles.costPerSavedHourEur * 100) / 100, 4.43, '€9.60 for 2 h 10 min');
  assert.equal(Math.round(tiles.paidPerSavedHourEur * 100) / 100, 5.72);
  assert.deepEqual([tiles.lowMin, tiles.highMin], [60, 170]);

  const lost = workTiles(normalizeWork(answer({ totals: { savedMin: -25, spentMin: 40, byHandMin: 15, valueEur: -3, paidEur: null, ourCostEur: 1 }, range: { lowMin: -60, highMin: 10, drivers: [] } })));
  assert.deepEqual([lost.savedMin, lost.isZero, lost.valueEur, lost.paidEur, lost.costPerSavedHourEur, lost.lowMin, lost.highMin], [0, true, 0, null, null, 0, 10]);
  const short = workTiles(normalizeWork(answer({ totals: { savedMin: 59, ourCostEur: 2, paidEur: 3 } })));
  assert.deepEqual([short.costPerSavedHourEur, short.paidPerSavedHourEur], [null, null], 'under an hour: no price per hour');
});

test('parts: by hand on one side, with Dr. Filler on the other, ending on the signed net', () => {
  // The backend: the day rule's cut is a negative "by hand" part, so the parts add up to netMin
  const backend = partsOf(normalizeWork(answer({
    totals: { savedMin: 130, netMin: 130 },
    parts: [{ key: 'hand_text', side: 'hand', min: 460 }, { key: 'hand_day', side: 'hand', min: -30 }, { key: 'df_read', side: 'df', min: 300 }],
  })));
  assert.deepEqual([backend.handMin, backend.dfMin, backend.netMin, backend.dayRuleMin], [430, 300, 130, 0]);
  // A slower day than by hand: the net is below zero (the tile says ≈ 0), and no cut is made up
  const lost = partsOf(normalizeWork(answer({ totals: { savedMin: 0, netMin: -5 }, parts: [{ key: 'hand_text', side: 'hand', min: 20 }, { key: 'df_read', side: 'df', min: 25 }] })));
  assert.deepEqual([lost.netMin, lost.dayRuleMin], [-5, 0]);
  // An answer whose parts do not add up (no netMin, no cut part): the gap gets its own line
  const older = partsOf(normalizeWork(answer()));
  assert.deepEqual([older.handMin, older.dfMin, older.netMin, older.dayRuleMin], [460, 300, 130, -30]);
  assert.equal(older.maxAbs, 300);
  // A server that sends the spent parts already signed means the same
  const signed = partsOf(normalizeWork(answer({ totals: { netMin: 160 }, parts: [{ key: 'type', side: 'hand', min: 460 }, { key: 'read', side: 'df', min: -250 }, { key: 'press', side: 'df', min: -50 }] })));
  assert.deepEqual([signed.dfMin, signed.dayRuleMin], [300, 0]);
  // Rounding is not a rule
  assert.equal(partsOf(normalizeWork(answer({ totals: { savedMin: 160.3 } }))).dayRuleMin, 0);
});

test('chart rows tile the period; future buckets are empty; the whole column is the time by hand', () => {
  const work = normalizeWork(answer());
  const days = dailyRows(work);
  assert.equal(days.length, 31, 'every day of October, also the ones without work');
  const twelfth = days.find((d) => d.key === '2026-10-12');
  assert.deepEqual([twelfth.savedMin, twelfth.spentMin, twelfth.spentNeg, twelfth.byHandMin], [60, 120, -120, 180]);
  assert.equal(days.reduce((s, d) => s + d.savedMin, 0), 130, 'the days add up to the period');

  // The page's period (November, today the 5th): weeks would be the chart's choice for a longer one
  const nowMs = Date.parse('2026-11-05T10:00:00Z');
  const month = resolvePeriod('month', nowMs);
  const rows = dailyRows(normalizeWork(answer({ from: '2026-11-01', to: '2026-11-06', daily: [{ day: '2026-11-03', savedMin: 12, spentMin: 30 }] })), month);
  assert.equal(rows.length, 30);
  assert.equal(rows.filter((r) => r.isFuture).length, 25);
  assert.ok(rows.filter((r) => r.isFuture).every((r) => r.savedMin === null && r.byHandMin === null));
  const year = resolvePeriod('year', nowMs);
  const months = dailyRows(work, year);
  assert.equal(months[0].granularity, 'month');
  assert.equal(months.find((m) => m.key === '2026-10').savedMin, 130);
});

test('roles, guesses, drivers, counts and health for the view', () => {
  const work = normalizeWork(answer());
  assert.deepEqual(roleRows(work).map((r) => [r.role, r.own]), [['doctor', false], ['nurse', true]], 'the nurse hour is the clinic’s own');
  assert.deepEqual(guessedWorkers(work).map((w) => w.pid), [A]);
  assert.deepEqual(driverRows(work).map((d) => d.label), ['Share of the text retyped', 'Skaitymo greitis', 'K_unknown']);
  const counts = countItems(work);
  assert.deepEqual(counts.map((c) => c.key), ['forms', 'formsAuto', 'inserts', 'services', 'presses'], 'zeros left out, forms always');
  const noEvents = countItems(normalizeWork(answer({ firstWorkDay: null })));
  assert.equal(noEvents.find((c) => c.key === 'inserts').value, null, 'inserts unknown before the extension sent counts');

  const health = healthOf(work, [A, B, C, 'dddddddddd']);
  assert.deepEqual(health.silent, ['dddddddddd'], 'a member without counts; the one who objected is not asked');
  assert.equal(health.qualityTotal, 4);
  assert.equal(health.allClear, false);
  const clean = healthOf(normalizeWork(answer({ health: { versions: [], quality: {}, checks: { formsVsBilling: [], insertsOverForms: 0, daysCapped: 4 } } })), []);
  assert.equal(clean.allClear, true, 'days kept at 30 minutes are the rule working, not a fault');
});

test('nothing measured is no measured zero: tiles, roles, specialties, each time, guessed people', () => {
  const none = normalizeWork(answer({
    totals: { savedMin: 0, netMin: 0, spentMin: 0, byHandMin: 0, valueEur: null, forms: 9, workDays: 0 },
    byRole: [{ role: 'doctor', workers: 1, savedMin: 0, perWorkerDayMin: null, rateEur: 38.56, valueEur: null }],
    bySpecialty: [{ spec: 'Kardiologija', workers: 1, savedMin: 0, perWorkerDayMin: null, valueEur: null }],
    byWorker: [{ pid: A, role: 'doctor', guessed: true, member: true, days: 3, forms: 9, savedMin: null }],
    byActivity: [{ key: 'e025', count: 9, savedMin: 0, perUnitMin: null }],
  }));
  const tiles = workTiles(none);
  assert.deepEqual([tiles.measured, tiles.isZero], [false, false], 'no "≈ 0": nothing was measured');
  assert.deepEqual(roleRows(none).map((r) => r.savedMin), [null]);
  assert.deepEqual(specialtyRows(none).map((r) => r.savedMin), [null]);
  assert.equal(none.byActivity[0].perUnitMin, null, "the server's null stays (no 0 min each time)");
  assert.deepEqual(guessedWorkers(none), [], 'a guessed role without hours is no "their hours count"');
  // An answer without workDays (older): measured as before
  assert.equal(workTiles(normalizeWork(answer())).measured, true);
  assert.equal(normalizeWork(answer()).byRole[0].perWorkerDayMin, 6.4);
});

test('inserts and the counting notes follow the first reported day, as the clinic page does', () => {
  // only shared logins and our own accounts reported: no minutes, but the inserts are known
  const shared = normalizeWork(answer({ firstWorkDay: null, firstReportDay: '2026-10-09' }));
  assert.equal(countItems(shared).find((c) => c.key === 'inserts').value, 100);
  assert.equal(countingNotes(shared).none, false);
  const silent = normalizeWork(answer({ firstWorkDay: null, firstReportDay: null }));
  assert.deepEqual([countItems(silent).find((c) => c.key === 'inserts').value, countingNotes(silent).none], [null, true]);
  // the clinic began before the period: no "counted from" note, only the people not reporting yet
  const later = normalizeWork(answer({ firstWorkDay: '2026-10-05', totals: { ...answer().totals, countsOnlyDays: 4, countsOnlyAfterFirst: 4 } }));
  assert.deepEqual(countingNotes(later), { none: false, before: false, notYet: true });
  const began = normalizeWork(answer({ totals: { ...answer().totals, countsOnlyDays: 6, countsOnlyAfterFirst: 0 } }));
  assert.deepEqual(countingNotes(began), { none: false, before: true, notYet: false });
  assert.equal(normalizeWork(answer({ clinic: { ...answer().clinic, statsShown: true, statsFrom: '2026-10-03' } })).clinic.statsFrom, '2026-10-03');
});

test('what Dr. Filler did: drafts never written, „Kartoti“, the counts-only actions, each with its words', () => {
  const work = normalizeWork(answer({ totals: { ...answer().totals, referralsProposed: 10, referralsUnused: 0, referrals: 10, rxRep: 15, abxShown: 3, abxTesiu: 1, aiRx: 2, aiRxHelper: 1 } }));
  const keys = countItems(work).map((c) => c.key);
  assert.ok(keys.includes('referralsProposed') && !keys.includes('referralsUnused'), 'all 10 drafts were written: none left');
  assert.ok(['rxRep', 'abxShown', 'abxTesiu', 'aiRx', 'aiRxHelper'].every((k) => keys.includes(k)));
  assert.ok(COUNT_PARTS.every((k) => COUNT_KEYS.includes(k)));
  ['referralsUnused', 'rxRep', 'abxShown', 'aiRef', 'anaCollect'].forEach((k) => assert.ok(has(`clinics.work.count.${k}`), k));
  assert.doesNotMatch(t('clinics.work.count.referralsProposed'), /not written/, 'every draft proposed, written or not');
  assert.match(t('clinics.work.count.referralsUnused'), /never written/);
});

test('health with a worker filter: only the picked members can be silent; objectors never', () => {
  const work = normalizeWork(answer({ byWorker: [{ pid: B, role: 'nurse', member: true, days: 2, forms: 3, savedMin: 4 }] }));
  // the filter picked B: its version is there; A and C are not asked about
  assert.deepEqual(healthOf(work, [B]).silent, []);
  // everyone: A and B reported, C objected (the clinic's marks say so though C is not in this answer)
  assert.deepEqual(healthOf(work, [A, B, C, 'dddddddddd'], [C]).silent, ['dddddddddd']);
});

test('a period longer than the routes take is read from its last 400 days', () => {
  assert.equal(queryFrom('2026-03-05', '2027-04-09'), '2026-03-05', '400 days: as asked');
  assert.equal(queryFrom('2026-03-05', '2027-04-10'), '2026-03-06', '401 days: one day later');
  assert.equal(queryFrom(null, '2027-04-10'), null);
});

test('the workers query and the picker search', () => {
  assert.equal(workersParam([]), undefined);
  assert.equal(workersParam([B, A, A, 'x']), `${A},${B}`);
  assert.equal(workersParam(null), undefined);
  const options = [
    { pid: A, label: 'a@example.test', code: 'D-AAAA', role: 'doctor' },
    { pid: B, label: 'nurse@example.test', code: 'D-BBBB', role: 'nurse' },
  ];
  assert.deepEqual(filterWorkers(options, { query: 'NURSE' }).map((o) => o.pid), [B]);
  assert.deepEqual(filterWorkers(options, { query: 'd-aa' }).map((o) => o.pid), [A]);
  assert.deepEqual(filterWorkers(options, { role: 'doctor' }).map((o) => o.pid), [A]);
  assert.equal(filterWorkers(options).length, 2);
});

test('every count, quality counter and chart title of the view has its words', () => {
  COUNT_KEYS.forEach((key) => assert.ok(has(`clinics.work.count.${key}`), key));
  QUALITY_KEYS.forEach((key) => assert.ok(has(`clinics.work.q.${key}`), key));
  ['day', 'week', 'month'].forEach((g) => assert.ok(has(`clinics.work.daily.title.${g}`), g));
});
