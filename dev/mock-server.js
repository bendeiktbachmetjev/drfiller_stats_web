// Local mock of the admin API v2 (§5.3.10, OVERRIDES O2/O3). Port 8323, ESM, no dependencies.
// Run: `npm run dev:mock` + `VITE_API_URL= npm run dev` (Vite proxies /api/admin to this server).
//
//   x-admin-secret must be 'dev' (401 otherwise, the same body as the backend)
//   per request (query on any /api/admin/v2 route, e.g. with curl):
//     ?scenario=planned          the planned scenario
//     ?fail=<route>              500 on that route (usage, doctors, revenue, soniox-usage, live-now, config, costs-monthly, settings);
//                                ?fail=usage413 answers the full-history /usage with 413 TOO_MANY_ROWS (the 90-day retry works)
//     ?off=revenue|soniox        status 'off'
//     ?stripe=test               revenue livemode false
//     ?fresh=1                   a second fresh=1 on a route within 30 s adds the note FRESH_THROTTLED
//   sticky for the browser (the site never forwards its own query string to the API):
//     GET /api/admin/v2/__mock?scenario=planned&off=revenue&stripe=test&fail=settings&email=click&fallbackOn404=1
//     GET /api/admin/v2/__mock?reset=1   back to the environment defaults (no key needed on __mock)
//   environment: EMAIL_MODE=off|click|list (default list, O2), FALLBACK_ON_404=0|1 (default 0),
//     MOCK_SCENARIO, MOCK_OFF, MOCK_STRIPE, MOCK_FAIL (the sticky defaults), MOCK_PORT
// PUT /settings and PUT /costs-monthly/:month validate like §5.2.3.7 and keep state for the process
// lifetime. Clinics (/clinics…) start from src/dev/demoClinics.js and keep their changes for the process
// lifetime too; a clinic's usage = its current doctors' demo requests. No 409 anywhere (O3): unknown pids are dropped with the note UNKNOWN_PIDS_IGNORED, and the
// marked pids come back as `internal: true, internalSource: 'settings'` on /doctors.
// Work statistics (spec v1 §7.2): GET /clinics/:id/work?from&to&workers comes from src/dev/demoWork.js (its own
// invented world, not the usage rows); PATCH /clinics/:id/staff/:pid { role?, ex?, statsOff? } and PUT /clinics/:id
// { hourEur?, statsShown? } change it; each clinic of GET /clinics has `staff`: its members and the past members
// the owner marked, as { pid, role, guessed, spec, ex, statsOff, member } (the backend's shape).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { makeDemoApi } from '../src/dev/demoData.js';
import { demoClinics, demoClinicUsage } from '../src/dev/demoClinics.js';
import { demoWork } from '../src/dev/demoWork.js';
import { guessRole } from '../src/data/clinics/staff.js';
import { CLINIC_ID_RE, DAY_RE, DEFAULT_PLANNING, DEFAULT_SETTINGS, envelope, errorBody, HOUR_EUR_MAX, MONTH_COST_LIMITS, MONTH_RE, PID_RE, PLANNING_LIMITS, STAFF_ROLES, validate } from '../src/data/api/contract.js';

const PORT = Number(process.env.MOCK_PORT) || 8323;
const PREFIX = '/api/admin/v2';
const TTL_MS = 600000;
const FRESH_THROTTLE_MS = 30000;
const EMAIL_MODES = ['off', 'click', 'list'];
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MIN_FROM_MS = Date.parse('2025-01-01T00:00:00Z');

const envDefaults = () => ({
  scenario: process.env.MOCK_SCENARIO === 'planned' ? 'planned' : 'today',
  off: process.env.MOCK_OFF ?? null,
  stripe: process.env.MOCK_STRIPE ?? null,
  fail: process.env.MOCK_FAIL ?? null,
  email: EMAIL_MODES.includes(process.env.EMAIL_MODE) ? process.env.EMAIL_MODE : 'list',
  fallbackOn404: process.env.FALLBACK_ON_404 === '1',
});

const state = {
  sticky: envDefaults(),
  settings: null,
  months: new Map(),
  grants: new Map(),
  emailReveals: [],
  emailLists: [],
  fresh: new Map(), // route → last fresh=1 time
  clinics: null, // Map id → clinic (without members), seeded from demoClinics on first use
  memberOf: null, // Map pid → clinic id
  grantList: [], // hand grants with their price: { id, t, pid|null, clinicId|null, credits, priceEur, note }
  staff: null, // Map clinic id → { [pid]: { role?, ex? } } (the owner's marks; the backend keys them by uid)
  statsOff: null, // Set of pids who objected to work statistics (kept with the account, not the clinic)
  profiles: null, // Map pid → demo work profile (demoWork.js)
  pastMembers: null, // Map clinic id → Set of pids taken out (their work stays in the clinic's statistics)
};

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const ok = (res, data, notes = []) => send(res, 200, envelope(data, { nowMs: Date.now(), ttlMs: TTL_MS, notes }));
const fail = (res, status, code, message) => send(res, status, errorBody(code, message));

