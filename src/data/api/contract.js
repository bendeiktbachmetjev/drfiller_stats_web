// FROZEN CONTRACT 1 — admin API v2 (B1 ⇄ F0), SPEC §5.2.3 with OVERRIDES O2–O4.
// Shapes as JSDoc typedefs + runtime schemas. The mock server and the demo emit exactly these shapes;
// contract.test.mjs validates them. Changing a shape needs an F0-REQUESTS note and INT's OK.
//
// OVERRIDES applied here:
//  O2  ADMIN_EMAIL_MODE default 'list'; in 'list' mode every DoctorApi carries `email: string|null`.
//  O3  No 409 PSEUDONYM_SECRET_REQUIRED: PUT /settings accepts internalPids and stores uids server-side.
//  O4  settings.vatPayer default false. O1: settings.lang default 'en'.

export const SCHEMA_VERSION = 1;

/** Error codes the server may send in `{ success: false, code }`. */
export const API_ERROR_CODES = Object.freeze([
  'BAD_RANGE',
  'TOO_MANY_ROWS',
  'INVALID_BODY',
  'NOT_FOUND',
  'EMAIL_OFF',
  'RATE_LIMITED',
  'NOT_CONFIGURED',
  'INTERNAL',
]);
// Firestore missing on the server → 503 NOT_CONFIGURED (the client maps 503 to API_OFF).
// `from`/`to` must be full ISO instants with a zone ('2026-09-23T08:00:00Z'); a date-only value → 400 BAD_RANGE.

/**
 * Codes the server may add to `notes` of an Ok envelope (B1, 2026-09-23). Informational; never an error.
 *   FRESH_THROTTLED            `fresh=1` ignored (at most once per 30 s per route)
 *   PAYPAL_FEE_OUTSIDE_STRIPE  /revenue: PayPal's own fee is not in Stripe; the client adds it from the price table
 *   UNKNOWN_PIDS_IGNORED       PUT /settings dropped pids it could not resolve to an account
 *   INTERNAL_PARTIAL           GET /settings: the doctor list failed, `internal` marks may be incomplete
 */
export const API_NOTES = Object.freeze(['FRESH_THROTTLED', 'PAYPAL_FEE_OUTSIDE_STRIPE', 'UNKNOWN_PIDS_IGNORED', 'INTERNAL_PARTIAL']);

/** `reason` values of sources that are off or failing (`status: 'partial'` keeps its reason). */
export const SOURCE_REASONS = Object.freeze({
  revenue: Object.freeze(['no_stripe_key', 'stripe_error', 'stripe_timeout']),
  soniox: Object.freeze(['no_soniox_key', 'soniox_error']),
});

/**
 * @template T
 * @typedef {{ success: true, schemaVersion: 1, generatedAt: string,
 *   cache: { hit: boolean, ageMs: number, ttlMs: number }, notes: string[], data: T }} Ok
 * @typedef {{ success: false, code: string, error: string }} Err
 */

/**
 * GET /usage → { range: { from, to, open }, counts: { usageLogs, usageEvents }, rows: UsageRowApi[] }.
 * Rows sorted by t asc; absent/null fields are left out.
 * @typedef {{
 *   id: string, t: number, action: string, pid: string,
 *   model?: string, inTok?: number, visTok?: number, outTok?: number, thinkTok?: number, cachedTok?: number,
 *   costUsd?: number, priceKnown?: boolean,
 *   durMs?: number, chars?: number, convChars?: number, histChars?: number,
 *   audioSec?: number, audioMs?: number, audioMsSource?: 'provider'|'wav_header'|'size_estimate', audioBytes?: number,
 *   mode?: 'live', sessionRef?: string, speakers?: number, reconnects?: number,
 *   primaryModel?: string, fallbackUsed?: boolean, fallbackReason?: string, endpoint?: 'direct'|'vertex',
 *   location?: string, preset?: string, provider?: 'soniox'|'openai', priceTable?: string,
 *   credits?: number, docs?: number, pages?: number, pdfBytes?: number, tier?: string, finishReason?: string,
 *   facts?: number, batch?: number, focus?: boolean,
 *   source?: 'dictation'|'live_finish'|'live_reconcile'|'settle', addedMs?: number, chargedCredits?: number,
 *   bankMsAfter?: number, creditsAfter?: number,
 *   feature?: string, errorKind?: string, httpStatus?: number, refunded?: boolean
 * }} UsageRowApi
 */

