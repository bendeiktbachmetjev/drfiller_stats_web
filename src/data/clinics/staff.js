// Work statistics on the owner's site: roles, the national value of an hour per role, and the checks of what
// the owner types (the hour values of ClinicForm, a worker's marks in the staff editor). Pure and copy-free.
//
// NATIONAL_RATES, guessRole, profileRole and roleOf mirror the backend (services/stats/timeModel.js RATES,
// services/stats/roles.js); staff.test.mjs compares them with it when ../backend sits next to this repo. The
// work answer brings the server's own rates too (`rates`), and those win once loaded.
//
// A worker's role (the server decides it; the site shows it and mirrors the rule for the mock and for the
// moment after a change): the role the owner set at the clinic, while the worker's profile still gives the role
// it gave when the owner set it; else the role the profile gives (the specialty picked in the extension); else,
// with no specialty, a doctor as a guess — hours only, no €.
import { HOUR_EUR_MAX, ROLE_FROM, STAFF_ROLES } from '../api/contract.js';

export { ROLE_FROM, STAFF_ROLES };

/** €/h an employer pays on average (2026 Jan–Sep, public health institutions): central, low, high. */
export const NATIONAL_RATES = Object.freeze({
  doctor: Object.freeze({ eur: 38.56, lo: 36.1, hi: 42.03 }),
  nurse: Object.freeze({ eur: 18.95, lo: 17.65, hi: 20.65 }),
  other: Object.freeze({ eur: 16.53, lo: 15.51, hi: 18.01 }),
  admin: Object.freeze({ eur: 9.91, lo: 9.23, hi: 10.8 }),
});
/** Where the rates come from (the State Patient Fund's open data on pay in health institutions). */
export const RATES_SOURCE = 'https://ligoniukasa.lrv.lt/lt/atviri-duomenys-1/informacija-apie-gydymo-istaigu-darbuotoju-darbo-uzmokesti/';

const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isRole = (v) => STAFF_ROLES.includes(v);

// The words of a specialty (roles.js): a doctor's title wins, then nurses and midwives, then registry and
// administration; anything else is a doctor ('Kita' too).
const DOCTOR_RE = /gydytoj/iu;
const NURSE_RE = /slaug|akušer/iu;
const ADMIN_RE = /administr|registrat/iu;

/**
 * The role the words of a specialty suggest (a blank one included: a doctor).
 * @param {string|null|undefined} specialization
 * @returns {'doctor'|'nurse'|'admin'}
 */
export function guessRole(specialization) {
  const s = typeof specialization === 'string' ? specialization.trim() : '';
  if (!s || DOCTOR_RE.test(s)) return 'doctor';
  if (NURSE_RE.test(s)) return 'nurse';
  if (ADMIN_RE.test(s)) return 'admin';
  return 'doctor';
}

/**
 * The role a worker's profile gives: none without a specialty, else by its words (guessRole).
 * 'Gydytojas akušeris ginekologas' → doctor, 'Bendrosios praktikos slaugytojas' → nurse, 'Kita' → doctor.
 * @param {string|null|undefined} specialization users/{uid}.specialization
 * @returns {'doctor'|'nurse'|'admin'|null}
 */
export function profileRole(specialization) {
  const s = typeof specialization === 'string' ? specialization.trim() : '';
  return s ? guessRole(s) : null;
}

/** The profile's role stored with the owner's: a role or null (no specialty then); undefined = none stored, or no role. */
const storedProfileRole = (entry) => {
  if (!Object.hasOwn(entry, 'profileRole')) return undefined;
  return entry.profileRole === null || isRole(entry.profileRole) ? entry.profileRole : undefined;
};

/**
 * A worker's role at a clinic, as the server works it out from what it stores: the owner's role while it
 * applies, else the profile's, else a guess. The owner's role applies while the profile gives the role it gave
 * when the owner set it (entry.profileRole, null = no specialty then); an entry from before that rule (no
 * profileRole key, or no role in it) always applies. The mock server and the kit store entries like the backend.
 * @param {{ role?: string, profileRole?: string|null }|null|undefined} entry clinics/{id}.staff[uid]
 * @param {string|null|undefined} specialization users/{uid}.specialization
 * @returns {{ role: 'doctor'|'nurse'|'other'|'admin', guessed: boolean, from: 'owner'|'profile'|'guess', profile: string|null }}
 *   profile = the role the profile gives now
 */
export function roleOf(entry, specialization) {
  const profile = profileRole(specialization);
  if (isMap(entry) && isRole(entry.role)) {
    const then = storedProfileRole(entry);
    if (then === undefined || then === profile) return { role: entry.role, guessed: false, from: 'owner', profile };
  }
  if (profile) return { role: profile, guessed: false, from: 'profile', profile };
  return { role: 'doctor', guessed: true, from: 'guess', profile: null };
}

/**
 * A member's marks as the pages show them: the server's, else the role the doctor list's specialty gives (a
 * server without work statistics sends no marks).
 * @param {{ staff?: Record<string, object> }} clinic a normalized Clinic
 * @param {string} pid
 * @param {{ specialization?: string|null }|null} [doctor] the dataset's doctor
 * @returns {{ role: string, guessed: boolean, from: 'owner'|'profile'|'guess', profile: string|null, spec: string|null,
 *   ex: boolean, statsOff: boolean, known: boolean }} known = the server sent marks for this member
 */
