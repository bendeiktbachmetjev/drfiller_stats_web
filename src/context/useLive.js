// "Right now" numbers: /v2/live-now polled once a minute while the tab is visible (§5.3.9, D20).
// Independent of the period and of the scope (service numbers: all traffic).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminCore } from './AdminContext.jsx';
import { useAnalytics } from './AnalyticsContext.jsx';
import { LIVE_INTERVAL_MS } from '../data/constants.js';
import { toDataError } from '../data/errors.js';
import { ROUTES } from '../data/api/endpoints.js';
import { normalizeUsageRows } from '../data/normalize/usage.js';
import { summarizeToday } from '../data/core/today.js';
import { computeAlerts } from '../data/core/alerts.js';

// Last successful read, kept across page switches so Models → Recording does not refetch within a minute.
let lastLive = null; // { key, data, updatedAt }

/**
 * @param {{ enabled?: boolean }} [options]
 * @returns {{ data: import('../data/api/contract.js').LiveNowApi|null, today: import('../data/core/today.js').TodaySummary|null,
 *   status: 'loading'|'ready'|'error', error: import('../data/errors.js').DataError|null, isStale: boolean,
 *   updatedAt: number|null, alerts: import('../data/core/alerts.js').Alert[], refresh: () => void }}
 */
export function useLive({ enabled = true } = {}) {
  const { client, isDemo, demoScenario } = useAdminCore();
  const { dataset } = useAnalytics();
  const demo = import.meta.env.DEV && Boolean(isDemo);
  const key = demo ? `demo:${demoScenario}` : 'live';

  const [state, setState] = useState(() =>
    lastLive && lastLive.key === key ? { data: lastLive.data, updatedAt: lastLive.updatedAt, error: null, isStale: false } : { data: null, updatedAt: null, error: null, isStale: false },
  );
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const nowMs = Date.now();
      let data;
      if (import.meta.env.DEV && demo) {
        const demoData = await import('../dev/demoData.js');
        data = demoData.makeDemoApi(nowMs, { scenario: demoScenario }).liveNow;
      } else {
        data = await client.get(ROUTES.liveNow, undefined, { signal: controller.signal });
      }
      if (controller.signal.aborted) return;
      lastLive = { key, data, updatedAt: nowMs };
      setState({ data, updatedAt: nowMs, error: null, isStale: false });
    } catch (err) {
      const error = toDataError(err);
      if (error.code !== 'ABORTED' && !controller.signal.aborted) setState((current) => ({ ...current, error, isStale: true }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [client, demo, demoScenario, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    const lastReadAt = () => (lastLive && lastLive.key === key ? lastLive.updatedAt : 0);
    if (Date.now() - lastReadAt() >= LIVE_INTERVAL_MS) load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, LIVE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastReadAt() >= LIVE_INTERVAL_MS) load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [enabled, key, load]);

  const { data } = state;
  const derived = useMemo(() => {
    if (!data || !dataset) return { today: null, alerts: [] };
    const nowMs = data.now ?? Date.now();
    const { rows } = normalizeUsageRows(data.todayRows ?? [], { config: dataset.config, prices: dataset.prices, fx: dataset.fx });
    const today = summarizeToday(rows, dataset, nowMs);
    return { today, alerts: computeAlerts({ ds: dataset, today, live: data, nowMs }) };
  }, [data, dataset]);

  let status = 'loading';
  if (data) status = 'ready';
  else if (state.error) status = 'error';

  return { data, today: derived.today, alerts: derived.alerts, status, error: state.error, isStale: state.isStale, updatedAt: state.updatedAt, refresh: load };
}

export default useLive;