/**
 * GET /doctors → { counts: { auth, creditDocs, profiles }, emailMode, doctors: DoctorApi[] }.
 * @typedef {{
 *   pid: string, code: string, email?: string|null,
 *   signupAt: number|null, lastSignInAt: number|null,
 *   exists: { auth: boolean, credits: boolean, profile: boolean },
 *   specialization: string|null, detailLevel: 'detailed'|'concise'|null,
 *   credits: { available: number, used: number, total: number, consistent: boolean } | null,
 *   audioBankMs: number, liveOpen: number, legacyFields: boolean,
 *   class: 'legacy'|'gifted'|'bought_inferred'|'free'|'no_credits_doc',
 *   inferredPacks: { pack250: number, pack600: number, pack1500: number } | null,
 *   internal: boolean, internalSource: 'settings'|'env'|'profile'|null
 * }} DoctorApi
 */

/**
 * GET /revenue → RevenueApi (only Dr.Filler pack sessions; the frontend excludes everything when livemode is false).
 * @typedef {{
 *   id: string, t: number, sessionT: number, pid: string|null,
 *   packId: 'pack250'|'pack600'|'pack1500'|null, credits: number|null, currency: string,
 *   grossCents: number, subtotalCents: number, discountCents: number, taxCents: number,
 *   feeCents: number|null, netCents: number|null, refundedCents: number, refundedAt: number|null,
 *   method: 'card'|'revolut_pay'|'paypal'|'link'|'other', promo: boolean,
 *   credited: 'yes'|'no'|'pending'|'unknown'
 * }} PaymentApi
 * @typedef {{
 *   status: 'ok'|'off'|'error', reason?: 'no_stripe_key'|'stripe_error'|'stripe_timeout', livemode: boolean|null,
 *   payments: PaymentApi[],
 *   adjustments: Array<{ t: number, type: 'dispute'|'stripe_fee'|'other', amountCents: number, paymentId: string|null }>,
 *   ignoredSessions: number,
 *   totals: { count: number, grossCents: number, discountCents: number, feeCents: number, refundedCents: number, netCents: number, credits: number, payingDoctors: number },
 *   webhook: { checkedFromMs: number, notCredited: number, pending: number, unknown: number }
 * }} RevenueApi
 */

/**
 * GET /soniox-usage → SonioxApi (Vilnius days).
 * @typedef {{
 *   status: 'ok'|'partial'|'off'|'error', reason?: string, range: { from: string, to: string, clamped: boolean },
 *   days: Array<{ day: string, kind: 'async'|'rt'|'other', model: string, requests: number, audioMs: number, costUsd: number }>,
 *   liveSessions: Array<{ pid: string|null, sessionRef: string, endedAt: number, audioMs: number, costUsd: number, requests: number }>,
 *   totals: { requests: number, audioMs: number, costUsd: number }
 * }} SonioxApi
 */

/**
 * GET /live-now → LiveNowApi (30 s cache). todayRows = usageLogs + usageEvents since Vilnius midnight.
 * @typedef {{
 *   now: number, dayKey: string, liveEnabled: boolean, openCount: number, startedToday: number,
 *   open: Array<{ pid: string, startedAt: number, ageSec: number }>,
 *   limits: { streamsDefault: number, maxOpenPerDoctor: number, maxSessionSeconds: number, dailyCap: number },
 *   todayRows: UsageRowApi[]
 * }} LiveNowApi
 */

/**
 * GET /config → ConfigApi (no secrets, no project id).
 * @typedef {{
 *   build: string|null, serverStartedAt: number|null,
 *   gemini: { preset: string|null, main: string, fallback: string|null, endpoint: 'direct'|'vertex', vertexLocation: string|null,
 *             primaryTimeoutMs: number, fallbackOn: Array<string|number>, thinkingLevel: string|null, thinkingBudget: number|null,
 *             maxOutputTokens: number, fallbackOn404: boolean },
 *   anamnesis: { vertexLocation: string, creditValueEur: number, margin: number, usdToEur: number, minCredits: number, maxCredits: number,
 *                caps: { dailyUsd: number, userDailyUsd: number, userDailyRequests: number } },
 *   transcription: { provider: 'soniox'|'openai', sonioxModel: string, openaiModel: string, fallback: 'openai'|null },
 *   live: { enabled: boolean, rtModel: string, maxSessionSeconds: number, dailyCap: number, maxOpenPerDoctor: number, streamsDefault: number },
 *   billing: { creditsPerForm: number, audioMinutesPerCredit: number, freeCreditsOnSignup: number, meterSince: string,
 *              packs: Array<{ id: string, credits: number, priceEur: number, discountPct: number }> },
 *   prices: PriceSnapshot,
 *   server: { now: number, emailMode: 'off'|'click'|'list', pseudonymSecretDedicated: boolean, stripeConfigured: boolean,
 *             stripeMode: 'live'|'test'|null, sonioxConfigured: boolean }
 * }} ConfigApi
 */

