// GET /clinics → Clinic[] (Clinics page, the Doctors page's clinic column). Copy-free.
import { CLINIC_ID_RE, DAY_RE, HOUR_EUR_MAX, MONTH_RE, PID_RE, ROLE_FROM, STAFF_ROLES } from '../api/contract.js';

/**
 * @typedef {{ role: 'doctor'|'nurse'|'other'|'admin'|null, guessed: boolean, from: 'owner'|'profile'|'guess',
 *   profile: 'doctor'|'nurse'|'other'|'admin'|null, spec: string|null, ex: boolean, statsOff: boolean }} StaffMark
 *   role      the role that counts (null = unknown): the owner's while it applies, else the profile's, else a guess
 *   guessed   no specialty in the profile and no role of the owner's: a doctor as a guess (hours only, no €)
 *   from      where the role comes from; an older answer has none: its guessed role is 'guess', any other 'owner'
 *   profile   the role the worker's profile gives now (null = no specialty, or an older answer)
 *   ex        a shared login: counted, but no time saved
 *   statsOff  the worker objected: no work statistics at all
 * @typedef {{
 *   id: string, name: string, billing: 'invoice'|'prepaid', active: boolean, monthlyCapPerDoctor: number,
 *   markupPct: number, note: string, credits: { available: number, used: number, total: number },
 *   createdAt: number|null, updatedAt: number|null, members: string[],
 *   payments: Array<{ month: string, amountEur: number, note: string, at: number|null }>,
 *   share: { createdAt: number|null, lastOpenedAt: number|null, opens: number }|null,
 *   staff: Record<string, StaffMark>, hourEur: Record<string, number>, statsShown: boolean, statsFrom: string|null
 * }} Clinic
 *   payments: what an invoiced clinic paid, one record per month (the owner enters them)
 *   share: the clinic's working read-only link (its page in Lithuanian), null when there is none
 *   markupPct: an invoiced clinic pays our real cost plus this many percent (default 30; never shown to it)
 *   staff: work-statistics marks by pid, of the members and of past members the owner marked (a server
 *     without work statistics sends none: the pages then take the role the profile gives, see staff.js markOf)
 *   hourEur: the clinic's own €/h per role (a role left out = the national average)
 *   statsShown: its own page shows the work statistics
 *   statsFrom: the first day its page shows them ('YYYY-MM-DD'; the server sets the day they were turned on)
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** A member as the server sends it: a pid, or { pid, role, guessed, from, profile, spec, ex, statsOff }. */
export const memberPid = (m) => (typeof m === 'string' ? m : isMap(m) && typeof m.pid === 'string' ? m.pid : null);

/** The marks of one member object; fields the server left out stay out (so an older answer adds nothing). */
const marksOf = (m) => {
  if (!isMap(m)) return {};
  const out = {};
  if (m.role === null || STAFF_ROLES.includes(m.role)) out.role = m.role;
  if (typeof m.guessed === 'boolean') out.guessed = m.guessed;
  if (ROLE_FROM.includes(m.from)) out.from = m.from;
  if (m.profile === null || STAFF_ROLES.includes(m.profile)) out.profile = m.profile;
  if (m.spec === null || typeof m.spec === 'string') out.spec = m.spec;
  if (typeof m.ex === 'boolean') out.ex = m.ex;
  if (typeof m.statsOff === 'boolean') out.statsOff = m.statsOff;
  return out;
};

const fullMark = (marks) => {
  const guessed = marks.guessed === true;
  return {
    role: marks.role ?? null,
    guessed,
    // An older server sends no `from`: it guessed a role it did not have from the owner, the rest were the owner's
    from: marks.from ?? (guessed ? 'guess' : 'owner'),
    profile: marks.profile ?? null,
    spec: typeof marks.spec === 'string' ? marks.spec : null,
    ex: marks.ex === true,
    statsOff: marks.statsOff === true,
  };
};

/**
 * Work-statistics marks by pid: of the members, and of past members the owner marked (their rows stay in the
 * clinic's statistics). They come in `staff` (a list of { pid, role, guessed, from, profile, spec, ex, statsOff,
 * member }, as the backend sends it, or a pid-keyed map) or on member objects; the member objects win.
 * @returns {Record<string, StaffMark>}
 */
function staffOf(c) {
  const merged = new Map();
  const put = (pid, marks) => {
    if (!PID_RE.test(pid ?? '')) return;
    merged.set(pid, { ...(merged.get(pid) ?? {}), ...marks });
  };
  if (Array.isArray(c.staff)) c.staff.forEach((m) => put(memberPid(m), marksOf(m)));
  else if (isMap(c.staff)) Object.entries(c.staff).forEach(([pid, m]) => put(pid, marksOf(m)));
  (Array.isArray(c.members) ? c.members : []).forEach((m) => {
    if (isMap(m)) put(m.pid, marksOf(m));
  });
  return Object.fromEntries([...merged.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([pid, marks]) => [pid, fullMark(marks)]));
}

/** The clinic's own €/h per role: only the valid ones (above 0, at most HOUR_EUR_MAX). */
export function hourEurOf(map) {
  const out = {};
  if (!isMap(map)) return out;
  STAFF_ROLES.forEach((role) => {
    const eur = map[role];
    if (typeof eur === 'number' && Number.isFinite(eur) && eur > 0 && eur <= HOUR_EUR_MAX) out[role] = Math.round(eur * 100) / 100;
  });
  return out;
}

/**
 * @param {{ clinics?: object[] }|null} api the /clinics data (null when it did not load)
 * @returns {Clinic[]} by name; malformed entries are left out
 */
export function normalizeClinics(api) {
  const list = Array.isArray(api?.clinics) ? api.clinics : [];
  return list
    .filter((c) => c && CLINIC_ID_RE.test(c.id))
    .map((c) => {
      const members = [...new Set((Array.isArray(c.members) ? c.members : []).map(memberPid).filter((pid) => PID_RE.test(pid ?? '')))].sort();
      return {
        id: c.id,
        name: typeof c.name === 'string' ? c.name : '',
        billing: c.billing === 'prepaid' ? 'prepaid' : 'invoice',
        active: c.active !== false,
        monthlyCapPerDoctor: Number.isInteger(c.monthlyCapPerDoctor) ? c.monthlyCapPerDoctor : 3000,
        markupPct: typeof c.markupPct === 'number' && Number.isFinite(c.markupPct) ? c.markupPct : 30,
        note: typeof c.note === 'string' ? c.note : '',
        credits: { available: num(c.credits?.available), used: num(c.credits?.used), total: num(c.credits?.total) },
        createdAt: numOrNull(c.createdAt),
        updatedAt: numOrNull(c.updatedAt),
        members,
        payments: (Array.isArray(c.payments) ? c.payments : [])
          .filter((p) => p && MONTH_RE.test(p.month) && Number.isFinite(p.amountEur))
          .map((p) => ({ month: p.month, amountEur: p.amountEur, note: typeof p.note === 'string' ? p.note : '', at: numOrNull(p.at) }))
          .sort((a, b) => (a.month < b.month ? -1 : 1)),
        share: c.share && typeof c.share === 'object'
          ? { createdAt: numOrNull(c.share.createdAt), lastOpenedAt: numOrNull(c.share.lastOpenedAt), opens: num(c.share.opens) }
          : null,
        staff: staffOf(c),
        hourEur: hourEurOf(c.hourEur),
        statsShown: c.statsShown === true,
        statsFrom: typeof c.statsFrom === 'string' && DAY_RE.test(c.statsFrom) ? c.statsFrom : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}
