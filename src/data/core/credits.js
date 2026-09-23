// Credits spent (§5.3.7 "Credits spent"). SKELETON — F0-DATA implements the rules:
//  forms 1 each (rule); anamnesis stored `credits`; recording (a) t ≥ METER_SINCE and ≥ v2LoggingSince.events →
//  Σ meter.chargedCredits (stored); (b) METER_SINCE ≤ t < first meter row → simulateMeter (estimate);
//  (c) t < METER_SINCE → simulatePerVisit (old rule; estimate).

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {{ form: number, recording: number, anamnesis: number, total: number, recordingBasis: 'stored'|'estimate'|'mixed'|'none' }}
 * @todo F0-DATA
 */
export function creditsSpent(ds, period, scope) {
  return { form: 0, recording: 0, anamnesis: 0, total: 0, recordingBasis: 'none' };
}

/**
 * Audio meter simulation: 600,000 ms per credit, remainder carried per doctor, debt ignored.
 * @param {import('../buildDataset.js').UsageRow[]} rows dictation + live rows
 * @param {{ sinceMs: number, untilMs: number, msPerCredit?: number }} options
 * @returns {Map<string, Array<{ t: number, credits: number }>>} charges per pid
 * @todo F0-DATA
 */
export function simulateMeter(rows, { sinceMs, untilMs, msPerCredit = 600000 }) {
  return new Map();
}

/**
 * The old per-visit rule (before METER_SINCE): per doctor, a dictation right after a form is free,
 * each further dictation before the next form costs 1; the same for live conversations.
 * @param {import('../buildDataset.js').UsageRow[]} rows forms + dictation + live rows, sorted by t
 * @param {{ untilMs: number }} options
 * @returns {Map<string, Array<{ t: number, credits: number }>>}
 * @todo F0-DATA
 */
export function simulatePerVisit(rows, { untilMs }) {
  return new Map();
}
