// Synthetic API-shaped data for `?demo` / `?demo=planned` and the mock server (§5.3.10).
// Pure: seeded PRNG (mulberry32 + hash32), `nowMs` injected, no Math.random / Date.now.
// Imports only data/constants.js, data/eras.js and data/static/*. Never real ids: synthetic only.
//
//  'today'   the real shapes of Appendix C.4: one owner-like power user with ≈ 87 % of forms, 44 accounts
//            (25 free / 7 gifted / 5 bought / 4 legacy credit docs + 3 without), prompt growth from ≈ 5.5k to
//            ≈ 11.6k tokens, the model eras of eras.js, OpenAI dictation until 22.09 then Soniox, live from
//            23.09, medical history summaries in September, 5 payments (one not credited), a few B2 events
//            after 23.09 11:23.
//  'planned' 100 paying doctors × 400 visits a month over the last 31 days, almost every visit a 15-minute
//            live conversation with its text in the form, pack 1500, B2 fields on every row.
//
// Each Vilnius day is generated from its own seed, so a day never changes when "now" moves; only rows up
// to `nowMs` are returned. Days are cached (the generator is called again on every live poll).
import { DEFAULT_FX, LT_HOLIDAYS, PACK_SIZES } from '../data/constants.js';
import { METER_SINCE, MODEL_ERAS, SONIOX_SINCE, TRANSCRIPTION_ERAS } from '../data/eras.js';
import prices from '../data/static/prices-2026-09-23.json' with { type: 'json' };

// ---------------------------------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------------------------------

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
const b32 = (rand, length) => {
  let text = '';
  for (let i = 0; i < length; i += 1) text += B32[Math.floor(rand() * 32)];
  return text;
};

/** A synthetic pseudonym of the real shape /^d[a-z2-7]{9}$/. */
export function fakePid(seed, index) {
  return `d${b32(mulberry32(hash32(seed, 'pid', index)), 9)}`;
}

export const codeOf = (pid) => `D-${pid.slice(1, 5).toUpperCase()}`;

const stream = (...parts) => mulberry32(hash32('drfiller-demo', ...parts));
const between = (rand, min, max) => min + rand() * (max - min);
const intBetween = (rand, min, max) => Math.floor(between(rand, min, max + 1));
const gauss = (rand) => {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
/** Log-normal with a given MEAN (not median) and spread. */
const logNormalMean = (rand, mean, sigma) => mean * Math.exp(sigma * gauss(rand) - (sigma * sigma) / 2);
const logNormalMedian = (rand, median, sigma) => median * Math.exp(sigma * gauss(rand));
const poisson = (rand, lambda) => {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rand)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rand();
  while (p > limit) {
    k += 1;
    p *= rand();
  }
  return k;
};
const pickWeighted = (rand, items, weightOf) => {
  const total = items.reduce((acc, item) => acc + weightOf(item), 0);
  let x = rand() * total;
  for (const item of items) {
    x -= weightOf(item);
    if (x <= 0) return item;
  }
  return items[items.length - 1];
};

// ---------------------------------------------------------------------------------------------------
// Vilnius calendar (EU summer time rule; no Intl needed, so the mock server stays fast)
// ---------------------------------------------------------------------------------------------------

