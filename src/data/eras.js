// Setup history: which model, transcription service and billing rule worked when (§5.3.8, Appendix C.2).
// Pure lookups; no clock. Times are UTC instants; day-only strings are Vilnius days.

export const STATS_ORIGIN = '2026-03-05'; // Vilnius day; server origin 2026-03-04T22:00Z
export const STATS_ORIGIN_MS = Date.parse('2026-03-04T22:00:00Z');
export const FALLBACK_FEATURE_SINCE = '2026-09-01T06:26Z'; // before this no row can be a fallback
export const SONIOX_SINCE = '2026-09-22T14:00Z';
export const LIVE_SINCE = '2026-09-23T06:55Z'; // first live-card row (tests)
export const METER_SINCE = '2026-09-23T08:23Z';
export const ANAMNESIS_CREDITS_SINCE = '2026-09-05';

export const FALLBACK_FEATURE_SINCE_MS = Date.parse(FALLBACK_FEATURE_SINCE);
export const SONIOX_SINCE_MS = Date.parse(SONIOX_SINCE);
export const LIVE_SINCE_MS = Date.parse(LIVE_SINCE);
export const METER_SINCE_MS = Date.parse(METER_SINCE);
/** Vilnius midnight of 05.09.2026 (UTC+3 in summer). */
export const ANAMNESIS_CREDITS_SINCE_MS = Date.parse('2026-09-04T21:00:00Z');
/** Fallback era start (02.09.2026 Vilnius midnight is 2026-09-01T21:00Z; the era table uses 00:00Z as logged). */
export const FALLBACK_ERA_SINCE_MS = Date.parse('2026-09-02T00:00Z');

const withMs = (era) => Object.freeze({ ...era, fromMs: Date.parse(era.from), toMs: era.to ? Date.parse(era.to) : null });

/**
 * @typedef {{ id: string, from: string, to: string|null, fromMs: number, toMs: number|null,
 *   main: string, fallback: string|null, endpoint: 'direct'|'vertex', location: string|null,
 *   standard: boolean, note?: string, primaryTimeoutMs?: number }} ModelEra
 */

/** @type {ReadonlyArray<ModelEra>} */
export const MODEL_ERAS = Object.freeze(
  [
    { id: 'e1', from: '2026-03-04T22:00Z', to: '2026-08-26T16:15Z', main: 'gemini-3-flash-preview', fallback: null, endpoint: 'direct', location: null, standard: true },
    { id: 'e2', from: '2026-08-26T16:15Z', to: '2026-08-26T16:21Z', main: 'gemini-2.5-flash', fallback: null, endpoint: 'vertex', location: null, standard: false, note: 'test' },
    { id: 'e3', from: '2026-08-26T16:21Z', to: '2026-09-01T05:50Z', main: 'gemini-3.7-flash', fallback: null, endpoint: 'vertex', location: 'eu', standard: false, note: 'vertexEu' },
    { id: 'e4', from: '2026-09-01T05:50Z', to: '2026-09-02T00:00Z', main: 'mixed', fallback: 'gemini-3.5-flash-lite', endpoint: 'direct', location: null, standard: false, note: 'testDay' },
    { id: 'e5', from: '2026-09-02T00:00Z', to: null, main: 'gemini-3-flash-preview', fallback: 'gemini-3.5-flash-lite', endpoint: 'direct', location: null, standard: true, primaryTimeoutMs: 25000 },
  ].map(withMs),
);

export const TRANSCRIPTION_ERAS = Object.freeze(
  [
    { from: '2026-03-04T22:00Z', to: '2026-07-21T15:54Z', main: 'gpt-4o-mini-transcribe-2025-03-20', fallback: null },
    { from: '2026-07-21T15:54Z', to: '2026-09-22T14:00Z', main: 'gpt-4o-mini-transcribe-2025-12-15', fallback: null },
    { from: '2026-09-22T14:00Z', to: null, main: 'soniox:stt-async-v5', fallback: 'gpt-4o-mini-transcribe-2025-12-15' },
  ].map(withMs),
);

export const BILLING_ERAS = Object.freeze(
  [
    { id: 'per-visit', from: '2026-03-02', to: '2026-09-23T08:23Z', rule: 'per-visit', form: 1, dictation: '2nd in a row = 1', live: '2nd in a row = 1 (23.09 morning only)' },
    { id: 'audio-meter', from: '2026-09-23T08:23Z', to: null, rule: 'audio-meter', form: 1, audioMinutesPerCredit: 10 },
  ].map(withMs),
);

const findAt = (list, ms) => {
  if (!Number.isFinite(ms)) return null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (ms >= item.fromMs && (item.toMs === null || ms < item.toMs)) return item;
  }
  return ms < list[0].fromMs ? list[0] : list[list.length - 1];
};

/** @param {number} ms @returns {ModelEra|null} the model era at an instant (the first era for earlier instants). */
export const modelEraAt = (ms) => findAt(MODEL_ERAS, ms);
/** @param {number} ms */
export const billingEraAt = (ms) => findAt(BILLING_ERAS, ms);
/** @param {number} ms */
export const transcriptionEraAt = (ms) => findAt(TRANSCRIPTION_ERAS, ms);

/**
 * The era with the last era's main/fallback/endpoint/location taken from `/config` for rows written
 * after the server started (D21): the first model switch after B2 must not turn new rows into "switch".
 * @param {number} ms
 * @param {object|null} [config] ConfigApi
 * @returns {ModelEra|null}
 */
export function effectiveModelEraAt(ms, config = null) {
  const era = modelEraAt(ms);
  const last = MODEL_ERAS[MODEL_ERAS.length - 1];
  if (!era || era !== last || !config?.gemini || !Number.isFinite(config.serverStartedAt)) return era;
  if (ms < config.serverStartedAt) return era;
  return Object.freeze({
    ...era,
    main: config.gemini.main ?? era.main,
    fallback: config.gemini.fallback ?? null,
    endpoint: config.gemini.endpoint ?? era.endpoint,
    location: config.gemini.endpoint === 'vertex' ? config.gemini.vertexLocation ?? null : null,
  });
}

/**
 * Role of a form row (D21), first match: not a form → null; `fallbackUsed` true/false (B2) decides;
 * era main 'mixed' → switch; model = era main → main; after FALLBACK_FEATURE_SINCE and model = era
 * fallback → fallback; else switch.
 * @param {{ t: number, model?: string|null, action?: string, kind?: string, fallbackUsed?: boolean }} row
 * @param {{ config?: object|null }} [ds]
 * @returns {'main'|'fallback'|'switch'|null}
 */
export function roleOf(row, ds = {}) {
  const isForm = row.kind ? row.kind === 'form' : row.action === 'ai_processing';
  if (!isForm) return null;
  if (row.fallbackUsed === true) return 'fallback';
  if (row.fallbackUsed === false) return 'main';
  const era = effectiveModelEraAt(row.t, ds.config ?? null);
  if (!era || era.main === 'mixed') return 'switch';
  if (row.model === era.main) return 'main';
  if (row.t >= FALLBACK_FEATURE_SINCE_MS && era.fallback && row.model === era.fallback) return 'fallback';
  return 'switch';
}

/** The last (current) model era as the static table knows it. */
export const currentModelEra = () => MODEL_ERAS[MODEL_ERAS.length - 1];