const readBody = (req) =>
  new Promise((resolve) => {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : null);
      } catch {
        resolve(undefined);
      }
    });
  });

const inRange = (value, [min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Like the backend: missing keys take the defaults, unknown keys are dropped, `updatedAt` is the server's. */
const withDefaults = (body) => {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const planningSrc = src.planning && typeof src.planning === 'object' ? src.planning : {};
  const pickKnown = (from, defaults) => Object.fromEntries(Object.keys(defaults).map((key) => [key, from[key] === undefined ? defaults[key] : from[key]]));
  return { ...pickKnown(src, DEFAULT_SETTINGS), planning: pickKnown(planningSrc, DEFAULT_PLANNING), updatedAt: 0 };
};

function checkSettings(body) {
  const { ok: shapeOk, errors } = validate('settingsObject', body);
  if (!shapeOk) return errors[0];
  const p = body.planning;
  const plain = ['visitsPerDoctorMonth', 'liveShareOfVisits', 'liveMinutesPerVisit', 'dictationMinutesPerVisit', 'conversationTokensPerMinute', 'anamnesisRunsPerDoctorMonth', 'freeShare', 'workdaysPerMonth', 'peakHourShare', 'sonioxStreamLimit'];
  for (const key of plain) if (!inRange(p[key], PLANNING_LIMITS[key])) return `planning.${key} out of range`;
  if (p.doctorScales.length !== 2 || !p.doctorScales.every((n) => inRange(n, PLANNING_LIMITS.doctorScales))) return 'planning.doctorScales out of range';
  if (![p.assumedFormTokens.in, p.assumedFormTokens.out].every((n) => inRange(n, PLANNING_LIMITS.assumedFormTokens))) return 'planning.assumedFormTokens out of range';
  const mix = Object.values(p.packMix);
  if (!mix.every((n) => inRange(n, PLANNING_LIMITS.packMix)) || Math.abs(mix.reduce((a, b) => a + b, 0) - 1) > 0.001) return 'planning.packMix must sum to 1';
  if (![p.fixedMonthlyUsd.railway, p.fixedMonthlyUsd.other].every((n) => inRange(n, PLANNING_LIMITS.fixedMonthlyUsd))) return 'planning.fixedMonthlyUsd out of range';
  if (body.internalPids.length > 200 || !body.internalPids.every((pid) => PID_RE.test(pid))) return 'internalPids invalid';
  return null;
}

const MONTH_FIELDS = ['googleInvoiceEur', 'googlePromoCreditsEur', 'railwayUsd', 'sonioxInvoiceUsd', 'openaiInvoiceUsd', 'otherEur'];

function checkMonth(month, body, nowMs) {
  const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit' }).format(new Date(nowMs));
  if (!MONTH_RE.test(month) || month < MONTH_COST_LIMITS.firstMonth || month > current) return 'month out of range';
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body must be an object';
  for (const key of MONTH_FIELDS) {
    if (!(key in body) || body[key] === null) continue;
    if (!inRange(body[key], [MONTH_COST_LIMITS.min, MONTH_COST_LIMITS.max])) return `${key} out of range`;
  }
  if ('note' in body && (typeof body.note !== 'string' || body.note.length > MONTH_COST_LIMITS.noteMax)) return 'note too long';
  return null;
}

/** [from, to) of a /usage request, or an error text (BAD_RANGE, like the backend). */
function parseRange(query, nowMs) {
  const fromText = query.get('from');
  const toText = query.get('to');
  if ((fromText && !ISO_INSTANT.test(fromText)) || (toText && !ISO_INSTANT.test(toText))) return { error: 'from/to must be ISO instants with a zone' };
  const fromMs = fromText ? Date.parse(fromText) : Date.parse('2026-03-04T22:00:00Z');
  const toMs = toText ? Date.parse(toText) : nowMs + 1;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs || fromMs < MIN_FROM_MS) return { error: 'bad range' };
  return { fromMs, toMs, open: !toText };
}

const hourly = (list, nowMs) => list.filter((t) => t > nowMs - 3600000);

const offRevenue = (revenue) => ({
  ...revenue,
  status: 'off',
  reason: 'no_stripe_key',
  livemode: null,
  payments: [],
  adjustments: [],
  ignoredSessions: 0,
  totals: { count: 0, grossCents: 0, discountCents: 0, feeCents: 0, refundedCents: 0, netCents: 0, credits: 0, payingDoctors: 0 },
  webhook: { ...revenue.webhook, notCredited: 0, pending: 0, unknown: 0 },
});

const offSoniox = (soniox) => ({ ...soniox, status: 'off', reason: 'no_soniox_key', days: [], liveSessions: [], totals: { requests: 0, audioMs: 0, costUsd: 0 } });

function handleControl(res, query) {
  if (query.get('reset') === '1') state.sticky = envDefaults();
  if (query.has('scenario')) state.sticky.scenario = query.get('scenario') === 'planned' ? 'planned' : 'today';
  ['off', 'stripe', 'fail'].forEach((key) => {
    if (query.has(key)) state.sticky[key] = query.get(key) || null;
  });
  if (EMAIL_MODES.includes(query.get('email'))) state.sticky.email = query.get('email');
  if (query.has('fallbackOn404')) state.sticky.fallbackOn404 = query.get('fallbackOn404') === '1';
  if (query.get('reset') === '1') {
    state.settings = null;
    state.months.clear();
    state.clinics = null;
    state.memberOf = null;
    state.grantList = [];
    state.staff = null;
    state.statsOff = null;
    state.profiles = null;
    state.pastMembers = null;
  }
  return send(res, 200, { success: true, mock: state.sticky });
}

// --- clinics (like the backend's routes/adminClinics.js, without its rate limits and logs) ----------------

const CLINIC_FIELDS = ['name', 'billing', 'active', 'monthlyCapPerDoctor', 'pricePerCreditEur', 'markupPct', 'note', 'hourEur', 'statsShown', 'statsFrom'];

/** A clinic's own €/h like the backend's hourEurOf: above 0, at most HOUR_EUR_MAX, 2 decimals; null otherwise. */
const hourOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= HOUR_EUR_MAX && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? Math.round(v * 100) / 100 : null);

