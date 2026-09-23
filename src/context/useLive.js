// "Right now" numbers: /v2/live-now polled once a minute while the tab is visible (§5.3.9, D20).
// Independent of the period and of the scope (service numbers: all traffic).
//
// One shared poll for the whole site: every component that calls useLive() (Overview's alerts and
// NowLine, the Models strip …) reads the same module-level store, so a page with three live blocks
// still sends one request a minute. The store survives page switches: Models → Recording within a
// minute does not refetch.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAdminCore } from './AdminContext.jsx';
import { useAnalytics } from './AnalyticsContext.jsx';
import { LIVE_INTERVAL_MS } from '../data/constants.js';
import { toDataError } from '../data/errors.js';
import { ROUTES } from '../data/api/endpoints.js';
import { normalizeUsageRows } from '../data/normalize/usage.js';
import { summarizeToday } from '../data/core/today.js';
import { computeAlerts } from '../data/core/alerts.js';

const EMPTY_SNAPSHOT = Object.freeze({ data: null, updatedAt: null, error: null, isStale: false });

const store = {
  key: null, // 'live' | 'demo:today' | 'demo:planned' — a new key starts from an empty snapshot
  snapshot: EMPTY_SNAPSHOT,
  listeners: new Set(),
  users: 0, // mounted, enabled useLive() calls
  timer: null,
  controller: null,
  fetcher: null, // (signal, nowMs) => Promise<LiveNowApi>
  onAuthError: null,
};

const emit = () => store.listeners.forEach((listener) => listener());

const setSnapshot = (patch) => {
  store.snapshot = { ...store.snapshot, ...patch };
  emit();
};

async function readLive() {
  if (store.controller || !store.fetcher) return;
  const controller = new AbortController();
  const key = store.key;
  store.controller = controller;
  try {
    const nowMs = Date.now();
    const data = await store.fetcher(controller.signal, nowMs);
    if (controller.signal.aborted || key !== store.key) return;
    setSnapshot({ data, updatedAt: nowMs, error: null, isStale: false });
  } catch (err) {
    const error = toDataError(err);
    if (controller.signal.aborted || key !== store.key || error.code === 'ABORTED') return;
    if (error.code === 'AUTH') {
      store.onAuthError?.();
      return;
    }
    // The last numbers stay on screen; the strip says it could not refresh.
    setSnapshot({ error, isStale: true });
  } finally {
    if (store.controller === controller) store.controller = null;
  }
}

const isDue = () => !store.snapshot.updatedAt || Date.now() - store.snapshot.updatedAt >= LIVE_INTERVAL_MS;

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible' && isDue()) readLive();
};

function startPolling() {
  if (isDue()) readLive();
  store.timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') readLive();
  }, LIVE_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopPolling() {
  window.clearInterval(store.timer);
  store.timer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  store.controller?.abort();
  store.controller = null;
}

/** Forgets the live numbers (sign out, key change). Running polls keep going with the next reader. */
export function resetLiveCache() {
  store.controller?.abort();
  store.controller = null;
  store.key = null;
  store.snapshot = EMPTY_SNAPSHOT;
  emit();
}

const subscribe = (listener) => {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};

// Today's summary and the alerts are derived once per (live answer, dataset) pair, not once per caller.
let derivedCache = { data: null, dataset: null, value: { today: null, alerts: [] } };

function deriveToday(data, dataset) {
  if (!data || !dataset) return { today: null, alerts: [] };
  if (derivedCache.data === data && derivedCache.dataset === dataset) return derivedCache.value;
  let value = { today: null, alerts: [] };
  try {
    const nowMs = Number.isFinite(data.now) ? data.now : Date.now();
    const { rows } = normalizeUsageRows(data.todayRows ?? [], { config: dataset.config, prices: dataset.prices, fx: dataset.fx });
    const today = summarizeToday(rows, dataset, nowMs);
    value = { today, alerts: computeAlerts({ ds: dataset, today, live: data, nowMs }) };
  } catch (err) {
    // A fault in today's numbers must not take the page down; the strip then shows "—".
    console.error('Dr.Filler stats: live numbers could not be computed', err);
  }
  derivedCache = { data, dataset, value };
  return value;
}

/**
 * Live numbers for today, all accounts, refreshed every 60 s while the tab is visible.
 * @param {{ enabled?: boolean }} [options] enabled=false reads the shared snapshot without polling
 * @returns {{ data: import('../data/api/contract.js').LiveNowApi|null, today: import('../data/core/today.js').TodaySummary|null,
 *   status: 'loading'|'ready'|'error', error: import('../data/errors.js').DataError|null, isStale: boolean,
 *   updatedAt: number|null, alerts: Array<{ key: string, tone: 'attention'|'quiet', values: object, link: string }>,
 *   refresh: () => void }}
 */
export function useLive({ enabled = true } = {}) {
  const { client, isDemo, demoScenario, onAuthError } = useAdminCore();
  const { dataset } = useAnalytics();
  const demo = import.meta.env.DEV && Boolean(isDemo);
  const key = demo ? `demo:${demoScenario}` : 'live';

  const fetcher = useMemo(() => {
    if (import.meta.env.DEV && demo) {
      return async (signal, nowMs) => {
        const demoData = await import('../dev/demoData.js');
        return demoData.makeDemoApi(nowMs, { scenario: demoScenario }).liveNow;
      };
    }
    return (signal) => client.get(ROUTES.liveNow, undefined, { signal });
  }, [client, demo, demoScenario]);

  useEffect(() => {
    if (!enabled) return undefined;
    const keyChanged = store.key !== key && store.users > 0;
    if (store.key !== key) {
      if (store.users > 0) stopPolling();
      store.key = key;
      store.snapshot = EMPTY_SNAPSHOT;
      emit();
    }
    store.fetcher = fetcher;
    store.onAuthError = onAuthError;
    store.users += 1;
    // A new key stops the old poll (above); restart it here even when other components already use it.
    if (store.users === 1 || keyChanged) startPolling();
    return () => {
      store.users -= 1;
      if (store.users === 0) stopPolling();
    };
  }, [enabled, key, fetcher, onAuthError]);

  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot, () => EMPTY_SNAPSHOT);
  const current = store.key === key ? snapshot : EMPTY_SNAPSHOT;
  const derived = deriveToday(current.data, dataset);
  const refresh = useCallback(() => readLive(), []);

  let status = 'loading';
  if (current.data) status = 'ready';
  else if (current.error) status = 'error';

  return {
    data: current.data,
    today: derived.today,
    alerts: derived.alerts,
    status,
    error: current.error,
    isStale: current.isStale,
    updatedAt: current.updatedAt,
    refresh,
  };
}

export default useLive;
