// Clinics page metric: what the loaded dataset knows about the clinics — each clinic, its doctors now and
// what their requests cost us in the period. The credits each clinic used (the invoice) are not in the
// dataset: the page loads them for the period on screen (GET /clinics/:id/usage, data/clinics/report.js).
// Pure and copy-free.
import { membersCostEur } from '../clinics/report.js';
import { EMPTY_RESULT } from './shared.js';

/**
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @returns {import('./shared.js').AreaResult} tables.clinics: one row per clinic
 *   ({ id, name, billing, active, members, creditsLeft, costEur }); costEur covers the doctors in the clinic now
 */
export function computeClinics(ds, period) {
  if (!ds || !ds.clinics?.length) return EMPTY_RESULT;
  const range = { fromMs: period.fromMs, toMs: period.effToMs };
  const clinics = ds.clinics.map((clinic) => ({
    id: clinic.id,
    name: clinic.name,
    billing: clinic.billing,
    active: clinic.active,
    members: clinic.members.length,
    creditsLeft: clinic.billing === 'prepaid' ? clinic.credits.available : null,
    costEur: membersCostEur(ds.rows, clinic.members, range),
  }));
  return {
    empty: false,
    headline: { clinics: clinics.length, doctors: clinics.reduce((n, c) => n + c.members, 0) },
    basis: { costEur: 'estimate' },
    answer: [],
    facts: [],
    series: [],
    moneySeries: [],
    tables: { clinics },
    takeaways: {},
    notes: [],
  };
}
