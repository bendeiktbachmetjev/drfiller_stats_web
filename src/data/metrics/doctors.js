// Doctors page metric (§4.8): who uses Dr.Filler, who pays, and what each doctor costs.
// Business numbers: they follow "Without my and test accounts". Shared headlines are the core's own
// values (active and paying doctors from summarize(), the plan doctor from projectScale(); §6.3), and the
// per-doctor money is read from summary.cost.byPid and summary.income.byPid, so the rows add up to the
// core totals.
import { MIN_DAYS_FOR_MONTH } from '../constants.js';
import { resolvePeriod } from '../period.js';
import { datasetRuns } from '../core/anamnesis.js';
import { incomeStatus } from '../core/income.js';
import { projectScale } from '../core/projection.js';
import { hidesInternal, internalCount, isInternal, scopedDoctors } from '../core/scope.js';
import { REQUEST_KINDS, summarize, topDoctorOf } from '../core/summary.js';
import { EMPTY_RESULT, inPeriod, share } from './shared.js';

/** Table views: doctors with a request in the period, or every account in the scope. */
export const VIEWS = Object.freeze(['active', 'all']);
/** Parts of "Costs by account type", in their fixed order (summary.cost.byClass keys). */
export const CLASS_ORDER = Object.freeze(['internal', 'gifted', 'free', 'paid', 'other']);
/** The first-run question "Is this your account?" needs a legacy account above this share of all forms. */
export const SUGGEST_SHARE = 0.5;
/** Above this share of the costs, one doctor is "most of the panel" (note + (i) of the tile). */
export const ONE_DOCTOR_SHARE = 0.5;

const RECORDING_KINDS = new Set(['dictation', 'live']);
const NO_ACCOUNT = new Set(['anonymous', 'deleted']);

/**
 * Per-pid activity in one pass over the rows (all traffic; the caller applies the scope).
 * Requests only (forms, dictations, live conversations, medical history calls); meter and failure rows
 * are not a doctor's request.
 * @returns {Map<string, { requests: number, forms: number, recordingMin: number, anamnesisRuns: number,
 *   formsAll: number, lastMs: number, recent: boolean }>}
 */
function activityByPid(ds, period, last30) {
  const byPid = new Map();
  const entryOf = (pid) => {
    let entry = byPid.get(pid);
    if (!entry) {
      entry = { requests: 0, forms: 0, recordingMin: 0, anamnesisRuns: 0, formsAll: 0, lastMs: -Infinity, recent: false };
      byPid.set(pid, entry);
    }
    return entry;
  };
  (ds.rows ?? []).forEach((row) => {
    if (!REQUEST_KINDS.has(row.kind)) return;
    const entry = entryOf(row.pid);
    if (row.kind === 'form') entry.formsAll += 1;
    if (row.t < ds.nowMs && row.t > entry.lastMs) entry.lastMs = row.t;
    if (inPeriod(row.t, last30)) entry.recent = true;
    if (!inPeriod(row.t, period)) return;
    entry.requests += 1;
    if (row.kind === 'form') entry.forms += 1;
    if (RECORDING_KINDS.has(row.kind) && Number.isFinite(row.audioSec)) entry.recordingMin += row.audioSec / 60;
  });
  datasetRuns(ds).forEach((run) => {
    if (inPeriod(run.startMs, period)) entryOf(run.pid).anamnesisRuns += 1;
  });
  return byPid;
}

/** The short code of a pid the server no longer lists (same rule as the backend's codeOf). */
const codeOfPid = (pid) => (NO_ACCOUNT.has(pid) ? '—' : `D-${pid.slice(1, 5).toUpperCase()}`);

/**
 * Does a doctor row match the search text? Case-insensitive substring of the email, the code, the
 * specialty or the number ("07"). The email is read from the dataset, never copied into the result.
 * @param {{ pid: string, code?: string|null, noText?: string|null, specialty?: string|null }} row
 * @param {string} search
 * @param {{ doctors?: Map<string, { email?: string|null }> }} ds
 * @returns {boolean}
 */
export function matchesSearch(row, search, ds) {
  const needle = String(search ?? '').trim().toLowerCase();
  if (!needle) return true;
  const email = ds?.doctors?.get?.(row.pid)?.email ?? '';
  return [email, row.code, row.specialty, row.noText].some((field) => typeof field === 'string' && field.toLowerCase().includes(needle));
}

/**
 * First-run question (§4.8, OVERRIDES O3): only while no account is marked "mine or test" from any source,
 * and a legacy account made more than half of all forms (all time, all traffic).
 * @returns {Array<{ pid: string, share: number, forms: number, totalForms: number }>} 0 or 1 row
 */
