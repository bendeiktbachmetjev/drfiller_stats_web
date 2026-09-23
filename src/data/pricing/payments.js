// Payment-provider fees and VAT (§3.5, Appendix C.1). EUR. Money rounds half-up to cents.

const ALIASES = { card: 'card_eea_standard', link: 'card_eea_standard' };
const UNKNOWN = 'card_international';

/** Cents, half-up (0.925 → 0.93 despite binary floating point). */
export const roundCents = (x) => Math.round(x * 100 + 1e-7) / 100;

const feeRow = (prices, method) => {
  const fees = prices?.PAYMENT_FEES ?? {};
  const aliases = prices?.PAYMENT_METHOD_ALIASES ?? ALIASES;
  const key = aliases[method] || method;
  return fees[key] ?? fees[prices?.PAYMENT_UNKNOWN ?? UNKNOWN] ?? { pct: 0.0315, fixed: 0.25 };
};

/**
 * Fee for one successful charge.
 * @param {object} prices snapshot
 * @param {number} amountEur
 * @param {string} [method] 'card_eea_standard' | 'card_eea_premium' | 'card_international' | 'revolut_pay' | 'paypal' | 'card' | 'link'
 * @returns {number} € (paymentFeeEur(12.50) = 0.44, (45) = 0.93, PayPal 12.50 = 0.90)
 */
export function paymentFeeEur(prices, amountEur, method = 'card_eea_standard') {
  const f = feeRow(prices, method);
  return roundCents((Number(amountEur) || 0) * f.pct + f.fixed);
}

/**
 * PayPal's own fee on a PayPal payment made through Stripe. Stripe's balance transaction holds only
 * Stripe's part, so the dashboard adds this part from the price table (basis estimate).
 * @param {object} prices snapshot
 * @param {number} amountEur
 * @returns {number} € (12.50 → 0.78)
 */
export function paypalOwnFeeEur(prices, amountEur) {
  const part = prices?.PAYMENT_FEES?.paypal?.paypalPart ?? { pct: 0.034, fixed: 0.35 };
  return roundCents((Number(amountEur) || 0) * part.pct + part.fixed);
}

/** VAT rate (0.21). */
export const vatRate = (prices) => prices?.TAX?.lt_vat?.rate ?? 0.21;

/**
 * VAT inside a gross amount: `taxCents` when Stripe Tax filled it, else (gross − refunded) × 21/121.
 * @param {object} prices
 * @param {{ grossEur: number, refundEur?: number, taxEur?: number }} amounts
 */
export function vatInsideEur(prices, { grossEur, refundEur = 0, taxEur = 0 }) {
  if (taxEur > 0) return taxEur;
  const rate = vatRate(prices);
  return ((grossEur - refundEur) * rate) / (1 + rate);
}
