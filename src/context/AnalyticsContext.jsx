// Data for the whole site (SimuFlow pattern): everything is loaded ONCE per session, turned into one
// frozen Dataset, and every period and scope is computed in memory. Changing the period never touches
// the network. FROZEN CONTRACT (hooks, §5.3.9): useMetric, useAnalytics, usePeriod, useScope.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConfigProvider, useAdminCore } from './AdminContext.jsx';
import useIsPhone from './useIsPhone.js';
import { METRIC_MEMO_LIMIT, PHONE_MAX_BUCKETS, STALE_MS, STORAGE, TIMEZONE } from '../data/constants.js';
import { DataError, toDataError } from '../data/errors.js';
import { loadAll, reloadSource } from '../data/load.js';
import { buildDataset } from '../data/buildDataset.js';
import {
  DEFAULT_PRESET, PRESET_IDS, SHIFTABLE_PRESETS, addDays, canShiftPeriod, compareCaveat, previousPeriod, resolvePeriod,
} from '../data/period.js';
import { comparable, makeDelta } from '../data/metrics/shared.js';
import { COMPUTE } from '../data/metrics/index.js';
import { internalCount as countInternal, makeScope, scopeKey } from '../data/core/scope.js';
import { plural, setLang, t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import staticPrices from '../data/static/prices-2026-09-23.json' with { type: 'json' };
import benchmark from '../data/static/benchmark-2026-09-23.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Module-level cache: survives page switches and provider remounts.
// ---------------------------------------------------------------------------

let cache = null; // { cacheKey, raw, dataset, loadedAt }
let inflight = null; // { cacheKey, promise, controller }
let generation = 0; // bumped by resetAnalyticsCache so a late result of an old load is dropped

const metricMemo = new Map();
let memoDataset = null;

/** Forget everything loaded (sign out, key change). */
export function resetAnalyticsCache() {
  generation += 1;
  cache = null;
  if (inflight) {
    inflight.controller.abort();
    inflight = null;
  }
  metricMemo.clear();
  memoDataset = null;
}

/** Builds the dataset and switches the copy language to its settings before any render uses it. */
const build = (raw, nowMs) => {
  const dataset = buildDataset(raw, { nowMs, staticPrices, benchmark });
  if (dataset.settings?.lang) setLang(dataset.settings.lang);
  return dataset;
};

// Counts local rebuilds (a saved setting or invoice). A load that started before a rebuild keeps the
// newer settings and invoices instead of putting the old ones back on screen.
let rebuilds = 0;
const keepNewerEdits = (raw, since) => {
  if (rebuilds === since || !cache) return raw;
  const sources = { ...raw.sources };
  ['settings', 'costs'].forEach((name) => {
    if (cache.raw.sources?.[name]) sources[name] = cache.raw.sources[name];
  });
  return { ...raw, settings: cache.raw.settings, costsMonthly: cache.raw.costsMonthly, sources };
};

async function fetchRaw({ client, demoScenario, signal }) {
  const nowMs = Date.now();
  if (import.meta.env.DEV && demoScenario) {
    const demoData = await import('../dev/demoData.js');
    return { raw: await loadAll({ demo: demoData.makeDemoApi(nowMs, { scenario: demoScenario }), nowMs }), nowMs };
  }
  return { raw: await loadAll({ client, signal, nowMs }), nowMs };
}

// One load at a time per cache key: a second caller (StrictMode, a refresh click) gets the running promise.
function startLoad(cacheKey, params) {
  if (inflight && inflight.cacheKey === cacheKey) return inflight.promise;
  if (inflight) inflight.controller.abort();

  const controller = new AbortController();
  const startedIn = generation;
  const rebuildsAtStart = rebuilds;
  const promise = fetchRaw({ ...params, signal: controller.signal })
    .then(({ raw: fetched, nowMs }) => {
      if (startedIn !== generation || controller.signal.aborted) throw new DataError('ABORTED');
      const raw = cache?.cacheKey === cacheKey ? keepNewerEdits(fetched, rebuildsAtStart) : fetched;
      cache = { cacheKey, raw, dataset: build(raw, nowMs), loadedAt: nowMs };
      return cache;
    })
    .finally(() => {
      if (inflight && inflight.controller === controller) inflight = null;
    });

  inflight = { cacheKey, promise, controller };
  return promise;
}

const EMPTY_FLAGS = { isRefetching: false, isStale: false };

const stateFor = (cacheKey) =>
  cache && cache.cacheKey === cacheKey
    ? { key: cacheKey, status: 'ready', dataset: cache.dataset, error: null, lastUpdated: cache.loadedAt, ...EMPTY_FLAGS }
    : { key: cacheKey, status: 'loading', dataset: null, error: null, lastUpdated: null, ...EMPTY_FLAGS };

// ---------------------------------------------------------------------------
// Stored choices (period, scope switch)
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PERIOD_STATE = { preset: DEFAULT_PRESET, offset: 0 };
const MIN_OFFSET = -240;

const isValidRange = (from, to) =>
  typeof from === 'string' && typeof to === 'string' && DATE_RE.test(from) && DATE_RE.test(to) && from <= to;

function readStoredPeriod() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE.period));
    if (!stored || !PRESET_IDS.includes(stored.preset)) return DEFAULT_PERIOD_STATE;
    if (stored.preset === 'custom') {
      return isValidRange(stored.from, stored.to) ? { preset: 'custom', from: stored.from, to: stored.to } : DEFAULT_PERIOD_STATE;
    }
    const offset = Number.isInteger(stored.offset) ? Math.min(0, Math.max(MIN_OFFSET, stored.offset)) : 0;
    return { preset: stored.preset, offset };
  } catch {
    return DEFAULT_PERIOD_STATE;
  }
}

const writeStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
};

function readExcludeInternal() {
  try {
    const stored = window.localStorage.getItem(STORAGE.excludeInternal);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

// Wall-clock offset of a zone at an instant, in minutes east of UTC.
function zoneOffsetMin(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

// A zone that keeps Vilnius's clock (Riga, Helsinki…) is harmless; the note appears only when clocks differ.
function detectTzWarning() {
  try {
    if (new Intl.DateTimeFormat().resolvedOptions().timeZone === TIMEZONE) return false;
    const year = new Date().getFullYear();
    return [Date.UTC(year, 0, 15, 12), Date.UTC(year, 6, 15, 12)].some(
      (ms) => zoneOffsetMin(ms, TIMEZONE) !== -new Date(ms).getTimezoneOffset(),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Labels built from structured period fields (the data layer is copy-free)
// ---------------------------------------------------------------------------

/** Text of what a period is compared with: 'the previous 30 days' · '1–23 Aug 2026' · 'August 2026' · '2025'. */
export function compareText(prevPeriod) {
  const spec = prevPeriod?.compare;
  if (!spec) return null;
  switch (spec.kind) {
    case 'prevDays':
      return t(`common.compare.prevDays.${plural(spec.n, ['one', 'other'])}`, { n: fmt.int(spec.n) });
    case 'month':
      return t('common.compare.month', { month: fmt.month(spec.from) });
    case 'year':
      return t('common.compare.year', { year: spec.from.slice(0, 4) });
    default:
      return t(`common.compare.${spec.kind}`, { range: fmt.range(spec.from, spec.to) });
  }
}

/** Label of the selected period: the preset name, 'September 2026', '2026' or the custom dates. */
export function periodLabel(period) {
  if (!period) return '';
  if (period.preset === 'month') return fmt.month(period.from);
  if (period.preset === 'year') return period.from.slice(0, 4);
  if (period.preset === 'custom') return fmt.range(period.from, period.to);
  return t(`common.preset.${period.preset}`);
}

/** The same, short enough for the phone period pill: 'Sep 2026', '2026', '30 days', custom dates. */
export function periodShortLabel(period) {
  if (period?.preset === 'month') return fmt.monthShortYear(period.from);
  return periodLabel(period);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function runMetric(name, dataset, period, scope, opts, optsKey) {
  if (memoDataset !== dataset) {
    metricMemo.clear();
    memoDataset = dataset;
  }
  const key = `${dataset.id}|${period.key}|${period.chart.granularity}|${scopeKey(scope)}|${name}|${optsKey}`;
  if (metricMemo.has(key)) return metricMemo.get(key);
  const value = COMPUTE[name](dataset, period, scope, opts);
  if (metricMemo.size >= METRIC_MEMO_LIMIT) metricMemo.delete(metricMemo.keys().next().value);
  metricMemo.set(key, value);
  return value;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DataContext = createContext(null);
const PeriodContext = createContext(null);
const ScopeContext = createContext(null);

export function AnalyticsProvider({ children }) {
  const { client, isDemo, demoScenario, onAuthError } = useAdminCore();
  const demo = import.meta.env.DEV && Boolean(isDemo);
  const cacheKey = demo ? `demo:${demoScenario}` : 'live';
  const isPhone = useIsPhone();

  const [data, setData] = useState(() => stateFor(cacheKey));
  const [periodState, setPeriodState] = useState(readStoredPeriod);
  const [excludeInternal, setExcludeInternalState] = useState(readExcludeInternal);
  const [mountedAtMs] = useState(() => Date.now());
  const [tzWarning] = useState(detectTzWarning);

  const subscriptionRef = useRef(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadParams = useMemo(() => ({ client, demoScenario: demo ? demoScenario : null }), [client, demo, demoScenario]);

  const follow = useCallback(
    (promise) => {
      const token = {};
      subscriptionRef.current = token;
      return promise.then(
        (entry) => {
          if (subscriptionRef.current !== token) return;
          setData({ key: entry.cacheKey, status: 'ready', dataset: entry.dataset, error: null, lastUpdated: entry.loadedAt, ...EMPTY_FLAGS });
        },
        (err) => {
          if (subscriptionRef.current !== token) return;
          const error = toDataError(err);
          if (error.code === 'AUTH') {
            resetAnalyticsCache();
            onAuthError?.();
            return;
          }
          setData((current) => {
            if (error.code === 'ABORTED') return { ...current, isRefetching: false };
            if (current.dataset) return { ...current, error, isStale: true, isRefetching: false };
            return { ...current, status: 'error', error, isRefetching: false };
          });
        },
      );
    },
    [onAuthError],
  );

  const refresh = useCallback(() => {
    setData((current) => (current.dataset ? { ...current, isRefetching: true } : { ...current, status: 'loading', error: null }));
    return follow(startLoad(cacheKey, loadParams));
  }, [cacheKey, loadParams, follow]);

  /** Refreshes in the background when the data on screen is older than STALE_MS (page switch, tab back). */
  const refreshIfStale = useCallback(() => {
    const current = dataRef.current;
    if (!current.dataset || current.isRefetching || !current.lastUpdated) return false;
    if (Date.now() - current.lastUpdated <= STALE_MS) return false;
    refresh();
    return true;
  }, [refresh]);

  /** Rebuilds the dataset from the cached raw data (after a settings change); no network. */
  const rebuild = useCallback((mutateRaw) => {
    if (!cache) return;
    const raw = typeof mutateRaw === 'function' ? mutateRaw(cache.raw) : cache.raw;
    const nowMs = Date.now();
    rebuilds += 1;
    cache = { ...cache, raw, dataset: build(raw, nowMs) };
    setData((current) => ({ ...current, dataset: cache.dataset }));
  }, []);

  /** Re-reads one optional source (settings or invoices) and rebuilds. Demo: rebuilds with `demoValue`. */
  const refreshSource = useCallback(
    async (source, demoValue) => {
      if (!cache) return;
      if (demo) {
        const key = source === 'settings' ? 'settings' : 'costsMonthly';
        rebuild((raw) => ({ ...raw, [key]: demoValue ?? raw[key] }));
        return;
      }
      const raw = await reloadSource(cache.raw, source, { client, nowMs: Date.now() });
      rebuild(() => raw);
    },
    [demo, client, rebuild],
  );

  useEffect(() => {
    const initial = stateFor(cacheKey);
    setData((current) => (current.key === initial.key && current.status === initial.status ? current : initial));
    const cached = cache && cache.cacheKey === cacheKey;
    if (!cached) follow(startLoad(cacheKey, loadParams));
    else if (Date.now() - cache.loadedAt > STALE_MS) {
      setData((current) => ({ ...current, isRefetching: true }));
      follow(startLoad(cacheKey, loadParams));
    }
    return () => {
      subscriptionRef.current = null;
    };
  }, [cacheKey, loadParams, follow]);

  // Coming back to the tab after a while: refresh quietly in the background.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refreshIfStale]);

  useEffect(() => {
    writeStorage(STORAGE.period, JSON.stringify(periodState));
  }, [periodState]);

  const { dataset } = data;

  // The dataset's own clock keeps periods and buckets consistent with the data.
  const nowMs = dataset?.nowMs ?? mountedAtMs;
  const maxBuckets = isPhone ? PHONE_MAX_BUCKETS : Infinity;

  const period = useMemo(
    () =>
      resolvePeriod(periodState.preset, nowMs, {
        offset: periodState.offset ?? 0,
        custom: periodState.preset === 'custom' ? { from: periodState.from, to: periodState.to } : null,
        maxBuckets,
      }),
    [periodState, nowMs, maxBuckets],
  );

  const prevPeriod = useMemo(() => {
    if (!dataset) return null;
    const previous = previousPeriod(period, { maxBuckets });
    return previous && comparable(dataset, previous) ? previous : null;
  }, [dataset, period, maxBuckets]);

  const canShift = useMemo(() => canShiftPeriod(period, nowMs), [period, nowMs]);

  const setPreset = useCallback(
    (id) => {
      if (!PRESET_IDS.includes(id)) return;
      if (id !== 'custom') {
        setPeriodState({ preset: id, offset: 0 });
        return;
      }
      const endExclusive = period.effTo > period.from ? period.effTo : period.to;
      setPeriodState((current) => (current.preset === 'custom' ? current : { preset: 'custom', from: period.from, to: addDays(endExclusive, -1) }));
    },
    [period],
  );

  const setCustom = useCallback((fromISO, toInclusiveISO) => {
    if (!isValidRange(fromISO, toInclusiveISO)) return false;
    setPeriodState({ preset: 'custom', from: fromISO, to: toInclusiveISO });
    return true;
  }, []);

  const shift = useCallback(
    (direction) => {
      const step = direction < 0 ? -1 : 1;
      if ((step < 0 && !canShift.prev) || (step > 0 && !canShift.next)) return;
      setPeriodState({ preset: period.preset, offset: period.offset + step });
    },
    [canShift, period],
  );

  const setExcludeInternal = useCallback((value) => {
    setExcludeInternalState(Boolean(value));
    writeStorage(STORAGE.excludeInternal, value ? '1' : '0');
  }, []);

  const internalCount = dataset ? countInternal(dataset) : 0;
  const scope = useMemo(() => makeScope({ excludeInternal, settings: dataset?.settings ?? null }), [excludeInternal, dataset]);

  const dataValue = useMemo(
    () => ({
      status: data.status,
      dataset: data.dataset,
      error: data.error,
      isRefetching: data.isRefetching,
      isStale: data.isStale,
      lastUpdated: data.lastUpdated,
      refresh,
      refreshIfStale,
      rebuild,
      refreshSource,
      tzWarning,
    }),
    [data, refresh, refreshIfStale, rebuild, refreshSource, tzWarning],
  );

  const periodValue = useMemo(
    () => ({
      period,
      prevPeriod,
      presets: PRESET_IDS.map((id) => ({ id, label: t(`common.preset.${id}`) })),
      stepper: SHIFTABLE_PRESETS.includes(period.preset),
      label: periodLabel(period),
      shortLabel: periodShortLabel(period),
      setPreset,
      setCustom,
      shift,
      canShift,
      compareLabel: compareText(prevPeriod),
      compareCaveat: compareCaveat(period, prevPeriod),
    }),
    [period, prevPeriod, setPreset, setCustom, shift, canShift],
  );

  const scopeValue = useMemo(() => ({ scope, setExcludeInternal, internalCount }), [scope, setExcludeInternal, internalCount]);

  return (
    <DataContext.Provider value={dataValue}>
      <PeriodContext.Provider value={periodValue}>
        <ScopeContext.Provider value={scopeValue}>
          <AdminConfigProvider value={dataset?.config ?? null}>{children}</AdminConfigProvider>
        </ScopeContext.Provider>
      </PeriodContext.Provider>
    </DataContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks (FROZEN, §5.3.9)
// ---------------------------------------------------------------------------

/** @returns {{ status: 'loading'|'ready'|'error', dataset: object|null, error: DataError|null, isRefetching: boolean, isStale: boolean,
 *   lastUpdated: number|null, refresh: () => Promise<void>, refreshIfStale: () => boolean, rebuild: (mutateRaw?: Function) => void,
 *   refreshSource: (source: 'settings'|'costs', demoValue?: object) => Promise<void>, tzWarning: boolean }} */
export function useAnalytics() {
  const value = useContext(DataContext);
  if (!value) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return value;
}

/** SimuFlow period API + presets: { period, prevPeriod, presets, stepper, label, shortLabel, setPreset, setCustom, shift, canShift,
 *  compareLabel, compareCaveat }. */
export function usePeriod() {
  const value = useContext(PeriodContext);
  if (!value) throw new Error('usePeriod must be used inside AnalyticsProvider');
  return value;
}

/** @returns {{ scope: import('../data/core/scope.js').Scope, setExcludeInternal: (on: boolean) => void, internalCount: number }} */
export function useScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error('useScope must be used inside AnalyticsProvider');
  return value;
}

/**
 * useMetric('<id>', opts) → { data, prev, status, error, isRefetching, isStale, period, prevPeriod, compareLabel,
 *   compareCaveat, scope, sources, delta(pick, kind = 'pct') }.
 * `prev` is the same metric for the comparison window (null when there is nothing to compare with).
 * Memo key: `${ds.id}|${period.key}|${granularity}|${scopeKey(scope)}|${name}|${JSON.stringify(opts)}` (≤ 160 entries).
 */
export function useMetric(name, opts) {
  const { status, dataset, error, isRefetching, isStale } = useAnalytics();
  const { period, prevPeriod, compareLabel, compareCaveat: caveat } = usePeriod();
  const { scope } = useScope();
  const optsKey = opts == null ? '' : JSON.stringify(opts);

  return useMemo(() => {
    if (!COMPUTE[name]) throw new Error(`Unknown metric "${name}"`);
    let data = null;
    let prev = null;
    if (dataset) {
      const stableOpts = optsKey ? JSON.parse(optsKey) : {};
      data = runMetric(name, dataset, period, scope, stableOpts, optsKey);
      prev = prevPeriod ? runMetric(name, dataset, prevPeriod, scope, stableOpts, optsKey) : null;
    }
    const delta = (pick, kind = 'pct') => {
      if (!data) return null;
      return makeDelta(pick(data), prev ? pick(prev) : null, { kind, comparable: Boolean(prev) });
    };
    return {
      data, prev, status, error, isRefetching, isStale, period, prevPeriod, compareLabel, compareCaveat: caveat,
      scope, sources: dataset?.sources ?? null, delta,
    };
  }, [name, optsKey, dataset, period, prevPeriod, compareLabel, caveat, scope, status, error, isRefetching, isStale]);
}

export const useOverview = (opts) => useMetric('overview', opts);
export const useMoney = (opts) => useMetric('money', opts);
export const useCosts = (opts) => useMetric('costs', opts);
export const useRequests = (opts) => useMetric('requests', opts);
export const useRecording = (opts) => useMetric('recording', opts);
export const useModels = (opts) => useMetric('models', opts);
export const usePrices = (opts) => useMetric('prices', opts);
export const useDoctors = (opts) => useMetric('doctors', opts);
export const useSettingsMetric = (opts) => useMetric('settings', opts);