export function suggestionOf(ds, activity) {
  if (internalCount(ds) > 0) return [];
  const totalForms = (ds.forms ?? []).length;
  if (totalForms === 0) return [];
  const pick = (ds.doctorList ?? []).find((doctor) => {
    if (doctor.class !== 'legacy') return false;
    const forms = activity.get(doctor.pid)?.formsAll ?? 0;
    return forms / totalForms > SUGGEST_SHARE;
  });
  if (!pick) return [];
  const forms = activity.get(pick.pid).formsAll;
  return [{ pid: pick.pid, share: forms / totalForms, forms, totalForms }];
}

/**
 * "The doctor's path" (all time, no period; §4.8): signed up → made a request → active in the last 30 days
 * → bought credits. Registered accounts of the scope only, so every step is a subset of the first.
 * Bought = a live Stripe payment; while Stripe is not usable, guessed from balances (basis inferred).
 */
function funnelOf(ds, scope, activity, stripeOk) {
  const registered = scopedDoctors(ds, scope).filter((doctor) => doctor.exists?.auth);
  const count = (test) => registered.filter(test).length;
  const seen = (doctor) => activity.get(doctor.pid);
  return [
    { key: 'registered', value: registered.length, basis: 'exact' },
    { key: 'used', value: count((doctor) => Boolean(seen(doctor))), basis: 'exact' },
    { key: 'active30', value: count((doctor) => Boolean(seen(doctor)?.recent)), basis: 'exact' },
    stripeOk
      ? { key: 'bought', value: count((doctor) => doctor.payments > 0), basis: 'exact' }
      : { key: 'bought', value: count((doctor) => doctor.class === 'bought_inferred'), basis: 'inferred' },
  ];
}

/**
 * One row per doctor (§4.8 table). The 'all' view lists every account of the scope plus any pid that has
 * cost or income in the period, so Σ rows = the core totals.
 */
function doctorRows(ds, period, scope, summary, activity, { monthFactor, stripeOk }) {
  const hide = hidesInternal(ds, scope);
  const pids = new Set(scopedDoctors(ds, scope).map((doctor) => doctor.pid));
  Object.keys(summary.cost.byPid).forEach((pid) => pids.add(pid));
  Object.keys(summary.income.byPid).forEach((pid) => pids.add(pid));
  const variable = summary.cost.variableEur;

  const rows = [];
  pids.forEach((pid) => {
    if (hide && isInternal(pid, ds)) return;
    const doctor = ds.doctors?.get?.(pid) ?? null;
    const seen = activity.get(pid);
    const costEur = summary.cost.byPid[pid] ?? 0;
    const paidNetEur = stripeOk ? summary.income.byPid[pid] ?? 0 : null;
    const active = (seen?.requests ?? 0) > 0 && pid !== 'anonymous';
    rows.push({
      key: pid,
      pid,
      no: doctor?.no ?? null,
      noText: doctor?.noText ?? null,
      code: doctor?.code ?? codeOfPid(pid),
      class: doctor?.class ?? (pid === 'deleted' ? 'deleted' : 'unknown'),
      displayClass: doctor?.displayClass ?? 'other',
      internal: Boolean(doctor?.internal),
      internalSource: doctor?.internalSource ?? null,
      deletedAccount: doctor ? Boolean(doctor.deletedAccount) : true,
      specialty: doctor?.specialization ?? null,
      detailLevel: doctor?.detailLevel ?? null,
      forms: seen?.forms ?? 0,
      recordingMin: seen?.recordingMin ?? 0,
      anamnesisRuns: seen?.anamnesisRuns ?? 0,
      costEur,
      costPerMonthEur: monthFactor === null ? null : costEur * monthFactor,
      costShare: share(costEur, variable),
      paidNetEur,
      resultEur: paidNetEur === null ? null : paidNetEur - costEur,
      balance: Number.isFinite(doctor?.credits?.available) ? doctor.credits.available : null,
      audioBankMin: Number.isFinite(doctor?.audioBankMs) ? doctor.audioBankMs / 60000 : null,
      lastActiveMs: Number.isFinite(seen?.lastMs) ? seen.lastMs : null,
      signupAt: Number.isFinite(doctor?.signupAt) ? doctor.signupAt : null,
      active,
      muted: !active,
    });
  });
  return rows.sort((a, b) => b.costEur - a.costEur || (a.no ?? Infinity) - (b.no ?? Infinity) || a.pid.localeCompare(b.pid));
}

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Headline: active, newDoctors, newActive, paying, payingAll, topShare, topPid, planPerDoctorEur,
 * topPerMonthEur, registered, doctorsAll. Tables: doctors (the chosen view, searched), byClass, funnel,
 * suggestion (0–1 row). Rows carry pids and codes, never emails (the page joins them from the dataset).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {{ view?: 'active'|'all', search?: string }} [opts] page-local, JSON-serialisable
 * @returns {import('./shared.js').AreaResult}
 */