/** The backend's validateClinic in short: field names of the errors, or the clean value. */
function checkClinic(body, partial) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {};
  const errors = [];
  const has = (key) => Object.hasOwn(b, key);
  const text = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : null);
  if (has('name') || !partial) {
    const name = text(b.name);
    if (!name || name.length > 120) errors.push('name');
    else value.name = name;
  }
  if (has('billing') || !partial) {
    if (!['invoice', 'prepaid'].includes(b.billing)) errors.push('billing');
    else value.billing = b.billing;
  }
  if (has('active')) (typeof b.active === 'boolean' ? (value.active = b.active) : errors.push('active'));
  if (has('monthlyCapPerDoctor')) {
    const n = b.monthlyCapPerDoctor;
    if (Number.isInteger(n) && n >= 1 && n <= 100000) value.monthlyCapPerDoctor = n;
    else errors.push('monthlyCapPerDoctor');
  }
  if (has('markupPct')) {
    const m = b.markupPct;
    if (typeof m === 'number' && Number.isFinite(m) && m >= 0 && m <= 300 && Math.abs(m * 100 - Math.round(m * 100)) < 1e-6) value.markupPct = Math.round(m * 100) / 100;
    else errors.push('markupPct');
  }
  if (has('pricePerCreditEur')) {
    const p = b.pricePerCreditEur;
    if (p === null) value.pricePerCreditEur = null;
    else if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 10 && Math.abs(p * 10000 - Math.round(p * 10000)) < 1e-6) value.pricePerCreditEur = Math.round(p * 10000) / 10000;
    else errors.push('pricePerCreditEur');
  }
  if (has('note')) {
    const note = text(b.note);
    if (note === null || note.length > 500) errors.push('note');
    else value.note = note;
  }
  if (has('hourEur')) {
    // Like the backend: the whole map is replaced, a role left out or null = the national average
    const h = b.hourEur;
    if (h === null) value.hourEur = {};
    else if (!h || typeof h !== 'object' || Array.isArray(h)) errors.push('hourEur');
    else {
      const rates = {};
      Object.entries(h).forEach(([role, eur]) => {
        if (!STAFF_ROLES.includes(role) || (eur !== null && hourOf(eur) === null)) errors.push(`hourEur.${role}`);
        else if (eur !== null) rates[role] = hourOf(eur);
      });
      value.hourEur = rates;
    }
  }
  if (has('statsShown')) (typeof b.statsShown === 'boolean' ? (value.statsShown = b.statsShown) : errors.push('statsShown'));
  // The first day the clinic's page shows them (a real day from 2026 on)
  if (has('statsFrom')) {
    const day = b.statsFrom;
    const at = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : null;
    const real = Boolean(at) && !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
    if (real && day >= '2026-01-01') value.statsFrom = day;
    else errors.push('statsFrom');
  }
  Object.keys(b).forEach((key) => {
    if (!CLINIC_FIELDS.includes(key)) errors.push(key);
  });
  if (partial && !errors.length && !Object.keys(value).length) errors.push('nothing to change');
  return { errors, value };
}

