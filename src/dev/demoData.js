// Synthetic API-shaped data for `?demo` / `?demo=planned` and the mock server (§5.3.10).
// Pure: seeded PRNG (mulberry32 + hash32), `nowMs` injected, no Math.random / Date.now.
// Imports only data/constants.js, data/eras.js and data/static/*. Never real ids: synthetic only.
// SKELETON (scaffold): every route returns a valid, nearly empty shape. F0-DATA writes the generators
// of §5.3.10 ('today' = the real shapes of Appendix C.4; 'planned' = 100 doctors × 400 visits, live 15 min).
import { DEFAULT_FX, PACK_SIZES } from '../data/constants.js';
import { MODEL_ERAS, METER_SINCE } from '../data/eras.js';
import prices from '../data/static/prices-2026-09-23.json' with { type: 'json' };

/** Deterministic PRNG in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of any parts (seed, dayKey, index …). */
export function hash32(...parts) {
  let h = 2166136261;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** A synthetic pseudonym of the real shape /^d[a-z2-7]{9}$/. */
export function fakePid(seed, index) {
  const rand = mulberry32(hash32(seed, 'pid', index));
  let pid = 'd';
  for (let i = 0; i < 9; i += 1) pid += B32[Math.floor(rand() * 32)];
  return pid;
}

export const codeOf = (pid) => `D-${pid.slice(1, 5).toUpperCase()}`;

const iso = (ms) => new Date(ms).toISOString();
const vilniusDayKey = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** ConfigApi as production runs today (§5.2.3.6). */
export function demoConfig(nowMs, { fallbackOn404 = false, emailMode = 'list' } = {}) {
  const era = MODEL_ERAS[MODEL_ERAS.length - 1];
  return {
    build: 'demo',
    serverStartedAt: nowMs - 6 * 3600000,
    gemini: {
      preset: 'direct-3-flash',
      main: era.main,
      fallback: era.fallback,
      endpoint: 'direct',
      vertexLocation: null,
      primaryTimeoutMs: era.primaryTimeoutMs ?? 25000,
      fallbackOn: ['timeout', 429, 500, 503, 504, ...(fallbackOn404 ? [404] : [])],
      thinkingLevel: 'low',
      thinkingBudget: null,
      maxOutputTokens: 8000,
      fallbackOn404,
    },
    anamnesis: {
      vertexLocation: 'global',
      creditValueEur: 0.03,
      margin: 1.5,
      usdToEur: 0.86,
      minCredits: 1,
      maxCredits: 40,
      caps: { dailyUsd: 25, userDailyUsd: 10, userDailyRequests: 30 },
    },
    transcription: { provider: 'soniox', sonioxModel: 'stt-async-v5', openaiModel: 'gpt-4o-mini-transcribe-2025-12-15', fallback: 'openai' },
    live: { enabled: true, rtModel: 'stt-rt-v5', maxSessionSeconds: 3600, dailyCap: 20, maxOpenPerDoctor: 2, streamsDefault: 10 },
    billing: {
      creditsPerForm: 1,
      audioMinutesPerCredit: 10,
      freeCreditsOnSignup: 15,
      meterSince: `${METER_SINCE.replace('Z', ':00.000Z')}`,
      packs: [
        { id: 'pack250', credits: PACK_SIZES.pack250, priceEur: 12.5, discountPct: 0 },
        { id: 'pack600', credits: PACK_SIZES.pack600, priceEur: 24, discountPct: 20 },
        { id: 'pack1500', credits: PACK_SIZES.pack1500, priceEur: 45, discountPct: 40 },
      ],
    },
    prices,
    server: {
      now: nowMs,
      emailMode,
      pseudonymSecretDedicated: true,
      stripeConfigured: true,
      stripeMode: 'live',
      sonioxConfigured: true,
    },
  };
}

/** Settings with the server defaults (§5.2.3.7, OVERRIDES O1/O4). */
export function demoSettings() {
  return {
    internalPids: [],
    vatPayer: false,
    lang: 'en',
    planning: {
      visitsPerDoctorMonth: 400,
      doctorScales: [100, 300],
      liveShareOfVisits: 1,
      liveMinutesPerVisit: 15,
      dictationMinutesPerVisit: 1,
      conversationTokensPerMinute: 250,
      formCostBasis: 'measured',
      assumedFormTokens: { in: 11441, out: 986 },
      anamnesisRunsPerDoctorMonth: 0,
      packMix: { pack250: 0, pack600: 0, pack1500: 1 },
      paymentMethod: 'card_eea_standard',
      freeShare: 0,
      fixedMonthlyUsd: { railway: 1.96, other: 0 },
      workdaysPerMonth: 21,
      peakHourShare: 0.15,
      sonioxStreamLimit: 10,
    },
    updatedAt: 0,
  };
}

/**
 * The whole API as the demo sees it (the same shapes as /api/admin/v2/*, envelope data only).
 * @param {number} nowMs
 * @param {{ scenario?: 'today'|'planned', emailMode?: 'off'|'click'|'list', fallbackOn404?: boolean }} [options]
 * @returns {{ usage: object, doctors: object, liveNow: object, revenue: object, soniox: object, config: object,
 *   costsMonthly: object, settings: object }}
 * @todo F0-DATA: generate rows, doctors, payments, Soniox days and today's rows per §5.3.10.
 */
export function makeDemoApi(nowMs, { scenario = 'today', emailMode = 'list', fallbackOn404 = false } = {}) {
  const originIso = '2026-03-04T22:00:00.000Z';
  return {
    scenario,
    usage: { range: { from: originIso, to: iso(nowMs), open: true }, counts: { usageLogs: 0, usageEvents: 0 }, rows: [] },
    doctors: { counts: { auth: 0, creditDocs: 0, profiles: 0 }, emailMode, doctors: [] },
    liveNow: {
      now: nowMs,
      dayKey: vilniusDayKey(nowMs),
      liveEnabled: true,
      openCount: 0,
      startedToday: 0,
      open: [],
      limits: { streamsDefault: 10, maxOpenPerDoctor: 2, maxSessionSeconds: 3600, dailyCap: 20 },
      todayRows: [],
    },
    revenue: {
      status: 'ok',
      livemode: true,
      payments: [],
      adjustments: [],
      ignoredSessions: 0,
      totals: { count: 0, grossCents: 0, discountCents: 0, feeCents: 0, refundedCents: 0, netCents: 0, credits: 0, payingDoctors: 0 },
      webhook: { checkedFromMs: nowMs - 30 * 86400000, notCredited: 0, pending: 0, unknown: 0 },
    },
    soniox: {
      status: 'ok',
      range: { from: iso(nowMs - 90 * 86400000), to: iso(nowMs), clamped: true },
      days: [],
      liveSessions: [],
      totals: { requests: 0, audioMs: 0, costUsd: 0 },
    },
    config: demoConfig(nowMs, { fallbackOn404, emailMode }),
    costsMonthly: { months: [] },
    settings: { settings: demoSettings() },
  };
}

/** The demo's FX (same as the static price table). */
export const DEMO_FX = DEFAULT_FX;
