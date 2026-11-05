// Demo clinics for the mock server and ?demo (never in the build): one clinic that pays by invoice and one
// with prepaid credits, made of demo doctors. A clinic's usage rows come from its doctors' demo requests, as
// if they had always been in it (the real server counts only what happened while they were members).
// Work statistics (src/dev/demoWork.js): each clinic also has its people's specialties (their profiles), the
// staff marks (the owner's roles, a shared login), the people who objected, and invented work profiles (who
// writes forms, who uses Express …).
import { CLINIC_ID_RE } from '../data/api/contract.js';

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (t) => DAY.format(new Date(t));

export const DEMO_CLINIC_IDS = Object.freeze({ invoice: 'c1a2b3c4d5e6f7a8b', prepaid: 'c9f8e7d6c5b4a3f2e' });

const NURSE = 'Bendrosios praktikos slaugytojas';

/**
 * The invented work people of the invoice clinic, in member order, so the view shows every source of a role:
 *   spec        the specialty in their profile (null = none): the profile's role counts
 *   role        a role the owner set (left out = none); profileRole = what the profile gave when they set it
 *               (left out = an entry from before that rule: it always counts)
 * plus a shared login, a worker who objected, an old extension, and how each one works.
 */
export const INVOICE_PEOPLE = Object.freeze([
  { spec: 'Šeimos gydytojas', profile: { forms: 20, express: 0.35, heavy: true } }, // a family doctor who runs Dr. Filler Express
  { spec: null, profile: { forms: 12 }, oldApp: true }, // no specialty: a guess (no €); an old extension sends no counts
  { spec: 'Gydytojas kardiologas', role: 'doctor', profile: { forms: 9, cardio: true } }, // ŠKL and echo; set by the owner before the rule
  { spec: NURSE, profile: {} },
  { spec: NURSE, role: 'doctor', profileRole: null, profile: { helper: true } }, // set while the profile was empty; now a nurse: the profile counts again
  { spec: 'Kita', role: 'admin', profileRole: 'doctor', profile: {} }, // the registry: 'Kita' in the profile, set by the owner
  { spec: 'Vidaus ligų gydytojas', ex: true, profile: { forms: 16 } }, // a shared login of the ward
  { spec: 'Kita', role: 'other', profileRole: 'doctor', statsOff: true, profile: {} }, // objected to work statistics
]);
export const PREPAID_PEOPLE = Object.freeze([
  { spec: 'Šeimos gydytojas', profile: { forms: 15, f025: true } },
  { spec: null, profile: { forms: 8 } },
  { spec: NURSE, role: 'other', profileRole: 'nurse', profile: {} },
]);

/** Specialties, staff marks, objections and work profiles of a clinic's demo people (by pid). */
const peopleOf = (pids, people) => {
  const specs = {};
  const staff = {};
  const statsOff = [];
  const profiles = {};
  pids.forEach((pid, i) => {
    const person = people[i];
    if (!person) return;
    specs[pid] = person.spec ?? null;
    const entry = {};
    if (person.role) entry.role = person.role;
    if (person.role && Object.hasOwn(person, 'profileRole')) entry.profileRole = person.profileRole;
    if (person.ex) entry.ex = true;
    if (Object.keys(entry).length) staff[pid] = entry;
    if (person.statsOff) statsOff.push(pid);
    profiles[pid] = { ...person.profile, ...(person.oldApp ? { oldApp: true } : {}) };
  });
  return { specs, staff, statsOff, profiles };
};

/**
 * The demo clinics: the first eight doctors with a login (no account is the owner's in the demo) pay by
 * invoice, the next three share prepaid credits.
 * @param {{ doctors: { doctors: object[] } }} api makeDemoApi output
 * @param {number} nowMs
 * @returns {Array<object>} ClinicApi without `members` (the mock adds them from the doctors' clinicId), plus
 *   `pids` (its doctors), `specs` (pid → the specialty in their profile, null = none), `staff` (pid → { role?,
 *   profileRole?, ex? }, as the backend stores it), `statsOff` (pids) and `profiles` (pid → work profile)
 */