const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const dstCache = new Map();
const dstOf = (year) => {
  let range = dstCache.get(year);
  if (!range) {
    const lastSunday = (month) => {
      const last = new Date(Date.UTC(year, month + 1, 0));
      return last.getUTCDate() - last.getUTCDay();
    };
    range = [Date.UTC(year, 2, lastSunday(2), 1), Date.UTC(year, 9, lastSunday(9), 1)];
    dstCache.set(year, range);
  }
  return range;
};
const offsetMs = (ms) => {
  const [from, to] = dstOf(new Date(ms).getUTCFullYear());
  return (ms >= from && ms < to ? 3 : 2) * HOUR_MS;
};
const dayKeyOf = (ms) => new Date(ms + offsetMs(ms)).toISOString().slice(0, 10);
const utcOfKey = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const addDays = (key, n) => new Date(utcOfKey(key) + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (key) => new Date(utcOfKey(key)).getUTCDay() || 7;
/** Epoch ms of a Vilnius wall time on a day (seconds may be fractional). */
const wallMs = (dayKey, hour, minute = 0, second = 0) => {
  const wall = utcOfKey(dayKey) + hour * HOUR_MS + minute * 60000 + second * 1000;
  const summer = wall - 3 * HOUR_MS;
  return offsetMs(summer) === 3 * HOUR_MS ? summer : wall - 2 * HOUR_MS;
};
const HOLIDAYS = new Set(LT_HOLIDAYS);
const isWorkday = (key) => weekdayOf(key) <= 5 && !HOLIDAYS.has(key);
const iso = (ms) => new Date(ms).toISOString();

const ms = (text) => Date.parse(text);
const ORIGIN_DAY = '2026-03-05';
const ORIGIN_MS = ms('2026-03-04T22:00:00Z');
const SONIOX_MS = ms(SONIOX_SINCE);
const METER_MS = ms(METER_SINCE);
const MS_PER_CREDIT = 600000;

// Busy hours: peaks at 08:00 and 16–17:00 (weekday peak hour ≈ 15 % of the day's forms).
const WEEKDAY_HOURS = { 6: 0.1, 7: 0.5, 8: 2.05, 9: 1.2, 10: 1, 11: 1, 12: 0.8, 13: 0.7, 14: 0.9, 15: 1.2, 16: 1.8, 17: 1.6, 18: 0.6, 19: 0.3, 20: 0.15, 21: 0.05 };
const WEEKEND_HOURS = { 9: 1, 10: 1.2, 11: 1.2, 12: 1, 13: 0.8, 14: 0.6, 15: 0.4 };
const HOUR_KEYS = { weekday: Object.keys(WEEKDAY_HOURS).map(Number), weekend: Object.keys(WEEKEND_HOURS).map(Number) };
const randomTime = (rand, dayKey) => {
  const workday = isWorkday(dayKey);
  const table = workday ? WEEKDAY_HOURS : WEEKEND_HOURS;
  const hour = pickWeighted(rand, workday ? HOUR_KEYS.weekday : HOUR_KEYS.weekend, (h) => table[h]);
  return wallMs(dayKey, hour, rand() * 60);
};

const eraAt = (list, t) => list.find((era) => t >= era.fromMs && (era.toMs === null || t < era.toMs)) ?? list[0];
const modelEraAt = (t) => eraAt(MODEL_ERAS, t);
const transcriptionModelAt = (t) => eraAt(TRANSCRIPTION_ERAS, t).main;

// ---------------------------------------------------------------------------------------------------
// Server settings and config (the same for both scenarios)
// ---------------------------------------------------------------------------------------------------

/** ConfigApi as production runs today (§5.2.3.6). */
export function demoConfig(nowMs, { fallbackOn404 = false, emailMode = 'list' } = {}) {
  const era = MODEL_ERAS[MODEL_ERAS.length - 1];
  return {
    build: 'demo',
    serverStartedAt: nowMs - 6 * HOUR_MS,
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

// ---------------------------------------------------------------------------------------------------
// Row builders (API field names, absent fields left out)
// ---------------------------------------------------------------------------------------------------

const clean = (row) => {
  Object.keys(row).forEach((key) => {
    if (row[key] === undefined || row[key] === null) delete row[key];
  });
  return row;
};

const round = (x) => Math.max(0, Math.round(x));

const formApi = (id, t, pid, { model, inTok, outTok, thinkTok, durMs, chars, convChars, histChars, b2 }) =>
  clean({
    id,
    t,
    action: 'ai_processing',
    pid,
    model,
    inTok,
    visTok: outTok - thinkTok,
    outTok,
    thinkTok,
    durMs,
    chars,
    convChars,
    histChars,
    ...(b2 ?? {}),
  });

// ---------------------------------------------------------------------------------------------------
// 'today' — the shapes of Appendix C.4
// ---------------------------------------------------------------------------------------------------

const SPECIALTIES = ['Šeimos medicina', 'Vidaus ligos', 'Kardiologija', 'Neurologija', 'Endokrinologija', 'Pediatrija', null];

/**
 * The 44 accounts. credits = [total, used, available] (the pinned cases of §5.2.3.2 included);
 * window = the days a doctor makes forms besides the power user; weight = share among those doctors.
 */
const TODAY_ROSTER = [
  { key: 'top', class: 'legacy', credits: [750, 5297, 11045], legacy: true, signup: '2026-02-20', spec: 0 },
  { key: 'l2', class: 'legacy', credits: [500, 1200, 6210], legacy: true, signup: '2026-02-24', window: ['2026-03-05', '2026-06-15'], weight: 3, spec: 1 },
  { key: 'l3', class: 'legacy', credits: [300, 450, 3574], legacy: true, signup: '2026-03-01', window: ['2026-04-01', '2026-05-31'], weight: 2, spec: 2 },
  { key: 'l4', class: 'legacy', credits: [15, 0, 500], legacy: true, signup: '2026-03-02', window: ['2026-03-05', '2026-03-31'], weight: 0.5, spec: 3 },
  { key: 'g1', class: 'gifted', credits: [15, 362, 7262], signup: '2026-03-10', window: ['2026-03-12', null], weight: 3, spec: 0 },
  { key: 'g2', class: 'gifted', credits: [15, 240, 1200], signup: '2026-04-02', window: ['2026-04-05', null], weight: 2, spec: 4 },
  { key: 'g3', class: 'gifted', credits: [15, 160, 800], signup: '2026-04-08', window: ['2026-04-10', '2026-07-31'], weight: 2, spec: 1 },
  { key: 'g4', class: 'gifted', credits: [15, 90, 450], signup: '2026-04-28', window: ['2026-05-01', '2026-06-30'], weight: 1.5, spec: 5 },
  { key: 'g5', class: 'gifted', credits: [15, 60, 229], signup: '2026-05-12', window: ['2026-05-15', '2026-08-15'], weight: 1, spec: 0 },
  { key: 'g6', class: 'gifted', credits: [15, 40, 150], signup: '2026-05-28', window: ['2026-06-01', '2026-07-15'], weight: 1, spec: 2 },
  { key: 'g7', class: 'gifted', credits: [15, 30, 50], signup: '2026-06-29', window: ['2026-07-01', '2026-08-20'], weight: 1, spec: 6 },
  { key: 'b5', class: 'bought_inferred', credits: [265, 29, 236], packs: { pack250: 1, pack600: 0, pack1500: 0 }, signup: '2026-04-10', window: ['2026-04-14', '2026-05-31'], weight: 1, spec: 1, pay: { day: '2026-04-14', hour: 10.2, pack: 'pack250', method: 'card' } },
  { key: 'b4', class: 'bought_inferred', credits: [600, 1, 600], packs: { pack250: 0, pack600: 1, pack1500: 0 }, signup: '2026-05-15', window: ['2026-05-20', '2026-06-10'], weight: 0.3, spec: 3, pay: { day: '2026-05-20', hour: 15.6, pack: 'pack600', method: 'card' } },
  { key: 'b3', class: 'bought_inferred', credits: [615, 112, 552], packs: { pack250: 0, pack600: 1, pack1500: 0 }, signup: '2026-06-10', window: ['2026-06-18', '2026-08-10'], weight: 1.2, spec: 0, pay: { day: '2026-06-18', hour: 9.1, pack: 'pack600', method: 'card' } },
  { key: 'b2', class: 'bought_inferred', credits: [615, 35, 580], packs: { pack250: 0, pack600: 1, pack1500: 0 }, signup: '2026-07-25', window: ['2026-07-30', null], weight: 0.8, spec: 4, pay: { day: '2026-07-30', hour: 16.3, pack: 'pack600', method: 'revolut_pay' } },
  { key: 'b1', class: 'bought_inferred', credits: [600, 77, 523], packs: { pack250: 0, pack600: 1, pack1500: 0 }, signup: '2026-08-18', window: ['2026-08-20', null], weight: 1.2, spec: 1, pay: { day: '2026-09-02', hour: 11.5, pack: 'pack600', method: 'card', notCredited: true } },
  // Free accounts that tried a few forms (used = 15 − available); the last one signed up in September.
  ...[
    ['2026-03-16', 2], ['2026-03-25', 2], ['2026-04-06', 3], ['2026-04-21', 3], ['2026-05-05', 4], ['2026-05-26', 4],
    ['2026-06-09', 5], ['2026-06-23', 5], ['2026-07-07', 5], ['2026-07-21', 5], ['2026-08-04', 4], ['2026-09-10', 5],
  ].map(([signup, used], i) => ({ key: `f${i + 1}`, class: 'free', credits: [15, used, 15 - used], signup, tries: used, spec: i % SPECIALTIES.length })),
  // Free accounts that never made a form.
  ...Array.from({ length: 13 }, (_, i) => ({ key: `u${i + 1}`, class: 'free', credits: [15, 0, 15], signup: addDays('2026-03-20', i * 14), spec: 6, noProfile: i < 4 })),
  // Accounts without a credit document.
  ...Array.from({ length: 3 }, (_, i) => ({ key: `n${i + 1}`, class: 'no_credits_doc', credits: null, signup: addDays('2026-05-03', i * 30), noProfile: true })),
];

const FORMS_PER_MONTH = { '2026-03': 615, '2026-04': 923, '2026-05': 787, '2026-06': 657, '2026-07': 866, '2026-08': 1093, '2026-09': 797 };
const SEPTEMBER_LAST_DAY = '2026-09-23'; // the real September count covers 1–23 Sep
const PROMPT_MEAN = { '2026-03': 5479, '2026-04': 5664, '2026-05': 5511, '2026-06': 5813, '2026-07': 6372, '2026-08': 8525, '2026-09': 11643 };
const OUTPUT_MEAN = { '2026-03': 687, '2026-04': 590, '2026-05': 562, '2026-06': 509, '2026-07': 575, '2026-08': 771, '2026-09': 981 };
const LATENCY_MEDIAN = { '2026-08': 4600, '2026-09': 5900 };
const WEEKEND_WEIGHT = 0.085;
const TOP_SHARE = 0.878;

const dayWeight = (key) => (isWorkday(key) ? 1 : WEEKEND_WEIGHT);
const monthOf = (key) => (key.slice(0, 7) in FORMS_PER_MONTH ? key.slice(0, 7) : '2026-09');

const lastDayOfMonth = (month) => {
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  return addDays(next.toISOString().slice(0, 10), -1);
};

const formsPerWeightCache = new Map();
/** Forms per unit of day weight in a month (the real monthly totals spread over its days). */
const formsPerWeight = (month) => {
  let rate = formsPerWeightCache.get(month);
  if (rate === undefined) {
    const first = month === '2026-03' ? ORIGIN_DAY : `${month}-01`;
    const last = month === '2026-09' ? SEPTEMBER_LAST_DAY : lastDayOfMonth(month);
    let weight = 0;
    for (let day = first; day <= last; day = addDays(day, 1)) weight += dayWeight(day);
    rate = FORMS_PER_MONTH[month] / weight;
    formsPerWeightCache.set(month, rate);
  }
  return rate;
};

const inWindow = (doctor, day) => doctor.window && day >= doctor.window[0] && (doctor.window[1] === null || day <= doctor.window[1]);

let todayWorld = null;
const getTodayWorld = () => {
  if (todayWorld) return todayWorld;
  const doctors = TODAY_ROSTER.map((entry, index) => ({ ...entry, pid: fakePid('today', index) }));
  const byKey = Object.fromEntries(doctors.map((doctor) => [doctor.key, doctor]));
  // Scheduled tries of the free accounts: on their first working days after signing up.
  const tries = new Map();
  doctors.filter((doctor) => doctor.tries).forEach((doctor) => {
    let day = addDays(doctor.signup, 1);
    for (let n = 0; n < doctor.tries; ) {
      if (isWorkday(day)) {
        const count = Math.min(2, doctor.tries - n);
        tries.set(day, [...(tries.get(day) ?? []), ...Array(count).fill(doctor.pid)]);
        n += count;
      }
      day = addDays(day, 1);
    }
  });
  todayWorld = { doctors, byKey, tries, top: byKey.top };
  return todayWorld;
};

const TWO_FIVE_TEST_FORMS = [ms('2026-08-26T16:16:30Z'), ms('2026-08-26T16:19:10Z')];
const LIVE_TODAY = [
  { t: ms('2026-09-23T06:58:00Z'), audioSec: 420 },
  { t: ms('2026-09-23T07:24:00Z'), audioSec: 780 },
];
const SONIOX_TESTS = [ms('2026-09-22T14:20:00Z'), ms('2026-09-22T14:31:00Z'), ms('2026-09-22T15:02:00Z'), ms('2026-09-22T15:40:00Z'), ms('2026-09-23T05:50:00Z')];
// The first dictations on the minute meter (23.09 after 11:23 Vilnius): they create the first audio_meter rows.
const METER_DICTATIONS = [
  { t: ms('2026-09-23T09:10:00Z'), sec: 190 },
  { t: ms('2026-09-23T10:40:00Z'), sec: 420 },
];

/** One form of the 'today' world at time t (model by era, tokens by month, latency by model). */
function todayForm(rand, id, t, pid, { convMin = 0 } = {}) {
  const era = modelEraAt(t);
  const month = monthOf(dayKeyOf(t));
  let model = era.main;
  let fallback = false;
  if (era.main === 'mixed') {
    const x = rand();
    model = x < 0.55 ? 'gemini-3.5-flash-lite' : x < 0.62 ? 'gemini-3.8-flash' : x < 0.66 ? 'gemini-3.5-flash' : 'gemini-3-flash-preview';
  } else if (era.fallback && rand() < 0.01) {
    model = era.fallback;
    fallback = true;
  }
  const inMean = PROMPT_MEAN[month] ?? PROMPT_MEAN['2026-09'];
  const inTok = round(logNormalMean(rand, inMean, 0.25) + convMin * 250);
  const outTok = round(logNormalMean(rand, OUTPUT_MEAN[month] ?? OUTPUT_MEAN['2026-09'], 0.35));
  const thinkTok = round(outTok * between(rand, 0.2, 0.4));
  let durMs;
  if (fallback) durMs = rand() < 0.75 ? between(rand, 27000, 30200) : between(rand, 5500, 6300);
  else if (era.id === 'e3') durMs = logNormalMedian(rand, 8400, 0.5);
  else {
    durMs = logNormalMedian(rand, LATENCY_MEDIAN[month] ?? 3900, month >= '2026-09' ? 0.4 : 0.46);
    if (rand() < 0.007) durMs *= between(rand, 3, 5); // Google is slow now and then
  }
  const histChars = month >= '2026-08' && rand() < 0.6 ? round(logNormalMedian(rand, 12000, 0.5)) : undefined;
  return formApi(id, t, pid, {
    model,
    inTok,
    outTok,
    thinkTok,
    durMs: round(Math.min(durMs, 60000)),
    chars: round(logNormalMedian(rand, 350, 0.6)),
    convChars: convMin > 0 ? round(convMin * 900) : undefined,
    histChars,
  });
}

/** A dictation of the 'today' world: OpenAI with the file size only until 22.09 17:00, Soniox after. */
function todayDictation(rand, id, t, pid, forcedSec = null) {
  const sec = forcedSec ?? Math.max(4, logNormalMean(rand, 83, 0.6));
  if (t >= SONIOX_MS && (forcedSec !== null || rand() >= 0.05)) {
    return clean({ id, t, action: 'transcription', pid, model: 'soniox:stt-async-v5', audioSec: Math.round(sec * 10) / 10, chars: round(sec * 13), durMs: round(between(rand, 1200, 3500)) });
  }
  const model = t >= SONIOX_MS ? 'gpt-4o-mini-transcribe-2025-12-15' : transcriptionModelAt(t);
  return clean({ id, t, action: 'transcription', pid, model, audioBytes: round(44 + sec * 32000), chars: round(sec * 13), durMs: round(between(rand, 1500, 4500)) });
}

const liveApi = (rand, id, t, pid, audioSec) =>
  clean({ id, t, action: 'transcription', mode: 'live', pid, model: 'soniox-rt:stt-rt-v5', audioSec: Math.round(audioSec), sessionRef: b32(rand, 10), speakers: 2, reconnects: rand() < 0.15 ? 1 : 0 });

const anamnesisCredits = (costUsd) => Math.min(40, Math.max(1, Math.ceil((costUsd * 0.86 * 1.5) / 0.03 - 1e-9)));
const vertexCost = (model, inTok, outTok) => {
  const entry = prices.GEMINI[model].periods[0];
  return Math.round(((inTok * entry.input + outTok * entry.output) / 1e6) * 1e6) / 1e6;
};

/** One v2 medical history run: 6–10 fact extractions (fast model, sometimes the strong one) + the narrative. */
function anamnesisRun(rand, day, pid, nextId) {
  const rows = [];
  let t = wallMs(day, intBetween(rand, 9, 15), rand() * 60);
  const calls = intBetween(rand, 6, 10);
  for (let i = 0; i < calls; i += 1) {
    const strong = rand() < 0.15;
    const model = strong ? 'gemini-3.5-flash' : 'gemini-3.5-flash-lite';
    const inTok = round(logNormalMean(rand, 9000, 0.3));
    const outTok = round(logNormalMean(rand, 800, 0.3));
    const costUsd = vertexCost(model, inTok, outTok);
    rows.push(clean({ id: nextId(), t, action: 'anamnesis_extract', pid, model, inTok, outTok, visTok: round(outTok * 0.7), costUsd, credits: anamnesisCredits(costUsd), docs: intBetween(rand, 3, 8), pages: intBetween(rand, 4, 20), tier: strong ? 'strong' : 'fast', finishReason: rand() < 0.02 ? 'MAX_TOKENS' : 'STOP', facts: intBetween(rand, 5, 20), batch: i, durMs: round(between(rand, 4000, 12000)) }));
    t += between(rand, 20000, 60000);
  }
  const inTok = round(logNormalMean(rand, 12000, 0.2));
  const outTok = round(logNormalMean(rand, 1200, 0.2));
  const costUsd = vertexCost('gemini-3.5-flash', inTok, outTok);
  rows.push(clean({ id: nextId(), t: t + 30000, action: 'anamnesis_narrative', pid, model: 'gemini-3.5-flash', inTok, outTok, visTok: round(outTok * 0.8), costUsd, credits: anamnesisCredits(costUsd), focus: rand() < 0.3, durMs: round(between(rand, 8000, 20000)) }));
  return rows;
}

const V1_SUMMARIES = { '2026-09-02': 4, '2026-09-03': 5, '2026-09-04': 3 };

/** Medical history summaries of one day in the 'today' world: v1 on 02–04.09, one v2 run a day from 05.09. */
function todayAnamnesis(rand, day, pid, nextId) {
  const v1 = V1_SUMMARIES[day];
  if (v1) {
    return Array.from({ length: v1 }, () => {
      const t = wallMs(day, intBetween(rand, 9, 16), rand() * 60);
      const inTok = round(logNormalMean(rand, 30000, 0.3));
      const outTok = round(logNormalMean(rand, 1500, 0.3));
      return clean({ id: nextId(), t, action: 'anamnesis_summary', pid, model: 'gemini-2.5-flash', inTok, outTok, visTok: outTok, costUsd: vertexCost('gemini-2.5-flash', inTok, outTok), docs: intBetween(rand, 3, 9), pages: intBetween(rand, 6, 30), pdfBytes: intBetween(rand, 200000, 2000000), finishReason: 'STOP' });
    });
  }
  if (day < '2026-09-05' || (day > '2026-09-23' && !isWorkday(day))) return [];
  return anamnesisRun(rand, day, pid, nextId);
}

/** Every usage row of one Vilnius day in the 'today' world (the whole day; the caller cuts at now). */
function todayDayRows(day) {
  const world = getTodayWorld();
  const rand = stream('today', day);
  const ids = stream('today', day, 'ids');
  const nextId = () => `r${b32(ids, 10)}`;
  const rows = [];

  const count = poisson(rand, formsPerWeight(monthOf(day)) * dayWeight(day));
  const others = world.doctors.filter((doctor) => inWindow(doctor, day));
  for (let i = 0; i < count; i += 1) {
    const t = randomTime(rand, day);
    const doctor = others.length === 0 || rand() < TOP_SHARE ? world.top : pickWeighted(rand, others, (d) => d.weight);
    let convMin = 0;
    // From 24.09 the power user records a quarter of the visits live; the form follows the conversation.
    if (day > '2026-09-23' && (doctor === world.top || doctor.key === 'g1') && rand() < 0.25) {
      convMin = Math.max(3, logNormalMedian(rand, 14, 0.35));
      rows.push(liveApi(rand, nextId(), t - 90000, doctor.pid, convMin * 60));
    }
    rows.push(todayForm(rand, nextId(), t, doctor.pid, { convMin }));
    if (!convMin && rand() < 1 / 24) rows.push(todayDictation(rand, nextId(), t - between(rand, 30000, 120000), doctor.pid));
  }
  (world.tries.get(day) ?? []).forEach((pid) => rows.push(todayForm(rand, nextId(), randomTime(rand, day), pid)));
  if (day >= '2026-04-06' && day <= '2026-04-17' && isWorkday(day)) rows.push(todayForm(rand, nextId(), randomTime(rand, day), 'deleted'));
  if (day === '2026-08-26') TWO_FIVE_TEST_FORMS.forEach((t) => rows.push(todayForm(rand, nextId(), t, world.top.pid)));
  if (day === '2026-06-02') rows.push(clean({ id: nextId(), t: wallMs(day, 9, 12), action: 'transcription', pid: world.top.pid, model: transcriptionModelAt(wallMs(day, 9)), audioBytes: 0 }));
  SONIOX_TESTS.filter((t) => dayKeyOf(t) === day).forEach((t) => rows.push(todayDictation(rand, nextId(), t, world.top.pid, between(rand, 5, 12))));
  METER_DICTATIONS.filter((d) => dayKeyOf(d.t) === day).forEach((d) => rows.push(todayDictation(rand, nextId(), d.t, world.top.pid, d.sec)));
  LIVE_TODAY.filter((live) => dayKeyOf(live.t) === day).forEach((live) => {
    rows.push(liveApi(rand, nextId(), live.t, world.top.pid, live.audioSec));
    rows.push(todayForm(rand, nextId(), live.t + 80000, world.top.pid, { convMin: live.audioSec / 60 }));
  });
  rows.push(...todayAnamnesis(rand, day, world.top.pid, nextId));

  // B2 events (after 23.09 11:23): failed requests of both groups.
  if (day >= '2026-09-23') {
    const failures = day === '2026-09-23'
      ? [{ t: wallMs(day, 12, 40), errorKind: 'timeout', feature: 'process', httpStatus: 400, refunded: true }, { t: wallMs(day, 13, 5), errorKind: 'no_credits', feature: 'dictation', httpStatus: 403, refunded: false }]
      : [
          ...(rand() < 0.1 ? [{ t: randomTime(rand, day), errorKind: pickWeighted(rand, ['timeout', 'upstream_5xx', 'upstream_429'], () => 1), feature: 'process', httpStatus: 400, refunded: true }] : []),
          ...(rand() < 0.2 ? [{ t: randomTime(rand, day), errorKind: pickWeighted(rand, ['no_credits', 'daily_cap'], () => 1), feature: 'live_key', httpStatus: 403, refunded: false }] : []),
        ];
    failures.filter((f) => f.t >= METER_MS).forEach((f) => rows.push(clean({ id: nextId(), action: 'request_failed', pid: world.top.pid, model: f.feature === 'process' ? 'gemini-3-flash-preview' : undefined, ...f })));
  }
  return rows.filter((row) => row.t >= ORIGIN_MS).sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------------------------------
// 'planned' — 100 paying doctors, 400 visits a month, 15-minute conversations
// ---------------------------------------------------------------------------------------------------

const PLANNED_DOCTORS = 100;
const PLANNED_DAYS = 31;
const VISITS_PER_WORKDAY = 17.8; // 400 a month over ≈ 21.7 working days plus a little weekend work
const LIVE_SHARE = 0.94;

let plannedWorld = null;
const getPlannedWorld = () => {
  if (plannedWorld) return plannedWorld;
  const doctors = Array.from({ length: PLANNED_DOCTORS }, (_, index) => {
    const rand = stream('planned', 'doctor', index);
    return {
      key: `p${index + 1}`,
      pid: fakePid('planned', index),
      class: 'bought_inferred',
      credits: [1515, intBetween(rand, 400, 1400), intBetween(rand, 100, 1400)],
      packs: { pack250: 0, pack600: 0, pack1500: 1 },
      signup: addDays('2026-06-01', intBetween(rand, 0, 60)),
      spec: index % SPECIALTIES.length,
      pace: between(rand, 0.8, 1.2),
      payOffset: (index * 7) % 45,
    };
  });
  plannedWorld = { doctors };
  return plannedWorld;
};

const b2Form = (fallback) => ({ fallbackUsed: fallback, fallbackReason: fallback ? 'timeout' : undefined, endpoint: 'direct', priceKnown: true });

/** Every usage row of one Vilnius day in the 'planned' world. */
function plannedDayRows(day) {
  const world = getPlannedWorld();
  const ids = stream('planned', day, 'ids');
  const nextId = () => `r${b32(ids, 10)}`;
  const rows = [];
  world.doctors.forEach((doctor) => {
    const rand = stream('planned', day, doctor.key);
    const visits = poisson(rand, VISITS_PER_WORKDAY * doctor.pace * dayWeight(day));
    for (let i = 0; i < visits; i += 1) {
      const end = randomTime(rand, day);
      const live = rand() < LIVE_SHARE;
      const minutes = live ? Math.min(40, Math.max(5, 15 + 3 * gauss(rand))) : 0;
      if (live) rows.push(liveApi(rand, nextId(), end, doctor.pid, minutes * 60));
      else if (rand() < 0.5) {
        const sec = Math.max(10, 60 + 15 * gauss(rand));
        const openai = rand() < 0.03;
        rows.push(clean({ id: nextId(), t: end, action: 'transcription', pid: doctor.pid, model: openai ? 'gpt-4o-mini-transcribe-2025-12-15' : 'soniox:stt-async-v5', provider: openai ? 'openai' : 'soniox', fallbackUsed: openai, fallbackReason: openai ? 'timeout' : undefined, audioMs: round(sec * 1000), audioMsSource: 'provider', chars: round(sec * 13), durMs: round(between(rand, 1200, 3500)) }));
      }
      const fallback = rand() < 0.01;
      const inTok = round(logNormalMean(rand, 11441, 0.22) + minutes * 250);
      const outTok = round(logNormalMean(rand, 986, 0.3));
      const thinkTok = round(outTok * between(rand, 0.2, 0.4));
      const durMs = fallback ? between(rand, 27000, 30200) : logNormalMedian(rand, 5900, 0.4);
      rows.push(formApi(nextId(), end + between(rand, 40000, 150000), doctor.pid, {
        model: fallback ? 'gemini-3.5-flash-lite' : 'gemini-3-flash-preview',
        inTok,
        outTok,
        thinkTok,
        durMs: round(durMs),
        chars: round(logNormalMedian(rand, 250, 0.6)),
        convChars: live ? round(minutes * 900) : undefined,
        histChars: rand() < 0.6 ? round(logNormalMedian(rand, 12000, 0.5)) : undefined,
        b2: b2Form(fallback),
      }));
    }
    // About one medical history summary per doctor and month.
    if (isWorkday(day) && rand() < 1 / 21) rows.push(...anamnesisRun(rand, day, doctor.pid, nextId));
  });
  // Failed requests (B2): about 0.1 % service failures and 0.1 % refusals of the day's forms.
  const rand = stream('planned', day, 'failures');
  const formsToday = rows.filter((row) => row.action === 'ai_processing').length;
  const failures = poisson(rand, formsToday * 0.001);
  const refusals = poisson(rand, formsToday * 0.001);
  for (let i = 0; i < failures + refusals; i += 1) {
    const doctor = world.doctors[intBetween(rand, 0, world.doctors.length - 1)];
    const refusal = i >= failures;
    rows.push(clean({ id: nextId(), t: randomTime(rand, day), action: 'request_failed', pid: doctor.pid, feature: refusal ? 'live_key' : 'process', errorKind: refusal ? 'daily_cap' : pickWeighted(rand, ['timeout', 'upstream_5xx', 'upstream_429'], () => 1), httpStatus: refusal ? 429 : 400, refunded: !refusal, model: refusal ? undefined : 'gemini-3-flash-preview' }));
  }
  return rows.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------------------------------
// History assembly
// ---------------------------------------------------------------------------------------------------

const dayCache = new Map();
const DAY_CACHE_LIMIT = 600;
const dayRows = (scenario, day) => {
  const key = `${scenario}|${day}`;
  let rows = dayCache.get(key);
  if (!rows) {
    rows = scenario === 'planned' ? plannedDayRows(day) : todayDayRows(day);
    if (dayCache.size >= DAY_CACHE_LIMIT) dayCache.delete(dayCache.keys().next().value);
    dayCache.set(key, rows);
  }
  return rows;
};

const firstDayOf = (scenario, today) => (scenario === 'planned' ? addDays(today, -(PLANNED_DAYS - 1)) : ORIGIN_DAY);

/** Whole days from the first day to today (the current day complete, rows after now included). */
const daysUpTo = (scenario, nowMs) => {
  const today = dayKeyOf(nowMs);
  const out = [];
  for (let day = firstDayOf(scenario, today); day <= today; day = addDays(day, 1)) out.push(dayRows(scenario, day));
  return out;
};

/**
 * Audio meter events (B2) after METER_SINCE: every dictation or live conversation adds its length to the
 * doctor's counter; each full 10 minutes charges one credit, the rest carries over.
 */
const meterEvents = (rows) => {
  const bank = new Map();
  const events = [];
  rows.forEach((row) => {
    if (row.action !== 'transcription' || row.t < METER_MS) return;
    const addedMs = Number.isFinite(row.audioMs) ? row.audioMs : Number.isFinite(row.audioSec) ? Math.round(row.audioSec * 1000) : 0;
    if (addedMs <= 0) return;
    const total = (bank.get(row.pid) ?? 0) + addedMs;
    const chargedCredits = Math.floor(total / MS_PER_CREDIT);
    bank.set(row.pid, total - chargedCredits * MS_PER_CREDIT);
    events.push({ id: `m${row.id.slice(1)}`, t: row.t + 1000, action: 'audio_meter', pid: row.pid, source: row.mode === 'live' ? 'live_finish' : 'dictation', addedMs, chargedCredits, bankMsAfter: total - chargedCredits * MS_PER_CREDIT });
  });
  return { events, bank };
};

// ---------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------

const doctorApi = (entry, index, { emailMode, bankMs, activity }) => {
  const [total, used, available] = entry.credits ?? [];
  const seen = activity.get(entry.pid);
  const signupAt = wallMs(entry.signup, 9, 30);
  return {
    pid: entry.pid,
    code: codeOf(entry.pid),
    ...(emailMode === 'list' ? { email: `doctor${index + 1}@example.test` } : {}),
    signupAt,
    lastSignInAt: seen ? Math.max(seen - 3600000, signupAt) : signupAt,
    exists: { auth: true, credits: Boolean(entry.credits), profile: !entry.noProfile },
    specialization: entry.noProfile ? null : SPECIALTIES[entry.spec ?? 6] ?? null,
    detailLevel: entry.noProfile ? null : (entry.spec ?? 0) % 2 === 0 ? 'detailed' : 'concise',
    credits: entry.credits ? { available, used, total, consistent: available + used === total } : null,
    audioBankMs: bankMs.get(entry.pid) ?? 0,
    liveOpen: 0,
    legacyFields: Boolean(entry.legacy),
    class: entry.class,
    inferredPacks: entry.class === 'bought_inferred' ? { ...entry.packs } : null,
    internal: false,
    internalSource: null,
  };
};

const PACK_PRICE_CENTS = { pack250: 1250, pack600: 2400, pack1500: 4500 };
const feeCentsOf = (grossCents) => Math.round(grossCents * 0.015 + 25 + 1e-7);

const paymentApi = ({ t, pid, pack, method, credited }) => {
  const grossCents = PACK_PRICE_CENTS[pack];
  const feeCents = feeCentsOf(grossCents);
  return {
    id: `p${b32(stream('payment', pid, t), 10)}`,
    t,
    sessionT: t - 45000,
    pid,
    packId: pack,
    credits: PACK_SIZES[pack],
    currency: 'eur',
    grossCents,
    subtotalCents: grossCents,
    discountCents: 0,
    taxCents: 0,
    feeCents,
    netCents: grossCents - feeCents,
    refundedCents: 0,
    refundedAt: null,
    method,
    promo: false,
    credited,
  };
};

const webhookState = (t, nowMs, notCredited) => {
  if (t < nowMs - 30 * DAY_MS) return 'unknown';
  if (notCredited) return nowMs - t < HOUR_MS ? 'pending' : 'no';
  return nowMs - t < 5 * 60000 ? 'pending' : 'yes';
};

function revenueRoute(scenario, nowMs, doctors) {
  let payments;
  let adjustments = [];
  if (scenario === 'planned') {
    const first = addDays(dayKeyOf(nowMs), -(PLANNED_DAYS - 1));
    // 1,500 credits last a doctor ≈ 45 days (400 visits × 2.5 credits a month): one purchase before the
    // window makes everyone a paying doctor, the next one falls inside it for about two thirds of them.
    payments = doctors.flatMap((doctor) =>
      [doctor.payOffset - 45, doctor.payOffset]
        .map((offset) => ({ t: wallMs(addDays(first, offset), 8, 45 + (doctor.payOffset % 10)), pid: doctor.pid, pack: 'pack1500', method: 'card' })),
    );
  } else {
    payments = doctors.filter((doctor) => doctor.pay).map((doctor) => ({ t: wallMs(doctor.pay.day, Math.floor(doctor.pay.hour), (doctor.pay.hour % 1) * 60), pid: doctor.pid, pack: doctor.pay.pack, method: doctor.pay.method, notCredited: doctor.pay.notCredited }));
    adjustments = [{ t: wallMs('2026-08-03', 3, 0), type: 'stripe_fee', amountCents: -120, paymentId: null }];
  }
  const list = payments
    .filter((p) => p.t <= nowMs)
    .map((p) => paymentApi({ ...p, credited: webhookState(p.t, nowMs, p.notCredited) }))
    .sort((a, b) => a.t - b.t);
  const sum = (key) => list.reduce((acc, p) => acc + (p[key] ?? 0), 0);
  return {
    status: 'ok',
    livemode: true,
    payments: list,
    adjustments: adjustments.filter((a) => a.t <= nowMs),
    ignoredSessions: scenario === 'planned' ? 0 : 2,
    totals: {
      count: list.length,
      grossCents: sum('grossCents'),
      discountCents: sum('discountCents'),
      feeCents: sum('feeCents'),
      refundedCents: sum('refundedCents'),
      netCents: sum('netCents'),
      credits: sum('credits'),
      payingDoctors: new Set(list.map((p) => p.pid)).size,
    },
    webhook: {
      checkedFromMs: nowMs - 30 * DAY_MS,
      notCredited: list.filter((p) => p.credited === 'no').length,
      pending: list.filter((p) => p.credited === 'pending').length,
      unknown: list.filter((p) => p.credited === 'unknown').length,
    },
  };
}

function sonioxRoute(rows, nowMs, { sessionDays }) {
  const from = Math.max(nowMs - 90 * DAY_MS, SONIOX_MS);
  const days = new Map();
  const liveSessions = [];
  const sessionsFrom = nowMs - sessionDays * DAY_MS;
  rows.forEach((row) => {
    if (row.action !== 'transcription' || row.t < from) return;
    const live = row.mode === 'live';
    if (!live && !String(row.model).startsWith('soniox')) return;
    const audioMs = Math.round((Number.isFinite(row.audioMs) ? row.audioMs : (row.audioSec ?? 0) * 1000) * 1.02);
    const kind = live ? 'rt' : 'async';
    const perMinute = live ? 0.002 : 0.1 / 60;
    const costUsd = (audioMs / 60000) * perMinute;
    const key = `${dayKeyOf(row.t)}|${kind}`;
    const day = days.get(key) ?? { day: dayKeyOf(row.t), kind, model: live ? 'stt-rt-v5' : 'stt-async-v5', requests: 0, audioMs: 0, costUsd: 0 };
    day.requests += 1;
    day.audioMs += audioMs;
    day.costUsd = Math.round((day.costUsd + costUsd) * 1e6) / 1e6;
    days.set(key, day);
    if (live && row.t >= sessionsFrom) liveSessions.push({ pid: row.pid, sessionRef: row.sessionRef, endedAt: row.t, audioMs, costUsd: Math.round(costUsd * 1e6) / 1e6, requests: 1 });
  });
  const dayList = [...days.values()].sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind));
  const totals = dayList.reduce((acc, d) => ({ requests: acc.requests + d.requests, audioMs: acc.audioMs + d.audioMs, costUsd: Math.round((acc.costUsd + d.costUsd) * 1e6) / 1e6 }), { requests: 0, audioMs: 0, costUsd: 0 });
  return { status: 'ok', range: { from: iso(nowMs - 90 * DAY_MS), to: iso(nowMs), clamped: true }, days: dayList, liveSessions, totals };
}

const DEMO_INVOICES = [
  { month: '2026-07', googleInvoiceEur: 3.95, googlePromoCreditsEur: 3.55, railwayUsd: 1.96, sonioxInvoiceUsd: null, openaiInvoiceUsd: 0.14, otherEur: null, note: '', updatedAt: ms('2026-08-05T08:00:00Z') },
  { month: '2026-08', googleInvoiceEur: 6.8, googlePromoCreditsEur: 6.1, railwayUsd: 1.96, sonioxInvoiceUsd: null, openaiInvoiceUsd: 0.18, otherEur: null, note: 'Promo credits cover most of it.', updatedAt: ms('2026-09-04T08:00:00Z') },
];

function liveNowRoute(nowMs, dayRowsToday, rowsToNow) {
  const midnight = wallMs(dayKeyOf(nowMs), 0);
  const open = dayRowsToday
    .filter((row) => row.mode === 'live' && row.t > nowMs && row.t - row.audioSec * 1000 <= nowMs)
    .map((row) => {
      const startedAt = Math.round(row.t - row.audioSec * 1000);
      return { pid: row.pid, startedAt, ageSec: Math.round((nowMs - startedAt) / 1000) };
    });
  const endedToday = rowsToNow.filter((row) => row.t >= midnight && row.mode === 'live').length;
  return {
    now: nowMs,
    dayKey: dayKeyOf(nowMs),
    liveEnabled: true,
    openCount: open.length,
    startedToday: endedToday + open.length,
    open,
    limits: { streamsDefault: 10, maxOpenPerDoctor: 2, maxSessionSeconds: 3600, dailyCap: 20 },
    todayRows: rowsToNow.filter((row) => row.t >= midnight),
  };
}

/**
 * The whole API as the demo sees it (the same shapes as /api/admin/v2/*, envelope data only).
 * @param {number} nowMs
 * @param {{ scenario?: 'today'|'planned', emailMode?: 'off'|'click'|'list', fallbackOn404?: boolean }} [options]
 * @returns {{ scenario: string, usage: object, doctors: object, liveNow: object, revenue: object, soniox: object, config: object,
 *   costsMonthly: object, settings: object }}
 */
export function makeDemoApi(nowMs, { scenario = 'today', emailMode = 'list', fallbackOn404 = false } = {}) {
  const planned = scenario === 'planned';
  const days = daysUpTo(planned ? 'planned' : 'today', nowMs);
  const baseRows = days.flat().filter((row) => row.t <= nowMs);
  const { events, bank } = meterEvents(baseRows);
  const rows = [...baseRows, ...events].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));

  const world = planned ? getPlannedWorld() : getTodayWorld();
  const activity = new Map();
  rows.forEach((row) => activity.set(row.pid, row.t));
  const today = dayKeyOf(nowMs);
  const doctors = world.doctors
    .map((entry, index) => (entry.signup <= today ? doctorApi(entry, index, { emailMode, bankMs: bank, activity }) : null))
    .filter(Boolean);
  const counts = { usageEvents: rows.filter((row) => row.action === 'audio_meter' || row.action === 'request_failed').length };
  counts.usageLogs = rows.length - counts.usageEvents;

  return {
    scenario,
    usage: { range: { from: iso(ORIGIN_MS), to: iso(nowMs), open: true }, counts, rows },
    doctors: {
      counts: { auth: doctors.length, creditDocs: doctors.filter((d) => d.exists.credits).length, profiles: doctors.filter((d) => d.exists.profile).length },
      emailMode,
      doctors,
    },
    liveNow: liveNowRoute(nowMs, days[days.length - 1] ?? [], rows),
    revenue: revenueRoute(planned ? 'planned' : 'today', nowMs, world.doctors),
    soniox: sonioxRoute(rows, nowMs, { sessionDays: planned ? 7 : 90 }),
    config: demoConfig(nowMs, { fallbackOn404, emailMode }),
    costsMonthly: { months: planned ? [] : DEMO_INVOICES.filter((m) => m.month <= today.slice(0, 7)) },
    settings: { settings: demoSettings() },
  };
}

/** The demo's FX (same as the static price table). */
export const DEMO_FX = DEFAULT_FX;
