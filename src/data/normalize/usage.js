// UsageRowApi[] → UsageRow[] (FROZEN CONTRACT 2, §5.3.7): Vilnius keys, kind, provider, role, eras,
// tokens, audio seconds, list-price cost and credits. Pure; used for /usage and for /live-now todayRows.
import { ERROR_KIND_GROUP } from '../constants.js';
import { billingEraAt, effectiveModelEraAt, roleOf, STATS_ORIGIN_MS, transcriptionEraAt } from '../eras.js';
import { dayKeyOf, hourOf, isoWeekdayOf, monthKeyOf, weekKeyOf } from '../period.js';
import { rowCost } from '../pricing/rowCost.js';
import { canonicalTranscriptionModel, transcriptionModelKind } from '../pricing/transcription.js';

/**
 * @typedef {{
 *   key: string, t: number, dayKey: string, weekKey: string, monthKey: string, hour: number, isoWeekday: number,
 *   action: string, kind: 'form'|'dictation'|'live'|'anamnesis'|'meter'|'failure'|'other', pid: string,
 *   model: string|null, provider: 'gemini'|'soniox'|'openai'|null, endpoint: 'direct'|'vertex'|null, location: string|null,
 *   role: 'main'|'fallback'|'switch'|null, fallbackReason: string|null, modelEra: string, eraStandard: boolean,
 *   billingEra: 'per-visit'|'audio-meter',
 *   inTok: number, outTok: number, thinkTok: number|null, cachedTok: number|null,
 *   durMs: number|null, chars: number|null, convChars: number|null, histChars: number|null,
 *   audioSec: number|null, audioBasis: 'provider'|'client'|'wav_header'|'bytes_estimate'|null,
 *   costUsd: number, costEur: number, costBasis: 'stored'|'computed'|'estimated'|'none',
 *   credits: number|null, creditsBasis: 'stored'|'rule'|'none',
 *   live?: { sessionRef: string|null, speakers: number|null, reconnects: number|null },
 *   anamnesis?: { step: 'summary'|'extract'|'narrative', docs: number|null, pages: number|null, tier: string|null, finishReason: string|null, facts: number|null },
 *   meterEvent?: { source: string, addedMs: number, chargedCredits: number, bankMsAfter: number|null },
 *   failure?: { feature: string, errorKind: string, group: 'service'|'refusal', httpStatus: number|null, refunded: boolean }
 * }} UsageRow
 * @typedef {{ droppedBeforeOrigin: number, duplicateIds: number, unknownModels: string[], openaiRowsNoLength: number,
 *   derivedThinkingRows: number, zeroByteDictations: number }} Quality
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Vilnius offsets are whole hours and DST switches on the hour, so every calendar key is constant within
// one UTC hour: the keys are computed once per hour (≈ 5k hours of history instead of ≈ 100k rows).
const HOUR_MS = 3600000;
const timeKeyCache = new Map();
const timeKeysOf = (t) => {
  const hour = Math.floor(t / HOUR_MS);
  let keys = timeKeyCache.get(hour);
  if (!keys) {
    const ms = hour * HOUR_MS;
    keys = { dayKey: dayKeyOf(ms), weekKey: weekKeyOf(ms), monthKey: monthKeyOf(ms), hour: hourOf(ms), isoWeekday: isoWeekdayOf(ms) };
    if (timeKeyCache.size > 50000) timeKeyCache.clear();
    timeKeyCache.set(hour, keys);
  }
  return keys;
};

/** @param {string} action @param {string|undefined} mode */
export function kindOf(action, mode) {
  if (action === 'ai_processing') return 'form';
  if (action === 'transcription') return mode === 'live' ? 'live' : 'dictation';
  if (typeof action === 'string' && action.startsWith('anamnesis_')) return 'anamnesis';
  if (action === 'audio_meter') return 'meter';
  if (action === 'request_failed') return 'failure';
  return 'other';
}

