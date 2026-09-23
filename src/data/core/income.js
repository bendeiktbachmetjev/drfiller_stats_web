// Income of a period (§5.3.7 "Income"): Dr.Filler pack payments in live mode only, on their money time.
// net = gross − refund − fee − VAT (if we pay it); disputes on their own date; account-level Stripe fees
// are listed, never subtracted. Stripe off / error / test → the income is not known ('missing').
import { PACK_SIZES } from '../constants.js';
import { inPeriod } from '../period.js';
import { paymentFeeEur, paypalOwnFeeEur, vatInsideEur } from '../pricing/payments.js';
import { DEFAULT_PACKS, packsOf } from './packs.js';
import { hidesInternal, isInternal, scopedDoctors } from './scope.js';

/**
 * 'ok' only for a live-mode Stripe answer; a test-mode key gives 'test' (not counted as income).
 * @param {import('../buildDataset.js').Dataset} ds
 * @returns {'ok'|'off'|'error'|'test'}
 */
export function incomeStatus(ds) {
  const status = ds?.revenue?.status ?? ds?.sources?.revenue?.status ?? 'error';
  if (status === 'ok') return ds.revenueMode === 'test' ? 'test' : 'ok';
  if (status === 'off' || status === 'test') return status;
  return 'error';
}

/**
 * Money of one payment.
 * @param {import('../normalize/revenue.js').Payment} payment
 * @param {{ prices: object, vatPayer: boolean }} options
 * @returns {{ grossEur: number, discountEur: number, refundEur: number, feeEur: number, feeEstimated: boolean, vatEur: number, netEur: number }}
 */
export function paymentMoney(payment, { prices, vatPayer }) {
  const grossEur = (payment.grossCents ?? 0) / 100;
  const refundEur = (payment.refundedCents ?? 0) / 100;
  let feeEur;
  let feeEstimated = false;
  if (Number.isFinite(payment.feeCents)) {
    feeEur = payment.feeCents / 100;
    if (payment.method === 'paypal') {
      feeEur += paypalOwnFeeEur(prices, grossEur);
      feeEstimated = true;
    }
  } else {
    feeEur = paymentFeeEur(prices, grossEur, payment.method === 'other' ? 'card_international' : payment.method);
    feeEstimated = true;
  }
  const vatEur = vatPayer ? vatInsideEur(prices, { grossEur, refundEur, taxEur: (payment.taxCents ?? 0) / 100 }) : 0;
  return {
    grossEur,
    discountEur: (payment.discountCents ?? 0) / 100,
    refundEur,
    feeEur,
    feeEstimated,
    vatEur,
    netEur: grossEur - refundEur - feeEur - vatEur,
  };
}

/** Credits of a payment: its `credits`, else its pack size. */
export const paymentCredits = (payment) =>
  Number.isFinite(payment.credits) && payment.credits > 0 ? payment.credits : PACK_SIZES[payment.packId] ?? 0;

/**
 * Purchases guessed from credit balances while Stripe is not usable (§4.2): the fewest-pack
 * decompositions of `bought_inferred` doctors (≤ €108.50 on the real data). Basis inferred.
 * @param {Array<{ class: string, inferredPacks?: object|null }>} doctors
 * @param {Array<{ id: string, priceEur: number }>} packs
 * @returns {{ purchases: number, eur: number }}
 */
export function inferredLifetimeIncome(doctors, packs = DEFAULT_PACKS) {
  const price = Object.fromEntries(packs.map((pack) => [pack.id, pack.priceEur]));
  let purchases = 0;
  let eur = 0;
  (doctors ?? []).forEach((doctor) => {
    if (doctor.class !== 'bought_inferred' || !doctor.inferredPacks) return;
    Object.entries(doctor.inferredPacks).forEach(([id, count]) => {
      if (!Number.isFinite(count) || count <= 0) return;
      purchases += count;
      eur += count * (price[id] ?? 0);
    });
  });
  return { purchases, eur };
}

/**
 * @typedef {{ status: 'ok'|'off'|'error'|'test', basis: import('./basis.js').Basis, grossEur: number, discountEur: number,
 *   feeEur: number, refundEur: number, vatEur: number, disputeEur: number, netEur: number, payments: number,
 *   payingDoctors: number, creditsSold: number, lastPaymentMs: number|null, otherStripeFeesEur: number,
 *   byPid: Record<string, number>, unattributedNetEur: number, inferredLifetime: { purchases: number, eur: number } | null }} Income
 */

/**
 * Income of a period (business numbers: follows the scope).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {Income}
 */
export function incomeOf(ds, period, scope) {
  const status = incomeStatus(ds);
  const income = {
    status,
    basis: status === 'ok' ? 'exact' : 'missing',
    grossEur: 0,
    discountEur: 0,
    feeEur: 0,
    refundEur: 0,
    vatEur: 0,
    disputeEur: 0,
    netEur: 0,
    payments: 0,
    payingDoctors: 0,
    creditsSold: 0,
    lastPaymentMs: null,
    otherStripeFeesEur: 0,
    byPid: {},
    unattributedNetEur: 0,
    inferredLifetime: null,
  };
  if (status !== 'ok') {
    income.inferredLifetime = inferredLifetimeIncome(scopedDoctors(ds, scope), packsOf(ds));
    return income;
  }

  const vatPayer = Boolean(scope?.vatPayer ?? ds.settings?.vatPayer);
  const hide = hidesInternal(ds, scope);
  const keep = (pid) => !(hide && pid && isInternal(pid, ds));
  const addNet = (pid, eur) => {
    if (pid) income.byPid[pid] = (income.byPid[pid] ?? 0) + eur;
    else income.unattributedNetEur += eur;
  };
  const payers = new Set();
  let estimated = false;

  (ds.payments ?? []).forEach((payment) => {
    if (!keep(payment.pid)) return;
    if (payment.t < period.toMs && (income.lastPaymentMs === null || payment.t > income.lastPaymentMs)) income.lastPaymentMs = payment.t;
    if (!inPeriod(payment.t, period)) return;
    const money = paymentMoney(payment, { prices: ds.prices, vatPayer });
    income.payments += 1;
    income.grossEur += money.grossEur;
    income.discountEur += money.discountEur;
    income.refundEur += money.refundEur;
    income.feeEur += money.feeEur;
    income.vatEur += money.vatEur;
    income.netEur += money.netEur;
    income.creditsSold += paymentCredits(payment);
    if (money.feeEstimated) estimated = true;
    if (payment.pid) payers.add(payment.pid);
    addNet(payment.pid, money.netEur);
  });

  const paymentById = new Map((ds.payments ?? []).map((payment) => [payment.id, payment]));
  (ds.adjustments ?? []).forEach((adjustment) => {
    if (!inPeriod(adjustment.t, period)) return;
    const eur = (adjustment.amountCents ?? 0) / 100;
    if (adjustment.type === 'stripe_fee') {
      income.otherStripeFeesEur += Math.abs(eur);
      return;
    }
    if (adjustment.type !== 'dispute') return;
    const pid = paymentById.get(adjustment.paymentId)?.pid ?? null;
    if (!keep(pid)) return;
    income.disputeEur += eur;
    income.netEur += eur;
    addNet(pid, eur);
  });

  income.payingDoctors = payers.size;
  income.basis = estimated ? 'estimate' : 'exact';
  return income;
}
