import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { useLive } from '../../context/useLive.js';
import { planningOf } from '../../data/core/projection.js';
import { RightNowStrip } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

/**
 * The cells of the full "Right now" strip (§4.6), from today's rows (summarizeToday) and the live-now
 * answer. Pure, so the strip and a test read the same numbers; "—" wherever a number is not known yet.
 * @param {{ data: object|null, today: object|null }} live useLive() result
 * @param {object|null} dataset
 */
export function liveCells({ data, today }, dataset) {
  const now = Number.isFinite(data?.now) ? data.now : null;
  const limit = planningOf(dataset?.settings?.planning).sonioxStreamLimit ?? data?.limits?.streamsDefault ?? null;
  const open = Number.isFinite(data?.openCount) ? data.openCount : null;
  const lastForm = today?.lastAt?.form ?? null;
  return [
    { key: 'lastForm', value: lastForm && now ? fmt.ago(lastForm, now) : null, label: t('models.live.lastForm') },
    { key: 'forms', value: today ? fmt.int(today.forms) : null, label: t('models.live.forms') },
    { key: 'fallback', value: today ? fmt.int(today.fallback) : null, label: t('models.live.fallback') },
    {
      key: 'failures',
      value: today && today.serviceFailuresLastHour !== null ? fmt.int(today.serviceFailuresLastHour) : null,
      label: t('models.live.failures'),
    },
    {
      key: 'live',
      value: open !== null && limit ? t('models.live.ofLimit', { n: fmt.int(open), limit: fmt.int(limit) }) : null,
      label: t('models.live.conversations'),
      meter: open !== null && limit ? { value: open / limit, tone: open >= 0.8 * limit ? 'warn' : 'rec' } : undefined,
    },
  ];
}

/** Full live strip of the Models page: today, all accounts, refreshed every 60 s, independent of the period. */
export default function RightNow() {
  const live = useLive();
  const { dataset } = useAnalytics();
  return <RightNowStrip live={live} cells={liveCells(live, dataset)} />;
}
