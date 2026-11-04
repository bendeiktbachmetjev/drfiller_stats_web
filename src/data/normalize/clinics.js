// GET /clinics → Clinic[] (Clinics page, the Doctors page's clinic column). Copy-free.
import { CLINIC_ID_RE, MONTH_RE, PID_RE } from '../api/contract.js';

/**
 * @typedef {{
 *   id: string, name: string, billing: 'invoice'|'prepaid', active: boolean, monthlyCapPerDoctor: number,
 *   pricePerCreditEur: number|null, note: string, credits: { available: number, used: number, total: number },
 *   createdAt: number|null, updatedAt: number|null, members: string[],
 *   payments: Array<{ month: string, amountEur: number, note: string, at: number|null }>,
 *   share: { createdAt: number|null, lastOpenedAt: number|null, opens: number }|null
 * }} Clinic
 *   payments: what an invoiced clinic paid, one record per month (the owner enters them)
 *   share: the clinic's working read-only link (its page in Lithuanian), null when there is none
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param {{ clinics?: object[] }|null} api the /clinics data (null when it did not load)
 * @returns {Clinic[]} by name; malformed entries are left out
 */
export function normalizeClinics(api) {
  const list = Array.isArray(api?.clinics) ? api.clinics : [];
  return list
    .filter((c) => c && CLINIC_ID_RE.test(c.id))
    .map((c) => ({
      id: c.id,
      name: typeof c.name === 'string' ? c.name : '',
      billing: c.billing === 'prepaid' ? 'prepaid' : 'invoice',
      active: c.active !== false,
      monthlyCapPerDoctor: Number.isInteger(c.monthlyCapPerDoctor) ? c.monthlyCapPerDoctor : 3000,
      pricePerCreditEur: numOrNull(c.pricePerCreditEur),
      note: typeof c.note === 'string' ? c.note : '',
      credits: { available: num(c.credits?.available), used: num(c.credits?.used), total: num(c.credits?.total) },
      createdAt: numOrNull(c.createdAt),
      updatedAt: numOrNull(c.updatedAt),
      members: Array.isArray(c.members) ? c.members.filter((pid) => PID_RE.test(pid)).sort() : [],
      payments: (Array.isArray(c.payments) ? c.payments : [])
        .filter((p) => p && MONTH_RE.test(p.month) && Number.isFinite(p.amountEur))
        .map((p) => ({ month: p.month, amountEur: p.amountEur, note: typeof p.note === 'string' ? p.note : '', at: numOrNull(p.at) }))
        .sort((a, b) => (a.month < b.month ? -1 : 1)),
      share: c.share && typeof c.share === 'object'
        ? { createdAt: numOrNull(c.share.createdAt), lastOpenedAt: numOrNull(c.share.lastOpenedAt), opens: num(c.share.opens) }
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}
