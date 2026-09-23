// Words for the Overview metric items. The metric returns copy keys with raw values (§4.0); the shared
// resolver (format/items.js) turns them into sentences, with `{period}` filled in by this page.
import { plural, t } from '../../copy/index.js';
import { addDays } from '../../data/period.js';
import { fmt } from '../../format/format.js';
import { itemText, periodPhrase } from '../../format/items.js';

/**
 * The AnswerBlock sentences: the verdict and the plan line with `{period}` filled in.
 * @param {import('../../data/metrics/shared.js').AreaResult} data
 * @param {import('../../data/period.js').Period} period
 * @param {object|null} ds
 * @returns {Array<{ text: string, tone: string }>}
 */
export const answerItemsOf = (data, period, ds) =>
  (data?.answer ?? []).map((item) => ({ text: itemText(item, { ds, extra: { period: periodPhrase(period) } }), tone: item.tone }));

/**
 * "No requests from 1 Aug 2026 to 7 Aug 2026." (the empty state names both days of the period).
 * @param {import('../../data/period.js').Period} period
 */
export function emptyText(period) {
  const end = period.effTo > period.from ? period.effTo : period.to;
  return t('overview.empty', { from: fmt.date(period.from), to: fmt.date(addDays(end, -1)) });
}

/**
 * The quiet line at the bottom (§4.1 NowLine): open conversations and the last form of today, all
 * accounts; "Right now: —" before the first live answer.
 * @param {{ data?: { now?: number, openCount?: number } | null, today?: { lastAt?: { form: number|null } } | null,
 *   updatedAt?: number|null } | null} live the useLive() result
 * @returns {string}
 */
export function nowText(live) {
  const data = live?.data;
  if (!data) return t('overview.now.waiting');
  const n = Number.isFinite(data.openCount) ? data.openCount : 0;
  const values = { n: fmt.int(n), conversations: plural(n, 'common.unit.conversation') };
  const lastForm = live.today ? live.today.lastAt?.form ?? null : undefined;
  if (lastForm === null) return t('overview.now.noForm', values);
  const nowMs = Number.isFinite(data.now) ? data.now : live.updatedAt;
  return t('overview.now', { ...values, ago: lastForm === undefined ? fmt.empty : fmt.ago(lastForm, nowMs) });
}
