import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicReport, membersCostEur, roundCents } from '../report.js';

const MIN = 60000;
const A = 'daaaaaaaaa';
const B = 'dbbbbbbbbb';
const C = 'dccccccccc';

const rows = [
  { day: '2026-11-03', pid: A, formCredits: 10, formRefunded: 1, anamnesisCredits: 0, anamnesisRefunded: 0, audioCredits: 2, audioMs: 25 * MIN, costAiEur: 0.2, costAudioEur: 0.05, amountAiEur: 0.26, amountAudioEur: 0.065 },
  { day: '2026-11-04', pid: A, formCredits: 5, formRefunded: 0, anamnesisCredits: 7, anamnesisRefunded: 2, audioCredits: 0, audioMs: 3 * MIN, costAiEur: 0.3, amountAiEur: 0.39 },
  { day: '2026-11-04', pid: B, formCredits: 3, formRefunded: 0, anamnesisCredits: 0, anamnesisRefunded: 0, audioCredits: 1, audioMs: 12 * MIN, costAiEur: 0.05, costAudioEur: 0.02, amountAiEur: 0.065, amountAudioEur: 0.026 },
  { day: '2026-11-04', pid: 'deleted', anamnesisCredits: 4 },
];
const near = (x) => Math.round(x * 1e6) / 1e6;

test('a period adds up: per doctor, per day and in total, refunds left out', () => {
  const r = clinicReport(rows, { members: [A, B, C] });
  const a = r.doctors.find((d) => d.pid === A);
  assert.deepEqual(
    { forms: a.forms, anamnesis: a.anamnesisCredits, audio: a.audioCredits, min: a.audioMin, refunded: a.refunded, credits: a.credits, days: a.activeDays, cost: near(a.costEur), eur: near(a.amountEur) },
    { forms: 14, anamnesis: 5, audio: 2, min: 28, refunded: 3, credits: 21, days: 2, cost: 0.55, eur: 0.715 },
  );
  assert.equal(r.totals.credits, 21 + 4 + 4);
  assert.deepEqual([near(r.totals.costEur), near(r.totals.amountEur)], [0.62, 0.806], 'what the clinic pays: the amounts the server booked');
  assert.equal(r.totals.refunded, 3);
  assert.equal(r.totals.doctorsWithUsage, 3, 'A, B and a deleted account');
  assert.equal(r.totals.days, 2);
  // the doctors add up to the total, and so do the days
  assert.equal(r.doctors.reduce((s, d) => s + d.credits, 0), r.totals.credits);
  assert.equal(r.days.reduce((s, d) => s + d.credits, 0), r.totals.credits);
  assert.deepEqual(r.days.map((d) => [d.day, d.credits, d.doctors]), [['2026-11-03', 11, 1], ['2026-11-04', 18, 3]]);
});

test('every doctor of the clinic is listed, also without usage; the busiest first', () => {
  const r = clinicReport(rows, { members: [A, B, C] });
  assert.deepEqual(r.doctors.map((d) => d.pid), [A, B, 'deleted', C]);
  const c = r.doctors.find((d) => d.pid === C);
  assert.deepEqual([c.member, c.credits, c.activeDays], [true, 0, 0]);
  assert.equal(r.doctors.find((d) => d.pid === 'deleted').member, false, 'a former doctor still shows with their usage');
});

test('rows without money (a prepaid clinic, or before costs were booked) → zeros; empty period → zeros', () => {
  const r = clinicReport([{ day: '2026-11-04', pid: A, formCredits: 3 }]);
  assert.deepEqual([r.totals.credits, r.totals.costEur, r.totals.amountEur], [3, 0, 0]);
  const empty = clinicReport([]);
  assert.deepEqual([empty.totals.credits, empty.totals.amountEur, empty.doctors.length, empty.days.length], [0, 0, 0, 0]);
  assert.deepEqual(clinicReport(null).totals.credits, 0);
});

test('money rounds to cents, half up', () => {
  assert.equal(roundCents(0.125), 0.13);
  assert.equal(roundCents(40.114999), 40.11);
});

test("our costs of the clinic's doctors in a period", () => {
  const usage = [
    { pid: A, t: 100, costEur: 0.02 },
    { pid: A, t: 250, costEur: 0.5 },
    { pid: B, t: 150, costEur: 0.03 },
    { pid: C, t: 150, costEur: 9 },
  ];
  assert.equal(Math.round(membersCostEur(usage, [A, B], { fromMs: 100, toMs: 250 }) * 100) / 100, 0.05, 'to is exclusive, C is not a member');
});
