// Models page metric (§4.6): which model answers, how fast, how often the backup model steps in, what
// breaks, when the load comes and which risks lie ahead. Service page: every number counts all traffic
// (§2 rule 3), so the scope switch never changes it. Shared numbers are picked from summarizeHealth()
// and capacity() (§6.3); everything else is page-local and pure.
import { HEALTH, MIN_EVENTS_PER_POINT } from '../constants.js';
import { FALLBACK_FEATURE_SINCE_MS, MODEL_ERAS, modelEraAt } from '../eras.js';
import { dateToMs, dayKeyOf, diffDays } from '../period.js';
import { summarizeHealth } from '../core/health.js';
import { capacity } from '../core/projection.js';
import { currentSetup } from '../core/setup.js';
import { lookup, shutdownDate } from '../pricing/gemini.js';
import { EMPTY_RESULT, makeSeries, median, quantile, rowsIn } from './shared.js';

/** Wait buckets of the "How long doctors waited" chart (§4.6): lower bounds in ms, the last one open. */
export const WAIT_EDGES = Object.freeze([0, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 30000]);
/** The heatmap needs this many forms in the period (§4.6). */
export const HEATMAP_MIN_FORMS = 200;
/** Heatmap columns: Vilnius hours 06–22. */
export const HEATMAP_HOURS = Object.freeze(Array.from({ length: 17 }, (_, i) => i + 6));
/** Long lists (slow answers, backup answers) keep the newest rows only. */
export const LIST_LIMIT = 200;
/** "Latest failures and refusals" (§4.6). */
export const RECENT_FAILURES = 20;
/** The model to keep ready if Google removes the trial-version main model (§4.6 risks). */
export const READY_REPLACEMENT = 'gemini-3.8-flash';

const SLOW = Object.freeze({ bigRequestTok: 20000, longAnswerTok: 1500, slowTokensPerSec: 80, quickErrorMs: 10000 });
const DEFAULT_PRIMARY_TIMEOUT_MS = 25000;

const count = (list, test) => list.reduce((n, item) => (test(item) ? n + 1 : n), 0);
const newestFirst = (a, b) => b.t - a.t;
const byCount = (a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key));

