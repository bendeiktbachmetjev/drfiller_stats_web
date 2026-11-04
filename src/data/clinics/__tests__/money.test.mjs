import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicTopups, doctorMoney, invoiceMonths, manualPaymentsOf, nextMonth, wholeMonths } from '../money.js';
import { incomeOf } from '../../core/income.js';
import staticPrices from '../../static/prices-2026-09-23.json' with { type: 'json' };

const T = Date.parse('2026-11-04T10:00:00Z');
const A = 'daaaaaaaaa';
const C = 'c00000000000000a1';

const grants = [
  { id: 'g1', t: T - 3000, pid: A, clinicId: null, credits: 700, priceEur: 28, note: 'Pavedimas' },
  { id: 'g2', t: T - 2000, pid: A, clinicId: null, credits: 300, priceEur: 0, note: 'Dovana' },
  { id: 'g3', t: T - 1000, pid: A, clinicId: null, credits: 50, priceEur: null, note: 'senas' },
  { id: 'g4', t: T, pid: null, clinicId: C, credits: 1500, priceEur: 45, note: 'Sąskaita 7' },
];
const clinic = { id: C, pricePerCreditEur: 0.04, payments: [{ month: '2026-10', amountEur: 48.6, note: 'Pavedimas 31', at: T + 1000 }, { month: '2026-09', amountEur: 0, note: '', at: null }] };

test('hand money becomes payments: priced grants and paid months, no fee, no pack', () => {
  const list = manualPaymentsOf(grants, [clinic]);
  assert.deepEqual(list.map((p) => [p.id, p.pid, p.clinicId, p.credits, p.grossCents, p.feeCents, p.method, p.source]), [
    ['g1', A, null, 700, 2800, 0, 'manual', 'grant'],
    ['g4', null, C, 1500, 4500, 0, 'manual', 'grant'],
    [`m-${C}-2026-10`, null, C, null, 4860, 0, 'manual', 'month'],
  ]);
  assert.equal(list[0].dayKey, '2026-11-04');
  assert.equal(nextMonth('2026-12'), '2027-01');
});

test('income counts the hand payments next to Stripe, with no fee', () => {
  const manualPayments = manualPaymentsOf(grants, [clinic]);
  const ds = {
    revenue: { status: 'ok' }, revenueMode: 'live', prices: staticPrices, settings: { vatPayer: false },
    payments: [{ id: 'p1', t: T, pid: A, packId: 'pack250', credits: 250, grossCents: 1250, feeCents: 44, refundedCents: 0, taxCents: 0, discountCents: 0, method: 'card' }],
    manualPayments,
    doctors: new Map(), doctorList: [], adjustments: [],
  };
  const income = incomeOf(ds, { fromMs: T - 10000, toMs: T + 10000 }, {});
  assert.equal(Math.round(income.grossEur * 100) / 100, 12.5 + 28 + 45 + 48.6);
  assert.equal(Math.round(income.feeEur * 100) / 100, 0.44, 'only Stripe takes a fee');
  assert.equal(income.payments, 4);
  assert.equal(Math.round(income.byPid[A] * 100) / 100, 12.06 + 28);
  assert.equal(Math.round(income.unattributedNetEur * 100) / 100, 93.6, "the clinic's money is income without a doctor");
});

test("a doctor's purchases: Stripe and by hand, free credits in the average, old unpriced ones out of it", () => {
  const ds = {
    payments: [{ id: 'p1', t: T, pid: A, credits: 250, grossCents: 1250, refundedCents: 0 }],
    grants,
    doctors: new Map([[A, { credits: { available: 900, used: 400, total: 1300 } }]]),
  };
  const m = doctorMoney(ds, A);
  assert.equal(m.boughtCredits, 250 + 700 + 300 + 50);
  assert.equal(m.paidEur, 40.5);
  assert.equal(m.avgEur, 40.5 / (250 + 700 + 300), 'the 50 credits without a price are not in the average');
  assert.deepEqual([m.freeCredits, m.unpricedCredits, m.usedCredits, m.availableCredits], [300, 50, 400, 900]);
  assert.deepEqual([m.stripe.credits, m.byHand.credits, m.byHand.eur], [250, 1050, 28]);
  assert.equal(doctorMoney({ payments: [], grants: [] }, A).avgEur, null);
});

test("a prepaid clinic's top-ups in a period, newest first", () => {
  const r = clinicTopups(grants, C, { fromMs: T - 1, toMs: T + 1 });
  assert.deepEqual([r.credits, r.paidEur, r.avgEur, r.rows.length, r.rows[0].perCreditEur], [1500, 45, 0.03, 1, 0.03]);
  assert.equal(clinicTopups(grants, C, { fromMs: T + 1, toMs: T + 2 }).rows.length, 0);
});

test('an invoiced clinic month by month: amount at its price, paid, part or open', () => {
  const days = [
    { day: '2026-10-03', credits: 700 }, { day: '2026-10-20', credits: 515 },
    { day: '2026-11-02', credits: 100 },
    { day: '2026-09-30', credits: 10 },
  ];
  const r = invoiceMonths(days, clinic);
  assert.deepEqual(r.rows.map((row) => [row.month, row.credits, row.amountEur, row.paidEur, row.status]), [
    ['2026-11', 100, 4, null, 'open'],
    ['2026-10', 1215, 48.6, 48.6, 'paid'],
    ['2026-09', 10, 0.4, 0, 'part'],
  ]);
  assert.deepEqual([r.credits, r.amountEur, r.paidEur], [1325, 53, 48.6]);
  assert.equal(r.avgEur, 48.6 / (1215 + 10));
  const noPrice = invoiceMonths(days, { pricePerCreditEur: null, payments: [] });
  assert.ok(noPrice.rows.every((row) => row.status === 'none' && row.amountEur === null));
});

test('the months card reads whole months: a period starting or ending mid-month is widened', () => {
  assert.deepEqual(wholeMonths({ from: '2026-10-06', effTo: '2026-11-05' }), { from: '2026-10-01', to: '2026-12-01' });
  assert.deepEqual(wholeMonths({ from: '2026-11-01', effTo: '2026-12-01' }), { from: '2026-11-01', to: '2026-12-01' });
  assert.deepEqual(wholeMonths({ from: '2026-12-31', effTo: '2027-01-01' }), { from: '2026-12-01', to: '2027-01-01' });
});
