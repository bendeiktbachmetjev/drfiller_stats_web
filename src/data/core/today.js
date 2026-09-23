// "Today" numbers for the live strip and the alerts, computed in the browser from /live-now todayRows
// with the same rules as the pages (D20): all traffic, list-price cost. FROZEN CONTRACT 2: TodaySummary.
import { HEALTH } from '../constants.js';
import { SONIOX_SINCE_MS } from '../eras.js';
import { dayKeyOf } from '../period.js';

const HOUR_MS = 3600000;

/**
 * @typedef {{
 *   dayKey: string, forms: number, over15: number, fallback: number, dictations: number, openaiDictations: number,
 *   conversations: number, recordingMinutes: number, costEur: number, anamnesisCostUsd: number,
 *   serviceFailuresLastHour: number|null, refusalsLastHour: number|null,
 *   lastAt: { form: number|null, dictation: number|null, conversation: number|null }
 * }} TodaySummary
 */

/**
 * @param {import('../buildDataset.js').UsageRow[]} todayRows normalized with the dataset's eras, config and prices
 *   (normalizeUsageRows of normalize/usage.js); rows of other days are ignored
 * @param {import('../buildDataset.js').Dataset|null} ds used to know whether event logging exists yet
 * @param {number} nowMs
 * @returns {TodaySummary}
 */
export function summarizeToday(todayRows, ds, nowMs) {
  const dayKey = dayKeyOf(nowMs);
  const today = {
    dayKey,
    forms: 0, over15: 0, fallback: 0, dictations: 0, openaiDictations: 0, conversations: 0,
    recordingMinutes: 0, costEur: 0, anamnesisCostUsd: 0,
    serviceFailuresLastHour: null, refusalsLastHour: null,
    lastAt: { form: null, dictation: null, conversation: null },
  };
  const hourAgo = nowMs - HOUR_MS;
  let hasEvents = ds?.v2LoggingSince?.events != null;
  let service = 0;
  let refusals = 0;
  const latest = (current, t) => (current === null || t > current ? t : current);

  (todayRows ?? []).forEach((row) => {
    if (row.dayKey !== dayKey || row.t > nowMs) return;
    today.costEur += row.costEur ?? 0;
    const audioMin = Number.isFinite(row.audioSec) ? row.audioSec / 60 : 0;
    switch (row.kind) {
      case 'form':
        today.forms += 1;
        if (row.durMs > HEALTH.slowMs) today.over15 += 1;
        if (row.role === 'fallback') today.fallback += 1;
        today.lastAt.form = latest(today.lastAt.form, row.t);
        break;
      case 'dictation':
        today.dictations += 1;
        today.recordingMinutes += audioMin;
        if (row.provider === 'openai' && row.t >= SONIOX_SINCE_MS) today.openaiDictations += 1;
        today.lastAt.dictation = latest(today.lastAt.dictation, row.t);
        break;
      case 'live':
        today.conversations += 1;
        today.recordingMinutes += audioMin;
        today.lastAt.conversation = latest(today.lastAt.conversation, row.t);
        break;
      case 'anamnesis':
        today.anamnesisCostUsd += row.costUsd ?? 0;
        break;
      case 'meter':
        hasEvents = true;
        break;
      case 'failure':
        hasEvents = true;
        if (row.t <= hourAgo) break;
        if (row.failure?.group === 'refusal') refusals += 1;
        else service += 1;
        break;
      default:
    }
  });

  if (hasEvents) {
    today.serviceFailuresLastHour = service;
    today.refusalsLastHour = refusals;
  }
  return today;
}
