// D17: unit prices for every plan number and for the Prices page come from the forms of the CURRENT
// model setup, last 30 days, all traffic, without conversation text.
import { currentModelEra } from '../eras.js';

const DAY_MS = 86400000;

/**
 * Forms of the current model setup: kind 'form', t in the last `days`, standard era, role main or
 * fallback, model ∈ {config main, config fallback}, endpoint = config endpoint, no conversation text.
 * Without /config the static last era is used.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {number} [nowMs] defaults to ds.nowMs
 * @param {{ days?: number }} [options]
 * @returns {import('../buildDataset.js').UsageRow[]}
 */
export function currentSetupForms(ds, nowMs = ds?.nowMs, { days = 30 } = {}) {
  const era = currentModelEra();
  const gemini = ds?.config?.gemini ?? null;
  const main = gemini?.main ?? era.main;
  const fallback = gemini ? gemini.fallback : era.fallback;
  const endpoint = gemini?.endpoint ?? era.endpoint;
  const models = new Set([main, fallback].filter(Boolean));
  const since = nowMs - days * DAY_MS;
  return (ds?.forms ?? []).filter(
    (row) =>
      row.t >= since &&
      row.t <= nowMs &&
      row.eraStandard &&
      (row.role === 'main' || row.role === 'fallback') &&
      models.has(row.model) &&
      row.endpoint === endpoint &&
      !(row.convChars > 0),
  );
}
