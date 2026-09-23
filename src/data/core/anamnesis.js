// Medical history summary runs (§4.4). The log has no run id, so a run is inferred (estimate):
// v2 extract + narrative calls of one doctor with gaps under 10 minutes are one run; every v1 summary
// call is a run of its own.
import { ANAMNESIS_RUN_GAP_MS } from '../constants.js';

/**
 * @typedef {{ pid: string, startMs: number, endMs: number, version: 'v1'|'v2', calls: number,
 *   costEur: number, costUsd: number, credits: number, docs: number, facts: number, capped: boolean,
 *   steps: { extractFast: number, extractStrong: number, narrative: number, summary: number },
 *   rowKeys: string[] }} AnamnesisRun
 */

const newRun = (row, version) => ({
  pid: row.pid,
  startMs: row.t,
  endMs: row.t,
  version,
  calls: 0,
  costEur: 0,
  costUsd: 0,
  credits: 0,
  docs: 0,
  facts: 0,
  capped: false,
  steps: { extractFast: 0, extractStrong: 0, narrative: 0, summary: 0 },
  rowKeys: [],
});

const addCall = (run, row) => {
  const info = row.anamnesis ?? {};
  run.endMs = Math.max(run.endMs, row.t);
  run.calls += 1;
  run.costEur += row.costEur;
  run.costUsd += row.costUsd;
  run.credits += Number.isFinite(row.credits) ? row.credits : 0;
  run.docs += Number.isFinite(info.docs) ? info.docs : 0;
  run.facts += Number.isFinite(info.facts) ? info.facts : 0;
  if (info.finishReason === 'MAX_TOKENS') run.capped = true;
  if (info.step === 'summary') run.steps.summary += 1;
  else if (info.step === 'narrative') run.steps.narrative += 1;
  else if (info.tier === 'strong') run.steps.extractStrong += 1;
  else run.steps.extractFast += 1;
  run.rowKeys.push(row.key);
};

/**
 * Groups anamnesis rows into runs.
 * @param {import('../buildDataset.js').UsageRow[]} rows anamnesis rows (any order)
 * @param {{ gapMs?: number }} [options]
 * @returns {AnamnesisRun[]} sorted by start
 */
export function anamnesisRuns(rows, { gapMs = ANAMNESIS_RUN_GAP_MS } = {}) {
  const sorted = [...(rows ?? [])].filter((row) => row.kind === 'anamnesis').sort((a, b) => a.t - b.t);
  const runs = [];
  const openByPid = new Map();
  sorted.forEach((row) => {
    if (row.anamnesis?.step === 'summary') {
      const run = newRun(row, 'v1');
      addCall(run, row);
      runs.push(run);
      return;
    }
    let run = openByPid.get(row.pid);
    if (!run || row.t - run.endMs >= gapMs) {
      run = newRun(row, 'v2');
      openByPid.set(row.pid, run);
      runs.push(run);
    }
    addCall(run, row);
  });
  return runs.sort((a, b) => a.startMs - b.startMs);
}

const runsByDataset = new WeakMap();

/**
 * All runs of a dataset, all accounts, all time (memoised per dataset).
 * @param {import('../buildDataset.js').Dataset} ds
 * @returns {AnamnesisRun[]}
 */
export function datasetRuns(ds) {
  if (!ds || typeof ds !== 'object') return [];
  let runs = runsByDataset.get(ds);
  if (!runs) {
    runs = anamnesisRuns(ds.anamnesis ?? []);
    runsByDataset.set(ds, runs);
  }
  return runs;
}
