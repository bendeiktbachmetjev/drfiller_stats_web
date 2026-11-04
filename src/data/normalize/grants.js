// GET /grants → Grant[]: credits the owner added by hand, to a doctor (pid) or a prepaid clinic (clinicId),
// with what was paid for them (priceEur: 0 = given free, null = added before prices were recorded). Copy-free.
import { CLINIC_ID_RE, PID_RE } from '../api/contract.js';

/**
 * @typedef {{ id: string, t: number, pid: string|null, clinicId: string|null, credits: number, priceEur: number|null, note: string }} Grant
 */

/**
 * @param {{ grants?: object[] }|null} api the /grants data (null when it did not load)
 * @returns {Grant[]} oldest first; malformed entries are left out
 */
export function normalizeGrants(api) {
  const list = Array.isArray(api?.grants) ? api.grants : [];
  return list
    .filter((g) => g && typeof g.id === 'string' && Number.isFinite(g.t) && Number.isFinite(g.credits) && g.credits > 0)
    .map((g) => ({
      id: g.id,
      t: g.t,
      pid: typeof g.pid === 'string' && PID_RE.test(g.pid) ? g.pid : null,
      clinicId: typeof g.clinicId === 'string' && CLINIC_ID_RE.test(g.clinicId) ? g.clinicId : null,
      credits: g.credits,
      priceEur: Number.isFinite(g.priceEur) && g.priceEur >= 0 ? g.priceEur : null,
      note: typeof g.note === 'string' ? g.note : '',
    }))
    .filter((g) => g.pid || g.clinicId)
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
}
