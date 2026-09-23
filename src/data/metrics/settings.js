// Settings page metric (§4.9): the "measured" hints next to the forecast assumptions, the state of the
// data sources, the setup history, the accounts that can be marked as "mine or test" and the dashboard
// load line. Pure: the clock is ds.nowMs; copy-free (keys and raw values only).
//
// Which traffic a hint counts (§2 rule 3):
//   doctor behaviour  visits, summaries per doctor, free share → the scope (summarize)
//   service / plan    conversation share and minutes, dictation, form size, text per conversation minute,
//                     busiest hour, OpenAI share → all traffic (unitCosts and the rows themselves)
import { MIN_CONVERSATION_FORMS, MIN_DICTATIONS_FOR_SHARE, PACK_IDS, ESTIMATE_SHARE } from '../constants.js';
import { BILLING_ERAS, MODEL_ERAS, TRANSCRIPTION_ERAS } from '../eras.js';
import { inPeriod, resolvePeriod } from '../period.js';
import { incomeStatus, paymentCredits } from '../core/income.js';
import { capacity, planChips, planningOf, resolveScenario, unitCosts } from '../core/projection.js';
import { internalCount, makeScope, scopedRows } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { EMPTY_RESULT, share } from './shared.js';

/** Sources in the order the Settings table lists them. */
export const SOURCE_ORDER = Object.freeze(['usage', 'doctors', 'config', 'revenue', 'soniox', 'costs', 'settings']);

/** Data-quality counters of `ds.quality`, in display order. */
export const QUALITY_KEYS = Object.freeze([
  'droppedBeforeOrigin',
  'duplicateIds',
  'unknownModels',
  'openaiRowsNoLength',
  'derivedThinkingRows',
  'zeroByteDictations',
]);

/** The busiest-hour share needs this many weekday forms (same bar as the load heatmap, §4.6). */
export const MIN_PEAK_FORMS = 200;
/** A doctor with more than this share of all forms (and the old plan) is suggested as "probably yours". */
export const SUGGEST_SHARE = 0.5;
/** Above this share of the window's forms the measured values "mostly describe one doctor". */
export const TOP_DOCTOR_NOTE_SHARE = 0.5;

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const minutesOf = (row) => (Number.isFinite(row.audioSec) ? row.audioSec / 60 : 0);

/**
 * Share of weekday forms that fall into the busiest hour of the day (Vilnius), over all weekday forms
 * of the rows given. null under MIN_PEAK_FORMS weekday forms.
 * @param {Array<{ isoWeekday: number, hour: number }>} forms
 * @returns {number|null}
 */
export function peakHourShareOf(forms) {
  const weekday = forms.filter((row) => row.isoWeekday >= 1 && row.isoWeekday <= 5);
  if (weekday.length < MIN_PEAK_FORMS) return null;
  const byHour = new Map();
  weekday.forEach((row) => byHour.set(row.hour, (byHour.get(row.hour) ?? 0) + 1));
  return Math.max(...byHour.values()) / weekday.length;
}

/**
 * Which packs doctors buy, as the share of credits bought in each pack (the weight `packMix` has in the
 * net per credit). Live Stripe payments of all time; null shares when there is none.
 * @param {Array<{ packId: string|null, credits: number|null }>} payments
 * @returns {{ rows: Array<{ pack: string, credits: number, payments: number, share: number|null }>, payments: number }}
 */
export function packMixOf(payments) {
  const rows = PACK_IDS.map((pack) => ({ pack, credits: 0, payments: 0, share: null }));
  let counted = 0;
  payments.forEach((payment) => {
    const row = rows.find((item) => item.pack === payment.packId);
    if (!row) return;
    row.credits += paymentCredits(payment);
    row.payments += 1;
    counted += 1;
  });
  const total = rows.reduce((acc, row) => acc + row.credits, 0);
  rows.forEach((row) => {
    row.share = total > 0 ? row.credits / total : null;
  });
  return { rows, payments: counted };
}

