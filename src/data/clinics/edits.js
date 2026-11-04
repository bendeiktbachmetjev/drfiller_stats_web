// After a clinic change is saved, the loaded data takes it at once (AnalyticsContext rebuild), so the
// Doctors and Clinics pages agree without a reload. Pure: each takes the RawBundle and returns a new one.

const clinicsOf = (raw) => (Array.isArray(raw?.clinics?.clinics) ? raw.clinics.clinics : []);
const doctorsOf = (raw) => (Array.isArray(raw?.doctors?.doctors) ? raw.doctors.doctors : []);

/**
 * A new or changed clinic (its members stay as they are in the bundle).
 * @param {object} raw RawBundle
 * @param {object} clinic ClinicApi as the server answered
 */
export function withClinic(raw, clinic) {
  const list = clinicsOf(raw);
  const before = list.find((c) => c.id === clinic.id);
  const next = { ...clinic, members: before?.members ?? clinic.members ?? [] };
  const clinics = before ? list.map((c) => (c.id === clinic.id ? next : c)) : [...list, next];
  return { ...raw, clinics: { ...(raw?.clinics ?? {}), clinics } };
}

/**
 * A doctor moved into a clinic (clinicId) or out of every clinic (null): the doctor's `clinicId` and the
 * clinics' member lists.
 * @param {object} raw RawBundle
 * @param {string} pid
 * @param {string|null} clinicId
 */
export function withMembership(raw, pid, clinicId) {
  const clinics = clinicsOf(raw).map((c) => {
    const others = (c.members ?? []).filter((p) => p !== pid);
    return { ...c, members: c.id === clinicId ? [...others, pid].sort() : others };
  });
  const doctors = doctorsOf(raw).map((d) => (d.pid === pid ? { ...d, clinicId } : d));
  return {
    ...raw,
    clinics: { ...(raw?.clinics ?? {}), clinics },
    doctors: raw?.doctors ? { ...raw.doctors, doctors } : raw?.doctors,
  };
}

/**
 * A prepaid clinic's credits after a top-up.
 * @param {object} raw RawBundle
 * @param {string} id
 * @param {{ available: number, used: number, total: number }} credits
 */
export function withClinicCredits(raw, id, credits) {
  const clinics = clinicsOf(raw).map((c) => (c.id === id ? { ...c, credits } : c));
  return { ...raw, clinics: { ...(raw?.clinics ?? {}), clinics } };
}

/**
 * A credit grant the owner just added (doctor or clinic), until the next load brings the server's list.
 * @param {object} raw RawBundle
 * @param {{ pid?: string|null, clinicId?: string|null, credits: number, priceEur: number|null, note?: string, t: number }} grant
 */
export function withGrant(raw, { pid = null, clinicId = null, credits, priceEur, note = '', t }) {
  const list = Array.isArray(raw?.grants?.grants) ? raw.grants.grants : [];
  const grant = { id: `glocal-${t}-${list.length}`, t, pid, clinicId, credits, priceEur, note };
  return { ...raw, grants: { ...(raw?.grants ?? {}), grants: [...list, grant] } };
}

/**
 * A doctor's own balance after a hand top-up (the server's answer).
 * @param {object} raw RawBundle
 * @param {string} pid
 * @param {{ available: number, used?: number, total?: number }} credits
 */
export function withDoctorCredits(raw, pid, credits) {
  const doctors = doctorsOf(raw).map((d) => (d.pid === pid ? { ...d, credits: { ...(d.credits ?? {}), ...credits, consistent: true } } : d));
  return { ...raw, doctors: raw?.doctors ? { ...raw.doctors, doctors } : raw?.doctors };
}

/**
 * A month an invoiced clinic paid (payment), or that record removed (null).
 * @param {object} raw RawBundle
 * @param {string} id clinic
 * @param {string} month 'YYYY-MM'
 * @param {{ month: string, amountEur: number, note: string, at: number|null }|null} payment
 */
export function withClinicPayment(raw, id, month, payment) {
  const clinics = clinicsOf(raw).map((c) => {
    if (c.id !== id) return c;
    const others = (c.payments ?? []).filter((p) => p.month !== month);
    return { ...c, payments: payment ? [...others, payment].sort((a, b) => (a.month < b.month ? -1 : 1)) : others };
  });
  return { ...raw, clinics: { ...(raw?.clinics ?? {}), clinics } };
}

/** A deleted clinic leaves the list. */
export function withoutClinic(raw, id) {
  return { ...raw, clinics: { ...(raw?.clinics ?? {}), clinics: clinicsOf(raw).filter((c) => c.id !== id) } };
}
