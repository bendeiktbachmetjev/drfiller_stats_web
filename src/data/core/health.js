// Service numbers of a period: all traffic, ignores the scope (§2 rule 3). FROZEN CONTRACT 2: Health.
// The owner's own account is real load, so speed, backup-model answers and failures always count everyone.
import { HEALTH } from '../constants.js';
import { FALLBACK_FEATURE_SINCE_MS } from '../eras.js';
import { inPeriod } from '../period.js';
import { median, quantile } from '../metrics/shared.js';
import { remember } from './memo.js';

/**
 * @typedef {{
 *   forms: number, p50Ms: number|null, p90Ms: number|null, over15: number, over15Share: number|null,
 *   over25: number, over25Share: number|null, mainP50Ms: number|null,
 *   fallbackEligible: number, fallbackCount: number, fallbackShare: number|null, fallbackBasis: import('./basis.js').Basis,
 *   fallbackWaitP50Ms: number|null,
 *   serviceFailures: number|null, serviceFailureRate: number|null, serviceRequests: number|null, refusals: number|null,
 *   failuresByKind: Record<string, number>, refusalsByKind: Record<string, number>,
 *   word: 'ok'|'slow'|'bad'
 * }} Health
 *   serviceRequests = successful requests + service failures since failures are recorded (the rate's denominator).
 */

/** @returns {Health} */
export function emptyHealth() {
  return {
    forms: 0, p50Ms: null, p90Ms: null, over15: 0, over15Share: null, over25: 0, over25Share: null, mainP50Ms: null,
    fallbackEligible: 0, fallbackCount: 0, fallbackShare: null, fallbackBasis: 'estimate', fallbackWaitP50Ms: null,
    serviceFailures: null, serviceFailureRate: null, serviceRequests: null, refusals: null, failuresByKind: {}, refusalsByKind: {},
    word: 'ok',
  };
}

/**
 * Can this form be answered by the backup model? Only forms of a standard setup that had one
 * (from 02.09.2026; the test day 01.09 does not count).
 * @param {import('../buildDataset.js').UsageRow} row
 */
export const fallbackEligible = (row) => row.kind === 'form' && row.eraStandard && row.t >= FALLBACK_FEATURE_SINCE_MS;

/**
 * The health word (§4.1): bad when service failures are ≥ 3 and ≥ 0.5% of requests, or ≥ 5% of forms
 * took over 15 s; ok when under 2% took over 15 s, the backup model answered under 1% and no service
 * failure is recorded; else slow. `over15Share` here is the share among standard-setup forms (see
 * computeHealth), so a finished test week does not keep the word at "bad".
 * @param {{ over15Share: number|null, fallbackShare: number|null, serviceFailures: number|null, serviceFailureRate?: number|null }} numbers
 * @returns {'ok'|'slow'|'bad'}
 */
export function healthWord({ over15Share, fallbackShare, serviceFailures, serviceFailureRate = null }) {
  const slowShare = over15Share ?? 0;
  const failures = serviceFailures ?? 0;
  const manyFailures = failures >= HEALTH.badServiceFailures && (serviceFailureRate ?? 1) >= HEALTH.badServiceFailureRate;
  if (manyFailures || slowShare >= HEALTH.badOver15Share) return 'bad';
  if (slowShare < HEALTH.okOver15Share && (fallbackShare ?? 0) < HEALTH.okFallbackShare && failures === 0) return 'ok';
  return 'slow';
}

/**
 * Service numbers of a period over all traffic.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @returns {Health}
 */
export function summarizeHealth(ds, period) {
  if (!ds || !period) return emptyHealth();
  return remember(ds, `health|${period.key}|${period.effTo}`, () => computeHealth(ds, period));
}

function computeHealth(ds, period) {
  const health = emptyHealth();
  const durations = [];
  const mainDurations = [];
  const fallbackDurations = [];
  // The word looks at standard-setup forms only: test days and the Vertex-EU week stay in the numbers.
  let standardTimed = 0;
  let standardOver15 = 0;
  let fallbackFromB2 = true;
  const b2Since = ds.v2LoggingSince?.forms ?? null;

  (ds.forms ?? []).forEach((row) => {
    if (!inPeriod(row.t, period)) return;
    health.forms += 1;
    if (Number.isFinite(row.durMs)) {
      durations.push(row.durMs);
      if (row.durMs > HEALTH.slowMs) health.over15 += 1;
      if (row.durMs > HEALTH.fallbackWaitMs) health.over25 += 1;
      if (row.role === 'main') mainDurations.push(row.durMs);
      if (row.eraStandard) {
        standardTimed += 1;
        if (row.durMs > HEALTH.slowMs) standardOver15 += 1;
      }
    }
    if (!fallbackEligible(row)) return;
    health.fallbackEligible += 1;
    if (b2Since === null || row.t < b2Since) fallbackFromB2 = false;
    if (row.role === 'fallback') {
      health.fallbackCount += 1;
      if (Number.isFinite(row.durMs)) fallbackDurations.push(row.durMs);
    }
  });

  health.p50Ms = median(durations);
  health.p90Ms = quantile(durations, 0.9);
  health.mainP50Ms = median(mainDurations);
  health.over15Share = durations.length ? health.over15 / durations.length : null;
  health.over25Share = durations.length ? health.over25 / durations.length : null;
  health.fallbackShare = health.fallbackEligible ? health.fallbackCount / health.fallbackEligible : null;
  health.fallbackBasis = health.fallbackEligible > 0 && fallbackFromB2 ? 'exact' : 'estimate';
  health.fallbackWaitP50Ms = median(fallbackDurations);

  // Failures are known only from the first event row on; a period that ends before it shows "—".
  const eventsSince = ds.v2LoggingSince?.events ?? null;
  if (eventsSince !== null && period.toMs > eventsSince) {
    let service = 0;
    let refusals = 0;
    let successes = 0;
    (ds.rows ?? []).forEach((row) => {
      if (row.t < eventsSince || !inPeriod(row.t, period)) return;
      if (row.kind === 'failure') {
        const { group, errorKind } = row.failure;
        const byKind = group === 'refusal' ? health.refusalsByKind : health.failuresByKind;
        byKind[errorKind] = (byKind[errorKind] ?? 0) + 1;
        if (group === 'refusal') refusals += 1;
        else service += 1;
      } else if (row.kind === 'form' || row.kind === 'dictation' || row.kind === 'live' || row.kind === 'anamnesis') {
        successes += 1;
      }
    });
    health.serviceFailures = service;
    health.refusals = refusals;
    health.serviceRequests = successes + service;
    health.serviceFailureRate = health.serviceRequests > 0 ? service / health.serviceRequests : null;
  }

  const wordSlowShare = standardTimed > 0 ? standardOver15 / standardTimed : health.over15Share;
  health.word = healthWord({ ...health, over15Share: wordSlowShare });
  return health;
}
