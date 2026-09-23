// "Needs attention" (§3.10): pure rules over today's numbers, the sources and the price table.
// Service numbers: all traffic. Output keys are copy keys under `alerts.*`; values are raw numbers with
// fmt hints. Permanent risks (the trial-version model, free credits) are not alerts.
import { ALERTS, LT_HOLIDAYS } from '../constants.js';
import { addDays, dayKeyOf, diffDays, hourOf, isoWeekdayOfDate } from '../period.js';
import { lookup, shutdownDate } from '../pricing/gemini.js';
import { canonicalTranscriptionModel } from '../pricing/transcription.js';
import { planningOf } from './projection.js';

/**
 * @typedef {{ key: string, tone: 'attention'|'quiet', values: Record<string, unknown>, link: string }} Alert
 */

/** Rule order (ties are shown in this order after attention-first sorting). */
export const ALERT_ORDER = Object.freeze([
  'notCredited', 'stripeTestMode', 'fallbackToday', 'slowToday', 'failuresHour', 'liveNearLimit', 'silence',
  'anamCap', 'openaiDictation', 'lifecycleSoon', 'revenueDown', 'pricesStale',
]);

const LINKS = Object.freeze({
  notCredited: '/money#payments',
  stripeTestMode: '/settings#sources',
  fallbackToday: '/models#fallback',
  slowToday: '/models#speed',
  failuresHour: '/models#failures',
  liveNearLimit: '/recording',
  silence: '/models',
  anamCap: '/requests#anamnesis',
  openaiDictation: '/recording',
  lifecycleSoon: '/models#risks',
  revenueDown: '/money',
  pricesStale: '/prices#prices',
});

const QUIET = new Set(['revenueDown', 'pricesStale']);
const HOLIDAYS = new Set(LT_HOLIDAYS);

/** Mon–Fri and not a Lithuanian public holiday. */
export const isWorkingDay = (dayKey) => isoWeekdayOfDate(dayKey) <= 5 && !HOLIDAYS.has(dayKey);

/** The working day before `dayKey` (skipping weekends and holidays). */
export const previousWorkingDay = (dayKey) => {
  let day = addDays(dayKey, -1);
  for (let i = 0; i < 14 && !isWorkingDay(day); i += 1) day = addDays(day, -1);
  return day;
};

/**
 * Production models that Google or OpenAI will switch off within `days`, soonest first.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {number} nowMs
 * @param {number} days
 * @returns {Array<{ model: string, date: string, daysLeft: number }>}
 */
export function modelsShuttingDown(ds, nowMs, days = ALERTS.lifecycleDays) {
  const today = dayKeyOf(nowMs);
  const gemini = ds?.config?.gemini ?? null;
  const platform = gemini?.endpoint === 'vertex' ? 'vertex' : 'direct';
  const candidates = [];
  [gemini?.main, gemini?.fallback].filter(Boolean).forEach((model) => {
    const date = shutdownDate(ds.prices, model, platform);
    if (date) candidates.push({ model, date });
  });
  const transcription = ds?.config?.transcription ?? null;
  [transcription?.openaiModel, canonicalTranscriptionModel(transcription?.sonioxModel)].filter(Boolean).forEach((model) => {
    const date = lookup(ds.prices?.TRANSCRIPTION ?? {}, model).entry?.shutdown ?? null;
    if (date) candidates.push({ model, date });
  });
  return candidates
    .map((item) => ({ ...item, daysLeft: diffDays(today, item.date) }))
    .filter((item) => item.daysLeft >= 0 && item.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

const formsOnDay = (ds, dayKey) => (ds?.forms ?? []).reduce((n, row) => (row.dayKey === dayKey ? n + 1 : n), 0);

/**
 * @param {{ ds: import('../buildDataset.js').Dataset, today: import('./today.js').TodaySummary|null,
 *   live: import('../api/contract.js').LiveNowApi|null, nowMs: number }} input
 * @returns {Alert[]} attention first, then rule order; at most ALERTS.maxShown (3)
 */
export function computeAlerts({ ds, today, live, nowMs }) {
  if (!ds) return [];
  const fired = [];
  const fire = (key, values = {}) => fired.push({ key, tone: QUIET.has(key) ? 'quiet' : 'attention', values, link: LINKS[key] });
  const revenueLive = ds.revenue?.status === 'ok' && ds.revenueMode === 'live';

  const notCredited = ds.revenue?.webhook?.notCredited ?? 0;
  if (revenueLive && notCredited >= ALERTS.notCredited) {
    fire('notCredited', { n: notCredited, payments: { key: notCredited === 1 ? 'common.unit.payment.one' : 'common.unit.payment.other' } });
  }
  if (ds.revenueMode === 'test') fire('stripeTestMode');

  if (today) {
    if (today.fallback >= ALERTS.fallbackToday) fire('fallbackToday', { n: today.fallback });
    if (today.forms >= ALERTS.slowTodayMinForms && today.over15 / today.forms > ALERTS.slowTodayShare) {
      fire('slowToday', { pct: ['pct', today.over15 / today.forms] });
    }
    if (today.serviceFailuresLastHour !== null && today.serviceFailuresLastHour >= ALERTS.failuresHour) {
      fire('failuresHour', { n: today.serviceFailuresLastHour });
    }
  }

  if (live && Number.isFinite(live.openCount)) {
    const limit = planningOf(ds.settings?.planning).sonioxStreamLimit ?? live.limits?.streamsDefault ?? 10;
    if (live.openCount > 0 && live.openCount >= ALERTS.liveNearLimitShare * limit) fire('liveNearLimit', { n: live.openCount, limit });
  }

  if (today) {
    const hour = hourOf(nowMs);
    const day = today.dayKey ?? dayKeyOf(nowMs);
    if (
      today.forms === 0 &&
      isWorkingDay(day) &&
      hour >= ALERTS.silenceFromHour &&
      hour < ALERTS.silenceToHour &&
      formsOnDay(ds, previousWorkingDay(day)) >= ALERTS.silencePrevDayForms
    ) {
      fire('silence');
    }
    const capUsd = ds.config?.anamnesis?.caps?.dailyUsd;
    if (Number.isFinite(capUsd) && capUsd > 0 && today.anamnesisCostUsd >= ALERTS.anamCapShare * capUsd) {
      fire('anamCap', { x: ['usd', today.anamnesisCostUsd], cap: ['usd', capUsd] });
    }
    if (today.openaiDictations >= ALERTS.openaiDictations) fire('openaiDictation', { n: today.openaiDictations });
  }

  const soon = modelsShuttingDown(ds, nowMs)[0];
  if (soon) fire('lifecycleSoon', { d: soon.daysLeft, model: ['model', soon.model] });

  if (ds.sources?.revenue?.status === 'error') fire('revenueDown');
  const checkedAt = ds.prices?.CHECKED_AT;
  if (typeof checkedAt === 'string' && diffDays(checkedAt, dayKeyOf(nowMs)) > ALERTS.pricesStaleDays) {
    fire('pricesStale', { date: ['date', checkedAt] });
  }

  const rank = (alert) => (alert.tone === 'attention' ? 0 : 1) * 100 + ALERT_ORDER.indexOf(alert.key);
  return fired.sort((a, b) => rank(a) - rank(b)).slice(0, ALERTS.maxShown);
}
