// Local mock of the admin API v2 (§5.3.10, OVERRIDES O2/O3). Port 8323, ESM, no dependencies.
// Run: `npm run dev:mock` + `VITE_API_URL= npm run dev` (Vite proxies /api/admin to this server).
//
//   x-admin-secret must be 'dev' (401 otherwise)
//   ?scenario=planned          planned scenario on any route
//   ?fail=<route>              forces 500 on that route (usage, doctors, revenue, soniox-usage, live-now, config, costs-monthly, settings)
//   ?off=revenue|soniox        returns status 'off'
//   ?stripe=test               revenue livemode false
//   env EMAIL_MODE=off|click|list (default list), FALLBACK_ON_404=0|1 (default 0)
// PUT /settings and PUT /costs-monthly/:month validate like §5.2.3.7 and keep state for the process lifetime.
import http from 'node:http';
import { makeDemoApi } from '../src/dev/demoData.js';
import { envelope, errorBody, MONTH_COST_LIMITS, MONTH_RE, PID_RE, PLANNING_LIMITS, validate } from '../src/data/api/contract.js';

const PORT = Number(process.env.MOCK_PORT) || 8323;
const EMAIL_MODE = ['off', 'click', 'list'].includes(process.env.EMAIL_MODE) ? process.env.EMAIL_MODE : 'list';
const FALLBACK_ON_404 = process.env.FALLBACK_ON_404 === '1';
const PREFIX = '/api/admin/v2';

const state = { settings: null, months: new Map(), emailReveals: [] };

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const ok = (res, data, notes = []) => send(res, 200, envelope(data, { nowMs: Date.now(), ttlMs: 600000, notes }));
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
  if (!body || typeof body !== 'object') return 'body must be an object';
  for (const key of MONTH_FIELDS) {
    if (!(key in body) || body[key] === null) continue;
    if (!inRange(body[key], [MONTH_COST_LIMITS.min, MONTH_COST_LIMITS.max])) return `${key} out of range`;
  }
  if ('note' in body && (typeof body.note !== 'string' || body.note.length > MONTH_COST_LIMITS.noteMax)) return 'note too long';
  return null;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith(PREFIX)) return fail(res, 404, 'NOT_FOUND', 'Unknown route.');
  if (req.headers['x-admin-secret'] !== 'dev') return fail(res, 401, 'NOT_CONFIGURED', 'Unauthorized.');

  const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/';
  const name = route.split('/')[1] ?? '';
  const nowMs = Date.now();
  if (url.searchParams.get('fail') === name) return fail(res, 500, 'INTERNAL', 'Forced failure (mock).');

  const scenario = url.searchParams.get('scenario') === 'planned' ? 'planned' : 'today';
  const api = makeDemoApi(nowMs, { scenario, emailMode: EMAIL_MODE, fallbackOn404: FALLBACK_ON_404 });
  const off = url.searchParams.get('off');

  if (req.method === 'PUT' && route === '/settings') {
    const body = await readBody(req);
    const problem = body === undefined ? 'body is not JSON' : checkSettings(body);
    if (problem) return fail(res, 400, 'INVALID_BODY', problem);
    state.settings = { ...body, updatedAt: nowMs };
    return ok(res, { settings: state.settings });
  }
  const monthMatch = /^\/costs-monthly\/([^/]+)$/.exec(route);
  if (req.method === 'PUT' && monthMatch) {
    const month = decodeURIComponent(monthMatch[1]);
    const body = await readBody(req);
    const problem = body === undefined ? 'body is not JSON' : checkMonth(month, body, nowMs);
    if (problem) return fail(res, 400, 'INVALID_BODY', problem);
    const before = state.months.get(month) ?? { month, googleInvoiceEur: null, googlePromoCreditsEur: null, railwayUsd: null, sonioxInvoiceUsd: null, openaiInvoiceUsd: null, otherEur: null, note: '' };
    const next = { ...before, ...Object.fromEntries(Object.entries(body).filter(([key]) => MONTH_FIELDS.includes(key) || key === 'note')), updatedAt: nowMs };
    if (typeof next.note === 'string') next.note = next.note.replace(/[\u0000-\u001f]/g, '');
    state.months.set(month, next);
    return ok(res, { month: next });
  }
  if (req.method !== 'GET') return fail(res, 404, 'NOT_FOUND', 'Unknown route.');

  const emailOf = (pid) => `doctor${api.doctors.doctors.findIndex((d) => d.pid === pid) + 1}@example.test`;
  const emailMatch = /^\/doctors\/([^/]+)\/email$/.exec(route);

  switch (true) {
    case route === '/usage':
      return ok(res, api.usage);
    case route === '/doctors': {
      const doctors = EMAIL_MODE === 'list' ? api.doctors.doctors.map((d) => ({ ...d, email: emailOf(d.pid) })) : api.doctors.doctors;
      return ok(res, { ...api.doctors, emailMode: EMAIL_MODE, doctors });
    }
    case route === '/doctors/emails':
      if (EMAIL_MODE !== 'list') return fail(res, 403, 'EMAIL_OFF', 'Email list is off.');
      return ok(res, { emails: Object.fromEntries(api.doctors.doctors.map((d) => [d.pid, emailOf(d.pid)])) });
    case Boolean(emailMatch): {
      if (EMAIL_MODE === 'off') return fail(res, 403, 'EMAIL_OFF', 'Email reveal is off.');
      const pid = decodeURIComponent(emailMatch[1]);
      if (!api.doctors.doctors.some((d) => d.pid === pid)) return fail(res, 404, 'NOT_FOUND', 'Unknown doctor.');
      state.emailReveals = state.emailReveals.filter((t) => t > nowMs - 3600000);
      if (state.emailReveals.length >= 30) return fail(res, 429, 'RATE_LIMITED', 'Too many reveals.');
      state.emailReveals.push(nowMs);
      return ok(res, { pid, email: emailOf(pid) });
    }
    case route === '/revenue': {
      if (off === 'revenue') return ok(res, { ...api.revenue, status: 'off', reason: 'no_stripe_key', livemode: null, payments: [], adjustments: [] });
      const livemode = url.searchParams.get('stripe') !== 'test';
      return ok(res, { ...api.revenue, livemode });
    }
    case route === '/soniox-usage':
      if (off === 'soniox') return ok(res, { ...api.soniox, status: 'off', reason: 'no_soniox_key', days: [], liveSessions: [] });
      return ok(res, api.soniox);
    case route === '/live-now':
      return ok(res, api.liveNow);
    case route === '/config':
      return ok(res, api.config);
    case route === '/costs-monthly':
      return ok(res, { months: [...state.months.values()].sort((a, b) => a.month.localeCompare(b.month)) });
    case route === '/settings':
      return ok(res, { settings: state.settings ?? api.settings.settings });
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
    console.log(`Mock admin API v2 on http://localhost:${PORT}${PREFIX} (key: dev, email mode: ${EMAIL_MODE}, fallbackOn404: ${FALLBACK_ON_404})`);
  });
