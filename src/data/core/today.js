// "Today" numbers for the live strip and the alerts, computed in the browser from /live-now todayRows
// with the same page code (D20). FROZEN CONTRACT 2: TodaySummary. SKELETON — F0-DATA implements it.
import { dayKeyOf } from '../period.js';

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
 *   (use normalizeUsageRows from normalize/usage.js)
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {number} nowMs
 * @returns {TodaySummary}
 * @todo F0-DATA
 */
export function summarizeToday(todayRows, ds, nowMs) {
  return {
    dayKey: dayKeyOf(nowMs),
    forms: 0, over15: 0, fallback: 0, dictations: 0, openaiDictations: 0, conversations: 0,
    recordingMinutes: 0, costEur: 0, anamnesisCostUsd: 0,
    serviceFailuresLastHour: null, refusalsLastHour: null,
    lastAt: { form: null, dictation: null, conversation: null },
  };
}
