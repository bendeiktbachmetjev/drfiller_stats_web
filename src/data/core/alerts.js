// "Needs attention" (§3.10): pure rules over today's numbers. SKELETON — F0-DATA implements the rules.
// Output keys are copy keys under `alerts.*`; values are raw numbers with fmt hints.

/**
 * @typedef {{ key: string, tone: 'attention'|'quiet', values: Record<string, unknown>, link: string }} Alert
 */

/** Rule order (ties are shown in this order after attention-first sorting). */
export const ALERT_ORDER = Object.freeze([
  'notCredited', 'stripeTestMode', 'fallbackToday', 'slowToday', 'failuresHour', 'liveNearLimit', 'silence',
  'anamCap', 'openaiDictation', 'lifecycleSoon', 'revenueDown', 'pricesStale',
]);

/**
 * @param {{ ds: import('../buildDataset.js').Dataset, today: import('./today.js').TodaySummary|null,
 *   live: import('../api/contract.js').LiveNowApi|null, nowMs: number }} input
 * @returns {Alert[]} attention first, then rule order; at most ALERTS.maxShown (3)
 * @todo F0-DATA
 */
export function computeAlerts({ ds, today, live, nowMs }) {
  return [];
}