/**
 * `prices.snapshot()` of the backend (also data/static/prices-2026-09-23.json).
 * @typedef {{ CHECKED_AT: string, SOURCES: Record<string, string>, GEMINI: Record<string, object>, GEMINI_TIERS: object,
 *   VERTEX: object, TRANSCRIPTION: Record<string, object>, PAYMENT_FEES: object, TAX: object, RAILWAY: object,
 *   FIRESTORE: object, FX: { usdPerEur: number, rateDate: string } }} PriceSnapshot
 */

/**
 * GET /costs-monthly → { months: MonthCost[] }; PUT /costs-monthly/:month (Partial<MonthCostInput>) → { month: MonthCost }.
 * @typedef {{ month: string, googleInvoiceEur: number|null, googlePromoCreditsEur: number|null, railwayUsd: number|null,
 *   sonioxInvoiceUsd: number|null, openaiInvoiceUsd: number|null, otherEur: number|null, note: string, updatedAt: number }} MonthCost
 */

/**
 * GET /settings → { settings }; PUT /settings (full object) → { settings }.
 * @typedef {{
 *   visitsPerDoctorMonth: number, doctorScales: [number, number], liveShareOfVisits: number, liveMinutesPerVisit: number,
 *   dictationMinutesPerVisit: number, conversationTokensPerMinute: number, formCostBasis: 'measured'|'assumed',
 *   assumedFormTokens: { in: number, out: number }, anamnesisRunsPerDoctorMonth: number,
 *   packMix: { pack250: number, pack600: number, pack1500: number },
 *   paymentMethod: 'card_eea_standard'|'card_eea_premium'|'card_international'|'revolut_pay'|'paypal',
 *   freeShare: number, fixedMonthlyUsd: { railway: number, other: number }, workdaysPerMonth: number,
 *   peakHourShare: number, sonioxStreamLimit: number
 * }} Planning
 * @typedef {{ internalPids: string[], vatPayer: boolean, lang: 'en'|'ru', planning: Planning, updatedAt: number }} Settings
 */

/** Server defaults, mirrored for the demo, the mock and "reset" in Settings (§5.2.3.7). */
export const DEFAULT_PLANNING = Object.freeze({
  visitsPerDoctorMonth: 400,
  doctorScales: Object.freeze([100, 300]),
  liveShareOfVisits: 1,
  liveMinutesPerVisit: 15,
  dictationMinutesPerVisit: 1,
  conversationTokensPerMinute: 250,
  formCostBasis: 'measured',
  assumedFormTokens: Object.freeze({ in: 11441, out: 986 }),
  anamnesisRunsPerDoctorMonth: 0,
  packMix: Object.freeze({ pack250: 0, pack600: 0, pack1500: 1 }),
  paymentMethod: 'card_eea_standard',
  freeShare: 0,
  fixedMonthlyUsd: Object.freeze({ railway: 1.96, other: 0 }),
  workdaysPerMonth: 21,
  peakHourShare: 0.15,
  sonioxStreamLimit: 10,
});

export const DEFAULT_SETTINGS = Object.freeze({
  internalPids: Object.freeze([]),
  vatPayer: false,
  lang: 'en',
  planning: DEFAULT_PLANNING,
  updatedAt: 0,
});

/** Allowed ranges of the planning fields (server validation mirrored; out of range → 400 INVALID_BODY). */
export const PLANNING_LIMITS = Object.freeze({
  visitsPerDoctorMonth: [1, 5000],
  doctorScales: [1, 10000],
  liveShareOfVisits: [0, 1],
  liveMinutesPerVisit: [0, 120],
  dictationMinutesPerVisit: [0, 60],
  conversationTokensPerMinute: [0, 2000],
  assumedFormTokens: [0, 200000],
  anamnesisRunsPerDoctorMonth: [0, 500],
  packMix: [0, 1],
  freeShare: [0, 1],
  fixedMonthlyUsd: [0, 10000],
  workdaysPerMonth: [1, 31],
  peakHourShare: [0.01, 1],
  sonioxStreamLimit: [1, 10000],
});

