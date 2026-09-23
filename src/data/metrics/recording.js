// Recording page metric (SPEC §4.5): how much we record, what it costs, and whether 1 credit per
// 10 minutes pays for it. Two scopes on one page (§2 rule 3):
//   business ("How much and at what price") follows the account switch: minutes, cost, credits, chart;
//   service ("How recording works") counts all traffic: conversations, Soniox share, peak, limit, tables.
// Shared numbers are copied from the F0 core (summarize, unitEconomics, projectScale, capacity), never recounted.
import { MIN_EVENTS_FOR_CHART, PLAN } from '../constants.js';
import { LIVE_SINCE_MS, METER_SINCE_MS, SONIOX_SINCE_MS } from '../eras.js';
import { compareCaveat, dayKeyOf, inPeriod } from '../period.js';
import { costBasis } from '../core/basis.js';
import { binomialQuantile } from '../core/binomial.js';
import { capacity, planningOf, projectScale, unitCosts } from '../core/projection.js';
import { hidesInternal, isInternal } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { EMPTY_RESULT, addTo, makeSeries, share } from './shared.js';

/** Recordings needed since Soniox began before the page draws conclusions and the minutes chart (§4.5). */
export const MIN_RECORDINGS = MIN_EVENTS_FOR_CHART;
/** A takeaway about OpenAI needs this many dictations since Soniox and this share of them on OpenAI. */
const OPENAI_TAKEAWAY_MIN = 5;
const OPENAI_TAKEAWAY_SHARE = 0.1;

const MS_PER_MIN = 60000;
const minutesOf = (row) => (Number.isFinite(row.audioSec) ? row.audioSec / 60 : 0);
const byNewest = (a, b) => b.t - a.t;

/**
 * Largest number of intervals open at the same moment. Touching intervals (one ends where the next
 * starts) do not overlap.
 * @param {Array<[number, number]>} intervals [start, end] pairs in ms
 * @returns {number}
 */
export function peakOverlap(intervals) {
  const events = [];
  (intervals ?? []).forEach(([start, end]) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    events.push([start, 1], [end, -1]);
  });
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let peak = 0;
  events.forEach(([, step]) => {
    open += step;
    peak = Math.max(peak, open);
  });
  return peak;
}

/**
 * Conversations running at once in the busiest moment: each live row is [t − length, t] (the row is
 * written when the conversation ends, so the start is an estimate).
 * @param {import('../normalize/usage.js').UsageRow[]} lives
 * @returns {number}
 */
export const peakStreams = (lives) =>
  peakOverlap((lives ?? []).filter((row) => row.audioSec > 0).map((row) => [row.t - row.audioSec * 1000, row.t]));

/**
 * The answer's thin rule: the period reaches the Soniox era and holds fewer than 20 recordings since then.
 * @param {import('../period.js').Period} period
 * @param {number} recordingsSinceSoniox
 */
export const isThin = (period, recordingsSinceSoniox) =>
  Boolean(period) && period.toMs > SONIOX_SINCE_MS && recordingsSinceSoniox < MIN_RECORDINGS;

/**
 * The chart's thin rule (§4.5): like isThin, except for periods in months (year, all time), where the
 * OpenAI history before 22.09 is what the chart shows ("Show all time" leads there).
 * @param {import('../period.js').Period} period
 * @param {number} recordingsSinceSoniox
 */
export const chartIsThin = (period, recordingsSinceSoniox) => isThin(period, recordingsSinceSoniox) && period.granularity !== 'month';

/**
 * Recording credits cannot be compared when the two periods were billed by different rules (§3.3):
 * the dominant rule differs, or only one of them reaches the per-minute meter.
 * @param {import('../period.js').Period} period
 * @param {import('../period.js').Period|null} prev
 * @returns {boolean}
 */
export function creditsDeltaHidden(period, prev) {
  if (!period || !prev) return false;
  if (compareCaveat(period, prev).billingEraChanged) return true;
  const touchesMeter = (p) => p.effToMs > METER_SINCE_MS;
  const touchesPerVisit = (p) => p.fromMs < METER_SINCE_MS;
  return touchesMeter(period) !== touchesMeter(prev) || touchesPerVisit(period) !== touchesPerVisit(prev);
}

