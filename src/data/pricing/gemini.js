// Gemini list prices from a price snapshot — the same rules as backend services/analytics/prices.js.
// Pure; `prices` is `config.prices` (server) or the static snapshot.

const DEFAULT_UNKNOWN = 'gemini-3.5-flash';

/** UTC day of an instant (the backend prices by UTC day). */
const isoDay = (at) => {
  const d = at instanceof Date ? at : new Date(at == null || at === '' ? 0 : at);
  return Number.isNaN(d.getTime()) ? '1970-01-01' : d.toISOString().slice(0, 10);
};

/** Exact key first, then the longest key the name starts with (dated snapshots). */
export function lookup(table, rawName) {
  const name = String(rawName || '').trim().replace(/^models\//, '');
  if (table && Object.hasOwn(table, name)) return { key: name, entry: table[name] };
  const key = Object.keys(table || {})
    .filter((k) => name.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { key, entry: table[key] } : { key: null, entry: null };
}

const periodAt = (periods, day) =>
  periods.find((p) => (!p.validFrom || day >= p.validFrom) && (!p.validTo || day <= p.validTo)) || periods[periods.length - 1];

/**
 * USD per 1M tokens. The ×1.10 non-global factor applies only on Vertex, off `global`, for non-preview
 * models without the 2.5 exemption, from 2026-07-01.
 * @param {object} prices snapshot
 * @param {string} model
 * @param {{ at?: number|string|Date, platform?: 'direct'|'vertex', endpoint?: string, tier?: string }} [opts]
 * @returns {{ model: string, known: boolean, status: string, inputPerM: number, audioInputPerM: number, outputPerM: number,
 *   cachedInputPerM: number, regional: boolean }}
 */
export function geminiPrice(prices, model, opts = {}) {
  const table = prices?.GEMINI ?? {};
  const { key, entry } = lookup(table, model);
  const e = entry || table[prices?.GEMINI_UNKNOWN ?? DEFAULT_UNKNOWN];
  // Without a date the price table's own check date is "today" (the backend uses the clock).
  const day = opts.at == null || opts.at === '' ? prices?.CHECKED_AT ?? isoDay(0) : isoDay(opts.at);
  const p = periodAt(e.periods, day);
  const factors = prices?.GEMINI_TIERS?.factors ?? prices?.GEMINI_TIERS ?? {};
  const tier = (opts.tier && factors[opts.tier]) || 1;
  const vertex = prices?.VERTEX ?? { nonGlobalFactor: 1.1, nonGlobalFrom: '2026-07-01' };
  const regional =
    opts.platform === 'vertex' &&
    Boolean(opts.endpoint) &&
    opts.endpoint !== 'global' &&
    e.status !== 'preview' &&
    !e.noVertexRegionalSurcharge &&
    day >= vertex.nonGlobalFrom;
  const f = tier * (regional ? vertex.nonGlobalFactor : 1);
  const r = (n) => Math.round(n * f * 1e6) / 1e6;
  return {
    model: key || String(model || ''),
    known: Boolean(entry),
    status: e.status,
    inputPerM: r(p.input),
    audioInputPerM: r(p.audioInput),
    outputPerM: r(p.output),
    cachedInputPerM: r(p.cachedInput),
    regional,
  };
}

/**
 * Cost of one Gemini call in USD. `outputTokens` must already include thinking. The dashboard never
 * passes cachedTokens (list price, D19); the parameter exists for the Costs page's saving estimate.
 * @param {object} prices
 * @param {string} model
 * @param {{ inputTokens?: number, outputTokens?: number, cachedTokens?: number }} usage
 * @param {{ at?: number, platform?: 'direct'|'vertex', endpoint?: string }} [opts]
 * @returns {{ usd: number, known: boolean, price: ReturnType<typeof geminiPrice> }}
 */
export function geminiCostUsd(prices, model, usage = {}, opts = {}) {
  const pr = geminiPrice(prices, model, opts);
  const cached = Math.max(0, Number(usage.cachedTokens) || 0);
  const input = Math.max(0, (Number(usage.inputTokens) || 0) - cached);
  const output = Math.max(0, Number(usage.outputTokens) || 0);
  const usd = (input * pr.inputPerM + cached * pr.cachedInputPerM + output * pr.outputPerM) / 1e6;
  return { usd: Math.round(usd * 1e8) / 1e8, known: pr.known, price: pr };
}

/**
 * Hard shutdown date of a model on a platform, or null (only hard dates count; "not before" does not).
 * @param {object} prices
 * @param {string} model
 * @param {'direct'|'vertex'} platform
 * @returns {string|null} 'YYYY-MM-DD'
 */
export function shutdownDate(prices, model, platform = 'direct') {
  const { entry } = lookup(prices?.GEMINI ?? {}, model);
  if (!entry) return null;
  return platform === 'vertex' ? entry.vertexShutdown ?? null : entry.shutdownDirect ?? null;
}