const providerOf = (kind, model, rowProvider) => {
  if (kind === 'form' || kind === 'anamnesis') return 'gemini';
  if (kind === 'live') return 'soniox';
  if (kind !== 'dictation') return null;
  if (rowProvider === 'soniox' || rowProvider === 'openai') return rowProvider;
  const modelKind = transcriptionModelKind(model);
  if (modelKind === 'async' || modelKind === 'rt') return 'soniox';
  if (modelKind === 'openai') return 'openai';
  return null;
};

// OpenAI legacy rows carry only the file size: 16 kHz mono 16-bit WAV = 32,000 bytes per second.
const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SEC = 32000;

const audioOf = (api, kind, provider) => {
  if (kind !== 'dictation' && kind !== 'live') return { audioSec: null, audioBasis: null };
  if (num(api.audioMs) !== null) {
    const source = api.audioMsSource;
    const audioBasis = source === 'size_estimate' ? 'bytes_estimate' : source === 'wav_header' ? 'wav_header' : 'provider';
    return { audioSec: api.audioMs / 1000, audioBasis };
  }
  if (num(api.audioSec) !== null) return { audioSec: api.audioSec, audioBasis: kind === 'live' || provider === 'openai' ? 'client' : 'provider' };
  if (num(api.audioBytes) !== null) {
    return { audioSec: Math.max(0, api.audioBytes - WAV_HEADER_BYTES) / WAV_BYTES_PER_SEC, audioBasis: 'bytes_estimate' };
  }
  return { audioSec: null, audioBasis: null };
};

/**
 * Normalizes API rows. Rows before the origin and duplicate ids are dropped and counted.
 * @param {import('../api/contract.js').UsageRowApi[]} apiRows
 * @param {{ config: import('../api/contract.js').ConfigApi|null, prices: object, fx: { usdPerEur: number } }} context
 * @returns {{ rows: UsageRow[], quality: Quality }}
 */