/** The most frequent value of `pick(row)`; ties keep the first seen. */
const mostCommon = (rows, pick) => {
  const counts = new Map();
  rows.forEach((row) => {
    const value = pick(row);
    if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  let best = null;
  counts.forEach((n, value) => {
    if (best === null || n > best.n) best = { value, n };
  });
  return best?.value ?? null;
};

/** 'direct' or 'vertex:<location>' — the page turns it into a friendly place name. */
const whereOf = (endpoint, location) => (endpoint === 'vertex' ? `vertex:${location || 'global'}` : 'direct');
const hasEuServers = (endpoint, location) => endpoint === 'vertex' && Boolean(location) && (location === 'eu' || location.startsWith('europe-'));

const primaryTimeoutOf = (ds) => ds?.config?.gemini?.primaryTimeoutMs ?? MODEL_ERAS[MODEL_ERAS.length - 1].primaryTimeoutMs ?? DEFAULT_PRIMARY_TIMEOUT_MS;

// ---------------------------------------------------------------------------------------------------
// Row rules (pure, exported for the tests)
// ---------------------------------------------------------------------------------------------------

/**
 * Why a slow form was slow (§4.6), first match: the backup model answered (B2 reason, else silent main
 * ≥ 25 s, else a quick error < 10 s) → the setup of a non-standard era → a very big request → a very long
 * answer → a slow model (under 80 tokens a second) → unclear.
 * @param {import('../buildDataset.js').UsageRow} row a form
 * @returns {{ cause: 'fallbackReason'|'fallbackSilent'|'fallbackError'|'era'|'bigRequest'|'longAnswer'|'slowModel'|'unclear',
 *   reason?: string, era?: string, tokensPerSec: number|null }}
 */
export function slowCause(row) {
  const tokensPerSec = Number.isFinite(row.durMs) && row.durMs > 0 ? row.outTok / (row.durMs / 1000) : null;
  if (row.role === 'fallback') {
    if (row.fallbackReason) return { cause: 'fallbackReason', reason: row.fallbackReason, tokensPerSec };
    if (row.durMs >= HEALTH.fallbackWaitMs) return { cause: 'fallbackSilent', tokensPerSec };
    if (row.durMs < SLOW.quickErrorMs) return { cause: 'fallbackError', tokensPerSec };
  }
  // A row whose own (B2) endpoint differs from its era's did not run on that era's setup (D21).
  const era = modelEraAt(row.t);
  if (era && !era.standard && row.endpoint === era.endpoint) return { cause: 'era', era: era.note ?? 'test', tokensPerSec };
  if (row.inTok > SLOW.bigRequestTok) return { cause: 'bigRequest', tokensPerSec };
  if (row.outTok > SLOW.longAnswerTok) return { cause: 'longAnswer', tokensPerSec };
  if (tokensPerSec !== null && tokensPerSec < SLOW.slowTokensPerSec) return { cause: 'slowModel', tokensPerSec };
  return { cause: 'unclear', tokensPerSec };
}

/**
 * Why the backup model answered one form: the B2 reason when logged, else "the main model was silent"
 * when the wait reached the main model's time limit, else "a quick error".
 * @param {import('../buildDataset.js').UsageRow} row a fallback form
 * @param {number} [primaryTimeoutMs]
 * @returns {{ reason: 'b2'|'silent'|'error', kind: string|null }}
 */
export function fallbackReasonOf(row, primaryTimeoutMs = DEFAULT_PRIMARY_TIMEOUT_MS) {
  if (row.fallbackReason) return { reason: 'b2', kind: row.fallbackReason };
  return { reason: row.durMs >= primaryTimeoutMs ? 'silent' : 'error', kind: null };
}

/** What the doctor was doing when a request failed (`request_failed.feature`). */
export const activityOf = (feature) => {
  if (feature === 'process') return 'form';
  if (feature === 'dictation') return 'dictation';
  if (feature === 'live_key') return 'live';
  if (typeof feature === 'string' && feature.startsWith('anamnesis')) return 'anamnesis';
  return 'other';
};

/**
 * Empty text of the backup-answers table: before 01.09.2026 09:26 there was no backup model at all.
 * @param {import('../period.js').Period} period
 * @returns {'models.fallbackEvents.before'|'models.fallbackEvents.empty'}
 */
export const fallbackEmptyKey = (period) =>
  period && period.toMs <= FALLBACK_FEATURE_SINCE_MS ? 'models.fallbackEvents.before' : 'models.fallbackEvents.empty';

// ---------------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------------

function buildSeries(ds, period, forms) {
  const { rows, indexOf } = makeSeries(period, ['forms', 'fallback', 'p50Ms', 'p90Ms', 'serviceFailures', 'refusals']);
  const durations = rows.map(() => []);
  forms.forEach((row) => {
    const i = indexOf(row.t);
    if (i < 0 || rows[i].isFuture) return;
    rows[i].forms += 1;
    if (row.role === 'fallback') rows[i].fallback += 1;
    if (Number.isFinite(row.durMs)) durations[i].push(row.durMs);
  });
  rows.forEach((row, i) => {
    const enough = durations[i].length >= MIN_EVENTS_PER_POINT;
    row.p50Ms = !row.isFuture && enough ? median(durations[i]) : null;
    row.p90Ms = !row.isFuture && enough ? quantile(durations[i], 0.9) : null;
  });

  // Failures are known only from the first event row on: earlier buckets are gaps, not zeros.
  const since = ds.v2LoggingSince?.events ?? null;
  rows.forEach((row) => {
    const known = since !== null && !row.isFuture && dateToMs(row.to) > since;
    row.serviceFailures = known ? 0 : null;
    row.refusals = known ? 0 : null;
  });
  if (since !== null) {
    rowsIn(ds.failures, period).forEach((row) => {
      if (row.t < since) return;
      const i = indexOf(row.t);
      if (i < 0 || rows[i].serviceFailures === null) return;
      if (row.failure.group === 'refusal') rows[i].refusals += 1;
      else rows[i].serviceFailures += 1;
    });
  }
  return rows;
}

function buildWaitHist(forms) {
  const rows = WAIT_EDGES.map((fromMs, i) => ({
    key: `w${i}`,
    fromMs,
    toMs: WAIT_EDGES[i + 1] ?? null,
    count: 0,
    fallback: 0,
    slow: fromMs >= HEALTH.slowMs,
    fallbackBar: fromMs === HEALTH.fallbackWaitMs,
  }));
  forms.forEach((row) => {
    if (!Number.isFinite(row.durMs)) return;
    let i = WAIT_EDGES.length - 1;
    while (i > 0 && row.durMs < WAIT_EDGES[i]) i -= 1;
    rows[i].count += 1;
    if (row.role === 'fallback') rows[i].fallback += 1;
  });
  return rows;
}

function buildSlow(forms) {
  return forms
    .filter((row) => row.durMs > HEALTH.slowMs)
    .sort(newestFirst)
    .slice(0, LIST_LIMIT)
    .map((row) => {
      const { cause, reason = null, era = null, tokensPerSec } = slowCause(row);
      return { key: row.key, t: row.t, pid: row.pid, model: row.model, role: row.role, durMs: row.durMs, inTok: row.inTok, outTok: row.outTok, tokensPerSec, cause, reason, era };
    });
}

function buildFallbackEvents(ds, forms) {
  const timeout = primaryTimeoutOf(ds);
  return forms
    .filter((row) => row.role === 'fallback')
    .sort(newestFirst)
    .slice(0, LIST_LIMIT)
    .map((row) => ({ key: row.key, t: row.t, pid: row.pid, model: row.model, durMs: row.durMs, inTok: row.inTok, costEur: row.costEur, ...fallbackReasonOf(row, timeout) }));
}

function buildEras(ds) {
  return MODEL_ERAS.map((era, i) => {
    const current = i === MODEL_ERAS.length - 1;
    const setup = current ? currentSetup(ds) : era;
    return {
      key: era.id,
      from: era.fromMs,
      to: era.toMs,
      current,
      main: setup.main,
      fallback: setup.fallback ?? null,
      where: whereOf(setup.endpoint, setup.location),
      note: era.note ?? null,
    };
  }).reverse();
}

function buildModelTable(ds, forms) {
  const visits = ds.settings?.planning?.visitsPerDoctorMonth ?? null;
  const groups = new Map();
  forms.forEach((row) => {
    const key = `${row.model}|${row.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()]
    .map(([key, rows]) => {
      const durations = rows.map((row) => row.durMs).filter(Number.isFinite);
      const model = rows[0].model;
      const endpoint = mostCommon(rows, (row) => row.endpoint) ?? 'direct';
      const costPerFormEur = rows.reduce((acc, row) => acc + row.costEur, 0) / rows.length;
      return {
        key,
        model,
        role: rows[0].role,
        where: whereOf(endpoint, mostCommon(rows, (row) => row.location)),
        firstT: rows[0].t,
        lastT: rows[rows.length - 1].t,
        forms: rows.length,
        p50Ms: median(durations),
        p90Ms: quantile(durations, 0.9),
        over15: count(durations, (ms) => ms > HEALTH.slowMs),
        costPerFormEur,
        formsPerDoctorMonthEur: Number.isFinite(visits) ? costPerFormEur * visits : null,
        status: lookup(ds.prices?.GEMINI ?? {}, model).entry?.status ?? null,
        shutdown: shutdownDate(ds.prices, model, endpoint === 'vertex' ? 'vertex' : 'direct'),
      };
    })
    .sort((a, b) => b.forms - a.forms || a.key.localeCompare(b.key));
}

function buildHeatmap(forms) {
  if (forms.length < HEATMAP_MIN_FORMS) return { rows: [], peak: null };
  const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ key: `d${weekday}`, weekday, counts: HEATMAP_HOURS.map(() => 0), total: 0 }));
  forms.forEach((row) => {
    const day = rows[row.isoWeekday - 1];
    day.total += 1;
    const col = row.hour - HEATMAP_HOURS[0];
    if (col >= 0 && col < HEATMAP_HOURS.length) day.counts[col] += 1;
  });
  let peak = null;
  rows.forEach((day) =>
    day.counts.forEach((n, col) => {
      if (n > 0 && (peak === null || n > peak.n)) peak = { weekday: day.weekday, hour: HEATMAP_HOURS[col], n, share: n / day.total };
    }),
  );
  return { rows, peak };
}

function buildProxies(ds, period, health) {
  const dictations = rowsIn(ds.dictations, period);
  const lives = rowsIn(ds.lives, period);
  return [
    { key: 'fallback', value: health.fallbackCount },
    { key: 'over25', value: health.over25 },
    { key: 'maxTokens', value: count(rowsIn(ds.anamnesis, period), (row) => row.anamnesis?.finishReason === 'MAX_TOKENS') },
    { key: 'emptyDictation', value: count(dictations, (row) => row.chars === 0 && row.audioSec >= 2) },
    { key: 'reconnects', value: lives.reduce((acc, row) => acc + (row.live?.reconnects ?? 0), 0) },
  ];
}

function buildFailures(ds, period, health) {
  const kinds = (map) => Object.entries(map ?? {}).map(([kind, value]) => ({ key: kind, kind, value })).sort(byCount);
  const since = ds.v2LoggingSince?.events ?? null;
  const recent =
    since === null
      ? []
      : rowsIn(ds.failures, period)
          .filter((row) => row.t >= since)
          .sort(newestFirst)
          .slice(0, RECENT_FAILURES)
          .map((row) => ({
            key: row.key, t: row.t, pid: row.pid, activity: activityOf(row.failure.feature), errorKind: row.failure.errorKind,
            group: row.failure.group, httpStatus: row.failure.httpStatus, refunded: row.failure.refunded,
          }));
  return { byKind: kinds(health.failuresByKind), refusalsByKind: kinds(health.refusalsByKind), recent };
}

/** Successful requests + service failures since event logging began (the denominator of the failure rate). */
function serviceRequests(ds, period, health) {
  const since = ds.v2LoggingSince?.events ?? null;
  if (since === null || health.serviceFailures === null) return null;
  const kinds = new Set(['form', 'dictation', 'live', 'anamnesis']);
  return count(rowsIn(ds.rows, period), (row) => row.t >= since && kinds.has(row.kind)) + health.serviceFailures;
}

function buildNowCard(ds) {
  const setup = currentSetup(ds);
  const gemini = ds.config?.gemini ?? null;
  const entry = (model) => lookup(ds.prices?.GEMINI ?? {}, model).entry;
  const rows = [
    {
      key: 'models.now.main',
      tone: 'neutral',
      values: { main: ['model', setup.main], where: ['where', whereOf(setup.endpoint, setup.location)], eu: ['yesNo', hasEuServers(setup.endpoint, setup.location)] },
    },
  ];
  if (setup.fallback) {
    rows.push({
      key: gemini?.fallbackOn404 === true ? 'models.now.fallback404' : 'models.now.fallback',
      tone: 'neutral',
      values: { fallback: ['model', setup.fallback], timeout: ['seconds', primaryTimeoutOf(ds)] },
    });
  } else {
    rows.push({ key: 'models.now.noFallback', tone: 'attention', values: {} });
  }
  if (entry(setup.main)?.status === 'preview') rows.push({ key: 'models.now.preview', tone: 'attention', values: {} });
  const notBefore = setup.fallback ? entry(setup.fallback)?.vertexRetiresNotBefore ?? null : null;
  if (notBefore && entry(setup.fallback)?.status === 'stable') {
    rows.push({ key: 'models.now.fallbackStable', tone: 'quiet', values: { date: ['date', notBefore] } });
  }
  const transcription = ds.config?.transcription ?? null;
  if (transcription) {
    rows.push({
      key: transcription.fallback ? 'models.now.transcription' : 'models.now.transcriptionSolo',
      tone: 'neutral',
      values: { provider: ['provider', transcription.provider], fallbackProvider: ['provider', transcription.fallback] },
    });
  }
  if (Number.isFinite(ds.config?.serverStartedAt)) {
    rows.push({ key: 'models.now.server', tone: 'quiet', values: { ago: ['ago', [ds.config.serverStartedAt, ds.nowMs]], build: ds.config.build ?? '—' } });
  }
  return rows;
}

/** Future price steps in the price table, grouped by date and factor ("× 2 from 01.01.2027"). */
function priceRises(ds, today) {
  const groups = new Map();
  Object.entries(ds.prices?.GEMINI ?? {}).forEach(([model, entry]) => {
    const periods = entry.periods ?? [];
    const now = periods.find((p) => (!p.validFrom || p.validFrom <= today) && (!p.validTo || today <= p.validTo));
    periods.forEach((p) => {
      if (!now || !p.validFrom || p.validFrom <= today || !(p.input > now.input)) return;
      const factor = Math.round((p.input / now.input) * 100) / 100;
      const key = `${p.validFrom}|${factor}`;
      if (!groups.has(key)) groups.set(key, { date: p.validFrom, factor, models: [] });
      groups.get(key).models.push(model);
    });
  });
  return [...groups.values()];
}

function buildRisks(ds, scope) {
  const today = dayKeyOf(ds.nowMs);
  const setup = currentSetup(ds);
  const ours = new Set([setup.main, setup.fallback].filter(Boolean));
  const platform = setup.endpoint === 'vertex' ? 'vertex' : 'direct';
  const gemini = (model) => lookup(ds.prices?.GEMINI ?? {}, model).entry ?? null;
  const rows = [];
  const add = (row) => rows.push({ tone: 'neutral', date: null, dateKind: 'none', happens: null, todo: null, values: {}, ...row });

  const main = gemini(setup.main);
  const mainShutdown = shutdownDate(ds.prices, setup.main, platform);
  const protectedBy404 = ds.config?.gemini?.fallbackOn404 === true;
  const isPreview = main?.status === 'preview';
  add({
    key: 'main',
    what: 'main',
    tone: isPreview && !protectedBy404 ? 'attention' : 'neutral',
    status: isPreview ? (protectedBy404 ? 'previewSafe' : 'previewOpen') : 'plain',
    date: mainShutdown,
    dateKind: mainShutdown ? 'date' : 'notAnnounced',
    happens: protectedBy404 ? 'mainGoneSafe' : 'mainGone',
    todo: 'keepReady',
    values: { model: ['model', setup.main], status: ['status', main?.status ?? null], ready: ['model', READY_REPLACEMENT] },
  });

  const soniox = capacity(ds, { planning: scope?.planning ?? ds.settings?.planning }).soniox;
  add({
    key: 'sonioxLimit',
    what: 'sonioxLimit',
    status: 'limit',
    dateKind: soniox.meanDoctors === null ? 'noLive' : 'doctors',
    happens: 'busy',
    todo: 'askLimit',
    values: { limit: soniox.limit, next: soniox.limit + 1, meanDoctors: soniox.meanDoctors, limitDoctors: soniox.limitDoctors },
  });
  add({ key: 'sonioxEu', what: 'sonioxEu', status: 'check', happens: 'gdpr', todo: 'askSoniox' });
  add({ key: 'prepay', what: 'prepay', status: 'manual', happens: 'prepayZero', todo: 'watchBalance' });
  add({ key: 'promo', what: 'promo', status: 'runOut', happens: 'invoiceGrows', todo: 'seeCosts' });

  const openaiModel = ds.config?.transcription?.openaiModel ?? null;
  if (openaiModel) {
    const shutdown = lookup(ds.prices?.TRANSCRIPTION ?? {}, openaiModel).entry?.shutdown ?? null;
    add({
      key: 'openai',
      what: 'openai',
      tone: shutdown && diffDays(today, shutdown) >= 0 ? 'attention' : 'neutral',
      status: shutdown ? 'shutdown' : 'noDate',
      date: shutdown,
      dateKind: shutdown ? 'date' : 'none',
      happens: shutdown ? 'backupTranscriptionStops' : null,
      todo: shutdown ? 'changeInRailway' : null,
      values: { model: ['model', openaiModel] },
    });
  }

  priceRises(ds, today).forEach((rise) => {
    const affectsUs = rise.models.some((model) => ours.has(model));
    add({
      key: `rise:${rise.date}`,
      what: 'priceRise',
      tone: affectsUs ? 'attention' : 'neutral',
      status: 'priceRise',
      date: rise.date,
      dateKind: 'date',
      happens: affectsUs ? 'oursCostMore' : 'onlyIfSwitch',
      todo: 'seePrices',
      models: rise.models,
      values: { factor: ['factor', rise.factor] },
    });
  });

  if (setup.fallback) {
    const entry = gemini(setup.fallback);
    const hard = shutdownDate(ds.prices, setup.fallback, platform);
    const notBefore = entry?.vertexRetiresNotBefore ?? null;
    add({
      key: 'fallback',
      what: 'fallback',
      status: 'plain',
      date: hard ?? notBefore,
      dateKind: hard ? 'date' : notBefore ? 'notBefore' : 'notAnnounced',
      values: { model: ['model', setup.fallback], status: ['status', entry?.status ?? null] },
    });
  }

  const legacy = Object.entries(ds.prices?.GEMINI ?? {}).filter(([, entry]) => entry.status === 'legacy-limited');
  if (legacy.length) {
    const dates = [...new Set(legacy.flatMap(([, entry]) => [entry.vertexInactiveCutoff, entry.vertexShutdown]).filter(Boolean))].sort();
    const affectsUs = legacy.some(([model]) => ours.has(model));
    add({
      key: 'legacy',
      what: 'legacy',
      tone: affectsUs ? 'attention' : 'neutral',
      status: 'closing',
      date: dates[0] ?? null,
      dateKind: dates.length ? 'dates' : 'none',
      happens: affectsUs ? 'formsFail' : 'noEffect',
      dates,
    });
  }

  return rows
    .map((row, order) => ({ ...row, order, daysLeft: row.date ? diffDays(today, row.date) : null }))
    .sort((a, b) => {
      const tone = (a.tone === 'attention' ? 0 : 1) - (b.tone === 'attention' ? 0 : 1);
      if (tone) return tone;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (Boolean(a.date) !== Boolean(b.date)) return a.date ? -1 : 1;
      return a.order - b.order;
    });
}

/** The model that wrote most main-role forms in the period (else the current setup), with its place. */
function periodSetup(ds, forms) {
  const setup = currentSetup(ds);
  const mains = forms.filter((row) => row.role === 'main');
  const fallbacks = forms.filter((row) => row.role === 'fallback');
  const main = mostCommon(mains, (row) => row.model) ?? setup.main;
  const ofMain = mains.filter((row) => row.model === main);
  const endpoint = mostCommon(ofMain, (row) => row.endpoint) ?? setup.endpoint;
  const location = endpoint === 'vertex' ? mostCommon(ofMain, (row) => row.location) ?? setup.location : null;
  return { main, where: whereOf(endpoint, location), fallback: mostCommon(fallbacks, (row) => row.model) ?? setup.fallback };
}

function buildAnswer(ds, period, health, forms, requests) {
  const answer = [];
  if (health.forms === 0) {
    answer.push({ key: 'models.answer.noForms', tone: 'neutral', values: {} });
  } else {
    const setup = periodSetup(ds, forms);
    const withFallback = setup.fallback && health.fallbackEligible > 0;
    answer.push({
      key: withFallback ? 'models.answer.now' : 'models.answer.nowSolo',
      tone: 'neutral',
      values: { main: ['model', setup.main], where: ['place', setup.where], fallback: ['model', setup.fallback], n: health.fallbackCount, N: health.fallbackEligible },
    });
    answer.push({
      key: 'models.answer.speed',
      tone: (health.over15Share ?? 0) >= HEALTH.badOver15Share ? 'attention' : 'neutral',
      values: { usual: ['sec', health.p50Ms], nineOfTen: ['sec', health.p90Ms], over15: health.over15, forms: health.forms },
    });
  }
  const current = currentSetup(ds);
  const mainIsPreview = lookup(ds.prices?.GEMINI ?? {}, current.main).entry?.status === 'preview';
  if (ds.config?.gemini?.fallbackOn404 !== true && mainIsPreview) {
    answer.push({ key: 'models.answer.risk404', tone: 'attention', values: {} });
  } else if (health.serviceFailures !== null) {
    answer.push({ key: 'models.answer.failures', tone: health.serviceFailures > 0 ? 'attention' : 'neutral', values: { n: health.serviceFailures, N: requests } });
  } else {
    answer.push({ key: 'models.answer.failuresOff', tone: 'neutral', values: {} });
  }
  return answer.slice(0, 3);
}

/** Notes only for special eras whose setup the rows really ran on (B2 row fields win, D21). */
function buildNotes(forms) {
  const notes = [];
  if (forms.some((row) => row.modelEra === 'e3' && row.endpoint === 'vertex')) notes.push({ key: 'models.note.vertexEra' });
  if (forms.some((row) => row.modelEra === 'e4' && row.role === 'switch')) notes.push({ key: 'models.note.testDay' });
  return notes;
}

const basisOf = (value, basis = 'exact') => (value === null || value === undefined ? 'missing' : basis);

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Service numbers: all traffic, whatever the scope says (§2 rule 3); the scope only feeds the plan
 * numbers of the Soniox risk row (capacity()).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] page-local, JSON-serialisable (unused)
 * @returns {import('./shared.js').AreaResult}
 */
export function computeModels(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const health = summarizeHealth(ds, period);
  const forms = rowsIn(ds.forms, period);
  const requests = serviceRequests(ds, period, health);

  const headline = {
    forms: health.forms,
    p50Ms: health.p50Ms,
    p90Ms: health.p90Ms,
    over15: health.over15,
    over15Share: health.over15Share,
    over25: health.over25,
    fallbackCount: health.fallbackCount,
    fallbackEligible: health.fallbackEligible,
    fallbackShare: health.fallbackShare,
    fallbackWaitMs: health.fallbackWaitP50Ms,
    serviceFailures: health.serviceFailures,
    serviceFailureRate: health.serviceFailureRate,
    refusals: health.refusals,
    mainP50Ms: health.mainP50Ms,
  };
  const fallbackBasis = health.fallbackEligible > 0 ? health.fallbackBasis : 'missing';
  const basis = {
    forms: 'exact',
    p50Ms: basisOf(health.p50Ms),
    p90Ms: basisOf(health.p90Ms),
    over15: basisOf(health.over15Share),
    over15Share: basisOf(health.over15Share),
    over25: basisOf(health.over25Share),
    fallbackCount: fallbackBasis,
    fallbackEligible: fallbackBasis,
    fallbackShare: basisOf(health.fallbackShare, fallbackBasis),
    fallbackWaitMs: basisOf(health.fallbackWaitP50Ms, fallbackBasis),
    serviceFailures: basisOf(health.serviceFailures),
    serviceFailureRate: basisOf(health.serviceFailureRate),
    refusals: basisOf(health.refusals),
    mainP50Ms: basisOf(health.mainP50Ms),
  };

  const series = buildSeries(ds, period, forms);
  const waitHist = buildWaitHist(forms);
  const heatmap = buildHeatmap(forms);
  const failures = buildFailures(ds, period, health);
  const longView = period.preset === 'year' || period.preset === 'allTime';

  const takeaways = {};
  const longFallback = count(forms, (row) => row.role === 'fallback' && row.durMs > HEALTH.fallbackWaitMs);
  if (health.over25 > 0 && longFallback / health.over25 >= 0.5) {
    takeaways.waitHist = { key: 'models.takeaway.waitHist', values: { usual: ['sec', health.p50Ms], n: health.over25 } };
  }
  if (heatmap.peak) {
    takeaways.heatmap = {
      key: 'models.takeaway.heatmap',
      values: { day: ['weekday', heatmap.peak.weekday], hour: String(heatmap.peak.hour).padStart(2, '0'), share: ['pct', heatmap.peak.share] },
    };
  }

  return {
    empty: health.forms === 0 && !(health.serviceFailures > 0 || health.refusals > 0),
    headline,
    basis,
    answer: buildAnswer(ds, period, health, forms, requests),
    series,
    tables: {
      nowCard: buildNowCard(ds),
      waitHist,
      latency: longView ? series : [],
      slow: buildSlow(forms),
      fallbackEvents: buildFallbackEvents(ds, forms),
      eras: buildEras(ds),
      modelTable: buildModelTable(ds, forms),
      proxies: buildProxies(ds, period, health),
      failuresByKind: failures.byKind,
      refusalsByKind: failures.refusalsByKind,
      failuresRecent: failures.recent,
      heatmap: heatmap.rows,
      risks: buildRisks(ds, scope),
    },
    takeaways,
    notes: buildNotes(forms),
  };
}

/**
 * Bands of the monthly latency chart: the non-standard setup eras that fall inside the period, by the
 * bucket keys they start and end in (a band inside one bucket has no width and is left out).
 * @param {import('./shared.js').SeriesRow[]} rows chart rows
 * @returns {Array<{ fromKey: string, toKey: string, era: string, fromMs: number, toMs: number }>}
 */
export function latencyBands(rows) {
  if (!rows?.length) return [];
  const keyAt = (ms) => rows.find((row) => ms >= dateToMs(row.from) && ms < dateToMs(row.to))?.key ?? null;
  return MODEL_ERAS.filter((era) => !era.standard && era.toMs !== null)
    .map((era) => ({ fromKey: keyAt(era.fromMs), toKey: keyAt(era.toMs - 1), era: era.note ?? 'test', fromMs: era.fromMs, toMs: era.toMs }))
    .filter((band) => band.fromKey && band.toKey && band.fromKey !== band.toKey);
}

