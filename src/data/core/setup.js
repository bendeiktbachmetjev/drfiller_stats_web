// D17: unit prices for every plan number and for the Prices page come from the forms of the CURRENT
// model setup, last 30 days, all traffic, without conversation text.
import { currentModelEra } from '../eras.js';

const DAY_MS = 86400000;

/**
 * The current setup: `/config` when it arrived, else the static last era.
 * @param {{ config?: object|null }} ds
 * @returns {{ main: string, fallback: string|null, endpoint: 'direct'|'vertex', location: string|null }}
 */
export function currentSetup(ds) {
  const era = currentModelEra();
  const gemini = ds?.config?.gemini ?? null;
  if (!gemini) return { main: era.main, fallback: era.fallback, endpoint: era.endpoint, location: era.location };
  return {
    main: gemini.main ?? era.main,
    fallback: gemini.fallback ?? null,
    endpoint: gemini.endpoint ?? era.endpoint,
    location: gemini.endpoint === 'vertex' ? gemini.vertexLocation ?? null : null,
  };
}

/**
 * Forms of the current model setup: kind 'form', t in the last `days`, standard era, role main or
 * fallback, model ∈ {config main, config fallback}, endpoint = config endpoint and, by default, no
 * conversation text. Without /config the static last era is used.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {number} [nowMs] defaults to ds.nowMs
 * @param {{ days?: number, conversation?: 'without'|'with'|'any' }} [options]
 *   `conversation: 'with'` gives the forms that carry conversation text (the per-minute surcharge, D17)
 * @returns {import('../buildDataset.js').UsageRow[]}
 */
export function currentSetupForms(ds, nowMs = ds?.nowMs, { days = 30, conversation = 'without' } = {}) {
  const setup = currentSetup(ds);
  const models = new Set([setup.main, setup.fallback].filter(Boolean));
  const since = nowMs - days * DAY_MS;
  const keepConversation = (row) => {
    const has = row.convChars > 0;
    if (conversation === 'with') return has;
    if (conversation === 'without') return !has;
    return true;
  };
  return (ds?.forms ?? []).filter(
    (row) =>
      row.t >= since &&
      row.t <= nowMs &&
      row.eraStandard &&
      (row.role === 'main' || row.role === 'fallback') &&
      models.has(row.model) &&
      row.endpoint === setup.endpoint &&
      keepConversation(row),
  );
}
