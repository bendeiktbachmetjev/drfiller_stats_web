// Row and object builders with the API field names (§5.2.3), for the data tests (§5.3.12).
// Every builder takes a Vilnius wall time 'YYYY-MM-DD HH:mm' (or epoch ms) and optional overrides.
import { vilniusOffsetMin } from '../period.js';
import { DEFAULT_SETTINGS } from '../api/contract.js';
import staticPrices from '../static/prices-2026-09-23.json' with { type: 'json' };
import benchmark from '../static/benchmark-2026-09-23.json' with { type: 'json' };

export { staticPrices, benchmark };

/**
 * Epoch ms of a Vilnius wall time.
 * @param {string} text 'YYYY-MM-DD HH:mm' (or 'YYYY-MM-DD' = midnight)
 * @returns {number}
 */
export function localMs(text) {
  const [day, time = '00:00'] = text.split(' ');
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - vilniusOffsetMin(guess) * 60000;
  return guess - vilniusOffsetMin(first) * 60000;
}

const at = (when) => (typeof when === 'number' ? when : localMs(when));

let sequence = 0;
/** A fresh row id ('r' + 10 characters, like refOf). */
export const nextId = () => {
  sequence += 1;
  return `r${String(sequence).padStart(10, 'a')}`;
};

/** Pids of the shape /^d[a-z2-7]{9}$/. */
export const PID = Object.freeze({
  top: 'dtopdoctor',
  internal: 'dinternal2',
  payer: 'dpayeraaaa',
  bought: 'dboughtaaa',
  gifted: 'dgiftedaaa',
  free: 'dfreeaaaaa',
  noCredits: 'dnocreditz',
});

/** A form (`ai_processing`) on the main model of September. */
export const formRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'ai_processing',
  pid: PID.top,
  model: 'gemini-3-flash-preview',
  inTok: 11441,
  visTok: 700,
  outTok: 986,
  durMs: 5200,
  chars: 420,
  ...overrides,
});

/** A dictation (file transcription). Soniox by default; OpenAI legacy rows carry only `audioBytes`. */
export const dictationRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'transcription',
  pid: PID.top,
  model: 'soniox:stt-async-v5',
  audioSec: 60,
  chars: 800,
  durMs: 2100,
  ...overrides,
});

/** A live conversation (the "Pokalbis" card), logged when it ends. */
export const liveRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'transcription',
  mode: 'live',
  pid: PID.top,
  model: 'soniox-rt:stt-rt-v5',
  audioSec: 900,
  sessionRef: 'sabcdefghj',
  speakers: 2,
  reconnects: 0,
  ...overrides,
});

/** A medical history summary call with its stored list-price cost and credits. */
export const anamnesisRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'anamnesis_extract',
  pid: PID.top,
  model: 'gemini-3.5-flash-lite',
  inTok: 20000,
  outTok: 1500,
  costUsd: 0.01,
  credits: 1,
  docs: 4,
  pages: 9,
  tier: 'fast',
  finishReason: 'STOP',
  facts: 12,
  ...overrides,
});

/** An audio meter event (B2): minutes added to a doctor's counter and credits charged. */
export const meterRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'audio_meter',
  pid: PID.top,
  source: 'dictation',
  addedMs: 60000,
  chargedCredits: 0,
  bankMsAfter: 60000,
  creditsAfter: 100,
  ...overrides,
});

/** A failed request (B2). `errorKind` decides the group (service / refusal). */
export const failedRow = (when, overrides = {}) => ({
  id: nextId(),
  t: at(when),
  action: 'request_failed',
  pid: PID.top,
  feature: 'process',
  errorKind: 'timeout',
  httpStatus: 400,
  refunded: true,
  ...overrides,
});

/** A DoctorApi object. */
export const doctor = (pid, overrides = {}) => ({
  pid,
  code: `D-${pid.slice(1, 5).toUpperCase()}`,
  email: `${pid}@example.test`,
  signupAt: localMs('2026-03-01 09:00'),
  lastSignInAt: localMs('2026-09-20 09:00'),
  exists: { auth: true, credits: true, profile: true },
  specialization: null,
  detailLevel: 'detailed',
  credits: { available: 13, used: 2, total: 15, consistent: true },
  audioBankMs: 0,
  liveOpen: 0,
  legacyFields: false,
  class: 'free',
  inferredPacks: null,
  internal: false,
  internalSource: null,
  ...overrides,
});

/** A PaymentApi object (Dr.Filler pack, live mode, card). */
export const payment = (when, overrides = {}) => {
  const t = at(when);
  return {
    id: `p${nextId().slice(1)}`,
    t,
    sessionT: t - 60000,
    pid: PID.payer,
    packId: 'pack600',
    credits: 600,
    currency: 'eur',
    grossCents: 2400,
    subtotalCents: 2400,
    discountCents: 0,
    taxCents: 0,
    feeCents: 61,
    netCents: 2339,
    refundedCents: 0,
    refundedAt: null,
    method: 'card',
    promo: false,
    credited: 'yes',
    ...overrides,
  };
};

