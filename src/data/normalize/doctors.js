// DoctorApi[] (+ payments and usage) → Doctor (FROZEN CONTRACT 2, §5.3.7 and OVERRIDES O2).
// Copy-free: the display name is built in the UI with copy's doctorLabel(doctor):
//   email when present (O2) → otherwise "Doctor NN" (`no`) → otherwise "Deleted account".

/**
 * @typedef {import('../api/contract.js').DoctorApi & {
 *   apiClass: string,
 *   class: 'internal'|'paid'|'bought_inferred'|'bought_unverified'|'legacy'|'gifted'|'free'|'no_credits_doc'|'deleted'|'unknown',
 *   displayClass: 'internal'|'paid'|'gifted'|'free'|'other',
 *   no: number|null, noText: string|null, email: string|null, deletedAccount: boolean,
 *   firstActivityMs: number|null, lastActivityMs: number|null, payments: number, paidGrossCents: number
 * }} Doctor
 */

const DISPLAY = {
  internal: 'internal',
  paid: 'paid',
  bought_inferred: 'paid',
  bought_unverified: 'gifted',
  legacy: 'gifted',
  gifted: 'gifted',
  free: 'free',
};

/**
 * Class precedence (first match): internal → paid (≥ 1 payment, Stripe ok + live) → bought_unverified
 * (API bought_inferred without a payment while Stripe is ok + live) → the API class. With Stripe
 * off/error/test, bought_inferred stays (counted as paid with basis inferred).
 * @param {{ internal: boolean, class: string }} api
 * @param {{ stripeLive: boolean, payments: number }} context
 */
export function classOf(api, { stripeLive, payments }) {
  if (api.internal) return 'internal';
  if (stripeLive && payments > 0) return 'paid';
  if (stripeLive && api.class === 'bought_inferred') return 'bought_unverified';
  return api.class;
}

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * @param {{ doctors?: import('../api/contract.js').DoctorApi[] } | null} api the /doctors data
 * @param {{ payments?: Array<{ pid: string|null, grossCents: number }>, stripeLive?: boolean,
 *   rows?: Array<{ pid: string, t: number }> }} context
 * @returns {{ doctors: Map<string, Doctor>, doctorList: Doctor[] }}
 */
export function normalizeDoctors(api, { payments = [], stripeLive = false, rows = [] } = {}) {
  const paidBy = new Map();
  payments.forEach((payment) => {
    if (!payment.pid) return;
    const entry = paidBy.get(payment.pid) ?? { payments: 0, grossCents: 0 };
    entry.payments += 1;
    entry.grossCents += payment.grossCents ?? 0;
    paidBy.set(payment.pid, entry);
  });

  const activity = new Map();
  rows.forEach((row) => {
    const entry = activity.get(row.pid);
    if (!entry) activity.set(row.pid, { first: row.t, last: row.t });
    else {
      if (row.t < entry.first) entry.first = row.t;
      if (row.t > entry.last) entry.last = row.t;
    }
  });

  const apiDoctors = Array.isArray(api?.doctors) ? api.doctors : [];
  const list = apiDoctors.map((doctor) => {
    const paid = paidBy.get(doctor.pid) ?? { payments: 0, grossCents: 0 };
    const cls = classOf(doctor, { stripeLive, payments: paid.payments });
    const seen = activity.get(doctor.pid);
    return {
      ...doctor,
      apiClass: doctor.class,
      class: cls,
      displayClass: DISPLAY[cls] ?? 'other',
      email: typeof doctor.email === 'string' && doctor.email ? doctor.email : null,
      deletedAccount: !doctor.exists?.auth && !doctor.exists?.credits,
      no: null,
      noText: null,
      firstActivityMs: seen?.first ?? null,
      lastActivityMs: seen?.last ?? null,
      payments: paid.payments,
      paidGrossCents: paid.grossCents,
    };
  });

  // Usage-only pids: deleted accounts ('deleted' pass-through or a pid the server no longer knows).
  const known = new Set(list.map((doctor) => doctor.pid));
  activity.forEach((seen, pid) => {
    if (known.has(pid) || pid === 'anonymous') return;
    list.push({
      pid,
      code: pid === 'deleted' ? '—' : `D-${pid.slice(1, 5).toUpperCase()}`,
      signupAt: null,
      lastSignInAt: null,
      exists: { auth: false, credits: false, profile: false },
      specialization: null,
      detailLevel: null,
      credits: null,
      audioBankMs: 0,
      liveOpen: 0,
      legacyFields: false,
      inferredPacks: null,
      internal: false,
      internalSource: null,
      apiClass: null,
      class: pid === 'deleted' ? 'deleted' : 'unknown',
      displayClass: 'other',
      email: null,
      deletedAccount: true,
      no: null,
      noText: null,
      firstActivityMs: seen.first,
      lastActivityMs: seen.last,
      payments: paidBy.get(pid)?.payments ?? 0,
      paidGrossCents: paidBy.get(pid)?.grossCents ?? 0,
    });
  });

  // "Doctor NN": by signupAt ascending, ties by pid; deleted accounts get no number.
  const numbered = list
    .filter((doctor) => !doctor.deletedAccount)
    .sort((a, b) => (a.signupAt ?? Infinity) - (b.signupAt ?? Infinity) || a.pid.localeCompare(b.pid));
  const width = numbered.length >= 100 ? 3 : 2;
  numbered.forEach((doctor, index) => {
    doctor.no = index + 1;
    doctor.noText = pad(index + 1, width);
  });

  const doctorList = list.sort((a, b) => (a.no ?? Infinity) - (b.no ?? Infinity) || a.pid.localeCompare(b.pid));
  return { doctors: new Map(doctorList.map((doctor) => [doctor.pid, doctor])), doctorList };
}
