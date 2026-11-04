// Money the owner records by hand: credits added to a doctor or a prepaid clinic with what was paid for them
// (grants), and what an invoiced clinic paid for a month. Two jobs, both pure:
//   1. manualPaymentsOf → payments next to Stripe's, so Income (Money, Overview, Doctors) counts them;
//   2. the figures of one doctor or clinic: credits bought, euros paid, the average price of a credit, months
//      invoiced and paid.
import { dayKeyOf, monthKeyOf, weekKeyOf } from '../period.js';
import { amountOf, roundCents } from './report.js';

const cents = (eur) => Math.round(eur * 100);

/**
 * Hand money as payments (the shape of normalize/revenue.js#Payment): every grant with a price above 0, and
 * every month an invoiced clinic paid. method 'manual': no payment fee, no pack. A clinic's payment has no
 * doctor (pid null) and carries `clinicId`.
 * @param {import('../normalize/grants.js').Grant[]} grants
 * @param {import('../normalize/clinics.js').Clinic[]} clinics
 * @returns {Array<object>} by time
 */
export function manualPaymentsOf(grants, clinics) {
  const payment = ({ id, t, pid, clinicId, credits, eur, source, month = null }) => ({
    id,
    t,
    sessionT: t,
    pid,
    clinicId,
    packId: null,
    credits,
    currency: 'eur',
    grossCents: cents(eur),
    subtotalCents: cents(eur),
    discountCents: 0,
    taxCents: 0,
    feeCents: 0,
    netCents: cents(eur),
    refundedCents: 0,
    refundedAt: null,
    method: 'manual',
    promo: false,
    credited: 'yes',
    source,
    month,
    dayKey: dayKeyOf(t),
    weekKey: weekKeyOf(t),
    monthKey: monthKeyOf(t),
  });
  const list = [];
  (grants ?? []).forEach((g) => {
    if (!(g.priceEur > 0)) return;
    list.push(payment({ id: g.id, t: g.t, pid: g.pid, clinicId: g.clinicId, credits: g.credits, eur: g.priceEur, source: 'grant' }));
  });
  (clinics ?? []).forEach((clinic) => {
    clinic.payments.forEach((p) => {
      if (!(p.amountEur > 0)) return;
      // Recorded when the owner entered it; an old record without a time counts on the 1st of the next month
      const t = Number.isFinite(p.at) ? p.at : Date.parse(`${nextMonth(p.month)}-01T00:00:00Z`);
      list.push(payment({ id: `m-${clinic.id}-${p.month}`, t, pid: null, clinicId: clinic.id, credits: null, eur: p.amountEur, source: 'month', month: p.month }));
    });
  });
  return list.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
}

/**
 * The whole calendar months a period touches, as Vilnius days [from, to): an invoice is for whole months,
 * so a period that starts or ends mid-month still shows each of its months in full.
 * @param {{ from: string, effTo: string }} period from inclusive, effTo exclusive ('YYYY-MM-DD')
 * @returns {{ from: string, to: string }}
 */