function clinicsState(api, nowMs) {
  if (!state.clinics) {
    state.clinics = new Map();
    state.memberOf = new Map();
    state.staff = new Map();
    state.statsOff = new Set();
    state.profiles = new Map();
    state.pastMembers = new Map();
    state.specOf = new Map(api.doctors.doctors.map((d) => [d.pid, d.specialization ?? null]));
    demoClinics(api, nowMs).forEach(({ pids, staff, statsOff, profiles, ...clinic }) => {
      state.clinics.set(clinic.id, clinic);
      pids.forEach((pid) => state.memberOf.set(pid, clinic.id));
      state.staff.set(clinic.id, { ...staff });
      statsOff.forEach((pid) => state.statsOff.add(pid));
      Object.entries(profiles).forEach(([pid, profile]) => state.profiles.set(pid, profile));
    });
  }
  return state.clinics;
}

const membersOf = (id) => [...state.memberOf.entries()].filter(([, clinicId]) => clinicId === id).map(([pid]) => pid).sort();
const pastOf = (id) => {
  if (!state.pastMembers.has(id)) state.pastMembers.set(id, new Set());
  return state.pastMembers.get(id);
};
/** A worker's marks at a clinic as GET /clinics sends them (the role guessed from the specialty until set). */
const markOf = (clinicId, pid) => {
  const entry = state.staff.get(clinicId)?.[pid] ?? {};
  const spec = state.specOf?.get(pid) ?? null;
  return { pid, role: entry.role ?? guessRole(spec), guessed: !entry.role, spec: spec ?? 'Kita', ex: entry.ex === true, statsOff: state.statsOff.has(pid) };
};
/** Like the backend: the members now, then the past members the owner marked there, each with its marks. */
const staffOut = (clinicId) => {
  const members = membersOf(clinicId);
  const marked = Object.keys(state.staff.get(clinicId) ?? {}).filter((pid) => !members.includes(pid));
  return [...members.map((pid) => ({ ...markOf(clinicId, pid), member: true })), ...marked.map((pid) => ({ ...markOf(clinicId, pid), member: false }))].sort((a, b) => (a.pid < b.pid ? -1 : 1));
};
const clinicOut = ({ deletedAt, ...clinic }) => ({
  ...clinic,
  members: membersOf(clinic.id),
  staff: staffOut(clinic.id),
  payments: clinic.payments ?? [],
  share: clinic.share ?? null,
  hourEur: clinic.hourEur ?? {},
  statsShown: clinic.statsShown === true,
  statsFrom: clinic.statsFrom ?? null,
});
/** Like the backend: the first time they are turned on, shown from that day (unless the owner gave a day). */
const withStatsFrom = (clinic, value, nowMs) => {
  if (value.statsShown === true && !value.statsFrom && !clinic.statsFrom) value.statsFrom = vilniusDayOf(nowMs);
  return value;
};
/** Euros typed by the owner (like the backend's eurOf): 0..1e6, at most 2 decimals; null otherwise. */
const eurOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e6 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? Math.round(v * 100) / 100 : null);
const vilniusMonthOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit' }).format(new Date(ms));
const vilniusDayOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius' }).format(new Date(ms));

