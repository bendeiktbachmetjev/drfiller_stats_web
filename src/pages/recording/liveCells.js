// Cells of the compact "Right now" strip of the Recording page (§4.5): conversations running out of the
// Soniox limit, conversations started today, minutes recorded today. All accounts, independent of the period.
import { ALERTS } from '../../data/constants.js';
import { fmt } from '../../format/format.js';
import { t } from '../../copy/index.js';

/**
 * @param {{ data: object|null, today: object|null }} live the useLive() result
 * @param {number} fallbackLimit the planning stream limit, used until /live-now names its own
 * @returns {Array<{ key: string, value: string|null, label: string, meter?: { value: number, tone: string } }>}
 */
export function liveCells(live, fallbackLimit) {
  const data = live?.data ?? null;
  const limit = data?.limits?.streamsDefault ?? fallbackLimit;
  const open = Number.isFinite(data?.openCount) ? data.openCount : null;
  const ratio = open !== null && limit > 0 ? open / limit : 0;
  return [
    {
      key: 'open',
      value: open === null ? null : t('recording.live.openValue', { n: fmt.int(open), limit: fmt.int(limit) }),
      label: t('recording.live.open'),
      meter: { value: ratio, tone: ratio >= ALERTS.liveNearLimitShare ? 'warn' : 'rec' },
    },
    { key: 'started', value: Number.isFinite(data?.startedToday) ? fmt.int(data.startedToday) : null, label: t('recording.live.started') },
    { key: 'minutes', value: live?.today ? fmt.minutes(live.today.recordingMinutes) : null, label: t('recording.live.minutes') },
  ];
}
