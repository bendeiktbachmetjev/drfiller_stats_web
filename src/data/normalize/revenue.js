// /revenue → payments and adjustments with Vilnius keys. Money maths (fee, VAT, net) is core/summary's job.
import { dayKeyOf, monthKeyOf, weekKeyOf } from '../period.js';

/**
 * @typedef {import('../api/contract.js').PaymentApi & { dayKey: string, weekKey: string, monthKey: string }} Payment
 * @typedef {{ t: number, type: 'dispute'|'stripe_fee'|'other', amountCents: number, paymentId: string|null, dayKey: string }} Adjustment
 */

/**
 * @param {import('../api/contract.js').RevenueApi|null} api
 * @returns {{ status: 'ok'|'off'|'error'|'test', revenueMode: 'live'|'test'|null, payments: Payment[], adjustments: Adjustment[],
 *   webhook: import('../api/contract.js').RevenueApi['webhook']|null, ignoredSessions: number, reason: string|null }}
 */
export function normalizeRevenue(api) {
  if (!api || typeof api !== 'object') {
    return { status: 'error', revenueMode: null, payments: [], adjustments: [], webhook: null, ignoredSessions: 0, reason: null };
  }
  const revenueMode = api.livemode === true ? 'live' : api.livemode === false ? 'test' : null;
  const status = api.status === 'ok' && revenueMode === 'test' ? 'test' : api.status;
  const withKeys = (t) => ({ dayKey: dayKeyOf(t), weekKey: weekKeyOf(t), monthKey: monthKeyOf(t) });
  const payments = (api.payments ?? []).map((p) => ({ ...p, ...withKeys(p.t) })).sort((a, b) => a.t - b.t);
  const adjustments = (api.adjustments ?? []).map((a) => ({ ...a, dayKey: dayKeyOf(a.t) })).sort((a, b) => a.t - b.t);
  return {
    status,
    revenueMode,
    payments,
    adjustments,
    webhook: api.webhook ?? null,
    ignoredSessions: api.ignoredSessions ?? 0,
    reason: api.reason ?? null,
  };
}