export function normalizeUsageRows(apiRows, { config = null, prices, fx }) {
  const quality = { droppedBeforeOrigin: 0, duplicateIds: 0, unknownModels: [], openaiRowsNoLength: 0, derivedThinkingRows: 0, zeroByteDictations: 0 };
  const unknown = new Set();
  const seen = new Set();
  const rows = [];

  (Array.isArray(apiRows) ? apiRows : []).forEach((api) => {
    if (!api || !Number.isFinite(api.t)) return;
    if (api.t < STATS_ORIGIN_MS) {
      quality.droppedBeforeOrigin += 1;
      return;
    }
    if (seen.has(api.id)) {
      quality.duplicateIds += 1;
      return;
    }
    seen.add(api.id);

    const kind = kindOf(api.action, api.mode);
    const era = effectiveModelEraAt(api.t, config);
    let model = typeof api.model === 'string' && api.model ? api.model : null;
    if (!model && kind === 'dictation') model = transcriptionEraAt(api.t)?.main ?? null;
    if (!model && kind === 'live') model = config?.live?.rtModel ?? 'soniox-rt:stt-rt-v5';
    if (kind === 'dictation' || kind === 'live') model = canonicalTranscriptionModel(model);
    const provider = providerOf(kind, model, api.provider);

    let endpoint = null;
    let location = null;
    if (kind === 'form') {
      endpoint = api.endpoint ?? era?.endpoint ?? 'direct';
      location = api.endpoint ? api.location ?? null : era?.location ?? null;
    } else if (kind === 'anamnesis') {
      endpoint = 'vertex';
      location = config?.anamnesis?.vertexLocation ?? 'global';
    }

    const { audioSec, audioBasis } = audioOf(api, kind, provider);
    // "No length" = no measured length: the file-size estimate fills audioSec, but it is not a measurement.
    if (kind === 'dictation' && provider === 'openai' && (audioSec === null || audioBasis === 'bytes_estimate')) quality.openaiRowsNoLength += 1;
    if (kind === 'dictation' && api.audioBytes === 0 && num(api.audioMs) === null && num(api.audioSec) === null) quality.zeroByteDictations += 1;

    const thinkTok = num(api.thinkTok);
    // Old rows get thinkTok = total − prompt − completion; only a non-zero rest is a worked-out value.
    if (kind === 'form' && thinkTok > 0 && api.priceKnown === undefined) quality.derivedThinkingRows += 1;

    const row = {
      key: api.id,
      t: api.t,
      ...timeKeysOf(api.t),
      action: api.action,
      kind,
      pid: api.pid,
      model,
      provider,
      endpoint,
      location,
      role: null,
      fallbackReason: api.fallbackReason ?? null,
      modelEra: era?.id ?? 'e1',
      eraStandard: Boolean(era?.standard),
      billingEra: billingEraAt(api.t)?.rule ?? 'per-visit',
      inTok: num(api.inTok) ?? 0,
      outTok: num(api.outTok) ?? num(api.visTok) ?? 0,
      thinkTok,
      cachedTok: num(api.cachedTok),
      durMs: num(api.durMs),
      chars: num(api.chars),
      convChars: num(api.convChars),
      histChars: num(api.histChars),
      audioSec,
      audioBasis,
      costUsd: 0,
      costEur: 0,
      costBasis: 'none',
      credits: null,
      creditsBasis: 'none',
    };
    row.role = roleOf({ t: api.t, kind, model, fallbackUsed: api.fallbackUsed }, { config });

    const cost = rowCost({ ...row, storedCostUsd: kind === 'anamnesis' ? num(api.costUsd) : null }, prices, fx);
    row.costUsd = cost.costUsd;
    row.costEur = cost.costEur;
    row.costBasis = cost.costBasis;
    if (!cost.priceKnown && model && (kind === 'form' || kind === 'anamnesis')) unknown.add(model);

    if (kind === 'form') {
      row.credits = 1;
      row.creditsBasis = 'rule';
    } else if (kind === 'anamnesis' && num(api.credits) !== null) {
      row.credits = api.credits;
      row.creditsBasis = 'stored';
    } else if (kind === 'meter' && num(api.chargedCredits) !== null) {
      row.credits = api.chargedCredits;
      row.creditsBasis = 'stored';
    }

    if (kind === 'live') row.live = { sessionRef: api.sessionRef ?? null, speakers: num(api.speakers), reconnects: num(api.reconnects) };
    if (kind === 'anamnesis') {
      row.anamnesis = {
        step: api.action.slice('anamnesis_'.length),
        docs: num(api.docs),
        pages: num(api.pages),
        tier: api.tier ?? null,
        finishReason: api.finishReason ?? null,
        facts: num(api.facts),
      };
    }
    if (kind === 'meter') {
      row.meterEvent = { source: api.source ?? 'dictation', addedMs: num(api.addedMs) ?? 0, chargedCredits: num(api.chargedCredits) ?? 0, bankMsAfter: num(api.bankMsAfter) };
    }
    if (kind === 'failure') {
      const errorKind = api.errorKind ?? 'internal';
      row.failure = {
        feature: api.feature ?? 'process',
        errorKind,
        group: ERROR_KIND_GROUP[errorKind] ?? 'service',
        httpStatus: num(api.httpStatus),
        refunded: Boolean(api.refunded),
      };
    }
    rows.push(row);
  });

  rows.sort((a, b) => a.t - b.t);
  quality.unknownModels = [...unknown].sort();
  return { rows, quality };
}

/**
 * First instants of B2 logging (the "not recorded yet" footnote and credit rules).
 * @param {UsageRow[]} rows
 * @param {import('../api/contract.js').UsageRowApi[]} apiRows
 * @returns {{ forms: number|null, dictation: number|null, events: number|null }}
 */
export function loggingSince(rows, apiRows = []) {
  let forms = null;
  let dictation = null;
  (apiRows ?? []).forEach((api) => {
    if (api.action === 'ai_processing' && typeof api.fallbackUsed === 'boolean' && (forms === null || api.t < forms)) forms = api.t;
    if (api.action === 'transcription' && api.mode !== 'live' && typeof api.provider === 'string' && (dictation === null || api.t < dictation)) dictation = api.t;
  });
  const firstEvent = (rows ?? []).find((row) => row.kind === 'meter' || row.kind === 'failure');
  return { forms, dictation, events: firstEvent ? firstEvent.t : null };
}
