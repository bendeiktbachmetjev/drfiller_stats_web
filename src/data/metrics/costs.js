// Costs page metric (§4.3): what we owe vendors at list price, split by service, vendor and model;
// the price of one form over the months; hand-entered invoices next to the list price.
// Shared numbers (total, per form, per doctor in the plan) are picked from the core, never recounted.
import { MIN_EVENTS_PER_POINT } from '../constants.js';
import { MODEL_ERAS, SONIOX_SINCE_MS } from '../eras.js';
import { addDays, addMonths, compareCaveat, dayKeyOf, diffDays, eachDay, inPeriod, monthKeyOf, previousPeriod } from '../period.js';
import { formMonthly } from '../core/formTrend.js';
import { bucketFixedEur, fixedMonthUsd } from '../core/fixed.js';
import { remember } from '../core/memo.js';
import { projectScale } from '../core/projection.js';
import { hidesInternal, isInternal } from '../core/scope.js';
import { currentSetup } from '../core/setup.js';
import { summarize } from '../core/summary.js';
import { geminiPrice } from '../pricing/gemini.js';
import { EMPTY_RESULT, addTo, comparable, makeSeries, median, share, sum } from './shared.js';

/** Kinds that are a doctor's request and carry a cost (meter and failure rows cost nothing). */
const REQUEST_KINDS = new Set(['form', 'dictation', 'live', 'anamnesis']);

/** A change of the price of a form below this share reads as "hardly changed" (§4.3 answer). */
const FORM_FLAT_SHARE = 0.1;
/** Mean request or answer size must grow at least this much to be named as the cause. */
const SIZE_GROWTH = 1.1;
/** «Why a form got more expensive» takeaway: last full month ≥ 1.2 × the median of the first three. */
const WHY_UP_FACTOR = 1.2;

/** Series fields: by service, by vendor, by model; `fixed` (server) is the same in all three splits. */
export const SPLITS = Object.freeze({
  feature: Object.freeze(['form', 'recording', 'anamnesis', 'fixed']),
  provider: Object.freeze(['gemini', 'soniox', 'openai', 'fixed']),
  model: Object.freeze(['main', 'fallback', 'other', 'fixed']),
});
const SERIES_FIELDS = ['form', 'recording', 'anamnesis', 'gemini', 'soniox', 'openai', 'main', 'fallback', 'other', 'fixed', 'total', 'requests'];

const INVOICE_START = '2026-03';

// ---------------------------------------------------------------------------------------------------
// Row classification (mirrors core/summary.js, so every split adds up to the same total)
// ---------------------------------------------------------------------------------------------------

const featureOf = (row) => (row.kind === 'dictation' || row.kind === 'live' ? 'recording' : row.kind);

const providerOf = (row) => {
  if (row.kind === 'form' || row.kind === 'anamnesis') return 'gemini';
  if (row.kind === 'live') return 'soniox';
  return row.provider === 'soniox' ? 'soniox' : 'openai';
};

/** Today's main / backup model by identity (forms only); everything else is "other models". */
const modelGroupOf = (row, setup) => {
  if (row.kind !== 'form') return 'other';
  if (row.model === setup.main) return 'main';
  if (setup.fallback && row.model === setup.fallback) return 'fallback';
  return 'other';
};

const isSoniox = (row) => (row.kind === 'dictation' || row.kind === 'live') && providerOf(row) === 'soniox';

/** Request rows of the period in the business scope (the same rows summarize() counts). */
function periodRows(ds, period, scope) {
  const hide = hidesInternal(ds, scope);
  return (ds.rows ?? []).filter((row) => REQUEST_KINDS.has(row.kind) && inPeriod(row.t, period) && !(hide && isInternal(row.pid, ds)));
}

const planningOfScope = (ds, scope) => scope?.planning ?? ds.settings?.planning;
const usdToEur = (ds, usd) => (Number.isFinite(usd) ? usd / (ds.fx?.usdPerEur ?? 1) : null);