export function demoClinics(api, nowMs) {
  const doctors = api.doctors.doctors.filter((d) => d.exists?.auth && !d.internal);
  const created = nowMs - 20 * 86400000;
  const invoicePids = doctors.slice(0, INVOICE_PEOPLE.length).map((d) => d.pid);
  const prepaidPids = doctors.slice(INVOICE_PEOPLE.length, INVOICE_PEOPLE.length + PREPAID_PEOPLE.length).map((d) => d.pid);
  return [
    {
      id: DEMO_CLINIC_IDS.invoice,
      name: 'Demo klinika (invoice)',
      billing: 'invoice',
      active: true,
      monthlyCapPerDoctor: 3000,
      markupPct: 30,
      note: 'Contract 2026-11',
      credits: { available: 0, used: 0, total: 0 },
      createdAt: created,
      updatedAt: created,
      // The clinic set its own nurse rate; it already sees its work statistics
      hourEur: { nurse: 20 },
      statsShown: true,
      pids: invoicePids,
      ...peopleOf(invoicePids, INVOICE_PEOPLE),
    },
    {
      id: DEMO_CLINIC_IDS.prepaid,
      name: 'Demo poliklinika (prepaid)',
      billing: 'prepaid',
      active: true,
      monthlyCapPerDoctor: 2000,
      markupPct: 30,
      note: '',
      credits: { available: 1240, used: 260, total: 1500 },
      createdAt: created,
      updatedAt: created,
      share: { createdAt: created + 86400000, lastOpenedAt: nowMs - 5 * 3600000, opens: 4 },
      hourEur: {},
      statsShown: false,
      pids: prepaidPids,
      ...peopleOf(prepaidPids, PREPAID_PEOPLE),
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
export function demoClinicUsage(api, pids, fromDay, toDay, { markupPct = null } = {}) {
  // Our cost (the demo's list prices, USD → EUR) and, for an invoiced clinic, cost + markup — as the server books them
  const EUR_PER_USD = 1 / 1.1463;
  const SONIOX_PER_MIN_USD = 0.1 / 60;
  const book = (row, kind, usd) => {
    const eur = (Number(usd) || 0) * EUR_PER_USD;
    row[`cost${kind}Eur`] += eur;
    if (markupPct !== null) row[`amount${kind}Eur`] += eur * (1 + markupPct / 100);
  };
  const members = new Set(pids);
  const rows = new Map();
  api.usage.rows.forEach((r) => {
    if (!members.has(r.pid)) return;
    const day = dayOf(r.t);
    if (day < fromDay || day >= toDay) return;
    const key = `${day}|${r.pid}`;
    if (!rows.has(key)) rows.set(key, { day, pid: r.pid, formCredits: 0, formRefunded: 0, anamnesisCredits: 0, anamnesisRefunded: 0, audioCredits: 0, audioMs: 0, costAiEur: 0, costAudioEur: 0, amountAiEur: 0, amountAudioEur: 0 });
    const row = rows.get(key);
    if (r.action === 'ai_processing') {
      row.formCredits += Number.isFinite(r.credits) ? r.credits : 1;
      book(row, 'Ai', r.costUsd);
    } else if (r.action.startsWith('anamnesis_')) {
      row.anamnesisCredits += Number.isFinite(r.credits) ? r.credits : 0;
      book(row, 'Ai', r.costUsd);
    } else if (r.action === 'audio_meter') {
      row.audioCredits += r.chargedCredits ?? 0;
      row.audioMs += r.addedMs ?? 0;
      book(row, 'Audio', ((r.addedMs ?? 0) / 60000) * SONIOX_PER_MIN_USD);
    } else if (r.action === 'request_failed' && r.refunded && r.feature === 'process') {
      // A refunded form: charged and given back the same day
      row.formCredits += 1;
      row.formRefunded += 1;
    }
  });
  return [...rows.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.pid < b.pid ? -1 : 1));
}