/** A balance adjustment (dispute or an account-level Stripe fee). */
export const adjustment = (when, overrides = {}) => ({ t: at(when), type: 'stripe_fee', amountCents: -150, paymentId: null, ...overrides });

/** A RevenueApi object; totals are recomputed from the payments. */
export const revenue = (payments = [], overrides = {}) => {
  const sum = (key) => payments.reduce((acc, p) => acc + (p[key] ?? 0), 0);
  return {
    status: 'ok',
    livemode: true,
    payments,
    adjustments: [],
    ignoredSessions: 0,
    totals: {
      count: payments.length,
      grossCents: sum('grossCents'),
      discountCents: sum('discountCents'),
      feeCents: sum('feeCents'),
      refundedCents: sum('refundedCents'),
      netCents: sum('netCents'),
      credits: sum('credits'),
      payingDoctors: new Set(payments.map((p) => p.pid).filter(Boolean)).size,
    },
    webhook: { checkedFromMs: localMs('2026-08-24 00:00'), notCredited: 0, pending: 0, unknown: 0 },
    ...overrides,
  };
};

/** ConfigApi as production runs on 23.09.2026 (direct 3 Flash, backup 3.5 Flash-Lite). */
export const config = (overrides = {}) => ({
  build: 'test',
  serverStartedAt: localMs('2026-09-23 06:00'),
  gemini: {
    preset: null,
    main: 'gemini-3-flash-preview',
    fallback: 'gemini-3.5-flash-lite',
    endpoint: 'direct',
    vertexLocation: null,
    primaryTimeoutMs: 25000,
    fallbackOn: ['timeout', 429, 500, 503, 504],
    thinkingLevel: 'low',
    thinkingBudget: null,
    maxOutputTokens: 8000,
    fallbackOn404: false,
  },
  anamnesis: { vertexLocation: 'global', creditValueEur: 0.03, margin: 1.5, usdToEur: 0.86, minCredits: 1, maxCredits: 40, caps: { dailyUsd: 25, userDailyUsd: 10, userDailyRequests: 30 } },
  transcription: { provider: 'soniox', sonioxModel: 'stt-async-v5', openaiModel: 'gpt-4o-mini-transcribe-2025-12-15', fallback: 'openai' },
  live: { enabled: true, rtModel: 'stt-rt-v5', maxSessionSeconds: 3600, dailyCap: 20, maxOpenPerDoctor: 2, streamsDefault: 10 },
  billing: {
    creditsPerForm: 1,
    audioMinutesPerCredit: 10,
    freeCreditsOnSignup: 15,
    meterSince: '2026-09-23T08:23:00.000Z',
    packs: [
      { id: 'pack250', credits: 250, priceEur: 12.5, discountPct: 0 },
      { id: 'pack600', credits: 600, priceEur: 24, discountPct: 20 },
      { id: 'pack1500', credits: 1500, priceEur: 45, discountPct: 40 },
    ],
  },
  prices: staticPrices,
  server: { now: localMs('2026-09-23 14:30'), emailMode: 'list', pseudonymSecretDedicated: true, stripeConfigured: true, stripeMode: 'live', sonioxConfigured: true },
  ...overrides,
});

/** Settings with the server defaults (+ overrides). */
export const settings = (overrides = {}) => ({
  ...DEFAULT_SETTINGS,
  internalPids: [],
  planning: { ...DEFAULT_SETTINGS.planning },
  ...overrides,
});

/** A RawBundle as loadAll returns it (every source ok unless overridden). */
export const rawBundle = ({ rows = [], doctors = [], revenue: rev = revenue([]), config: cfg = config(), settings: set = settings(), soniox = null, costsMonthly = { months: [] }, sources = {} } = {}) => {
  const ok = { status: 'ok', fetchedAt: 0, cacheAgeMs: 0 };
  return {
    usage: { range: { from: '2026-03-04T22:00:00.000Z', to: '2026-09-23T11:30:00.000Z', open: true }, counts: { usageLogs: rows.length, usageEvents: 0 }, rows },
    doctors: { counts: { auth: doctors.length, creditDocs: doctors.length, profiles: doctors.length }, emailMode: 'list', doctors },
    config: cfg,
    revenue: rev,
    soniox,
    costsMonthly,
    settings: { settings: set },
    sources: {
      usage: ok, doctors: ok, config: cfg ? ok : { ...ok, status: 'error' },
      revenue: { ...ok, status: rev?.status === 'ok' ? (rev.livemode === false ? 'test' : 'ok') : rev?.status ?? 'error' },
      soniox: ok, costs: ok, settings: ok,
      ...sources,
    },
  };
};
