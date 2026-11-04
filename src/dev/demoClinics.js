// Demo clinics for the mock server and ?demo (never in the build): one clinic that pays by invoice and one
// with prepaid credits, made of demo doctors. A clinic's usage rows come from its doctors' demo requests, as
// if they had always been in it (the real server counts only what happened while they were members).
import { CLINIC_ID_RE } from '../data/api/contract.js';

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (t) => DAY.format(new Date(t));

export const DEMO_CLINIC_IDS = Object.freeze({ invoice: 'c1a2b3c4d5e6f7a8b', prepaid: 'c9f8e7d6c5b4a3f2e' });

/**
 * The demo clinics: the first three doctors with a login (not the owner's) pay by invoice, the next two
 * share prepaid credits.
 * @param {{ doctors: { doctors: object[] } }} api makeDemoApi output
 * @param {number} nowMs
 * @returns {Array<object>} ClinicApi without `members` (the mock adds them from the doctors' clinicId)
 */
export function demoClinics(api, nowMs) {
  const doctors = api.doctors.doctors.filter((d) => d.exists?.auth && !d.internal);
  const created = nowMs - 20 * 86400000;
  return [
    {
      id: DEMO_CLINIC_IDS.invoice,
      name: 'Demo klinika (invoice)',
      billing: 'invoice',
      active: true,
      monthlyCapPerDoctor: 3000,
      pricePerCreditEur: 0.04,
      note: 'Contract 2026-11',
      credits: { available: 0, used: 0, total: 0 },
      createdAt: created,
      updatedAt: created,
      pids: doctors.slice(0, 3).map((d) => d.pid),
    },
    {
      id: DEMO_CLINIC_IDS.prepaid,
      name: 'Demo poliklinika (prepaid)',
      billing: 'prepaid',
      active: true,
      monthlyCapPerDoctor: 2000,
      pricePerCreditEur: null,
      note: '',
      credits: { available: 1240, used: 260, total: 1500 },
      createdAt: created,
      updatedAt: created,
      share: { createdAt: created + 86400000, lastOpenedAt: nowMs - 5 * 3600000, opens: 4 },
      pids: doctors.slice(3, 5).map((d) => d.pid),
    },
  ].filter((c) => CLINIC_ID_RE.test(c.id));
}

/**
 * Usage rows of the given doctors in [fromDay, toDay), one per doctor per day, from the demo requests.
 * @param {{ usage: { rows: object[] } }} api
 * @param {string[]} pids
 * @param {string} fromDay 'YYYY-MM-DD'
 * @param {string} toDay 'YYYY-MM-DD', exclusive
 */
export function demoClinicUsage(api, pids, fromDay, toDay) {
  const members = new Set(pids);
  const rows = new Map();
  api.usage.rows.forEach((r) => {
    if (!members.has(r.pid)) return;
    const day = dayOf(r.t);
    if (day < fromDay || day >= toDay) return;
    const key = `${day}|${r.pid}`;
    if (!rows.has(key)) rows.set(key, { day, pid: r.pid, formCredits: 0, formRefunded: 0, anamnesisCredits: 0, anamnesisRefunded: 0, audioCredits: 0, audioMs: 0 });
    const row = rows.get(key);
    if (r.action === 'ai_processing') row.formCredits += Number.isFinite(r.credits) ? r.credits : 1;
    else if (r.action.startsWith('anamnesis_')) row.anamnesisCredits += Number.isFinite(r.credits) ? r.credits : 0;
    else if (r.action === 'audio_meter') {
      row.audioCredits += r.chargedCredits ?? 0;
      row.audioMs += r.addedMs ?? 0;
    } else if (r.action === 'request_failed' && r.refunded && r.feature === 'process') {
      // A refunded form: charged and given back the same day
      row.formCredits += 1;
      row.formRefunded += 1;
    }
  });
  return [...rows.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.pid < b.pid ? -1 : 1));
}
