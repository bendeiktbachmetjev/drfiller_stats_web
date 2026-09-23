// Shared constants of the statistics site.
// Pure file: no React, no window. Imported by the Node tests, the mock server and the browser.

export const TIMEZONE = 'Europe/Vilnius';

/** First Vilnius day of the usage history (server origin 2026-03-04T22:00:00Z). */
export const STATS_START = '2026-03-05';

/** Money: one display currency (EUR); costs arrive in USD and are converted once (§3.6). */
export const DEFAULT_FX = Object.freeze({ usdPerEur: 1.1463, rateDate: '2026-09-22' });

/** Measured on the production-shaped benchmark prompt: 25,375 characters = 9,329 tokens. */
export const CHARS_PER_TOKEN = 2.72;
/** Characters on one printed page (the `pages` formatter). */
export const CHARS_PER_PAGE = 1800;

/** A cost aggregate is an estimate once its estimated parts reach this share (§3.9 rule 2). */
export const ESTIMATE_SHARE = 0.05;
/** Trend charts need at least this many events in the period (§3.12). */
export const MIN_EVENTS_FOR_CHART = 20;
/** Fewer non-zero buckets → a sentence instead of the chart (§3.12). */
export const MIN_NONZERO_BUCKETS = 3;
/** Line points need this many events in a bucket, else the point is a gap (§3.12). */
export const MIN_EVENTS_PER_POINT = 5;
/** Phone charts show at most this many buckets (day → week → month). */
export const PHONE_MAX_BUCKETS = 14;

/** Average days per month: `monthFactor(period) = MONTH_DAYS / period.effDays`. */
export const MONTH_DAYS = 30.4375;
/** The «now» column of a projection needs at least this many elapsed days. */
export const MIN_DAYS_FOR_MONTH = 7;

/** Recording: 1 credit per 10 minutes of audio (audio meter since METER_SINCE). */
export const MS_PER_CREDIT = 600000;

/** Plan fallback for anamnesis runs when fewer than 5 runs exist (§5.3.7). */
export const DEFAULT_ANAMNESIS_RUN = Object.freeze({ usd: 0.05, credits: 7 });

/** Unit-cost rules (D17): minimum sample sizes. */
export const MIN_SETUP_FORMS = 20;
export const MIN_CONVERSATION_FORMS = 20;
export const MIN_DICTATIONS_FOR_SHARE = 20;
export const MIN_ANAMNESIS_RUNS = 5;
export const MIN_RECORDINGS_FOR_MEASURED = 20;

/** Dashboard history cap of the backend (`ADMIN_USAGE_MAX_ROWS`). */
export const DASHBOARD_ROW_CAP = 150000;

/** Loading. */
export const STALE_MS = 10 * 60 * 1000;
export const LIVE_INTERVAL_MS = 60 * 1000;
export const REQUEST_TIMEOUT_MS = 30 * 1000;
export const LIMITED_HISTORY_DAYS = 90;
export const METRIC_MEMO_LIMIT = 160;

/** Default production API; overridden by `VITE_API_URL` (empty = same origin, the dev proxy). */
export const DEFAULT_API_URL = 'https://web-production-d4666.up.railway.app';
export const API_PREFIX = '/api/admin/v2';

export const STORAGE = Object.freeze({
  period: 'drfiller.admin.period',
  lastSection: 'drfiller.admin.lastSection',
  returnTo: 'drfiller.admin.returnTo', // sessionStorage
  excludeInternal: 'drfiller.admin.excludeInternal',
  demo: 'drfiller.admin.demo', // dev server only
  disclosure: 'drfiller.admin.disclosure.', // + section id
  keySession: 'drfiller.admin.key', // sessionStorage
  keyRemembered: 'drfiller_admin_secret', // localStorage, shared with the legacy page
});

export const PACK_IDS = Object.freeze(['pack250', 'pack600', 'pack1500']);
export const PACK_SIZES = Object.freeze({ pack250: 250, pack600: 600, pack1500: 1500 });
export const PAYMENT_METHODS = Object.freeze([
  'card_eea_standard',
  'card_eea_premium',
  'card_international',
  'revolut_pay',
  'paypal',
]);

/** The "Is everything working?" word (§4.1): bad → slow → ok thresholds, all traffic. */
export const HEALTH = Object.freeze({
  badServiceFailures: 3,
  /** …and at least this share of requests, so one bad hour at the planned scale is not "failing". */
  badServiceFailureRate: 0.005,
  badOver15Share: 0.05,
  okOver15Share: 0.02,
  okFallbackShare: 0.01,
  slowMs: 15000,
  fallbackWaitMs: 25000,
});

/** Anamnesis calls of one doctor with gaps under this belong to one run (§4.4). */
export const ANAMNESIS_RUN_GAP_MS = 10 * 60 * 1000;

/** Plan constants of §5.3.7 (projection and capacity formulas). */
export const PLAN = Object.freeze({
  firestoreWritesPerVisit: 5,
  dictationMbPerMinute: 1.92,
  soniox95: 0.95,
  maxBinomialDoctors: 10000,
});

/** Alert thresholds (§3.10). */
export const ALERTS = Object.freeze({
  maxShown: 3,
  notCredited: 1,
  fallbackToday: 3,
  slowTodayMinForms: 10,
  slowTodayShare: 0.05,
  failuresHour: 3,
  liveNearLimitShare: 0.8,
  silenceFromHour: 11,
  silenceToHour: 18,
  silencePrevDayForms: 10,
  anamCapShare: 0.8,
  openaiDictations: 2,
  lifecycleDays: 60,
  pricesStaleDays: 60,
});

/** Weekday public holidays of Lithuania that matter for the `silence` alert (extend yearly). */
export const LT_HOLIDAYS = Object.freeze([
  '2026-01-01', '2026-02-16', '2026-03-11', '2026-04-06', '2026-05-01', '2026-06-24', '2026-07-06',
  '2026-08-15', '2026-11-02', '2026-12-24', '2026-12-25', '2027-01-01', '2027-02-16', '2027-03-11',
  '2027-03-29', '2027-05-01', '2027-06-24', '2027-07-06', '2027-08-15', '2027-11-01', '2027-11-02',
  '2027-12-24',
]);

/**
 * errorKind → group, mirrored from the backend `logFields.ERROR_KIND_GROUP` (§5.2.5).
 * `service` = something broke; `refusal` = a rule said no. `data/static/error-kinds.json` holds the
 * same map (written by `npm run sync:prices`); a test compares the two.
 */
export const ERROR_KIND_GROUP = Object.freeze({
  timeout: 'service',
  upstream_429: 'service',
  upstream_5xx: 'service',
  upstream_4xx: 'service',
  model_not_found: 'service',
  invalid_json: 'service',
  max_tokens: 'service',
  repetition: 'service',
  internal: 'service',
  credit_store: 'service',
  service_off: 'service',
  transcription_failed: 'service',
  soniox_busy: 'service',
  unavailable: 'service',
  live_off: 'service',
  no_credits: 'refusal',
  daily_cap: 'refusal',
  too_many_open: 'refusal',
  session_used: 'refusal',
  cap: 'refusal',
  queue_full: 'refusal',
  client_gone: 'refusal',
  invalid_audio: 'refusal',
});