async function handleClinics(req, res, route, query, api, nowMs) {
  const clinics = clinicsState(api, nowMs);
  const doctorOk = (pid) => PID_RE.test(pid) && api.doctors.doctors.some((d) => d.pid === pid && d.exists?.auth);
  if (route === '/clinics' && req.method === 'GET') {
    return ok(res, { clinics: [...clinics.values()].filter((c) => !c.deletedAt).map(clinicOut).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  if (route === '/clinics' && req.method === 'POST') {
    const { errors, value } = checkClinic(await readBody(req), false);
    if (errors.length) return fail(res, 400, 'INVALID_BODY', `Invalid fields: ${errors.join(', ')}`);
    const id = `c${randomBytes(8).toString('hex')}`;
    const clinic = { id, active: true, monthlyCapPerDoctor: 3000, markupPct: 30, note: '', ...withStatsFrom({}, value, nowMs), credits: { available: 0, used: 0, total: 0 }, createdAt: nowMs, updatedAt: nowMs };
    clinics.set(id, clinic);
    return ok(res, { clinic: clinicOut(clinic) });
  }
  const match = /^\/clinics\/([^/]+)(?:\/(members|credits|usage|payments|share|staff|work)(?:\/([^/]+))?)?$/.exec(route);
  if (!match) return fail(res, 404, 'NOT_FOUND', 'Unknown route.');
  const id = decodeURIComponent(match[1]);
  const part = match[2] ?? null;
  const pid = match[3] ? decodeURIComponent(match[3]) : null;
  const clinic = CLINIC_ID_RE.test(id) ? clinics.get(id) : null;
  if (!clinic || clinic.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Unknown clinic');

  if (!part && req.method === 'DELETE') {
    const left = membersOf(id).length;
    if (left) return fail(res, 409, 'HAS_DOCTORS', `Take the clinic's ${left} doctor(s) out first`);
    clinic.deletedAt = nowMs;
    clinic.share = null;
    return ok(res, { clinicId: id, deleted: true });
  }
  // The clinic's read-only link: the real page lives on the backend (/klinika/:token); here only its record
  if (part === 'share' && !pid && req.method === 'POST') {
    clinic.share = { createdAt: nowMs, lastOpenedAt: null, opens: 0 };
    const token = randomBytes(32).toString('base64url');
    const password = ['K7RM', '2XQP', '9ZTW'].join('-');
    return ok(res, { clinicId: id, url: `http://localhost:${PORT}/klinika/${token}`, password, createdAt: nowMs });
  }
  if (part === 'share' && !pid && req.method === 'DELETE') {
    const stopped = clinic.share ? 1 : 0;
    clinic.share = null;
    return ok(res, { clinicId: id, stopped });
  }
  if (part === 'payments' && pid && req.method === 'PUT') {
    const month = pid;
    if (!MONTH_RE.test(month) || month < '2026-01' || month > vilniusMonthOf(nowMs)) return fail(res, 400, 'INVALID_BODY', 'month must be YYYY-MM from 2026-01 up to this month');
    const body = await readBody(req);
    const amountEur = eurOf(body?.amountEur);
    if (amountEur === null) return fail(res, 400, 'INVALID_BODY', 'amountEur must be euros, at most 2 decimals');
    const payment = { month, amountEur, note: typeof body.note === 'string' ? body.note.slice(0, 200) : '', at: nowMs };
    clinic.payments = [...(clinic.payments ?? []).filter((p) => p.month !== month), payment].sort((a, b) => (a.month < b.month ? -1 : 1));
    return ok(res, { clinicId: id, payment });
  }
  if (part === 'payments' && pid && req.method === 'DELETE') {
    const before = (clinic.payments ?? []).length;
    clinic.payments = (clinic.payments ?? []).filter((p) => p.month !== pid);
    if (clinic.payments.length === before) return fail(res, 404, 'NOT_FOUND', 'Unknown payment');
    return ok(res, { clinicId: id, month: pid, removed: true });
  }

  if (!part && req.method === 'PUT') {
    const { errors, value } = checkClinic(await readBody(req), true);
    if (errors.length) return fail(res, 400, 'INVALID_BODY', `Invalid fields: ${errors.join(', ')}`);
    Object.assign(clinic, withStatsFrom(clinic, value, nowMs), { updatedAt: nowMs });
    return ok(res, { clinic: clinicOut(clinic) });
  }
  if (part === 'members' && pid && (req.method === 'PUT' || req.method === 'DELETE')) {
    if (!doctorOk(pid)) return fail(res, 404, 'NOT_FOUND', 'Unknown doctor');
    const previous = state.memberOf.get(pid) ?? null;
    if (req.method === 'PUT') {
      if (previous !== id) {
        state.memberOf.set(pid, id);
        if (previous) pastOf(previous).add(pid);
        pastOf(id).delete(pid);
      }
      return ok(res, { pid, clinicId: id, previousClinicId: previous, changed: previous !== id });
    }
    const changed = previous === id;
    if (changed) {
      state.memberOf.delete(pid);
      pastOf(id).add(pid);
    }
    return ok(res, { pid, clinicId: null, previousClinicId: previous, changed });
  }
  // Work statistics: the owner's marks on one worker (a member or a past member), like the backend's validateStaff
  if (part === 'staff' && pid && req.method === 'PATCH') {
    const body = await readBody(req);
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const errors = Object.keys(b).filter((key) => !['role', 'ex', 'statsOff'].includes(key));
    if ('role' in b && b.role !== null && !STAFF_ROLES.includes(b.role)) errors.push('role');
    ['ex', 'statsOff'].forEach((flag) => {
      if (flag in b && typeof b[flag] !== 'boolean') errors.push(flag);
    });
    if (!errors.length && !Object.keys(b).length) errors.push('nothing to change');
    if (errors.length) return fail(res, 400, 'INVALID_BODY', `Invalid fields: ${errors.join(', ')}`);
    const member = state.memberOf.get(pid) === id;
    if (!PID_RE.test(pid) || (!member && !pastOf(id).has(pid))) return fail(res, 404, 'NOT_FOUND', 'Not a worker of this clinic');
    const marks = { ...(state.staff.get(id)?.[pid] ?? {}) };
    if ('role' in b) {
      if (b.role) marks.role = b.role;
      else delete marks.role;
    }
    if ('ex' in b) {
      if (b.ex) marks.ex = true;
      else delete marks.ex;
    }
    const staff = { ...(state.staff.get(id) ?? {}) };
    if (Object.keys(marks).length) staff[pid] = marks;
    else delete staff[pid];
    state.staff.set(id, staff);
    if ('statsOff' in b) (b.statsOff ? state.statsOff.add(pid) : state.statsOff.delete(pid));
    return ok(res, { clinicId: id, staff: { ...markOf(id, pid), member } });
  }
  if (part === 'work' && !pid && req.method === 'GET') {
    // Like the backend (routes/adminWork.js): both days included, from not after to nor after today
    const from = query.get('from');
    const to = query.get('to');
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '') || from > to) return fail(res, 400, 'BAD_RANGE', 'from and to must be days (YYYY-MM-DD), from not after to');
    if (from > vilniusDayOf(nowMs)) return fail(res, 400, 'BAD_RANGE', 'from is after today');
    const workers = (query.get('workers') ?? '').split(',').filter((p) => PID_RE.test(p));
    // E-mails only in the 'list' mode, as on /doctors
    const emailOf = (p) => api.doctors.doctors.find((d) => d.pid === p)?.email ?? null;
    const people = [...membersOf(id).map((p) => ({ pid: p, member: true })), ...[...pastOf(id)].map((p) => ({ pid: p, member: false }))].map(({ pid: p, member }) => {
      const mark = markOf(id, p);
      const profile = state.profiles.get(p) ?? {};
      return { ...mark, email: emailOf(p), member, profile, oldApp: profile.oldApp === true };
    });
    // A prepaid clinic's price of a credit: what its priced purchases cost on average (none = it got them free)
    const priced = state.grantList.filter((g) => g.clinicId === id && Number.isFinite(g.priceEur) && g.priceEur > 0);
    const paidCredits = priced.reduce((s, g) => s + g.credits, 0);
    const creditPriceEur = paidCredits ? priced.reduce((s, g) => s + g.priceEur, 0) / paidCredits : null;
    return ok(res, demoWork({ clinic, people, from, to, workers: workers.length ? workers : null, nowMs, creditPriceEur }));
  }
  if (part === 'credits' && req.method === 'POST') {
    const body = await readBody(req);
    const credits = body?.credits;
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) return fail(res, 400, 'INVALID_BODY', 'credits must be a whole number from 1 to 100000');
    const priceEur = body.priceEur == null ? null : eurOf(body.priceEur);
    if (body.priceEur != null && priceEur === null) return fail(res, 400, 'INVALID_BODY', 'priceEur must be euros from 0, at most 2 decimals');
    if (clinic.billing !== 'prepaid') return fail(res, 409, 'NOT_PREPAID', 'This clinic pays by invoice; switch it to prepaid credits first');
    clinic.credits = { available: clinic.credits.available + credits, used: clinic.credits.used, total: clinic.credits.total + credits };
    clinic.updatedAt = nowMs;
    state.grantList.push({ id: `gmock${state.grantList.length + 1}`, t: nowMs, pid: null, clinicId: id, credits, priceEur, note: typeof body.note === 'string' ? body.note : '' });
    return ok(res, { clinicId: id, added: credits, priceEur, credits: clinic.credits });
  }
  if (part === 'usage' && req.method === 'GET') {
    const from = query.get('from');
    const to = query.get('to');
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '') || from >= to) return fail(res, 400, 'BAD_RANGE', 'from and to must be days (YYYY-MM-DD), from before to');
    return ok(res, { clinicId: id, range: { from, to }, rows: demoClinicUsage(api, membersOf(id), from, to, { markupPct: clinic.billing === 'invoice' ? clinic.markupPct ?? 30 : null }) });
  }
  return fail(res, 404, 'NOT_FOUND', 'Unknown route.');
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith(PREFIX)) return fail(res, 404, 'NOT_FOUND', 'Unknown route.');
  const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/';
  const query = url.searchParams;
  if (route === '/__mock') return handleControl(res, query);
  if (req.headers['x-admin-secret'] !== 'dev') return send(res, 401, { success: false, error: 'Invalid or missing admin secret' });

  const nowMs = Date.now();
  const name = route.split('/')[1] ?? '';
  const pick = (key) => (query.has(key) ? query.get(key) : state.sticky[key]);
  const failing = pick('fail');
  if (failing === name) return fail(res, 500, 'INTERNAL', 'Forced failure (mock).');

  const scenario = pick('scenario') === 'planned' ? 'planned' : 'today';
  const emailMode = EMAIL_MODES.includes(query.get('email')) ? query.get('email') : state.sticky.email;
  const api = makeDemoApi(nowMs, { scenario, emailMode, fallbackOn404: state.sticky.fallbackOn404 });
  const off = pick('off');
  const notes = [];
  if (query.get('fresh') === '1') {
    const last = state.fresh.get(route) ?? 0;
    if (nowMs - last < FRESH_THROTTLE_MS) notes.push('FRESH_THROTTLED');
    else state.fresh.set(route, nowMs);
  }

  const withGrant = (d) => {
    const extra = state.grants.get(d.pid) ?? 0;
    if (!extra) return d;
    const c = d.credits ?? { available: 0, used: 0, total: 0, consistent: true };
    return { ...d, credits: { ...c, available: c.available + extra, total: c.total + extra } };
  };
  const settingsNow = () => state.settings ?? api.settings.settings;
  const knownPids = new Set(api.doctors.doctors.map((d) => d.pid));

  if (route === '/clinics' || route.startsWith('/clinics/')) return handleClinics(req, res, route, query, api, nowMs);

  if (req.method === 'PUT' && route === '/settings') {
    const raw = await readBody(req);
    const body = raw === undefined ? undefined : withDefaults(raw);
    const problem = body === undefined ? 'body is not JSON' : checkSettings(body);
    if (problem) return fail(res, 400, 'INVALID_BODY', problem);
    const internalPids = body.internalPids.filter((pid) => knownPids.has(pid));
    if (internalPids.length < body.internalPids.length) notes.push('UNKNOWN_PIDS_IGNORED');
    state.settings = { ...body, internalPids, updatedAt: nowMs };
    return ok(res, { settings: state.settings }, notes);
  }
  const monthMatch = /^\/costs-monthly\/([^/]+)$/.exec(route);
  if (req.method === 'PUT' && monthMatch) {
    const month = decodeURIComponent(monthMatch[1]);
    const body = await readBody(req);
    const problem = body === undefined ? 'body is not JSON' : checkMonth(month, body, nowMs);
    if (problem) return fail(res, 400, 'INVALID_BODY', problem);
    const demoMonth = api.costsMonthly.months.find((m) => m.month === month);
    const before = state.months.get(month) ?? demoMonth ?? { month, googleInvoiceEur: null, googlePromoCreditsEur: null, railwayUsd: null, sonioxInvoiceUsd: null, openaiInvoiceUsd: null, otherEur: null, note: '' };
    const fields = Object.fromEntries(Object.entries(body).filter(([key]) => MONTH_FIELDS.includes(key) || key === 'note'));
    const next = { ...before, ...fields, updatedAt: nowMs };
    if (typeof next.note === 'string') next.note = next.note.replace(/[\u0000-\u001f\u007f]/g, '');
    state.months.set(month, next);
    return ok(res, { month: next });
  }
  const creditsMatch = /^\/doctors\/([^/]+)\/credits$/.exec(route);
  if (req.method === 'POST' && creditsMatch) {
    const pid = decodeURIComponent(creditsMatch[1]);
    const body = await readBody(req);
    const credits = body?.credits;
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) return fail(res, 400, 'INVALID_BODY', 'credits must be a whole number from 1 to 100000');
    const priceEur = body.priceEur == null ? null : eurOf(body.priceEur);
    if (body.priceEur != null && priceEur === null) return fail(res, 400, 'INVALID_BODY', 'priceEur must be euros from 0, at most 2 decimals');
    const doctor = api.doctors.doctors.find((d) => d.pid === pid);
    if (!PID_RE.test(pid) || !doctor || !doctor.exists?.auth) return fail(res, 404, 'NOT_FOUND', 'Unknown doctor.');
    const clinicsNow = clinicsState(api, nowMs);
    const paying = clinicsNow.get(state.memberOf.get(pid));
    if (paying && paying.active !== false && !paying.deletedAt) return fail(res, 409, 'IN_CLINIC', 'This doctor is paid for by a clinic; top up the clinic instead');
    state.grants.set(pid, (state.grants.get(pid) ?? 0) + credits);
    state.grantList.push({ id: `gmock${state.grantList.length + 1}`, t: nowMs, pid, clinicId: null, credits, priceEur, note: typeof body.note === 'string' ? body.note : '' });
    const c = withGrant(doctor).credits;
    return ok(res, { pid, added: credits, priceEur, credits: { available: c.available, used: c.used, total: c.total } });
  }
  if (req.method !== 'GET') return fail(res, 404, 'NOT_FOUND', 'Unknown route.');

  const emailOf = (pid) => {
    const index = api.doctors.doctors.findIndex((d) => d.pid === pid);
    return index < 0 ? null : `doctor${index + 1}@example.test`;
  };
  const emailMatch = /^\/doctors\/([^/]+)\/email$/.exec(route);

  switch (true) {
    case route === '/usage': {
      const range = parseRange(query, nowMs);
      if (range.error) return fail(res, 400, 'BAD_RANGE', range.error);
      if (failing === 'usage413' && range.fromMs < nowMs - 91 * 86400000) return fail(res, 413, 'TOO_MANY_ROWS', 'History too large (mock).');
      const rows = api.usage.rows.filter((row) => row.t >= range.fromMs && row.t < range.toMs);
      return ok(res, { range: { from: new Date(range.fromMs).toISOString(), to: new Date(Math.min(range.toMs, nowMs)).toISOString(), open: range.open }, counts: api.usage.counts, rows }, notes);
    }
    case route === '/doctors': {
      const marked = new Set(settingsNow().internalPids);
      clinicsState(api, nowMs);
      const doctors = api.doctors.doctors
        .map(withGrant)
        .map((d) => (marked.has(d.pid) && !d.internal ? { ...d, internal: true, internalSource: 'settings' } : d))
        .map((d) => ({ ...d, clinicId: state.memberOf.get(d.pid) ?? null }));
      return ok(res, { ...api.doctors, doctors }, notes);
    }
    case route === '/doctors/emails':
      if (emailMode !== 'list') return fail(res, 403, 'EMAIL_OFF', 'E-mail list is off (ADMIN_EMAIL_MODE).');
      state.emailLists = hourly(state.emailLists, nowMs);
      if (state.emailLists.length >= 10) return fail(res, 429, 'RATE_LIMITED', 'Too many e-mail lists this hour.');
      state.emailLists.push(nowMs);
      return ok(res, { emails: Object.fromEntries(api.doctors.doctors.map((d) => [d.pid, emailOf(d.pid)])) }, notes);
    case Boolean(emailMatch): {
      if (emailMode === 'off') return fail(res, 403, 'EMAIL_OFF', 'E-mails are off (ADMIN_EMAIL_MODE).');
      state.emailReveals = hourly(state.emailReveals, nowMs);
      if (state.emailReveals.length >= 30) return fail(res, 429, 'RATE_LIMITED', 'Too many e-mails revealed this hour.');
      const pid = decodeURIComponent(emailMatch[1]);
      if (!PID_RE.test(pid) || !knownPids.has(pid)) return fail(res, 404, 'NOT_FOUND', 'Unknown doctor.');
      state.emailReveals.push(nowMs);
      return ok(res, { pid, email: emailOf(pid) }, notes);
    }
    case route === '/revenue': {
      if (off === 'revenue') return ok(res, offRevenue(api.revenue), notes);
      return ok(res, { ...api.revenue, livemode: pick('stripe') !== 'test' }, notes);
    }
    case route === '/soniox-usage':
      return ok(res, off === 'soniox' ? offSoniox(api.soniox) : api.soniox, notes);
    case route === '/live-now':
      return ok(res, api.liveNow, notes);
    case route === '/config':
      return ok(res, { ...api.config, server: { ...api.config.server, stripeConfigured: off !== 'revenue', stripeMode: off === 'revenue' ? null : pick('stripe') === 'test' ? 'test' : 'live', sonioxConfigured: off !== 'soniox' } }, notes);
    case route === '/costs-monthly': {
      const months = new Map(api.costsMonthly.months.map((m) => [m.month, m]));
      state.months.forEach((m, key) => months.set(key, m));
      return ok(res, { months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)) }, notes);
    }
    case route === '/settings':
      return ok(res, { settings: settingsNow() }, notes);
    case route === '/grants':
      return ok(res, { grants: state.grantList }, notes);
    default:
      return fail(res, 404, 'NOT_FOUND', 'Unknown route.');
  }
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      fail(res, 500, 'INTERNAL', 'Mock error.');
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    const { scenario, email, fallbackOn404 } = state.sticky;
    console.log(`Mock admin API v2 on http://localhost:${PORT}${PREFIX} (key: dev, scenario: ${scenario}, email mode: ${email}, fallbackOn404: ${fallbackOn404})`);
  });