export function wholeMonths(period) {
  const last = new Date(`${period.effTo}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  const lastMonth = last.toISOString().slice(0, 7);
  return { from: `${period.from.slice(0, 7)}-01`, to: `${nextMonth(lastMonth < period.from.slice(0, 7) ? period.from.slice(0, 7) : lastMonth)}-01` };
}

/** '2026-12' → '2027-01'. */
export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** €/credit of what was paid for priced credits; null without any. */
const averageOf = (eur, credits) => (credits > 0 ? eur / credits : null);

/**
 * Everything one doctor bought, all time: packs through Stripe and credits added by hand.
 * @param {{ payments?: object[], grants?: object[], doctors?: Map<string, object> }} ds
 * @param {string} pid
 * @returns {{ boughtCredits: number, paidEur: number, avgEur: number|null, freeCredits: number, unpricedCredits: number,
 *   stripe: { payments: number, credits: number, eur: number }, byHand: { grants: number, credits: number, eur: number },
 *   usedCredits: number|null, availableCredits: number|null }}
 *   paidEur is what the doctor paid (gross); avgEur = paidEur / the credits that had a price (free ones included,
 *   at €0); unpricedCredits = hand credits added before prices were recorded (left out of the average).
 */
export function doctorMoney(ds, pid) {
  const stripe = { payments: 0, credits: 0, eur: 0 };
  (ds?.payments ?? []).forEach((p) => {
    if (p.pid !== pid) return;
    stripe.payments += 1;
    stripe.credits += Number.isFinite(p.credits) ? p.credits : 0;
    stripe.eur += ((p.grossCents ?? 0) - (p.refundedCents ?? 0)) / 100;
  });
  const byHand = { grants: 0, credits: 0, eur: 0 };
  let freeCredits = 0;
  let unpricedCredits = 0;
  (ds?.grants ?? []).forEach((g) => {
    if (g.pid !== pid) return;
    byHand.grants += 1;
    byHand.credits += g.credits;
    if (g.priceEur === null) unpricedCredits += g.credits;
    else {
      byHand.eur += g.priceEur;
      if (g.priceEur === 0) freeCredits += g.credits;
    }
  });
  const doctor = ds?.doctors?.get?.(pid) ?? null;
  const paidEur = roundCents(stripe.eur + byHand.eur);
  return {
    boughtCredits: stripe.credits + byHand.credits,
    paidEur,
    avgEur: averageOf(paidEur, stripe.credits + byHand.credits - unpricedCredits),
    freeCredits,
    unpricedCredits,
    stripe: { ...stripe, eur: roundCents(stripe.eur) },
    byHand: { ...byHand, eur: roundCents(byHand.eur) },
    usedCredits: doctor?.credits ? doctor.credits.used : null,
    availableCredits: doctor?.credits ? doctor.credits.available : null,
  };
}

/**
 * A prepaid clinic's top-ups in [fromMs, toMs), newest first, with their totals.
 * @param {import('../normalize/grants.js').Grant[]} grants
 * @param {string} clinicId
 * @param {{ fromMs: number, toMs: number }} range
 * @returns {{ rows: Array<{ id: string, t: number, credits: number, priceEur: number|null, perCreditEur: number|null, note: string }>,
 *   credits: number, paidEur: number, avgEur: number|null, unpricedCredits: number }}
 */
export function clinicTopups(grants, clinicId, { fromMs, toMs }) {
  const rows = (grants ?? [])
    .filter((g) => g.clinicId === clinicId && g.t >= fromMs && g.t < toMs)
    .map((g) => ({ id: g.id, t: g.t, credits: g.credits, priceEur: g.priceEur, perCreditEur: g.priceEur === null ? null : g.priceEur / g.credits, note: g.note }))
    .sort((a, b) => b.t - a.t);
  const credits = rows.reduce((s, r) => s + r.credits, 0);
  const unpricedCredits = rows.filter((r) => r.priceEur === null).reduce((s, r) => s + r.credits, 0);
  const paidEur = roundCents(rows.reduce((s, r) => s + (r.priceEur ?? 0), 0));
  return { rows, credits, paidEur, avgEur: averageOf(paidEur, credits - unpricedCredits), unpricedCredits };
}

/**
 * An invoiced clinic month by month: the credits its doctors used (from the period's usage report days), the
 * amount at the clinic's price, and what it paid (the owner's records).
 * @param {Array<{ day: string, credits: number }>} days clinicReport(...).days
 * @param {{ pricePerCreditEur: number|null, payments: Array<{ month: string, amountEur: number, note: string, at: number|null }> }} clinic
 * @returns {{ rows: Array<{ month: string, credits: number, amountEur: number|null, paidEur: number|null, note: string,
 *   status: 'paid'|'part'|'open'|'none' }>, credits: number, amountEur: number|null, paidEur: number, avgEur: number|null }}
 *   status: paid (≥ the amount), part (less), open (nothing yet), none (no price to compare with)
 */
export function invoiceMonths(days, clinic) {
  const byMonth = new Map();
  (days ?? []).forEach((d) => byMonth.set(d.day.slice(0, 7), (byMonth.get(d.day.slice(0, 7)) ?? 0) + d.credits));
  const paid = new Map((clinic?.payments ?? []).map((p) => [p.month, p]));
  const rows = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, credits]) => {
      const amountEur = amountOf(credits, clinic?.pricePerCreditEur);
      const payment = paid.get(month) ?? null;
      const paidEur = payment ? payment.amountEur : null;
      let status = 'open';
      if (paidEur !== null) status = amountEur === null ? 'paid' : paidEur + 0.005 >= amountEur ? 'paid' : 'part';
      else if (amountEur === null) status = 'none';
      return { month, credits, amountEur, paidEur, note: payment?.note ?? '', status };
    });
  const credits = rows.reduce((s, r) => s + r.credits, 0);
  const paidRows = rows.filter((r) => r.paidEur !== null);
  const paidEur = roundCents(paidRows.reduce((s, r) => s + r.paidEur, 0));
  return {
    rows,
    credits,
    amountEur: amountOf(credits, clinic?.pricePerCreditEur),
    paidEur,
    avgEur: averageOf(paidEur, paidRows.reduce((s, r) => s + r.credits, 0)),
  };
}