/** Last elapsed Vilnius month of a period ('YYYY-MM'). */
const lastMonthOf = (period) => (period.effTo > period.from ? addDays(period.effTo, -1) : period.from).slice(0, 7);

/** Months ('YYYY-MM') that the elapsed part of a period touches. */
function monthsOf(period) {
  const last = lastMonthOf(period);
  const months = [];
  for (let first = `${period.from.slice(0, 7)}-01`; first.slice(0, 7) <= last; first = addMonths(first, 1)) months.push(first.slice(0, 7));
  return months;
}

// ---------------------------------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------------------------------

function costSeries(ds, period, rows, planning, setup) {
  const { rows: series, indexOf } = makeSeries(period, SERIES_FIELDS);
  rows.forEach((row) => {
    const bucket = series[indexOf(row.t)];
    if (!bucket) return;
    addTo(bucket, featureOf(row), row.costEur);
    addTo(bucket, providerOf(row), row.costEur);
    addTo(bucket, modelGroupOf(row, setup), row.costEur);
    addTo(bucket, 'total', row.costEur);
    addTo(bucket, 'requests', 1);
  });
  series.forEach((bucket) => {
    if (bucket.fixed === null) return;
    bucket.fixed = bucketFixedEur(ds, bucket, period, planning);
    bucket.total += bucket.fixed;
  });
  return series;
}

// ---------------------------------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------------------------------

const meanTokens = (forms) => ({
  inTok: forms.length ? sum(forms.map((row) => row.inTok)) / forms.length : null,
  outTok: forms.length ? sum(forms.map((row) => row.outTok)) / forms.length : null,
});

/** The model era that covers most of a window (the same rule as period.compareCaveat). */
function dominantEra(fromMs, toMs) {
  let best = null;
  let bestMs = 0;
  MODEL_ERAS.forEach((era) => {
    const overlap = Math.min(toMs, era.toMs ?? Infinity) - Math.max(fromMs, era.fromMs);
    if (overlap > bestMs) {
      best = era;
      bestMs = overlap;
    }
  });
  return best;
}

const grew = (cur, prev) => Number.isFinite(cur) && Number.isFinite(prev) && prev > 0 && cur >= prev * SIZE_GROWTH;

/**
 * The price of one form against the comparison window, with its main cause (first match):
 * size (request +10 %, same model) · era (another model) · longer (answer +10 %) · other.
 * @returns {{ key: string, values: object, tone: string } | null}
 */
function formPriceAnswer(ds, period, scope, summary, forms) {
  const cpf = summary.unit.costPerFormEur;
  if (cpf === null) return null;
  const values = { cpf: ['eurUnit', cpf] };
  const prev = previousPeriod(period);
  const prevSummary = prev && comparable(ds, prev) ? summarize(ds, prev, scope) : null;
  const prevCpf = prevSummary?.unit.costPerFormEur ?? null;
  if (!(prevCpf > 0)) return { key: 'costs.answer.formOnly', values, tone: 'neutral' };

  const change = cpf / prevCpf - 1;
  if (Math.abs(change) < FORM_FLAT_SHARE) return { key: 'costs.answer.formFlat', values, tone: 'neutral' };
  if (change < 0) return { key: 'costs.answer.formDown', values: { ...values, delta: ['pct', -change] }, tone: 'good' };

  const up = { ...values, delta: ['pct', change] };
  const cur = meanTokens(forms);
  const before = meanTokens(periodRows(ds, prev, scope).filter((row) => row.kind === 'form'));
  const eraChanged = compareCaveat(period, prev).modelEraChanged;
  if (grew(cur.inTok, before.inTok) && !eraChanged) {
    return { key: 'costs.answer.formUp.size', values: { ...up, pages: ['pages', cur.inTok] }, tone: 'attention' };
  }
  if (eraChanged) {
    const era = dominantEra(period.fromMs, period.effToMs);
    return { key: 'costs.answer.formUp.era', values: { ...up, model: ['model', era?.main ?? null] }, tone: 'attention' };
  }
  if (grew(cur.outTok, before.outTok)) return { key: 'costs.answer.formUp.longer', values: up, tone: 'attention' };
  return { key: 'costs.answer.formUp.other', values: up, tone: 'attention' };
}

