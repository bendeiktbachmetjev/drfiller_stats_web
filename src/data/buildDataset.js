// RawBundle → Dataset (FROZEN CONTRACT 2, §5.3.7). Built once per load; every page computes from it.
import { fxOf } from './pricing/fx.js';
import { normalizeConfig } from './normalize/config.js';
import { normalizeCostsMonthly } from './normalize/costsMonthly.js';
import { normalizeDoctors } from './normalize/doctors.js';
import { normalizeRevenue } from './normalize/revenue.js';
import { normalizeSettings } from './normalize/settings.js';
import { normalizeSoniox } from './normalize/soniox.js';
import { loggingSince, normalizeUsageRows } from './normalize/usage.js';

/**
 * @typedef {'usage'|'doctors'|'config'|'revenue'|'soniox'|'costs'|'settings'} SourceName
 * @typedef {{ status: 'ok'|'off'|'error'|'limited'|'test', fetchedAt: number|null, cacheAgeMs: number|null, code?: string }} SourceState
 * @typedef {import('./normalize/usage.js').UsageRow} UsageRow
 * @typedef {import('./normalize/doctors.js').Doctor} Doctor
 * @typedef {import('./normalize/revenue.js').Payment} Payment
 * @typedef {import('./normalize/revenue.js').Adjustment} Adjustment
 * @typedef {{ schemaVersion?: number, meta: object, verdict?: string, highlights?: string[], availability: object[], combos: object[] }} SlimBenchmark
 * @typedef {{
 *   id: string, nowMs: number, firstActivityMs: number|null, lastActivityMs: number|null,
 *   settings: import('./api/contract.js').Settings, config: import('./api/contract.js').ConfigApi|null,
 *   prices: import('./api/contract.js').PriceSnapshot, pricesOrigin: 'server'|'static',
 *   fx: { usdPerEur: number, rateDate: string },
 *   rows: UsageRow[], forms: UsageRow[], dictations: UsageRow[], lives: UsageRow[], anamnesis: UsageRow[], meter: UsageRow[], failures: UsageRow[],
 *   doctors: Map<string, Doctor>, doctorList: Doctor[],
 *   payments: Payment[], adjustments: Adjustment[], revenueMode: 'live'|'test'|null,
 *   revenue: { status: string, webhook: object|null, ignoredSessions: number, reason: string|null },
 *   soniox: import('./api/contract.js').SonioxApi|null, costsMonthly: import('./api/contract.js').MonthCost[], benchmark: SlimBenchmark,
 *   emailMode: 'off'|'click'|'list',
 *   v2LoggingSince: { forms: number|null, dictation: number|null, events: number|null },
 *   sources: Record<SourceName, SourceState>,
 *   quality: import('./normalize/usage.js').Quality
 * }} Dataset
 * @typedef {{
 *   usage: import('./api/contract.js').UsageRowApi[] | { rows: import('./api/contract.js').UsageRowApi[] } | null,
 *   doctors: object|null, config: object|null, revenue: object|null, soniox: object|null, costsMonthly: object|null,
 *   settings: object|null, sources: Record<SourceName, SourceState>
 * }} RawBundle
 */

let sequence = 0;

const emptySources = () =>
  Object.fromEntries(['usage', 'doctors', 'config', 'revenue', 'soniox', 'costs', 'settings'].map((name) => [name, { status: 'error', fetchedAt: null, cacheAgeMs: null }]));

const freezeList = (list) => Object.freeze(list);

/**
 * Normalizes everything once. Frozen; `prices` = config.prices ?? staticPrices.
 * @param {RawBundle} raw
 * @param {{ nowMs: number, staticPrices: import('./api/contract.js').PriceSnapshot, benchmark: SlimBenchmark }} options
 * @returns {Dataset}
 */
export function buildDataset(raw, { nowMs, staticPrices, benchmark }) {
  const { config } = normalizeConfig(raw?.config ?? null);
  const prices = config?.prices ?? staticPrices;
  const fx = fxOf(prices);
  const settings = normalizeSettings(raw?.settings ?? null);

  const apiRows = Array.isArray(raw?.usage) ? raw.usage : raw?.usage?.rows ?? [];
  const { rows, quality } = normalizeUsageRows(apiRows, { config, prices, fx });

  const revenue = normalizeRevenue(raw?.revenue ?? null);
  const { doctors, doctorList } = normalizeDoctors(raw?.doctors ?? null, {
    payments: revenue.revenueMode === 'live' ? revenue.payments : [],
    stripeLive: revenue.status === 'ok' && revenue.revenueMode === 'live',
    rows,
  });

  const byKind = (kind) => freezeList(rows.filter((row) => row.kind === kind));
  const sources = { ...emptySources(), ...(raw?.sources ?? {}) };
  if (revenue.status === 'test') sources.revenue = { ...sources.revenue, status: 'test' };

  sequence += 1;
  return Object.freeze({
    id: `ds${sequence}-${nowMs}-${rows.length}`,
    nowMs,
    firstActivityMs: rows.length ? rows[0].t : null,
    lastActivityMs: rows.length ? rows[rows.length - 1].t : null,
    settings,
    config,
    prices,
    pricesOrigin: config?.prices ? 'server' : 'static',
    fx,
    rows: freezeList(rows),
    forms: byKind('form'),
    dictations: byKind('dictation'),
    lives: byKind('live'),
    anamnesis: byKind('anamnesis'),
    meter: byKind('meter'),
    failures: byKind('failure'),
    doctors,
    doctorList: freezeList(doctorList),
    payments: freezeList(revenue.payments),
    adjustments: freezeList(revenue.adjustments),
    revenueMode: revenue.revenueMode,
    revenue: Object.freeze({ status: revenue.status, webhook: revenue.webhook, ignoredSessions: revenue.ignoredSessions, reason: revenue.reason }),
    soniox: normalizeSoniox(raw?.soniox ?? null),
    costsMonthly: freezeList(normalizeCostsMonthly(raw?.costsMonthly ?? null)),
    benchmark: benchmark ?? { meta: {}, availability: [], combos: [] },
    emailMode: raw?.doctors?.emailMode ?? 'off',
    v2LoggingSince: loggingSince(rows, apiRows),
    sources: Object.freeze(sources),
    quality: Object.freeze(quality),
  });
}