/**
 * The most common way of paying among the payments ('card', 'paypal' …) and how often it was used.
 * @param {Array<{ method: string }>} payments
 * @returns {{ method: string|null, n: number }}
 */
export function topMethodOf(payments) {
  const counts = new Map();
  payments.forEach((payment) => counts.set(payment.method ?? 'other', (counts.get(payment.method ?? 'other') ?? 0) + 1));
  let method = null;
  let n = 0;
  counts.forEach((count, key) => {
    if (count > n) {
      method = key;
      n = count;
    }
  });
  return { method, n };
}

/** Number of records a source brought (null = not a list, or nothing arrived). */
function sourceCount(ds, name) {
  switch (name) {
    case 'usage':
      return ds.rows.length;
    case 'doctors':
      return ds.doctorList.filter((doctor) => !doctor.deletedAccount).length;
    case 'revenue':
      return ds.sources.revenue?.status === 'ok' || ds.sources.revenue?.status === 'test' ? ds.payments.length : null;
    case 'soniox':
      return Number.isFinite(ds.soniox?.totals?.requests) ? ds.soniox.totals.requests : null;
    case 'costs':
      return ds.sources.costs?.status === 'ok' ? ds.costsMonthly.length : null;
    default:
      return null;
  }
}

/** A short code for the note of a source row (`settings.sourceNote.<code>`), or null. */
function sourceNote(ds, name, status) {
  if (name === 'usage' && status === 'limited') return 'limited';
  if (name === 'config' && status !== 'ok') return 'static';
  if (name === 'settings' && status === 'error') return 'defaults';
  if (name === 'revenue') {
    if (status === 'test') return 'test';
    if (status !== 'ok') return ds.revenue?.reason ?? null;
  }
  if (name === 'soniox' && status !== 'ok') return ds.soniox?.reason ?? null;
  return null;
}

/**
 * One row per data source: state, when its data is from (fetch time minus the server's cache age),
 * how many records it brought and a note code.
 * @param {import('../buildDataset.js').Dataset} ds
 */
export function sourceRows(ds) {
  return SOURCE_ORDER.map((name) => {
    const source = ds.sources?.[name] ?? { status: 'error', fetchedAt: null, cacheAgeMs: null };
    const status = source.status ?? 'error';
    const updatedMs = Number.isFinite(source.fetchedAt) ? source.fetchedAt - (Number.isFinite(source.cacheAgeMs) ? source.cacheAgeMs : 0) : null;
    return { key: name, status, ok: status === 'ok', updatedMs, count: sourceCount(ds, name), note: sourceNote(ds, name, status) };
  });
}

/**
 * The setup history (model, transcription and billing eras), newest first, as data for the table.
 * @param {number} nowMs
 */
export function eraRows(nowMs) {
  const rows = [
    ...MODEL_ERAS.map((era) => ({
      key: `model-${era.id}`,
      kind: 'model',
      fromMs: era.fromMs,
      toMs: era.toMs,
      main: era.main,
      fallback: era.fallback,
      endpoint: era.endpoint,
      location: era.location,
      note: era.note ?? (era.primaryTimeoutMs ? 'timeout' : null),
      timeoutMs: era.primaryTimeoutMs ?? null,
    })),
    ...TRANSCRIPTION_ERAS.map((era, index) => ({
      key: `transcription-${index + 1}`,
      kind: 'transcription',
      fromMs: era.fromMs,
      toMs: era.toMs,
      main: era.main,
      fallback: era.fallback,
      note: null,
    })),
    ...BILLING_ERAS.map((era) => ({ key: `billing-${era.id}`, kind: 'billing', fromMs: era.fromMs, toMs: era.toMs, rule: era.rule, note: null })),
  ];
  return rows
    .map((row) => ({ ...row, current: row.fromMs <= nowMs && (row.toMs === null || row.toMs > nowMs) }))
    .sort((a, b) => b.fromMs - a.fromMs || a.kind.localeCompare(b.kind));
}

