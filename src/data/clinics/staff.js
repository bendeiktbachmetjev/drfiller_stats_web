// Work statistics on the owner's site: roles, the national value of an hour per role, and the checks of what
// the owner types (the hour values of ClinicForm, a worker's marks in the staff editor). Pure and copy-free.
//
// NATIONAL_RATES and guessRole mirror the backend (services/stats/timeModel.js RATES, services/stats/roles.js);
// staff.test.mjs compares them with it when ../backend sits next to this repo. The work answer brings the
// server's own rates too (`rates`), and those win once loaded.
import { HOUR_EUR_MAX, STAFF_ROLES } from '../api/contract.js';

export { STAFF_ROLES };

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

// The backend's guess from the specialty (roles.js): a doctor's title wins, then nurses and midwives, then
// registry and administration; anything else, blank included, is a doctor.
const DOCTOR_RE = /gydytoj/iu;
const NURSE_RE = /slaug|akušer/iu;
const ADMIN_RE = /administr|registrat/iu;

/**
 * The role a specialty suggests, as the server guesses it.
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
 * A member's marks as the pages show them: the server's, else a guess from the doctor list's specialty (a
 * server without work statistics sends no marks).
 * @param {{ staff?: Record<string, object> }} clinic a normalized Clinic
 * @param {string} pid
 * @param {{ specialization?: string|null }|null} [doctor] the dataset's doctor
 * @returns {{ role: string, guessed: boolean, spec: string|null, ex: boolean, statsOff: boolean, known: boolean }}
 *   known = the server sent marks for this member
 */
export function markOf(clinic, pid, doctor = null) {
  const mark = clinic?.staff?.[pid];
  const specialization = typeof doctor?.specialization === 'string' ? doctor.specialization : null;
  if (mark) {
    const role = isRole(mark.role) ? mark.role : guessRole(mark.spec ?? specialization);
    return { role, guessed: !isRole(mark.role) || mark.guessed === true, spec: mark.spec ?? specialization, ex: mark.ex === true, statsOff: mark.statsOff === true, known: true };
  }
  return { role: guessRole(specialization), guessed: true, spec: specialization, ex: false, statsOff: false, known: false };
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
 * them. A role set back to "not set" is guessed again from the specialty, as the server does.
 * @param {{ role?: string|null, ex?: boolean, statsOff?: boolean }} body what was sent
 * @param {unknown} answer the PATCH answer's data: { clinicId, staff: { pid, role, guessed, spec, ex, statsOff, member } }
 *   (the marks may also come on the answer itself)
 * @param {string|null} [specialization] the worker's specialty (for the guess)
 */
export function marksAfter(body, answer, specialization = null) {
  const out = {};
  if (Object.hasOwn(body, 'role')) {
    out.role = body.role === null ? guessRole(specialization) : body.role;
    out.guessed = body.role === null;
  }
  if (Object.hasOwn(body, 'ex')) out.ex = body.ex;
  if (Object.hasOwn(body, 'statsOff')) out.statsOff = body.statsOff;
  let said = {};
  if (isMap(answer)) said = isMap(answer.staff) ? answer.staff : isMap(answer.member) ? answer.member : answer;
  if (isRole(said.role)) out.role = said.role;
  if (typeof said.guessed === 'boolean') out.guessed = said.guessed;
  if (typeof said.ex === 'boolean') out.ex = said.ex;
  if (typeof said.statsOff === 'boolean') out.statsOff = said.statsOff;
  if (typeof said.spec === 'string') out.spec = said.spec;
  return out;
}
