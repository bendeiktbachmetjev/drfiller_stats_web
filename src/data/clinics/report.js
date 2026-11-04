// A clinic's usage in a period (Clinics page): per doctor, per day and in total, from the rows of
// GET /clinics/:id/usage — one row per doctor per Vilnius day, written by the server in the same step
// as each charge (backend services/billing/README.md). Pure: no React, no window, no network.
//
//   forms             formCredits − formRefunded          (a form is 1 credit)
//   anamnesisCredits  anamnesisCredits − anamnesisRefunded
//   audioCredits      credits charged for recorded audio; audioMin = the audio recorded
//   refunded          credits given back after failures (already left out of the above)
//   credits           forms + anamnesisCredits + audioCredits (the monthly limit counts them)
//   costEur           our real cost of that work: tokens and recorded minutes (costAiEur + costAudioEur)
//   amountEur         what an invoiced clinic pays for it: the cost plus its markup, fixed by the server when
//                     each request was done (amountAiEur + amountAudioEur; 0 for a prepaid clinic)
// Euros are summed as they come; round only to show them (fmt.eur) or at a month's end (roundCents).

const MIN_MS = 60000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Cents, half up (0.125 → 0.13). */
export const roundCents = (eur) => Math.round(eur * 100 + 1e-7) / 100;

const blank = () => ({ forms: 0, anamnesisCredits: 0, audioCredits: 0, audioMin: 0, refunded: 0, credits: 0, costEur: 0, amountEur: 0 });

/** Adds one usage row to a running total (mutates `total`). */
function addRow(total, row) {
  const forms = num(row.formCredits) - num(row.formRefunded);
  const anamnesis = num(row.anamnesisCredits) - num(row.anamnesisRefunded);
  const audio = num(row.audioCredits);
  total.forms += forms;
  total.anamnesisCredits += anamnesis;
  total.audioCredits += audio;
  total.audioMin += num(row.audioMs) / MIN_MS;
  total.refunded += num(row.formRefunded) + num(row.anamnesisRefunded);
  total.credits += forms + anamnesis + audio;
  total.costEur += num(row.costAiEur) + num(row.costAudioEur);
  total.amountEur += num(row.amountAiEur) + num(row.amountAudioEur);
  return total;
}

/**
 * @param {Array<{ day: string, pid: string, formCredits?: number, formRefunded?: number, anamnesisCredits?: number,
 *   anamnesisRefunded?: number, audioCredits?: number, audioMs?: number, costAiEur?: number, costAudioEur?: number,
 *   amountAiEur?: number, amountAudioEur?: number }>} rows the period's usage rows
 * @param {{ members?: string[] }} [options] members: the clinic's doctors now (each gets a line even without
 *   usage, so the table lists everyone)
 * @returns {{
 *   totals: { forms: number, anamnesisCredits: number, audioCredits: number, audioMin: number, refunded: number,
 *     credits: number, costEur: number, amountEur: number, doctorsWithUsage: number, days: number },
 *   doctors: Array<{ pid: string, member: boolean, activeDays: number } & ReturnType<typeof blank>>,
 *   days: Array<{ day: string, doctors: number } & ReturnType<typeof blank>>
 * }} doctors sorted by credits (most first), days by date
 */
export function clinicReport(rows, { members = [] } = {}) {
  const memberSet = new Set(members);
  const byPid = new Map();
  const byDay = new Map();
  const daysOf = new Map(); // pid → set of days with usage

  (rows ?? []).forEach((row) => {
    if (!row || typeof row.day !== 'string' || typeof row.pid !== 'string') return;
    if (!byPid.has(row.pid)) byPid.set(row.pid, blank());
    addRow(byPid.get(row.pid), row);
    if (!byDay.has(row.day)) byDay.set(row.day, { ...blank(), pids: new Set() });
    const day = addRow(byDay.get(row.day), row);
    day.pids.add(row.pid);
    if (!daysOf.has(row.pid)) daysOf.set(row.pid, new Set());
    daysOf.get(row.pid).add(row.day);
  });
  memberSet.forEach((pid) => {
    if (!byPid.has(pid)) byPid.set(pid, blank());
  });

  const doctors = [...byPid.entries()]
    .map(([pid, total]) => ({
      pid,
      member: memberSet.has(pid),
      ...total,
      activeDays: daysOf.get(pid)?.size ?? 0,
    }))
    .sort((a, b) => b.credits - a.credits || (a.pid < b.pid ? -1 : 1));

  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, { pids, ...total }]) => ({ day, doctors: pids.size, ...total }));

  const totals = doctors.reduce((sum, d) => {
    ['forms', 'anamnesisCredits', 'audioCredits', 'audioMin', 'refunded', 'credits', 'costEur', 'amountEur'].forEach((key) => {
      sum[key] += d[key];
    });
    return sum;
  }, blank());

  return {
    totals: {
      ...totals,
      doctorsWithUsage: doctors.filter((d) => d.activeDays > 0).length,
      days: days.length,
    },
    doctors,
    days,
  };
}

/**
 * What the clinic's doctors cost us in the period (Google and Soniox, from the dataset's usage rows), by the
 * doctors who are in the clinic NOW — a doctor who joined mid-period brings their earlier costs too.
 * @param {Array<{ pid: string, t: number, costEur: number }>} rows dataset usage rows
 * @param {string[]} pids the clinic's doctors
 * @param {{ fromMs: number, toMs: number }} range [fromMs, toMs)
 * @returns {number} €
 */
export function membersCostEur(rows, pids, { fromMs, toMs }) {
  const set = new Set(pids);
  let sum = 0;
  (rows ?? []).forEach((row) => {
    if (set.has(row.pid) && row.t >= fromMs && row.t < toMs) sum += num(row.costEur);
  });
  return sum;
}
