// Pack prices and the money of one credit (§3.5, §3.8, Appendix C.1/C.3).
import { PACK_IDS } from '../constants.js';
import { paymentFeeEur, vatRate } from '../pricing/payments.js';

/** Pack prices when /config is missing (Appendix C.1). */
export const DEFAULT_PACKS = Object.freeze([
  Object.freeze({ id: 'pack250', credits: 250, priceEur: 12.5, discountPct: 0 }),
  Object.freeze({ id: 'pack600', credits: 600, priceEur: 24, discountPct: 20 }),
  Object.freeze({ id: 'pack1500', credits: 1500, priceEur: 45, discountPct: 40 }),
]);

/** @param {{ config?: object|null }} ds @returns {Array<{ id: string, credits: number, priceEur: number }>} */
export const packsOf = (ds) => (Array.isArray(ds?.config?.billing?.packs) && ds.config.billing.packs.length ? ds.config.billing.packs : DEFAULT_PACKS);

/**
 * @typedef {{ priceEur: number, feeEur: number, vatEur: number, netEur: number }} CreditMoney
 *   per credit: what the doctor pays (gross), the payment fee, VAT (if we pay it) and what is left (net)
 */

const packMoneyOne = (id, { vatPayer, method, prices, packs }) => {
  const pack = packs.find((p) => p.id === id) ?? DEFAULT_PACKS.find((p) => p.id === id);
  const price = pack.priceEur;
  const credits = pack.credits;
  const fee = paymentFeeEur(prices, price, method);
  const rate = vatRate(prices);
  const vat = vatPayer ? (price * rate) / (1 + rate) : 0;
  return { priceEur: price / credits, feeEur: fee / credits, vatEur: vat / credits, netEur: (price - fee - vat) / credits };
};

/**
 * Money of one credit in a pack. 'plan' = the packMix-weighted mix (§3.8).
 * @param {'plan'|'pack250'|'pack600'|'pack1500'} pack
 * @param {{ vatPayer: boolean, method: string, prices: object, packs?: Array<{ id: string, credits: number, priceEur: number }>,
 *   packMix?: { pack250: number, pack600: number, pack1500: number } }} options
 * @returns {CreditMoney}
 */
export function creditMoney(pack, { vatPayer = false, method = 'card_eea_standard', prices, packs = DEFAULT_PACKS, packMix }) {
  const context = { vatPayer, method, prices, packs };
  if (pack !== 'plan') return packMoneyOne(pack, context);
  const mix = packMix ?? { pack250: 0, pack600: 0, pack1500: 1 };
  const weightSum = PACK_IDS.reduce((acc, id) => acc + (mix[id] > 0 ? mix[id] : 0), 0) || 1;
  const out = { priceEur: 0, feeEur: 0, vatEur: 0, netEur: 0 };
  PACK_IDS.forEach((id) => {
    const weight = mix[id] > 0 ? mix[id] / weightSum : 0;
    if (!weight) return;
    const one = packMoneyOne(id, context);
    Object.keys(out).forEach((key) => {
      out[key] += weight * one[key];
    });
  });
  return out;
}