export function markOf(clinic, pid, doctor = null) {
  const mark = clinic?.staff?.[pid];
  const specialization = typeof doctor?.specialization === 'string' ? doctor.specialization : null;
  if (mark) {
    const spec = mark.spec ?? specialization;
    const guessed = mark.guessed === true;
    const own = isRole(mark.role)
      ? { role: mark.role, guessed, from: ROLE_FROM.includes(mark.from) ? mark.from : guessed ? 'guess' : 'owner', profile: isRole(mark.profile) ? mark.profile : null }
      : roleOf(null, spec);
    return { ...own, spec, ex: mark.ex === true, statsOff: mark.statsOff === true, known: true };
  }
  return { ...roleOf(null, specialization), spec: specialization, ex: false, statsOff: false, known: false };
}

/**
 * The national rates to show: the work answer's (the server's own numbers) where it sent them, else the mirror.
 * @param {Record<string, { eur: number, lo?: number|null, hi?: number|null, src?: string|null }>} [fromServer]
 * @returns {Record<string, { eur: number, lo: number|null, hi: number|null, src: string }>}
 */
export function nationalRates(fromServer) {
  return Object.fromEntries(
    STAFF_ROLES.map((role) => {
      const own = isMap(fromServer?.[role]) && Number.isFinite(fromServer[role].eur) ? fromServer[role] : null;
      const base = NATIONAL_RATES[role];
      return [role, own
        ? { eur: own.eur, lo: Number.isFinite(own.lo) ? own.lo : null, hi: Number.isFinite(own.hi) ? own.hi : null, src: typeof own.src === 'string' && /^https:\/\//.test(own.src) ? own.src : RATES_SOURCE }
        : { eur: base.eur, lo: base.lo, hi: base.hi, src: RATES_SOURCE }];
    }),
  );
}

/**
 * One hour field as typed: '38,56', '40', ' 9.5 ' → the number; '' → null (the national average); anything
 * else (letters, 3 decimals, 0, above HOUR_EUR_MAX) → NaN.
 * @param {string} text
 * @returns {number|null}
 */
export function parseHourEur(text) {
  const s = String(text ?? '').replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n > 0 && n <= HOUR_EUR_MAX ? n : NaN;
}

/** The form's hour fields from the clinic's own rates: { doctor: '40,5', nurse: '', … }. */
export const hourDraftOf = (hourEur) =>
  Object.fromEntries(STAFF_ROLES.map((role) => [role, Number.isFinite(hourEur?.[role]) ? String(hourEur[role]).replace('.', ',') : '']));

/**
 * The clinic's own rates to save (only the roles the owner filled in; the server replaces the whole map, and
 * a role left out goes back to the national average), or the first role whose field is wrong.
 * @param {Record<string, string>} draft
 * @returns {{ hourEur: Record<string, number> } | { badRole: string }}
 */
export function hourEurFromDraft(draft) {
  const hourEur = {};
  for (const role of STAFF_ROLES) {
    const value = parseHourEur(draft?.[role] ?? '');
    if (Number.isNaN(value)) return { badRole: role };
    if (value !== null) hourEur[role] = value;
  }
  return { hourEur };
}

/** Two rate maps hold the same rates (to the cent). */
export function sameHourEur(a, b) {
  return STAFF_ROLES.every((role) => {
    const x = Number.isFinite(a?.[role]) ? Math.round(a[role] * 100) : null;
    const y = Number.isFinite(b?.[role]) ? Math.round(b[role] * 100) : null;
    return x === y;
  });
}

/**
 * The PATCH body of a change to one worker's marks; null when nothing valid is in it.
 * @param {{ role?: string|null, ex?: boolean, statsOff?: boolean }} change
 * @returns {{ role?: string|null, ex?: boolean, statsOff?: boolean }|null}
 */
export function staffPatch(change) {
  const body = {};
  if (isMap(change)) {
    if (Object.hasOwn(change, 'role') && (change.role === null || isRole(change.role))) body.role = change.role;
    if (typeof change.ex === 'boolean') body.ex = change.ex;
    if (typeof change.statsOff === 'boolean') body.statsOff = change.statsOff;
  }
  return Object.keys(body).length ? body : null;
}

/**
 * The marks to keep after a saved change: what was sent, overruled by whatever the server's answer says about
 * them. A role set back to "From the profile" (null) is the profile's role again, or a guess without a
 * specialty, as the server does.
 * @param {{ role?: string|null, ex?: boolean, statsOff?: boolean }} body what was sent
 * @param {unknown} answer the PATCH answer's data: { clinicId, staff: { pid, role, guessed, from, profile, spec, ex,
 *   statsOff, member } } (the marks may also come on the answer itself)
 * @param {string|null} [specialization] the worker's specialty (the role their profile gives)
 */
export function marksAfter(body, answer, specialization = null) {
  const out = {};
  if (Object.hasOwn(body, 'role')) {
    Object.assign(out, body.role === null ? roleOf(null, specialization) : { role: body.role, guessed: false, from: 'owner', profile: profileRole(specialization) });
  }
  if (Object.hasOwn(body, 'ex')) out.ex = body.ex;
  if (Object.hasOwn(body, 'statsOff')) out.statsOff = body.statsOff;
  let said = {};
  if (isMap(answer)) said = isMap(answer.staff) ? answer.staff : isMap(answer.member) ? answer.member : answer;
  if (isRole(said.role)) out.role = said.role;
  if (typeof said.guessed === 'boolean') out.guessed = said.guessed;
  // An older server sends no `from`: its guessed role was a guess, any other the owner's
  if (ROLE_FROM.includes(said.from)) out.from = said.from;
  else if (typeof said.guessed === 'boolean') out.from = said.guessed ? 'guess' : 'owner';
  if (said.profile === null || isRole(said.profile)) out.profile = said.profile;
  if (typeof said.ex === 'boolean') out.ex = said.ex;
  if (typeof said.statsOff === 'boolean') out.statsOff = said.statsOff;
  if (said.spec === null || typeof said.spec === 'string') out.spec = said.spec;
  return out;
}
