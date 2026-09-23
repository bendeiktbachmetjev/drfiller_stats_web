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
// lifetime. No 409 anywhere (O3): unknown pids are dropped with the note UNKNOWN_PIDS_IGNORED, and the
// marked pids come back as `internal: true, internalSource: 'settings'` on /doctors.
import http from 'node:http';
import { makeDemoApi } from '../src/dev/demoData.js';
import { DEFAULT_PLANNING, DEFAULT_SETTINGS, envelope, errorBody, MONTH_COST_LIMITS, MONTH_RE, PID_RE, PLANNING_LIMITS, validate } from '../src/data/api/contract.js';

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
  emailReveals: [],
  emailLists: [],
  fresh: new Map(), // route → last fresh=1 time
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
  }
  return send(res, 200, { success: true, mock: state.sticky });
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

  const settingsNow = () => state.settings ?? api.settings.settings;
  const knownPids = new Set(api.doctors.doctors.map((d) => d.pid));

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
      const doctors = api.doctors.doctors.map((d) => (marked.has(d.pid) && !d.internal ? { ...d, internal: true, internalSource: 'settings' } : d));
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
  .listen(PORT, () => {
    const { scenario, email, fallbackOn404 } = state.sticky;
    console.log(`Mock admin API v2 on http://localhost:${PORT}${PREFIX} (key: dev, scenario: ${scenario}, email mode: ${email}, fallbackOn404: ${fallbackOn404})`);
  });