const creditsBasis = (recordingBasis) => (recordingBasis === 'estimate' || recordingBasis === 'mixed' ? 'estimate' : 'exact');

// ---------------------------------------------------------------------------------------------------
// Business part (follows the scope)
// ---------------------------------------------------------------------------------------------------

function businessPart(ds, period, scope) {
  const hide = hidesInternal(ds, scope);
  const keep = (row) => !(hide && isInternal(row.pid, ds));
  const rows = [...(ds.dictations ?? []), ...(ds.lives ?? [])].filter((row) => inPeriod(row.t, period) && keep(row));

  const { rows: series, indexOf } = makeSeries(period, ['live', 'dictationSoniox', 'dictationOpenai']);
  // Minutes before Soniox by kind, for the "moved to Soniox" takeaway (only when OpenAI shaped that part).
  const before = { openai: 0, other: 0 };
  let sonioxAfter = 0;
  rows.forEach((row) => {
    const field = row.kind === 'live' ? 'live' : row.provider === 'openai' ? 'dictationOpenai' : 'dictationSoniox';
    addTo(series[indexOf(row.t)], field, minutesOf(row));
    if (row.t < SONIOX_SINCE_MS) before[field === 'dictationOpenai' ? 'openai' : 'other'] += minutesOf(row);
    else if (field !== 'dictationOpenai') sonioxAfter += 1;
  });

  const sinceSoniox = rows.filter((row) => row.t >= SONIOX_SINCE_MS);
  const dictationsSince = sinceSoniox.filter((row) => row.kind === 'dictation');
  const openaiSince = dictationsSince.filter((row) => row.provider === 'openai').length;

  let takeaway = null;
  if (dictationsSince.length >= OPENAI_TAKEAWAY_MIN && openaiSince / dictationsSince.length >= OPENAI_TAKEAWAY_SHARE) {
    takeaway = { key: 'recording.take.openaiHigh', values: { share: ['pct', openaiSince / dictationsSince.length] } };
  } else if (before.openai > 0 && before.openai >= before.other && sonioxAfter > 0) {
    takeaway = { key: 'recording.take.switch' };
  }

  return {
    rows,
    series,
    takeaway,
    costBasis: costBasis(rows),
    recordingsInPeriod: rows.length,
    recordingsSinceSoniox: sinceSoniox.length,
    recordings: sinceSoniox
      .map((row) => ({ key: row.key, t: row.t, pid: row.pid, kind: row.kind, provider: row.provider, minutes: minutesOf(row) }))
      .sort(byNewest),
    beforeMeter: rows.some((row) => row.t < METER_SINCE_MS),
    bytesEstimated: rows.some((row) => row.audioBasis === 'bytes_estimate'),
  };
}

// ---------------------------------------------------------------------------------------------------
// Service part (all traffic)
// ---------------------------------------------------------------------------------------------------

const sonioxMinutesBySession = (soniox) => {
  const bySession = new Map();
  (soniox?.liveSessions ?? []).forEach((session) => {
    if (!session.sessionRef) return;
    bySession.set(session.sessionRef, (bySession.get(session.sessionRef) ?? 0) + (session.audioMs ?? 0) / MS_PER_MIN);
  });
  return bySession;
};

const sonioxUsable = (ds) => Boolean(ds.soniox) && ['ok', 'partial'].includes(ds.soniox.status ?? 'ok');

function sessionsTable(lives, ds) {
  const confirmed = sonioxUsable(ds) ? sonioxMinutesBySession(ds.soniox) : null;
  return lives
    .map((row) => {
      const minutes = minutesOf(row);
      const ref = row.live?.sessionRef ?? null;
      return {
        key: row.key,
        t: row.t,
        pid: row.pid,
        minutes,
        speakers: row.live?.speakers ?? null,
        reconnects: row.live?.reconnects ?? null,
        waitMs: row.durMs,
        credits: minutes / 10,
        confirmedMin: confirmed && ref && confirmed.has(ref) ? confirmed.get(ref) : null,
      };
    })
    .sort(byNewest);
}

const meterTable = (meterRows) =>
  meterRows
    .map((row) => ({
      key: row.key,
      t: row.t,
      pid: row.pid,
      source: row.meterEvent?.source ?? 'dictation',
      addedMin: (row.meterEvent?.addedMs ?? 0) / MS_PER_MIN,
      charged: row.meterEvent?.chargedCredits ?? row.credits ?? 0,
      bankMin: Number.isFinite(row.meterEvent?.bankMsAfter) ? row.meterEvent.bankMsAfter / MS_PER_MIN : null,
    }))
    .sort(byNewest);