/** "Google's real invoice is smaller": the latest month of the period with promo credits entered. */
function promoAnswer(ds, period) {
  const months = new Set(monthsOf(period));
  const entry = [...(ds.costsMonthly ?? [])]
    .reverse()
    .find((month) => months.has(month.month) && month.googlePromoCreditsEur > 0);
  if (!entry) return null;
  return { key: 'costs.answer.promo', values: { promo: ['eur', entry.googlePromoCreditsEur], month: ['month', entry.month] }, tone: 'neutral' };
}

// ---------------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------------

/** "Where the money went": one row per service; the rows add up to the total. */
function whereWentRows(summary, rows, fixedMonthEur) {
  const { byFeature } = summary.cost;
  const openaiMinutes = sum(rows.filter((row) => row.kind === 'dictation' && providerOf(row) === 'openai').map((row) => (row.audioSec ?? 0) / 60));
  const runs = summary.counts.anamnesisRuns;
  const liveMin = summary.minutes.live;
  return [
    { key: 'form', valueEur: byFeature.form, count: summary.counts.forms, unitEur: share(byFeature.form, summary.counts.forms) },
    { key: 'anamnesis', valueEur: byFeature.anamnesis, count: runs, unitEur: share(byFeature.anamnesis, runs) },
    { key: 'live', valueEur: byFeature.live, minutes: liveMin, unitEur: share(byFeature.live, liveMin / 10) },
    { key: 'dictation', valueEur: byFeature.dictation, minutes: summary.minutes.dictation, openaiMinutes },
    { key: 'fixed', valueEur: summary.cost.fixedEur, perMonthEur: fixedMonthEur },
  ];
}

/** Forms by model and where it ran: role, amount of text, cost and cost per form. */
function byModelRows(forms) {
  const groups = new Map();
  forms.forEach((row) => {
    const key = `${row.model ?? 'unknown'}|${row.endpoint ?? 'direct'}|${row.location ?? ''}`;
    const group = groups.get(key) ?? {
      key, model: row.model, endpoint: row.endpoint ?? 'direct', location: row.location ?? null,
      roles: { main: 0, fallback: 0, switch: 0 }, forms: 0, inTok: 0, outTok: 0, costEur: 0,
    };
    group.forms += 1;
    group.inTok += row.inTok;
    group.outTok += row.outTok;
    group.costEur += row.costEur;
    if (row.role in group.roles) group.roles[row.role] += 1;
    groups.set(key, group);
  });
  const total = sum([...groups.values()].map((group) => group.costEur));
  return [...groups.values()]
    .map((group) => {
      const [role] = Object.entries(group.roles).sort((a, b) => b[1] - a[1])[0];
      return { ...group, role, perFormEur: share(group.costEur, group.forms), share: share(group.costEur, total) };
    })
    .sort((a, b) => b.costEur - a.costEur);
}

/** Fixed costs: Railway (Dr.Filler share), Firestore (free tier) and other, per month and for the period. */
function fixedRows(ds, period, planning, month) {
  let railwayUsd = 0;
  let otherUsd = 0;
  if (period.effTo > period.from) {
    eachDay(period.from, period.effTo).forEach((day) => {
      const first = `${day.slice(0, 7)}-01`;
      const days = diffDays(first, addMonths(first, 1));
      const fixed = fixedMonthUsd(ds, day.slice(0, 7), planning);
      railwayUsd += fixed.railwayUsd / days;
      otherUsd += fixed.otherUsd / days;
    });
  }
  const shown = fixedMonthUsd(ds, month, planning);
  return [
    { key: 'railway', month, perMonthEur: usdToEur(ds, shown.railwayUsd), periodEur: usdToEur(ds, railwayUsd), source: shown.entered ? 'invoice' : 'settings' },
    { key: 'firestore', month, perMonthEur: 0, periodEur: 0, source: 'freeTier' },
    { key: 'other', month, perMonthEur: usdToEur(ds, shown.otherUsd), periodEur: usdToEur(ds, otherUsd), source: 'settings' },
  ];
}

