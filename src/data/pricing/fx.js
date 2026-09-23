// USD → EUR, converted once with the price table's ECB rate (§3.6, D7).
import { DEFAULT_FX } from '../constants.js';

/**
 * @param {{ FX?: { usdPerEur?: number, rateDate?: string } } | null} prices a price snapshot
 * @returns {{ usdPerEur: number, rateDate: string }}
 */
export function fxOf(prices) {
  const usdPerEur = Number(prices?.FX?.usdPerEur);
  return Number.isFinite(usdPerEur) && usdPerEur > 0
    ? { usdPerEur, rateDate: prices.FX.rateDate ?? DEFAULT_FX.rateDate }
    : { ...DEFAULT_FX };
}

/** @param {number} usd @param {{ usdPerEur: number }} fx @returns {number} */
export const usdToEur = (usd, fx = DEFAULT_FX) => (Number.isFinite(usd) ? usd / fx.usdPerEur : 0);

/** @param {number} eur @param {{ usdPerEur: number }} fx @returns {number} */
export const eurToUsd = (eur, fx = DEFAULT_FX) => (Number.isFinite(eur) ? eur * fx.usdPerEur : 0);