export function computeDoctors(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const view = VIEWS.includes(opts.view) ? opts.view : 'active';
  const summary = summarize(ds, period, scope);
  const projection = projectScale(ds, period, scope);
  const stripeOk = incomeStatus(ds) === 'ok';
  const monthFactor = period.effDays >= MIN_DAYS_FOR_MONTH ? summary.monthFactor : null;
  const activity = activityByPid(ds, period, resolvePeriod('last30', ds.nowMs));

  const allRows = doctorRows(ds, period, scope, summary, activity, { monthFactor, stripeOk });
  const viewRows = view === 'all' ? allRows : allRows.filter((row) => row.active);
  const rows = viewRows.filter((row) => matchesSearch(row, opts.search, ds));

  const top = topDoctorOf(summary.cost.byPid);
  const topShare = top ? share(top.costEur, summary.cost.variableEur) : null;
  const funnel = funnelOf(ds, scope, activity, stripeOk);
  const [registered, used, , bought] = funnel;
  const newActive = scopedDoctors(ds, scope).filter(
    (doctor) => Number.isFinite(doctor.signupAt) && inPeriod(doctor.signupAt, period) && (activity.get(doctor.pid)?.requests ?? 0) > 0,
  ).length;

  const headline = {
    active: summary.activeDoctors,
    newDoctors: summary.newDoctors,
    newActive,
    paying: summary.payingActiveDoctors,
    payingAll: summary.payingDoctors,
    topShare,
    topPid: top?.pid ?? null,
    planPerDoctorEur: projection.columns.doctor.costTotalEur,
    topPerMonthEur: top && monthFactor !== null ? top.costEur * monthFactor : null,
    registered: registered.value,
    doctorsAll: allRows.length,
  };
  const payingBasis = stripeOk ? 'exact' : 'inferred';
  const basis = {
    active: 'exact',
    newDoctors: 'exact',
    newActive: 'exact',
    paying: payingBasis,
    payingAll: payingBasis,
    topShare: summary.cost.basis,
    topPid: 'exact',
    planPerDoctorEur: 'model',
    topPerMonthEur: summary.cost.basis,
    registered: 'exact',
    doctorsAll: 'exact',
  };

  const answer = [];
  if (summary.activeDoctors > 0) {
    answer.push(
      top
        ? { key: 'doctors.answer', values: { active: summary.activeDoctors, paying: summary.payingActiveDoctors, share: ['pct', topShare], top: ['doctor', top.pid] }, tone: 'neutral' }
        : { key: 'doctors.answer.noCost', values: { active: summary.activeDoctors, paying: summary.payingActiveDoctors }, tone: 'neutral' },
    );
  }
  if (registered.value > 0) {
    answer.push({ key: 'doctors.answer.funnel', values: { registered: registered.value, used: used.value, bought: bought.value }, tone: 'neutral' });
  }

  const byClass = CLASS_ORDER.map((key) => ({ key, valueEur: summary.cost.byClass[key] ?? 0, share: share(summary.cost.byClass[key] ?? 0, summary.cost.variableEur) }));
  const lead = [...byClass].sort((a, b) => b.valueEur - a.valueEur)[0];
  const takeaways = {};
  if (lead && lead.valueEur > 0) takeaways.byClass = { key: `doctors.byClass.lead.${lead.key}`, values: { share: ['pct', lead.share] } };

  const notes = [];
  if (!stripeOk) notes.push({ key: 'doctors.note.noIncome' });
  if (monthFactor === null && summary.activeDoctors > 0) notes.push({ key: 'doctors.note.shortPeriod', values: { days: MIN_DAYS_FOR_MONTH } });
  if (topShare > ONE_DOCTOR_SHARE) notes.push({ key: 'doctors.note.oneDoctor', values: { share: ['pct', topShare] } });
  if (stripeOk && summary.cost.fixedEur > 0 && allRows.some((row) => row.costEur > 0)) {
    notes.push({ key: 'doctors.note.fixed', values: { fixed: ['eur', summary.cost.fixedEur] } });
  }
  if (allRows.some((row) => row.deletedAccount && row.costEur > 0)) notes.push({ key: 'doctors.note.deleted' });

  return {
    empty: summary.activeDoctors === 0,
    headline,
    basis,
    answer,
    series: [],
    tables: {
      doctors: rows,
      byClass,
      funnel,
      suggestion: suggestionOf(ds, activity),
    },
    takeaways,
    projection,
    notes,
  };
}