/**
 * Accounts that can be marked as "mine or test": every doctor with an account, with forms and costs
 * of all time (all accounts), sorted by forms. `locked` marks come from the server (env or profile);
 * `suggested` = nobody is marked yet and this account made most of the forms on the old plan.
 * @param {import('../buildDataset.js').Dataset} ds
 */
export function internalCandidateRows(ds) {
  const all = summarize(ds, resolvePeriod('allTime', ds.nowMs), makeScope({ excludeInternal: false, settings: ds.settings }));
  const forms = new Map();
  ds.forms.forEach((row) => forms.set(row.pid, (forms.get(row.pid) ?? 0) + 1));
  const totalForms = ds.forms.length;
  const noneMarked = internalCount(ds) === 0;
  return ds.doctorList
    .filter((doctor) => !doctor.deletedAccount)
    .map((doctor) => {
      const n = forms.get(doctor.pid) ?? 0;
      const formShare = share(n, totalForms);
      const oldPlan = doctor.class === 'legacy' || doctor.apiClass === 'legacy';
      return {
        key: doctor.pid,
        pid: doctor.pid,
        code: doctor.code,
        no: doctor.no,
        forms: n,
        formShare,
        costEur: all.cost.byPid[doctor.pid] ?? 0,
        internal: Boolean(doctor.internal),
        internalSource: doctor.internalSource ?? null,
        locked: doctor.internal && (doctor.internalSource === 'env' || doctor.internalSource === 'profile'),
        suggested: noneMarked && oldPlan && formShare !== null && formShare > SUGGEST_SHARE,
      };
    })
    .sort((a, b) => b.forms - a.forms || (a.no ?? Infinity) - (b.no ?? Infinity));
}

/** @param {import('../buildDataset.js').Dataset} ds */
export function qualityRows(ds) {
  const quality = ds.quality ?? {};
  return QUALITY_KEYS.map((key) => {
    const value = quality[key];
    if (Array.isArray(value)) return { key, n: value.length, detail: value.join(', ') || null };
    return { key, n: Number.isFinite(value) ? value : 0, detail: null };
  });
}

/**
 * Settings (§4.9). `period` is not used: Settings has no period, and every measured hint covers the
 * last 30 days (Vilnius calendar days up to today) — the same window whatever another page picked.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period ignored (see above)
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] unused
 * @returns {import('./shared.js').AreaResult}
 */
