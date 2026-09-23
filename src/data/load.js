// Loads everything the dataset needs (§5.3.7). Required: /usage + /doctors (all-or-nothing). Optional:
// /config, /revenue, /soniox-usage, /costs-monthly, /settings (each may fail alone → its source is 'error').
import { LIMITED_HISTORY_DAYS } from './constants.js';
import { STATS_ORIGIN_MS } from './eras.js';
import { DataError, isRetryable, toDataError } from './errors.js';
import { ROUTES } from './api/endpoints.js';

const DAY_MS = 86400000;

/**
 * @typedef {{ usage: object, doctors: object, liveNow?: object, revenue: object|null, soniox: object|null,
 *   config: object|null, costsMonthly: object|null, settings: object|null }} DemoApi  (dev/demoData.js#makeDemoApi output)
 */

const withRetry = async (run) => {
  try {
    return await run();
  } catch (error) {
    const err = toDataError(error);
    if (!isRetryable(err)) throw err;
    return run();
  }
};

const sourceOf = (envelope, nowMs, status = 'ok') => ({
  status,
  fetchedAt: envelope?.generatedAt ? Date.parse(envelope.generatedAt) : nowMs,
  cacheAgeMs: envelope?.cache?.ageMs ?? null,
});

const revenueStatus = (data) => {
  if (!data) return 'error';
  if (data.status === 'off') return 'off';
  if (data.status === 'error') return 'error';
  return data.livemode === false ? 'test' : 'ok';
};

const sonioxStatus = (data) => {
  if (!data) return 'error';
  if (data.status === 'partial') return 'limited';
  return data.status === 'ok' ? 'ok' : data.status;
};

/**
 * @param {{ client?: import('./api/client.js').ApiClient, signal?: AbortSignal, demo?: DemoApi|null, nowMs: number }} options
 * @returns {Promise<import('./buildDataset.js').RawBundle>}
 * @throws {DataError} when /usage or /doctors fails (AUTH, API_OFF, NETWORK …) or the load was aborted
 */
export async function loadAll({ client, signal, demo = null, nowMs }) {
  if (demo) {
    const ok = { status: 'ok', fetchedAt: nowMs, cacheAgeMs: 0 };
    return {
      usage: demo.usage,
      doctors: demo.doctors,
      config: demo.config ?? null,
      revenue: demo.revenue ?? null,
      soniox: demo.soniox ?? null,
      costsMonthly: demo.costsMonthly ?? null,
      settings: demo.settings ?? null,
      sources: {
        usage: ok,
        doctors: ok,
        config: demo.config ? ok : { ...ok, status: 'error' },
        revenue: { ...ok, status: revenueStatus(demo.revenue) },
        soniox: { ...ok, status: sonioxStatus(demo.soniox) },
        costs: demo.costsMonthly ? ok : { ...ok, status: 'error' },
        settings: demo.settings ? ok : { ...ok, status: 'error' },
      },
    };
  }
  if (!client) throw new DataError('SERVER', 'No API client.');

  const get = (route, query) => withRetry(() => client.getEnvelope(route, query, { signal }));

  const loadUsage = async () => {
    try {
      const envelope = await get(ROUTES.usage, { from: new Date(STATS_ORIGIN_MS).toISOString() });
      return { envelope, status: 'ok' };
    } catch (error) {
      const err = toDataError(error);
      if (err.code !== 'TOO_MANY_ROWS' && err.code !== 'BAD_RANGE') throw err;
      const envelope = await get(ROUTES.usage, { from: new Date(nowMs - LIMITED_HISTORY_DAYS * DAY_MS).toISOString() });
      return { envelope, status: 'limited' };
    }
  };

  const optional = async (route, query) => {
    try {
      return { envelope: await get(route, query), error: null };
    } catch (error) {
      const err = toDataError(error);
      if (err.code === 'ABORTED' || err.code === 'AUTH') throw err;
      return { envelope: null, error: err };
    }
  };

  const [usage, doctors, config, revenue, soniox, costs, settings] = await Promise.all([
    loadUsage(),
    get(ROUTES.doctors),
    optional(ROUTES.config),
    optional(ROUTES.revenue),
    optional(ROUTES.soniox),
    optional(ROUTES.costsMonthly),
    optional(ROUTES.settings),
  ]);
  if (signal?.aborted) throw new DataError('ABORTED');

  const failed = (result) => ({ status: 'error', fetchedAt: null, cacheAgeMs: null, code: result.error?.code });
  const revenueData = revenue.envelope?.data ?? null;
  const sonioxData = soniox.envelope?.data ?? null;

  return {
    usage: usage.envelope.data,
    doctors: doctors.data,
    config: config.envelope?.data ?? null,
    revenue: revenueData,
    soniox: sonioxData,
    costsMonthly: costs.envelope?.data ?? null,
    settings: settings.envelope?.data ?? null,
    sources: {
      usage: sourceOf(usage.envelope, nowMs, usage.status),
      doctors: sourceOf(doctors, nowMs),
      config: config.envelope ? sourceOf(config.envelope, nowMs) : failed(config),
      revenue: revenue.envelope ? sourceOf(revenue.envelope, nowMs, revenueStatus(revenueData)) : failed(revenue),
      soniox: soniox.envelope ? sourceOf(soniox.envelope, nowMs, sonioxStatus(sonioxData)) : failed(soniox),
      costs: costs.envelope ? sourceOf(costs.envelope, nowMs) : failed(costs),
      settings: settings.envelope ? sourceOf(settings.envelope, nowMs) : failed(settings),
    },
  };
}

/**
 * Reloads one optional source after a PUT (Settings, invoices) without touching the rest.
 * @param {import('./buildDataset.js').RawBundle} raw
 * @param {'settings'|'costs'} source
 * @param {{ client: import('./api/client.js').ApiClient, signal?: AbortSignal, nowMs: number }} options
 * @returns {Promise<import('./buildDataset.js').RawBundle>}
 */
export async function reloadSource(raw, source, { client, signal, nowMs }) {
  const route = source === 'settings' ? ROUTES.settings : ROUTES.costsMonthly;
  const envelope = await withRetry(() => client.getEnvelope(route, undefined, { signal }));
  const key = source === 'settings' ? 'settings' : 'costsMonthly';
  return { ...raw, [key]: envelope.data, sources: { ...raw.sources, [source]: sourceOf(envelope, nowMs) } };
}
