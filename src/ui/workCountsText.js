// The one quiet line about the period's Dr. Filler counts (GET /work-counts) on the Overview card and under the
// Doctors table: loading, why they are missing, or that counting started later. Plain words, no alarm: people
// outside clinics are counted once their extension updates, so older periods are simply empty.
import { t } from '../copy/index.js';
import { fmt } from '../format/format.js';

/** Copy key of each word of data/normalize/workCounts.js#workCountsStatus ('ok' has nothing to say). */
export const WORK_NOTE_KEYS = Object.freeze({
  loading: 'common.work.loading',
  tooMany: 'common.work.tooMany',
  badRange: 'common.work.badRange',
  notYet: 'common.work.notYet',
  failed: 'common.work.failed',
  none: 'common.work.none',
  partial: 'common.work.partial',
});

/**
 * @param {string} status a workCountsStatus() word
 * @param {{ firstDay?: string|null }} [values] firstDay: the first day with a count (for 'partial')
 * @returns {string|null} null when there is nothing to say
 */
export function workCountsText(status, { firstDay = null } = {}) {
  const key = WORK_NOTE_KEYS[status];
  if (!key) return null;
  return status === 'partial' ? t(key, { date: firstDay ? fmt.date(firstDay) : null }) : t(key);
}