export function computeSettings(ds, period, scope, opts = {}) {
  if (!ds) return EMPTY_RESULT;
  const window = resolvePeriod('last30', ds.nowMs);
  const planning = planningOf(scope?.planning ?? ds.settings?.planning);
  const vatPayer = scope?.vatPayer ?? Boolean(ds.settings?.vatPayer);
  const summary = summarize(ds, window, scope);
  const uc = unitCosts(ds, planning);
  const ucMeasured = planning.formCostBasis === 'measured' ? uc : unitCosts(ds, { ...planning, formCostBasis: 'measured' });
  const cap = capacity(ds, { planning });

  // All traffic, last 30 days.
  const inWindow = (rows) => rows.filter((row) => inPeriod(row.t, window));
  const forms = inWindow(ds.forms);
  const lives = inWindow(ds.lives);
  const dictations = inWindow(ds.dictations);

  const liveMinutes = lives.map(minutesOf).filter((min) => min > 0);
  const measuredLiveMin = liveMinutes.length >= MIN_CONVERSATION_FORMS ? mean(liveMinutes) : null;
  const visitsWithoutConversation = forms.length - lives.length;
  const dictationMinutes = dictations.reduce((acc, row) => acc + minutesOf(row), 0);
  const estimatedMinutes = dictations.filter((row) => row.audioBasis === 'bytes_estimate').reduce((acc, row) => acc + minutesOf(row), 0);
  const measuredDictationMin =
    dictations.length >= MIN_DICTATIONS_FOR_SHARE && visitsWithoutConversation > 0 ? dictationMinutes / visitsWithoutConversation : null;

  const incomeOk = incomeStatus(ds) === 'ok';
  const livePayments = incomeOk ? ds.payments : [];
  const packMix = packMixOf(livePayments);
  const topMethod = topMethodOf(livePayments);
  const variable = summary.cost.variableEur;

  const headline = {
    measuredVisitsPerDoctorMonth: summary.perDoctorMonthActual?.forms ?? null,
    measuredLiveShare: forms.length > 0 ? Math.min(1, lives.length / forms.length) : null,
    measuredLiveMin,
    measuredDictationMin,
    measuredConvTokensPerMin: uc.convBasis === 'exact' ? uc.convTokensPerMin : null,
    measuredFormIn: ucMeasured.formBasis === 'exact' ? ucMeasured.formInTok : null,
    measuredFormOut: ucMeasured.formBasis === 'exact' ? ucMeasured.formOutTok : null,
    measuredAnamnesisRuns:
      summary.activeDoctors > 0 && summary.monthFactor > 0 ? (summary.counts.anamnesisRuns / summary.activeDoctors) * summary.monthFactor : null,
    measuredPeakHourShare: peakHourShareOf(forms),
    measuredOpenaiShare: uc.openaiShareMeasured ? uc.openaiShare : null,
    measuredFreeShare: variable > 0 ? Math.max(0, 1 - (summary.cost.byClass.paid ?? 0) / variable) : null,
    measuredPackMix: packMix.payments > 0 ? packMix.payments : null,
    measuredPaymentMethod: topMethod.method,
    measuredPayments: incomeOk ? livePayments.length : null,
    serverStreamLimit: Number.isFinite(ds.config?.live?.streamsDefault) ? ds.config.live.streamsDefault : null,
    historyRows: cap.dashboard.rowsNow,
    dashboardReadsPerLoad:
      cap.dashboard.rowsNow +
      ds.doctorList.filter((doctor) => doctor.exists?.credits).length +
      ds.doctorList.filter((doctor) => doctor.exists?.profile).length,
    monthsToRowCap: cap.dashboard.s0MonthsToCap,
    internalCount: internalCount(ds),
    usdPerEur: ds.fx.usdPerEur,
    eurPerUsd: ds.fx.usdPerEur > 0 ? 1 / ds.fx.usdPerEur : null,
    fxDate: ds.fx.rateDate ?? null,
    pricesCheckedAt: ds.prices?.CHECKED_AT ?? null,
    pricesOrigin: ds.pricesOrigin,
    emailMode: ds.emailMode ?? 'off',
    windowFrom: window.from,
    windowTo: window.effTo,
  };

  const basis = {
    measuredVisitsPerDoctorMonth: headline.measuredVisitsPerDoctorMonth === null ? 'missing' : 'exact',
    measuredLiveShare: headline.measuredLiveShare === null ? 'missing' : 'exact',
    measuredLiveMin: measuredLiveMin === null ? 'missing' : 'exact',
    measuredDictationMin:
      measuredDictationMin === null ? 'missing' : dictationMinutes > 0 && estimatedMinutes / dictationMinutes >= ESTIMATE_SHARE ? 'estimate' : 'exact',
    measuredConvTokensPerMin: headline.measuredConvTokensPerMin === null ? 'missing' : 'exact',
    measuredFormIn: headline.measuredFormIn === null ? 'missing' : 'exact',
    measuredFormOut: headline.measuredFormOut === null ? 'missing' : 'exact',
    measuredAnamnesisRuns: headline.measuredAnamnesisRuns === null ? 'missing' : 'estimate',
    measuredPeakHourShare: headline.measuredPeakHourShare === null ? 'missing' : 'exact',
    measuredOpenaiShare: headline.measuredOpenaiShare === null ? 'missing' : 'exact',
    measuredFreeShare: headline.measuredFreeShare === null ? 'missing' : incomeOk ? 'exact' : 'inferred',
    measuredPackMix: incomeOk ? (packMix.payments > 0 ? 'exact' : 'missing') : 'missing',
    measuredPaymentMethod: topMethod.method ? 'exact' : 'missing',
    measuredPayments: incomeOk ? 'exact' : 'missing',
    serverStreamLimit: headline.serverStreamLimit === null ? 'missing' : 'exact',
    historyRows: 'exact',
    dashboardReadsPerLoad: 'estimate',
    monthsToRowCap: 'model',
    internalCount: 'exact',
    usdPerEur: 'exact',
    eurPerUsd: 'exact',
    fxDate: 'exact',
    pricesCheckedAt: 'exact',
    pricesOrigin: 'exact',
    emailMode: 'exact',
    windowFrom: 'exact',
    windowTo: 'exact',
  };

  const sources = sourceRows(ds);
  const candidates = internalCandidateRows(ds);
  const troubled = sources.filter((row) => !row.ok);
  const suggested = candidates.find((row) => row.suggested) ?? null;
  const chips = planChips({ plan: planning, scenario: resolveScenario(ds, 'plan', planning), pack: 'plan', vatPayer });

  const answer = [
    { key: 'settings.answer.plan', values: { visits: planning.visitsPerDoctorMonth, scenario: chips[1], pack: chips[2], vat: chips[3] }, tone: 'neutral' },
  ];
  if (headline.internalCount > 0) {
    answer.push({ key: headline.internalCount === 1 ? 'settings.answer.internalOne' : 'settings.answer.internalMany', values: { n: headline.internalCount }, tone: 'neutral' });
  } else if (suggested) {
    answer.push({ key: 'settings.answer.suggest', values: { name: ['doctor', suggested.pid], share: ['pct', suggested.formShare] }, tone: 'attention' });
  } else {
    answer.push({ key: 'settings.answer.noInternal', tone: 'neutral' });
  }
  answer.push(
    troubled.length === 0
      ? { key: 'settings.answer.sourcesOk', values: { n: sources.length }, tone: 'good' }
      : { key: 'settings.answer.sourcesBad', values: { n: troubled.length, total: sources.length, names: ['sources', troubled.map((row) => row.key)] }, tone: 'attention' },
  );

  const notes = [];
  const scopedForms = scopedRows(forms, ds, scope);
  const perDoctor = new Map();
  scopedForms.forEach((row) => perDoctor.set(row.pid, (perDoctor.get(row.pid) ?? 0) + 1));
  const topShare = scopedForms.length ? Math.max(...perDoctor.values()) / scopedForms.length : 0;
  if (topShare > TOP_DOCTOR_NOTE_SHARE) notes.push({ key: 'settings.note.topDoctor', values: { share: ['pct', topShare] } });
  if (lives.length < MIN_CONVERSATION_FORMS) notes.push({ key: 'settings.note.fewConversations', values: { n: lives.length } });
  if (uc.convBasis !== 'exact') notes.push({ key: 'settings.note.convAssumed' });
  uc.notes.forEach((note) => notes.push(note));

  const [s0] = planning.doctorScales;
  const perMonthAtS0 = s0 * planning.visitsPerDoctorMonth * cap.dashboard.rowsPerVisit;

  return {
    empty: ds.rows.length === 0,
    headline,
    basis,
    answer,
    series: [],
    tables: {
      sources,
      eras: eraRows(ds.nowMs),
      internalCandidates: candidates,
      dataQuality: qualityRows(ds),
      packMix: packMix.rows,
      rates: [{ key: 'main', model: uc.mainModel, inputPerM: uc.mainInputPerM, outputPerM: uc.mainOutputPerM, usdPerEur: ds.fx.usdPerEur }],
    },
    takeaways: {
      load: { key: headline.monthsToRowCap === null ? 'settings.load.noGrowth' : 'settings.load', values: { rows: headline.historyRows, s0, perMonth: perMonthAtS0, months: ['dec', headline.monthsToRowCap] } },
    },
    notes,
  };
}