const nullableSum = (values) => {
  const known = values.filter(Number.isFinite);
  return known.length ? sum(known) : null;
};

/**
 * Every month since 2026-03 (newest first), all accounts (the invoices cover all traffic): Google and
 * Soniox at list price next to what was entered by hand. Not bound to the period.
 */
function invoiceRows(ds) {
  return remember(ds, 'costs.invoices', () => {
    const list = new Map();
    (ds.rows ?? []).forEach((row) => {
      if (!REQUEST_KINDS.has(row.kind)) return;
      const entry = list.get(row.monthKey) ?? { google: 0, soniox: 0 };
      if (providerOf(row) === 'gemini') entry.google += row.costEur;
      else if (isSoniox(row)) entry.soniox += row.costEur;
      list.set(row.monthKey, entry);
    });
    const entered = new Map((ds.costsMonthly ?? []).map((month) => [month.month, month]));
    const rows = [];
    const last = monthKeyOf(ds.nowMs);
    for (let first = `${INVOICE_START}-01`; first.slice(0, 7) <= last; first = addMonths(first, 1)) {
      const month = first.slice(0, 7);
      const e = entered.get(month) ?? {};
      const num = (v) => (Number.isFinite(v) ? v : null);
      const googleInvoiceEur = num(e.googleInvoiceEur);
      const googlePromoCreditsEur = num(e.googlePromoCreditsEur);
      const googlePaidEur = googleInvoiceEur === null ? null : Math.max(0, googleInvoiceEur - (googlePromoCreditsEur ?? 0));
      const railwayUsd = num(e.railwayUsd);
      const sonioxInvoiceUsd = num(e.sonioxInvoiceUsd);
      const openaiInvoiceUsd = num(e.openaiInvoiceUsd);
      const otherEur = num(e.otherEur);
      const railwayEur = usdToEur(ds, railwayUsd);
      const sonioxInvoiceEur = usdToEur(ds, sonioxInvoiceUsd);
      const openaiInvoiceEur = usdToEur(ds, openaiInvoiceUsd);
      rows.push({
        key: month,
        month,
        googleListEur: list.get(month)?.google ?? 0,
        googleInvoiceEur,
        googlePromoCreditsEur,
        googlePaidEur,
        railwayUsd,
        railwayEur,
        sonioxListEur: list.get(month)?.soniox ?? 0,
        sonioxInvoiceUsd,
        sonioxInvoiceEur,
        openaiInvoiceUsd,
        openaiInvoiceEur,
        otherEur,
        totalEur: nullableSum([googlePaidEur, railwayEur, sonioxInvoiceEur, openaiInvoiceEur, otherEur]),
        note: typeof e.note === 'string' ? e.note : '',
        updatedAt: num(e.updatedAt),
      });
    }
    return rows.reverse();
  });
}

/**
 * Soniox check: our list-price estimate next to Soniox's own numbers, per Vilnius day, for the days
 * the period shares with Soniox's 90-day window (all accounts: Soniox does not know our scope).
 */