const openaiTable = (dictations) =>
  dictations
    .filter((row) => row.t >= SONIOX_SINCE_MS && row.provider === 'openai')
    .map((row) => ({
      key: row.key,
      t: row.t,
      pid: row.pid,
      minutes: minutesOf(row),
      estimated: row.audioBasis === 'bytes_estimate',
      waitMs: row.durMs,
      reason: row.fallbackReason,
    }))
    .sort(byNewest);

/** Minutes and money by transcriber since Soniox began (the "Who transcribes" bar). */
function providersTable(recordings) {
  const make = (key) => ({ key, minutes: 0, count: 0, costEur: 0, per10Eur: null });
  const soniox = make('soniox');
  const openai = make('openai');
  recordings
    .filter((row) => row.t >= SONIOX_SINCE_MS)
    .forEach((row) => {
      const target = row.provider === 'openai' ? openai : soniox;
      target.minutes += minutesOf(row);
      target.count += 1;
      target.costEur += row.costEur;
    });
  [soniox, openai].forEach((item) => {
    item.per10Eur = item.minutes > 0 ? (item.costEur / item.minutes) * 10 : null;
  });
  return [soniox, openai];
}

/** Our Soniox minutes and € against Soniox's own numbers, by Vilnius day, where both could know them. */
function reconcileTable(recordings, ds, period, fx) {
  if (!sonioxUsable(ds)) return [];
  const rangeFrom = Date.parse(ds.soniox.range?.from ?? '');
  const firstDay = [dayKeyOf(SONIOX_SINCE_MS), Number.isFinite(rangeFrom) ? dayKeyOf(rangeFrom) : null].filter(Boolean).sort().pop();
  const days = new Map();
  const dayOf = (day) => {
    if (!days.has(day)) days.set(day, { key: day, day, ourMin: 0, ourUsd: 0, ourEur: 0, sonioxMin: 0, sonioxUsd: 0, sonioxEur: 0 });
    return days.get(day);
  };
  recordings
    .filter((row) => row.provider === 'soniox' && row.t >= SONIOX_SINCE_MS && row.dayKey >= firstDay)
    .forEach((row) => {
      const entry = dayOf(row.dayKey);
      entry.ourMin += minutesOf(row);
      entry.ourUsd += row.costUsd;
      entry.ourEur += row.costEur;
    });
  (ds.soniox.days ?? [])
    .filter((item) => item.day >= firstDay && inPeriod(item.day, period))
    .forEach((item) => {
      const entry = dayOf(item.day);
      entry.sonioxMin += (item.audioMs ?? 0) / MS_PER_MIN;
      entry.sonioxUsd += item.costUsd ?? 0;
      entry.sonioxEur += (item.costUsd ?? 0) / fx;
    });
  return [...days.values()]
    .map((entry) => ({ ...entry, diffMin: entry.ourMin - entry.sonioxMin }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** "Soniox limit: when we hit it" (§4.5), from capacity(); the "now" row is the measured peak. */
function limitTable(cap, { activeDoctors, peak, scales }) {
  const { limit } = cap.soniox;
  const p = Math.min(1, cap.perDoctorPeak);
  const planned = (key, doctors, streams) => ({ key, doctors, mean: streams.mean, p95: streams.p95, limit, enough: streams.p95 <= limit, plan: true });
  const atN = (n) => ({ mean: n * p, p95: binomialQuantile(Math.min(n, PLAN.maxBinomialDoctors), p, PLAN.soniox95) });
  const rows = [{ key: 'now', doctors: activeDoctors, mean: null, p95: peak, limit, enough: peak === null ? null : peak <= limit, plan: false }];
  if (cap.soniox.meanDoctors !== null) rows.push(planned('mean', cap.soniox.meanDoctors, atN(cap.soniox.meanDoctors)));
  if (cap.soniox.limitDoctors !== null) rows.push(planned('safe', cap.soniox.limitDoctors, atN(cap.soniox.limitDoctors)));
  return [...rows, planned('s0', scales[0], cap.soniox.s0), planned('s1', scales[1], cap.soniox.s1)];
}

// ---------------------------------------------------------------------------------------------------
// Plan rows
// ---------------------------------------------------------------------------------------------------

/**
 * The ScaleResult with two recording rows per column (§4.5 projection rows):
 *   recordingCostEur   Soniox + OpenAI (the same five-row split as every projection)
 *   recordingIncomeEur plan columns: recorded minutes ÷ 10 credits × the column's net per credit;
 *                      null for "now", because income is not split by feature.
 * @param {import('../core/projection.js').ScaleResult} scale
 */
export function withRecordingRows(scale) {
  const { liveShare, liveMin, dictMin } = scale.scenario;
  const recMinPerVisit = liveShare * liveMin + (1 - liveShare) * dictMin;
  const columns = {};
  Object.entries(scale.columns).forEach(([id, column]) => {
    const isPlan = id !== 'now' && id !== 'nowTotal';
    const perCredit = isPlan && column.creditsSpent > 0 && Number.isFinite(column.netEur) ? column.netEur / column.creditsSpent : null;
    columns[id] = {
      ...column,
      recordingCostEur: column.costSonioxEur + column.costOpenaiEur,
      recordingIncomeEur: perCredit === null ? null : ((column.visits * recMinPerVisit) / 10) * perCredit,
    };
  });
  return { ...scale, columns };
}

// ---------------------------------------------------------------------------------------------------
// Answer and notes
// ---------------------------------------------------------------------------------------------------

function answerOf({ period, business, summary, live10, cap }) {
  const answer = [];
  if (isThin(period, business.recordingsSinceSoniox)) {
    answer.push({ key: 'recording.answer.thin', values: { n: business.recordingsSinceSoniox }, tone: 'neutral' });
  } else if (business.recordingsInPeriod === 0) {
    answer.push({ key: 'recording.answer.none', tone: 'neutral' });
  } else {
    answer.push({
      key: 'recording.answer.volume',
      values: {
        minutes: ['minutes', summary.minutes.total],
        live: ['minutes', summary.minutes.live],
        dict: ['minutes', summary.minutes.dictation],
        cost: ['eur', summary.cost.byFeature.dictation + summary.cost.byFeature.live],
        credits: ['credits', summary.creditsSpent.recording],
      },
      tone: 'neutral',
    });
  }
  const unit = { cost10: ['eurUnit', live10.costEur], net1: ['eurUnit', live10.netEur] };
  answer.push(
    live10.leftEur >= 0
      ? { key: 'recording.answer.unit', values: { ...unit, left: ['eurUnit', live10.leftEur] }, tone: 'good' }
      : { key: 'recording.answer.unitLoss', values: { ...unit, loss: ['eurUnit', -live10.leftEur] }, tone: 'attention' },
  );
  if (cap.soniox.meanDoctors !== null) {
    answer.push({
      key: 'recording.answer.limit',
      values: { limit: cap.soniox.limit, mean: cap.soniox.meanDoctors, safe: cap.soniox.limitDoctors },
      tone: 'neutral',
    });
  }
  return answer;
}

function notesOf({ business, conversations }) {
  const notes = [];
  if (conversations > 0) notes.push({ key: 'recording.note.clientMinutes' });
  if (business.beforeMeter) notes.push({ key: 'recording.note.before' });
  if (business.bytesEstimated) notes.push({ key: 'recording.note.bytes' });
  return notes;
}

// ---------------------------------------------------------------------------------------------------
// The metric
// ---------------------------------------------------------------------------------------------------

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Headline: business `minutes, minutesLive, minutesDictation, cost, credits, recordings, recordingsSinceSoniox`
 * (scope) and the plan `cost10Eur, net1Eur, left10Eur, margin10` (unitEconomics().perCredit.live10: plan pack,
 * VAT setting) with `convTokensPerMin` (unitCosts); service `conversations, avgConversationMin, sonioxDictations, dictationsSinceSoniox, sonioxShare,
 * peakStreams, streamLimit, carriedMin` (all traffic) and `meanDoctors, safeDoctors` (capacity()).
 * Series `live, dictationSoniox, dictationOpenai` in minutes (scope). Tables `providers, limit, sessions,
 * meterEvents, openaiFallbacks, reconcile` (all traffic) and `recordings` (scope, since Soniox: the list
 * under a thin chart). Rows carry the doctor's pid only; the page shows the name.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] page-local, JSON-serialisable (none used)
 * @returns {import('./shared.js').AreaResult}
 */
export function computeRecording(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const planning = scope?.planning ?? ds.settings?.planning;
  const summary = summarize(ds, period, scope);
  const live10 = unitEconomics(ds, period, scope).perCredit.live10;
  const cap = capacity(ds, { planning });
  const uc = unitCosts(ds, planning);
  const business = businessPart(ds, period, scope);

  const allRecordings = [...(ds.dictations ?? []), ...(ds.lives ?? [])].filter((row) => inPeriod(row.t, period));
  const lives = allRecordings.filter((row) => row.kind === 'live');
  const dictations = allRecordings.filter((row) => row.kind === 'dictation');
  const dictationsSince = dictations.filter((row) => row.t >= SONIOX_SINCE_MS);
  const sonioxDictations = dictationsSince.filter((row) => row.provider === 'soniox').length;
  const liveMinutes = lives.reduce((acc, row) => acc + minutesOf(row), 0);
  const peak = period.effToMs > LIVE_SINCE_MS ? peakStreams(lives) : null;
  const allAccounts = summarize(ds, period, { ...scope, excludeInternal: false });

  const headline = {
    minutes: summary.minutes.total,
    minutesLive: summary.minutes.live,
    minutesDictation: summary.minutes.dictation,
    cost: summary.cost.byFeature.dictation + summary.cost.byFeature.live,
    credits: summary.creditsSpent.recording,
    recordings: business.recordingsInPeriod,
    recordingsSinceSoniox: business.recordingsSinceSoniox,
    cost10Eur: live10.costEur,
    net1Eur: live10.netEur,
    left10Eur: live10.leftEur,
    margin10: live10.shareLeft,
    convTokensPerMin: uc.convTokensPerMin,
    conversations: lives.length,
    avgConversationMin: lives.length > 0 ? liveMinutes / lives.length : null,
    sonioxDictations,
    dictationsSinceSoniox: dictationsSince.length,
    sonioxShare: share(sonioxDictations, dictationsSince.length),
    peakStreams: peak,
    streamLimit: cap.soniox.limit,
    carriedMin: (ds.doctorList ?? []).reduce((acc, doctor) => acc + (Number.isFinite(doctor.audioBankMs) ? doctor.audioBankMs : 0), 0) / MS_PER_MIN,
    meanDoctors: cap.soniox.meanDoctors,
    safeDoctors: cap.soniox.limitDoctors,
  };

  const basis = {
    minutes: summary.minutes.basis,
    minutesLive: 'exact',
    minutesDictation: summary.minutes.basis,
    cost: business.costBasis,
    credits: creditsBasis(summary.creditsSpent.recordingBasis),
    recordings: 'exact',
    recordingsSinceSoniox: 'exact',
    cost10Eur: 'model',
    net1Eur: 'model',
    left10Eur: 'model',
    margin10: 'model',
    convTokensPerMin: uc.convBasis,
    conversations: 'exact',
    avgConversationMin: 'exact',
    sonioxDictations: 'exact',
    dictationsSinceSoniox: 'exact',
    sonioxShare: 'exact',
    peakStreams: 'estimate',
    streamLimit: 'exact',
    carriedMin: 'exact',
    meanDoctors: 'model',
    safeDoctors: 'model',
  };

  return {
    empty: allRecordings.length === 0,
    headline,
    basis,
    answer: answerOf({ period, business, summary, live10, cap }),
    series: business.series,
    tables: {
      providers: providersTable(allRecordings),
      limit: limitTable(cap, { activeDoctors: allAccounts.activeDoctors, peak, scales: planningOf(planning).doctorScales }),
      sessions: sessionsTable(lives, ds),
      meterEvents: meterTable((ds.meter ?? []).filter((row) => inPeriod(row.t, period))),
      openaiFallbacks: openaiTable(dictations),
      reconcile: reconcileTable(allRecordings, ds, period, ds.fx?.usdPerEur ?? 1),
      recordings: business.recordings,
    },
    takeaways: business.takeaway ? { minutesChart: business.takeaway } : {},
    projection: withRecordingRows(projectScale(ds, period, scope)),
    notes: notesOf({ business, conversations: lives.length }),
  };
}