/** Month cost fields: finite 0..100000 or null; note ≤ 500 characters; month ≥ '2026-01' and ≤ the current month. */
export const MONTH_COST_LIMITS = Object.freeze({ min: 0, max: 100000, noteMax: 500, firstMonth: '2026-01' });

export const PID_RE = /^d[a-z2-7]{9}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// A tiny schema checker (no dependency). Unknown fields are allowed (forward compatible).
// ---------------------------------------------------------------------------

const S = {
  num: { t: 'number' },
  int: { t: 'integer' },
  str: { t: 'string' },
  bool: { t: 'boolean' },
  any: { t: 'any' },
  nullable: (inner) => ({ t: 'nullable', inner }),
  opt: (inner) => ({ t: 'optional', inner }),
  arr: (inner) => ({ t: 'array', inner }),
  obj: (fields) => ({ t: 'object', fields }),
  rec: (inner) => ({ t: 'record', inner }),
  oneOf: (values) => ({ t: 'enum', values }),
  match: (re) => ({ t: 'match', re }),
};

function check(schema, value, path, errors) {
  if (errors.length > 20) return;
  switch (schema.t) {
    case 'any':
      return;
    case 'optional':
      if (value === undefined) return;
      check(schema.inner, value, path, errors);
      return;
    case 'nullable':
      if (value === null) return;
      check(schema.inner, value, path, errors);
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path}: expected number`);
      return;
    case 'integer':
      if (!Number.isInteger(value)) errors.push(`${path}: expected integer`);
      return;
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      return;
    case 'enum':
      if (!schema.values.includes(value)) errors.push(`${path}: expected one of ${schema.values.join('|')}`);
      return;
    case 'match':
      if (typeof value !== 'string' || !schema.re.test(value)) errors.push(`${path}: expected ${schema.re}`);
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
        return;
      }
      value.forEach((item, index) => check(schema.inner, item, `${path}[${index}]`, errors));
      return;
    case 'record':
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object`);
        return;
      }
      Object.entries(value).forEach(([key, item]) => check(schema.inner, item, `${path}.${key}`, errors));
      return;
    case 'object':
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object`);
        return;
      }
      Object.entries(schema.fields).forEach(([key, inner]) => check(inner, value[key], `${path}.${key}`, errors));
      return;
    default:
      errors.push(`${path}: unknown schema`);
  }
}

const { num, int, str, bool, any, nullable, opt, arr, obj, rec, oneOf, match } = S;

const pidOrSpecial = match(/^(d[a-z2-7]{9}|deleted|anonymous)$/);

export const SCHEMAS = {};

SCHEMAS.usageRow = obj({
  id: str, t: num, action: str, pid: pidOrSpecial,
  model: opt(str), inTok: opt(num), visTok: opt(num), outTok: opt(num), thinkTok: opt(num), cachedTok: opt(num),
  costUsd: opt(num), priceKnown: opt(bool),
  durMs: opt(num), chars: opt(num), convChars: opt(num), histChars: opt(num),
  audioSec: opt(num), audioMs: opt(num), audioMsSource: opt(oneOf(['provider', 'wav_header', 'size_estimate'])), audioBytes: opt(num),
  mode: opt(oneOf(['live'])), sessionRef: opt(str), speakers: opt(num), reconnects: opt(num),
  primaryModel: opt(str), fallbackUsed: opt(bool), fallbackReason: opt(str), endpoint: opt(oneOf(['direct', 'vertex'])),
  location: opt(str), preset: opt(str), provider: opt(oneOf(['soniox', 'openai'])), priceTable: opt(str),
  credits: opt(num), docs: opt(num), pages: opt(num), pdfBytes: opt(num), tier: opt(str), finishReason: opt(str),
  facts: opt(num), batch: opt(num), focus: opt(bool),
  source: opt(oneOf(['dictation', 'live_finish', 'live_reconcile', 'settle'])), addedMs: opt(num), chargedCredits: opt(num),
  bankMsAfter: opt(num), creditsAfter: opt(num),
  feature: opt(str), errorKind: opt(str), httpStatus: opt(num), refunded: opt(bool),
});

SCHEMAS.usage = obj({
  range: obj({ from: str, to: str, open: bool }),
  counts: obj({ usageLogs: int, usageEvents: int }),
  rows: arr(SCHEMAS.usageRow),
});

SCHEMAS.doctor = obj({
  pid: match(PID_RE), code: match(/^D-[A-Z2-7]{4}$/), email: opt(nullable(str)),
  signupAt: nullable(num), lastSignInAt: nullable(num),
  exists: obj({ auth: bool, credits: bool, profile: bool }),
  specialization: nullable(str), detailLevel: nullable(oneOf(['detailed', 'concise'])),
  credits: nullable(obj({ available: num, used: num, total: num, consistent: bool })),
  audioBankMs: num, liveOpen: int, legacyFields: bool,
  class: oneOf(['legacy', 'gifted', 'bought_inferred', 'free', 'no_credits_doc']),
  inferredPacks: nullable(obj({ pack250: int, pack600: int, pack1500: int })),
  internal: bool, internalSource: nullable(oneOf(['settings', 'env', 'profile'])),
});

SCHEMAS.doctors = obj({
  counts: obj({ auth: int, creditDocs: int, profiles: int }),
  emailMode: oneOf(['off', 'click', 'list']),
  doctors: arr(SCHEMAS.doctor),
});

SCHEMAS.payment = obj({
  id: str, t: num, sessionT: num, pid: nullable(match(PID_RE)),
  packId: nullable(oneOf(['pack250', 'pack600', 'pack1500'])), credits: nullable(num), currency: str,
  grossCents: int, subtotalCents: int, discountCents: int, taxCents: int,
  feeCents: nullable(int), netCents: nullable(int), refundedCents: int, refundedAt: nullable(num),
  method: oneOf(['card', 'revolut_pay', 'paypal', 'link', 'other']), promo: bool,
  credited: oneOf(['yes', 'no', 'pending', 'unknown']),
});

SCHEMAS.revenue = obj({
  status: oneOf(['ok', 'off', 'error']),
  reason: opt(oneOf(['no_stripe_key', 'stripe_error', 'stripe_timeout'])),
  livemode: nullable(bool),
  payments: arr(SCHEMAS.payment),
  adjustments: arr(obj({ t: num, type: oneOf(['dispute', 'stripe_fee', 'other']), amountCents: int, paymentId: nullable(str) })),
  ignoredSessions: int,
  totals: obj({ count: int, grossCents: int, discountCents: int, feeCents: int, refundedCents: int, netCents: int, credits: num, payingDoctors: int }),
  webhook: obj({ checkedFromMs: num, notCredited: int, pending: int, unknown: int }),
});

SCHEMAS.soniox = obj({
  status: oneOf(['ok', 'partial', 'off', 'error']), reason: opt(str),
  range: obj({ from: str, to: str, clamped: bool }),
  days: arr(obj({ day: match(DAY_RE), kind: oneOf(['async', 'rt', 'other']), model: str, requests: int, audioMs: num, costUsd: num })),
  liveSessions: arr(obj({ pid: nullable(match(PID_RE)), sessionRef: str, endedAt: num, audioMs: num, costUsd: num, requests: int })),
  totals: obj({ requests: int, audioMs: num, costUsd: num }),
});

SCHEMAS.liveNow = obj({
  now: num, dayKey: match(DAY_RE), liveEnabled: bool, openCount: int, startedToday: int,
  open: arr(obj({ pid: match(PID_RE), startedAt: num, ageSec: num })),
  limits: obj({ streamsDefault: int, maxOpenPerDoctor: int, maxSessionSeconds: num, dailyCap: int }),
  todayRows: arr(SCHEMAS.usageRow),
});

SCHEMAS.priceSnapshot = obj({
  CHECKED_AT: match(DAY_RE), SOURCES: rec(str), GEMINI: rec(any), GEMINI_TIERS: any, VERTEX: any,
  TRANSCRIPTION: rec(any), PAYMENT_FEES: any, TAX: any, RAILWAY: any, FIRESTORE: any,
  FX: obj({ usdPerEur: num, rateDate: match(DAY_RE) }),
});

SCHEMAS.config = obj({
  build: nullable(str), serverStartedAt: nullable(num),
  gemini: obj({
    preset: nullable(str), main: str, fallback: nullable(str), endpoint: oneOf(['direct', 'vertex']), vertexLocation: nullable(str),
    primaryTimeoutMs: num, fallbackOn: arr(any), thinkingLevel: nullable(str), thinkingBudget: nullable(num),
    maxOutputTokens: num, fallbackOn404: bool,
  }),
  anamnesis: obj({
    vertexLocation: str, creditValueEur: num, margin: num, usdToEur: num, minCredits: num, maxCredits: num,
    caps: obj({ dailyUsd: num, userDailyUsd: num, userDailyRequests: num }),
  }),
  transcription: obj({ provider: oneOf(['soniox', 'openai']), sonioxModel: str, openaiModel: str, fallback: nullable(oneOf(['openai'])) }),
  live: obj({ enabled: bool, rtModel: str, maxSessionSeconds: num, dailyCap: num, maxOpenPerDoctor: num, streamsDefault: num }),
  billing: obj({
    creditsPerForm: num, audioMinutesPerCredit: num, freeCreditsOnSignup: num, meterSince: str,
    packs: arr(obj({ id: str, credits: num, priceEur: num, discountPct: num })),
  }),
  prices: SCHEMAS.priceSnapshot,
  server: obj({
    now: num, emailMode: oneOf(['off', 'click', 'list']), pseudonymSecretDedicated: bool, stripeConfigured: bool,
    stripeMode: nullable(oneOf(['live', 'test'])), sonioxConfigured: bool,
  }),
});

const moneyOrNull = nullable(num);
SCHEMAS.monthCost = obj({
  month: match(MONTH_RE), googleInvoiceEur: moneyOrNull, googlePromoCreditsEur: moneyOrNull, railwayUsd: moneyOrNull,
  sonioxInvoiceUsd: moneyOrNull, openaiInvoiceUsd: moneyOrNull, otherEur: moneyOrNull, note: str, updatedAt: num,
});
SCHEMAS.costsMonthly = obj({ months: arr(SCHEMAS.monthCost) });

SCHEMAS.planning = obj({
  visitsPerDoctorMonth: num, doctorScales: arr(num), liveShareOfVisits: num, liveMinutesPerVisit: num,
  dictationMinutesPerVisit: num, conversationTokensPerMinute: num, formCostBasis: oneOf(['measured', 'assumed']),
  assumedFormTokens: obj({ in: num, out: num }), anamnesisRunsPerDoctorMonth: num,
  packMix: obj({ pack250: num, pack600: num, pack1500: num }),
  paymentMethod: oneOf(['card_eea_standard', 'card_eea_premium', 'card_international', 'revolut_pay', 'paypal']),
  freeShare: num, fixedMonthlyUsd: obj({ railway: num, other: num }), workdaysPerMonth: num, peakHourShare: num,
  sonioxStreamLimit: num,
});
SCHEMAS.settingsObject = obj({
  internalPids: arr(match(PID_RE)), vatPayer: bool, lang: oneOf(['en', 'ru']), planning: SCHEMAS.planning, updatedAt: num,
});
SCHEMAS.settings = obj({ settings: SCHEMAS.settingsObject });

SCHEMAS.doctorEmail = obj({ pid: match(PID_RE), email: nullable(str) });

SCHEMAS.envelope = obj({
  success: oneOf([true]), schemaVersion: oneOf([SCHEMA_VERSION]), generatedAt: str,
  cache: obj({ hit: bool, ageMs: num, ttlMs: num }), notes: arr(str), data: any,
});
SCHEMAS.error = obj({ success: oneOf([false]), code: str, error: str });

/** Route data schema by source name (the same names as Dataset.sources). */
export const ROUTE_SCHEMAS = Object.freeze({
  usage: 'usage',
  doctors: 'doctors',
  revenue: 'revenue',
  soniox: 'soniox',
  liveNow: 'liveNow',
  config: 'config',
  costs: 'costsMonthly',
  settings: 'settings',
  doctorEmail: 'doctorEmail',
});

/**
 * Validates a value against a named schema.
 * @param {keyof typeof SCHEMAS} name
 * @param {unknown} value
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate(name, value) {
  const schema = SCHEMAS[name];
  if (!schema) return { ok: false, errors: [`unknown schema ${name}`] };
  const errors = [];
  check(schema, value, name, errors);
  return { ok: errors.length === 0, errors };
}

/**
 * Wraps route data in the Ok envelope (mock server, demo, tests).
 * @template T
 * @param {T} data
 * @param {{ nowMs?: number, hit?: boolean, ageMs?: number, ttlMs?: number, notes?: string[] }} [meta]
 * @returns {Ok<T>}
 */
export function envelope(data, { nowMs = 0, hit = false, ageMs = 0, ttlMs = 0, notes = [] } = {}) {
  return {
    success: true,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date(nowMs).toISOString(),
    cache: { hit, ageMs, ttlMs },
    notes,
    data,
  };
}

/**
 * The error body of the API.
 * @param {string} code one of API_ERROR_CODES
 * @param {string} message English, no data
 * @returns {Err}
 */
export const errorBody = (code, message) => ({ success: false, code, error: message });