function sonioxCheck(ds, period) {
  const sourceStatus = ds.sources?.soniox?.status ?? 'error';
  const api = ds.soniox;
  const base = { key: 'total', status: 'ok', partial: false, from: null, to: null, oursEur: null, theirsEur: null, diffShare: null };
  if (!api || api.status === 'off' || api.status === 'error' || sourceStatus === 'off' || sourceStatus === 'error') {
    const status = api?.status === 'off' || sourceStatus === 'off' ? 'off' : 'error';
    return { summary: { ...base, status }, days: [] };
  }
  const sinceDay = dayKeyOf(SONIOX_SINCE_MS);
  const windowFrom = api.range?.from ? dayKeyOf(Date.parse(api.range.from)) : sinceDay;
  const windowTo = api.range?.to ? addDays(dayKeyOf(Date.parse(api.range.to)), 1) : period.effTo;
  const from = [period.from, windowFrom, sinceDay].sort().at(-1);
  const to = [period.effTo, windowTo].sort()[0];
  const partial = api.status === 'partial' || (period.from < windowFrom && windowFrom > sinceDay);
  if (!(from < to)) return { summary: { ...base, status: period.effTo <= sinceDay ? 'before' : 'none', partial }, days: [] };

  const ours = new Map();
  (ds.rows ?? []).forEach((row) => {
    if (isSoniox(row) && row.t >= SONIOX_SINCE_MS && row.dayKey >= from && row.dayKey < to) ours.set(row.dayKey, (ours.get(row.dayKey) ?? 0) + row.costEur);
  });
  const theirs = new Map();
  (api.days ?? []).forEach((day) => {
    if (day.day >= from && day.day < to) theirs.set(day.day, (theirs.get(day.day) ?? 0) + (day.costUsd ?? 0));
  });
  const days = [...new Set([...ours.keys(), ...theirs.keys()])].sort().map((day) => {
    const theirsUsd = theirs.get(day) ?? 0;
    return { key: day, day, oursEur: ours.get(day) ?? 0, theirsEur: usdToEur(ds, theirsUsd), theirsUsd };
  });
  if (days.length === 0) return { summary: { ...base, status: 'none', partial, from, to }, days };
  const oursEur = sum(days.map((day) => day.oursEur));
  const theirsEur = sum(days.map((day) => day.theirsEur));
  return {
    summary: { ...base, partial, from, to, oursEur, theirsEur, diffShare: oursEur > 0 ? theirsEur / oursEur - 1 : null },
    days,
  };
}

/** Month rows of «Why a form got more expensive»: all time, points under 5 forms are gaps (§3.12). */
function formMonthRows(ds, period, scope) {
  const months = new Set(monthsOf(period));
  const current = monthKeyOf(ds.nowMs);
  return formMonthly(ds, scope).map((month) => {
    const enough = month.forms >= MIN_EVENTS_PER_POINT;
    return {
      key: month.monthKey,
      monthKey: month.monthKey,
      forms: month.forms,
      costPerFormEur: enough ? month.costPerFormEur : null,
      meanPages: enough ? month.meanPages : null,
      meanInTok: month.meanInTok,
      meanOutTok: month.meanOutTok,
      inPeriod: months.has(month.monthKey),
      isPartial: month.monthKey === current,
    };
  });
}

