// Credits spent (§5.3.7 "Credits spent"):
//  forms 1 each (rule); medical history summaries: the stored `credits`; recording:
//  (a) meter rows (t ≥ METER_SINCE, from the first meter row on) → Σ chargedCredits (stored);
//  (b) METER_SINCE ≤ t < first meter row → simulateMeter (600,000 ms per credit, carry per doctor; estimate);
//  (c) t < METER_SINCE → simulatePerVisit (the old rule; estimate).
import { MS_PER_CREDIT } from '../constants.js';
import { METER_SINCE_MS } from '../eras.js';
import { inPeriod } from '../period.js';
import { hidesInternal, isInternal } from './scope.js';

const isRecording = (row) => row.kind === 'dictation' || row.kind === 'live';
const byTime = (a, b) => a.t - b.t;

const push = (map, pid, entry) => {
  const list = map.get(pid);
  if (list) list.push(entry);
  else map.set(pid, [entry]);
};

const runMeter = (rows, { sinceMs, untilMs, msPerCredit }) => {
  const charges = new Map();
  const bank = new Map();
  (rows ?? [])
    .filter((row) => isRecording(row) && row.t >= sinceMs && row.t < untilMs && Number.isFinite(row.audioSec))
    .sort(byTime)
    .forEach((row) => {
      const total = (bank.get(row.pid) ?? 0) + Math.round(row.audioSec * 1000);
      const credits = Math.floor(total / msPerCredit);
      bank.set(row.pid, total - credits * msPerCredit);
      if (credits > 0) push(charges, row.pid, { t: row.t, credits });
    });
  return { charges, bank };
};

/**
 * Audio meter simulation: 600,000 ms per credit, remainder carried per doctor, debt ignored.
 * @param {import('../buildDataset.js').UsageRow[]} rows dictation + live rows (other kinds are ignored)
 * @param {{ sinceMs: number, untilMs?: number, msPerCredit?: number }} options
 * @returns {Map<string, Array<{ t: number, credits: number }>>} charges per pid
 */
export function simulateMeter(rows, { sinceMs, untilMs = Infinity, msPerCredit = MS_PER_CREDIT }) {
  return runMeter(rows, { sinceMs, untilMs, msPerCredit }).charges;
}

/**
 * What the simulated meter still holds per doctor at the end (ms not yet charged).
 * @param {import('../buildDataset.js').UsageRow[]} rows
 * @param {{ sinceMs: number, untilMs?: number, msPerCredit?: number }} options
 * @returns {Map<string, number>}
 */
export function simulatedMeterBank(rows, { sinceMs, untilMs = Infinity, msPerCredit = MS_PER_CREDIT }) {
  return runMeter(rows, { sinceMs, untilMs, msPerCredit }).bank;
}

/**
 * The old per-visit rule (before METER_SINCE): per doctor, the first dictation after a form is free and
 * each further dictation before the next form costs 1; live conversations the same, on their own count.
 * dictation, dictation, form, dictation → 1 credit.
 * @param {import('../buildDataset.js').UsageRow[]} rows forms + dictation + live rows
 * @param {{ untilMs?: number }} [options]
 * @returns {Map<string, Array<{ t: number, credits: number }>>}
 */
export function simulatePerVisit(rows, { untilMs = METER_SINCE_MS } = {}) {
  const charges = new Map();
  const free = new Map(); // pid → { dictation: boolean, live: boolean }
  (rows ?? [])
    .filter((row) => row.t < untilMs && (row.kind === 'form' || isRecording(row)))
    .sort(byTime)
    .forEach((row) => {
      const state = free.get(row.pid) ?? { dictation: true, live: true };
      if (row.kind === 'form') {
        state.dictation = true;
        state.live = true;
      } else if (state[row.kind]) {
        state[row.kind] = false;
      } else {
        push(charges, row.pid, { t: row.t, credits: 1 });
      }
      free.set(row.pid, state);
    });
  return charges;
}

const chargesByDataset = new WeakMap();

/**
 * Recording charges of the whole dataset, all accounts (memoised per dataset).
 * @param {import('../buildDataset.js').Dataset} ds
 * @returns {{ boundaryMs: number, perVisit: Map<string, Array<{ t: number, credits: number }>>,
 *   meter: Map<string, Array<{ t: number, credits: number }>> }}
 */
export function recordingCharges(ds) {
  let cached = chargesByDataset.get(ds);
  if (cached) return cached;
  const firstMeter = (ds.meter ?? []).find((row) => row.t >= METER_SINCE_MS);
  const boundaryMs = firstMeter ? firstMeter.t : Infinity;
  const rows = ds.rows ?? [];
  cached = {
    boundaryMs,
    perVisit: simulatePerVisit(rows, { untilMs: METER_SINCE_MS }),
    meter: simulateMeter(rows, { sinceMs: METER_SINCE_MS, untilMs: boundaryMs }),
  };
  chargesByDataset.set(ds, cached);
  return cached;
}

/**
 * Credits spent in a period (business numbers: follows the scope).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('./scope.js').Scope} scope
 * @returns {{ form: number, recording: number, anamnesis: number, total: number, recordingBasis: 'stored'|'estimate'|'mixed'|'none' }}
 */
export function creditsSpent(ds, period, scope) {
  const hide = hidesInternal(ds, scope);
  const keep = (pid) => !(hide && isInternal(pid, ds));
  let form = 0;
  let anamnesis = 0;
  let stored = 0;
  let hasRecording = false;
  (ds?.rows ?? []).forEach((row) => {
    if (!inPeriod(row.t, period) || !keep(row.pid)) return;
    if (row.kind === 'form') form += 1;
    else if (row.kind === 'anamnesis') anamnesis += Number.isFinite(row.credits) ? row.credits : 0;
    else if (isRecording(row)) hasRecording = true;
    else if (row.kind === 'meter' && row.t >= METER_SINCE_MS) {
      hasRecording = true;
      stored += Number.isFinite(row.credits) ? row.credits : 0;
    }
  });

  const { boundaryMs, perVisit, meter } = recordingCharges(ds);
  let simulated = 0;
  [perVisit, meter].forEach((charges) => {
    charges.forEach((list, pid) => {
      if (!keep(pid)) return;
      list.forEach((charge) => {
        if (inPeriod(charge.t, period)) simulated += charge.credits;
      });
    });
  });

  const touchesStored = Number.isFinite(boundaryMs) && period.toMs > boundaryMs;
  const touchesSimulated = period.fromMs < boundaryMs;
  let recordingBasis = 'none';
  if (hasRecording) {
    if (touchesStored && touchesSimulated) recordingBasis = 'mixed';
    else recordingBasis = touchesStored ? 'stored' : 'estimate';
  }
  const recording = stored + simulated;
  return { form, recording, anamnesis, total: form + recording + anamnesis, recordingBasis };
}
