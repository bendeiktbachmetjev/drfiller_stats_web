// What every person did with Dr. Filler in the period on screen (GET /work-counts): one shared load for the
// Overview card and the Doctors table. The answer is summed over its days, so it cannot come from the dataset:
// it is loaded for the period (period.from … effTo), after the dataset, and kept while the site is open. A
// page switch reuses it; Refresh (a new dataset load) and the stale reload ask again. Only the numbers move,
// never the page: a failed or 413 answer is a state the page words ("—" with a short note).
import { useEffect, useMemo, useState } from 'react';
import { useAdminCore } from './AdminContext.jsx';
import { useAnalytics, usePeriod } from './AnalyticsContext.jsx';
import { toDataError } from '../data/errors.js';
import { loadWorkCounts } from '../data/load.js';
import { workCountsQuery } from '../data/normalize/workCounts.js';

// `${mode}|${from}|${to}` → { counts, loadedAt } (loadedAt = the dataset load it was asked with)
const cache = new Map();
const CACHE_LIMIT = 24;

/** Forget every kept answer (sign out, a new key). */
export function resetWorkCountsCache() {
  cache.clear();
}

const IDLE = Object.freeze({ status: 'idle', counts: null, error: null, key: null });

const keep = (key, value) => {
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
};

/**
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', counts: import('../data/normalize/workCounts.js').WorkCounts|null,
 *   error: import('../data/errors.js').DataError|null, refreshing: boolean }}
 *   idle = nothing to ask yet (the dataset is still loading, or the period has no day that has begun);
 *   a refresh keeps the last numbers of the same period on screen ('ready' + `refreshing`) until the new ones
 *   arrive; a failed refresh keeps them too ('ready' + `error`)
 */
export function useWorkCounts() {
  const { client, isDemo, demoScenario, onAuthError } = useAdminCore();
  const { dataset, lastUpdated } = useAnalytics();
  const { period } = usePeriod();
  const demo = import.meta.env.DEV && Boolean(isDemo);
  // A period that still runs is asked "up to now" (no `to`): the key holds 'now' then
  const query = dataset ? workCountsQuery(period, Date.now()) : null;
  const key = query ? `${demo ? `demo:${demoScenario}` : 'live'}|${query.from}|${query.to ?? 'now'}` : null;
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }
    const hit = cache.get(key);
    if (hit && hit.loadedAt === lastUpdated) {
      setState({ status: 'ready', counts: hit.counts, error: null, key });
      return undefined;
    }
    const controller = new AbortController();
    // The same period's last numbers stay while they reload; another period's never do
    const previous = (current) => hit?.counts ?? (current.key === key ? current.counts : null);
    setState((current) => ({ status: 'loading', counts: previous(current), error: null, key }));

    const run = async () => {
      const nowMs = Date.now();
      if (import.meta.env.DEV && demo) {
        const [demoData, demoCounts] = await Promise.all([import('../dev/demoData.js'), import('../dev/demoWorkCounts.js')]);
        const api = demoData.makeDemoApi(nowMs, { scenario: demoScenario });
        const answer = demoCounts.demoWorkCounts(api, { fromMs: Date.parse(query.from), toMs: query.to ? Date.parse(query.to) : nowMs, open: !query.to, nowMs });
        return loadWorkCounts({ demo: answer, period, nowMs });
      }
      return loadWorkCounts({ client, period, signal: controller.signal, nowMs });
    };

    run().then(
      ({ counts }) => {
        if (controller.signal.aborted) return;
        keep(key, { counts, loadedAt: lastUpdated });
        setState({ status: 'ready', counts, error: null, key });
      },
      (err) => {
        const error = toDataError(err);
        if (controller.signal.aborted || error.code === 'ABORTED') return;
        if (error.code === 'AUTH') {
          onAuthError?.();
          return;
        }
        // A failed reload keeps the numbers already on screen; with none, the page says what went wrong
        setState((current) => {
          const counts = previous(current);
          return counts ? { status: 'ready', counts, error, key } : { status: 'error', counts: null, error, key };
        });
      },
    );
    return () => controller.abort();
    // `query` and `period` follow `key` (the same days give the same query)
  }, [key, lastUpdated, client, demo, demoScenario, onAuthError]); // eslint-disable-line react-hooks/exhaustive-deps

  // What this render shows: a kept answer of this very load at once (a page switch, a period picked again: no "…"
  // in between); else this key's own state; a key that has just changed shows "loading", never another period's numbers
  const kept = key ? cache.get(key) : null;
  const fresh = kept && kept.loadedAt === lastUpdated ? kept.counts : null;
  const current = state.key === key ? state : null;
  let status = key ? 'loading' : 'idle';
  let counts = null;
  let error = null;
  let refreshing = false;
  if (fresh) {
    status = 'ready';
    counts = fresh;
  } else if (current) {
    refreshing = current.status === 'loading' && Boolean(current.counts);
    status = refreshing ? 'ready' : current.status;
    counts = current.counts;
    error = current.error;
  }
  return useMemo(() => ({ status, counts, error, refreshing }), [status, counts, error, refreshing]);
}

export default useWorkCounts;