/** Takeaway when the last full month's form costs ≥ 1.2 × the median of the first three months. */
function whyUpTakeaway(months, nowMs) {
  const known = months.filter((month) => month.costPerFormEur !== null);
  if (known.length < 4) return null;
  const firstThree = known.slice(0, 3);
  const lastFullKey = addMonths(`${monthKeyOf(nowMs)}-01`, -1).slice(0, 7);
  const last = known.find((month) => month.monthKey === lastFullKey);
  if (!last || firstThree.includes(last)) return null;
  const before = median(firstThree.map((month) => month.costPerFormEur));
  if (!(last.costPerFormEur >= before * WHY_UP_FACTOR)) return null;
  return {
    key: 'costs.takeaway.whyUp',
    values: {
      fromMonth: ['month', firstThree[0].monthKey],
      a: ['eurUnit', before],
      b: ['eurUnit', last.costPerFormEur],
      x: ['int', median(firstThree.map((month) => month.meanPages))],
      y: ['int', last.meanPages],
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Headline extras and notes
// ---------------------------------------------------------------------------------------------------

/** Google's discount for repeated (cached) text at list price; never subtracted from costs. null without such rows. */
function cacheSavingEur(ds, forms) {
  const cached = forms.filter((row) => row.cachedTok > 0);
  if (cached.length === 0) return null;
  const usd = sum(
    cached.map((row) => {
      const price = geminiPrice(ds.prices, row.model, { at: row.t, platform: row.endpoint ?? 'direct', endpoint: row.location ?? 'global' });
      return (row.cachedTok * Math.max(0, price.inputPerM - price.cachedInputPerM)) / 1e6;
    }),
  );
  return usdToEur(ds, usd);
}

function notesOf(rows, forms) {
  const notes = [];
  if (forms.some((row) => row.endpoint === 'vertex' && row.location && row.location !== 'global')) notes.push({ key: 'costs.note.vertexSurcharge' });
  const byBytes = rows.filter((row) => row.kind === 'dictation' && row.audioBasis === 'bytes_estimate').length;
  if (byBytes > 0) notes.push({ key: 'costs.note.openaiBytes', values: { n: byBytes } });
  const unknown = [...new Set(rows.filter((row) => (row.kind === 'form' || row.kind === 'anamnesis') && row.costBasis === 'estimated').map((row) => row.model))].filter(Boolean).sort();
  if (unknown.length > 0) notes.push({ key: 'costs.note.unknownModel', values: { models: unknown.join(', ') } });
  return notes;
}

// ---------------------------------------------------------------------------------------------------
// Metric
// ---------------------------------------------------------------------------------------------------

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Headline `total`, `perForm` and `perDoctorPlan` are the core's own values (§6.3).
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {object} [opts] page-local, JSON-serialisable (the chart split is chosen on the page; all splits are returned)
 * @returns {import('./shared.js').AreaResult}
 */
export function computeCosts(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const summary = summarize(ds, period, scope);
  const planning = planningOfScope(ds, scope);
  const setup = currentSetup(ds);
  const rows = periodRows(ds, period, scope);
  const forms = rows.filter((row) => row.kind === 'form');
  const projection = projectScale(ds, period, scope);

  const month = lastMonthOf(period);
  const fixedMonth = fixedMonthUsd(ds, month, planning);
  const fixedMonthEur = usdToEur(ds, fixedMonth.usd);
  const saving = cacheSavingEur(ds, forms);

  const headline = {
    total: summary.cost.totalEur,
    perForm: summary.unit.costPerFormEur,
    perDoctorPlan: projection.columns.doctor.costTotalEur,
    fixedMonth: fixedMonthEur,
    formCount: summary.counts.forms,
    cacheSavingEur: saving,
  };
  const basis = {
    total: summary.cost.basis,
    perForm: summary.cost.basis,
    perDoctorPlan: 'model',
    fixedMonth: fixedMonth.entered ? 'exact' : 'estimate',
    formCount: 'exact',
    cacheSavingEur: 'estimate',
  };

  const { byFeature } = summary.cost;
  const answer = [
    {
      key: 'costs.answer.split',
      values: {
        cost: ['eur', summary.cost.totalEur],
        form: ['eur', byFeature.form],
        anam: ['eur', byFeature.anamnesis],
        rec: ['eur', byFeature.dictation + byFeature.live],
        fixed: ['eur', byFeature.fixed],
      },
      tone: 'neutral',
    },
    formPriceAnswer(ds, period, scope, summary, forms),
    promoAnswer(ds, period),
  ].filter(Boolean);

  const months = formMonthRows(ds, period, scope);
  const whyUp = whyUpTakeaway(months, ds.nowMs);
  const soniox = sonioxCheck(ds, period);

  return {
    empty: rows.length === 0,
    headline,
    basis,
    answer,
    series: costSeries(ds, period, rows, planning, setup),
    tables: {
      whereWent: whereWentRows(summary, rows, fixedMonthEur),
      byModel: byModelRows(forms),
      fixed: fixedRows(ds, period, planning, month),
      fixedMemo: [{ key: 'stripeFees', feeEur: summary.income.status === 'ok' ? summary.income.feeEur : null }],
      invoices: invoiceRows(ds),
      soniox: [soniox.summary],
      sonioxDays: soniox.days,
      formMonthly: months,
    },
    takeaways: whyUp ? { whyUp } : {},
    projection,
    notes: notesOf(rows, forms),
  };
}
