// Money page metric (§4.2): payments, credits, one credit and one visit, and the plan at 100–300 doctors.
// Pure. Every number that also appears on another page is picked from the F0 core (summarize,
// unitEconomics, projectScale, sensitivity, capacity), never recounted here (§2 rule 2).
import { METER_SINCE_MS } from '../eras.js';
import { dateToMs, moneyGranularity } from '../period.js';
import { bucketFixedEur } from '../core/fixed.js';
import { incomeOf, paymentCredits, paymentMoney } from '../core/income.js';
import { creditMoney, packsOf } from '../core/packs.js';
import { capacity, planningOf, projectScale, scenarioLabel, sensitivity, unitCosts } from '../core/projection.js';
import { hidesInternal, isInternal } from '../core/scope.js';
import { summarize } from '../core/summary.js';
import { unitEconomics } from '../core/unitEconomics.js';
import { EMPTY_RESULT, addTo, inPeriod, makeSeries } from './shared.js';

/** Page-local pack switch of "One credit and one visit" (§4.2 C); 'plan' = the packMix-weighted pack. */
export const PACK_OPTIONS = Object.freeze(['plan', 'pack250', 'pack600', 'pack1500']);
/** Page-local scenario switch of "Scale" (§4.2 D); 'plan' = the planning fields, 'measured' = as now. */
export const SCENARIO_OPTIONS = Object.freeze(['plan', 'measured', 'typed', 'dictation1', 'live15', 'live25']);
/** Rows of the scale table (§4.2 D, default 4 rows) — keys of a ScaleColumn. */
export const SCALE_ROWS = Object.freeze(['netEur', 'costTotalEur', 'resultEur', 'marginPct']);
/** The 13 steps of "Show the math step by step" — keys of a ScaleColumn. */
export const STEP_ROWS = Object.freeze([
  'visits', 'creditsSpent', 'grossEur', 'vatEur', 'feeEur', 'netEur', 'costGeminiFormsEur', 'costSonioxEur',
  'costOpenaiEur', 'costAnamnesisEur', 'costFixedEur', 'resultEur', 'marginPct',
]);
/** ScaleResult columns shown on this page, in order ('nowTotal' only in the step table). */
export const SCALE_COLUMNS = Object.freeze(['now', 'nowTotal', 'visit', 'doctor', 's0', 's1']);
/** The anatomy rows (§4.2 C): the two bars first, then the two extra table rows. */
export const ANATOMY_ROWS = Object.freeze(['form', 'live10', 'dictation10', 'anamnesis1']);

const MONEY_FIELDS = ['income', 'cost', 'result', 'costForm', 'costRecording', 'costAnamnesis', 'costFixed', 'costUsd'];
const COST_FIELD = { form: 'costForm', dictation: 'costRecording', live: 'costRecording', anamnesis: 'costAnamnesis' };
/** The dashboard row cap counts as "reached" when it is at most this many months away. */
const DASHBOARD_MONTHS = 12;
/** Sensitivity differences smaller than this (€ a month) are not worth a sentence. */
const SENSITIVITY_MIN_EUR = 0.5;
const TOP_SENSITIVITY = 3;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Income, cost and result per money bucket (week ≤ 90 days, else month). Costs follow the summary's rows
 * (form, recording, medical history) plus the fixed cost of each bucket's elapsed days; income is the
 * core income of the bucket. So Σ income = summary.income.netEur and Σ cost = summary.cost.totalEur.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {{ incomeOk: boolean, planning: object }} options
 * @returns {import('./shared.js').SeriesRow[]}
 */
export function moneySeriesOf(ds, period, scope, { incomeOk, planning }) {
  const { rows, indexOf } = makeSeries(period, MONEY_FIELDS, { granularity: moneyGranularity(period) });
  const hide = hidesInternal(ds, scope);
  (ds.rows ?? []).forEach((row) => {
    const field = COST_FIELD[row.kind];
    if (!field || !inPeriod(row.t, period) || (hide && isInternal(row.pid, ds))) return;
    const bucket = rows[indexOf(row.t)];
    addTo(bucket, field, row.costEur);
    addTo(bucket, 'costUsd', row.costUsd);
  });
  const usdPerEur = ds.fx?.usdPerEur ?? 1;
  rows.forEach((bucket) => {
    if (bucket.isFuture) return;
    bucket.costFixed = bucketFixedEur(ds, bucket, period, planning);
    bucket.costUsd += bucket.costFixed * usdPerEur;
    bucket.cost = bucket.costForm + bucket.costRecording + bucket.costAnamnesis + bucket.costFixed;
    if (!incomeOk) {
      bucket.income = null;
      bucket.result = null;
      return;
    }
    bucket.income = incomeOf(ds, { fromMs: dateToMs(bucket.from), toMs: dateToMs(bucket.to) }, scope).netEur;
    bucket.result = bucket.income - bucket.cost;
  });
  return rows;
}

const scopedPaymentsIn = (ds, period, scope) => {
  const hide = hidesInternal(ds, scope);
  return (ds.payments ?? []).filter((payment) => inPeriod(payment.t, period) && !(hide && payment.pid && isInternal(payment.pid, ds)));
};

/** Every purchase of the period with its money (§4.2 A "Purchases"); empty unless Stripe is live. */
function paymentRows(payments, { prices, vatPayer }) {
  return payments.map((payment) => {
    const money = paymentMoney(payment, { prices, vatPayer });
    return {
      key: payment.id,
      t: payment.t,
      pid: payment.pid ?? null,
      packId: payment.packId ?? null,
      credits: paymentCredits(payment),
      grossEur: money.grossEur,
      discountEur: money.discountEur,
      feeEur: money.feeEur,
      feeEstimated: money.feeEstimated,
      vatEur: money.vatEur,
      netEur: money.netEur,
      method: payment.method ?? 'other',
      refundEur: money.refundEur,
      credited: payment.credited ?? 'unknown',
    };
  });
}

/** Pack prices, what Stripe (EU card) and VAT take, and what one credit leaves (§4.2 A "Packs"). */
function packRows(ds, payments, { vatPayer, incomeOk }) {
  return packsOf(ds).map((pack) => {
    const perCredit = creditMoney(pack.id, { vatPayer, method: 'card_eea_standard', prices: ds.prices, packs: packsOf(ds) });
    const bought = payments.filter((payment) => payment.packId === pack.id);
    return {
      key: pack.id,
      credits: pack.credits,
      priceEur: pack.priceEur,
      feeEur: perCredit.feeEur * pack.credits,
      vatEur: perCredit.vatEur * pack.credits,
      netEur: perCredit.netEur * pack.credits,
      perCreditEur: perCredit.netEur,
      bought: incomeOk ? bought.length : null,
      boughtEur: incomeOk ? bought.reduce((acc, payment) => acc + (payment.grossCents ?? 0) / 100, 0) : null,
    };
  });
}

/**
 * One credit split into VAT + fee, our cost and what we keep; shares of the credit price sum to 1.
 * A credit that costs more than it brings is drawn as cost 100 % in red (`negative`).
 * @param {import('../core/unitEconomics.js').UnitEconomics['perCredit']} perCredit
 * @returns {Array<{ key: string, priceEur: number, vatEur: number, feeEur: number, costEur: number, leftEur: number,
 *   shareLeft: number|null, negative: boolean, shares: { vatFee: number, cost: number, left: number } }>}
 */
export function anatomyRows(perCredit) {
  return ANATOMY_ROWS.map((key) => {
    const row = perCredit[key];
    const negative = row.leftEur < 0;
    const price = row.priceEur;
    const shares = negative || !(price > 0)
      ? { vatFee: 0, cost: 1, left: 0 }
      : { vatFee: (row.vatEur + row.feeEur) / price, cost: row.costEur / price, left: row.leftEur / price };
    return {
      key,
      priceEur: row.priceEur,
      vatEur: row.vatEur,
      feeEur: row.feeEur,
      costEur: row.costEur,
      leftEur: row.leftEur,
      shareLeft: row.shareLeft,
      negative,
      shares,
    };
  });
}

const scaleRowsOf = (projection, keys, columns) =>
  keys.map((key) => {
    const row = { key };
    columns.forEach((column) => {
      row[column] = projection.columns[column]?.[key] ?? null;
    });
    return row;
  });

/** Only the limits that are reached at s0 or s1 (§4.2 D "Where we hit a limit"), smallest scale first. */
function capacityRows(cap, scales) {
  const [n0, n1] = scales;
  const rows = [];
  const { soniox, firestore, dashboard } = cap;
  const sonioxAt = soniox.s0.p95 > soniox.limit ? { n: n0, p95: soniox.s0.p95 } : soniox.s1.p95 > soniox.limit ? { n: n1, p95: soniox.s1.p95 } : null;
  if (sonioxAt) rows.push({ key: 'soniox', n: sonioxAt.n, value: sonioxAt.p95, limit: soniox.limit, ratio: sonioxAt.p95 / soniox.limit });
  const writesAt = firestore.s0Writes > firestore.free
    ? { n: n0, writes: firestore.s0Writes, eur: firestore.s0Eur }
    : firestore.s1Writes > firestore.free
      ? { n: n1, writes: firestore.s1Writes, eur: firestore.s1Eur }
      : null;
  if (writesAt) rows.push({ key: 'firestore', n: writesAt.n, value: writesAt.writes, limit: firestore.free, eur: writesAt.eur, ratio: writesAt.writes / firestore.free });
  const soon = (months) => months !== null && months <= DASHBOARD_MONTHS;
  const rowsAt = soon(dashboard.s0MonthsToCap) ? { n: n0, months: dashboard.s0MonthsToCap } : soon(dashboard.s1MonthsToCap) ? { n: n1, months: dashboard.s1MonthsToCap } : null;
  if (rowsAt) rows.push({ key: 'dashboard', n: rowsAt.n, months: rowsAt.months, value: dashboard.rowsNow, limit: dashboard.cap, ratio: dashboard.rowsNow / dashboard.cap });
  return rows;
}

/** The sensitivity rows (core order: |difference| desc) with a sentence; the top 3 that matter are marked. */
function sensitivityRows(rows, doctors) {
  let shown = 0;
  return rows.map((row) => {
    const top = shown < TOP_SENSITIVITY && Math.abs(row.diffEur) >= SENSITIVITY_MIN_EUR;
    if (top) shown += 1;
    // The sentence names the change ("… €960 less a month"), never a bare signed sum that reads as the new result.
    const values = { change: { key: `money.sensitivity.change.${row.key}` }, diff: ['eur', Math.abs(row.diffEur)], doctors };
    return {
      key: row.key,
      resultEur: row.resultEur,
      diffEur: row.diffEur,
      top,
      line: { key: row.diffEur >= 0 ? 'money.sensitivity.more' : 'money.sensitivity.less', values },
    };
  });
}

const cheapestPack = (ds) =>
  packsOf(ds).reduce((best, pack) => (!best || pack.priceEur / pack.credits < best.priceEur / best.credits ? pack : best), null)?.id ?? 'pack1500';

const recordingBasisOf = (spent) => (spent.recordingBasis === 'estimate' || spent.recordingBasis === 'mixed' ? 'estimate' : 'exact');

function planSentence(projection) {
  const [s0, s1] = projection.scales;
  const { resultEur: r0, marginPct } = projection.columns.s0;
  const values = {
    scenario: scenarioLabel(projection.scenario),
    s0,
    s1,
    r0: ['eurSigned', r0],
    r1: ['eurSigned', projection.columns.s1.resultEur],
  };
  if (!isNum(marginPct)) return { key: 'money.answer.planNoIncome', values, tone: 'neutral' };
  return { key: 'money.answer.plan', values: { ...values, pct: ['pct', marginPct] }, tone: r0 >= 0 ? 'good' : 'attention' };
}

function answerOf({ status, summary, inferred }) {
  const { income } = summary;
  const cost = ['eur', summary.cost.totalEur];
  if (status === 'off') {
    if (inferred && inferred.purchases > 0) {
      return { key: 'money.answer.revenueOff', values: { n: inferred.purchases, sum: ['eurCents', inferred.eur] }, tone: 'attention' };
    }
    return { key: 'money.answer.revenueOffNone', values: { cost }, tone: 'attention' };
  }
  if (status === 'error') return { key: 'money.answer.revenueError', values: { cost }, tone: 'attention' };
  if (status === 'test') return { key: 'money.answer.revenueTest', values: { cost }, tone: 'attention' };
  if (income.payments > 0) return null;
  return Number.isFinite(income.lastPaymentMs)
    ? { key: 'money.answer.noPaymentsLast', values: { date: ['date', income.lastPaymentMs] }, tone: 'neutral' }
    : { key: 'money.answer.noPayments', tone: 'neutral' };
}

function notesOf({ ds, period, summary, visitTypes, uc }) {
  const notes = [];
  const { income, creditsSpent } = summary;
  if (period.fromMs < METER_SINCE_MS && recordingBasisOf(creditsSpent) === 'estimate') notes.push({ key: 'money.note.beforeMeter' });
  if (income.status === 'ok' && income.disputeEur !== 0) notes.push({ key: 'money.note.disputes', values: { x: ['eur', Math.abs(income.disputeEur)] } });
  if (income.status === 'ok' && income.basis === 'estimate') notes.push({ key: 'money.note.feeEstimated' });
  if (income.status === 'ok' && ds.revenue?.ignoredSessions > 0) notes.push({ key: 'money.note.ignored', values: { n: ds.revenue.ignoredSessions } });
  const measured = visitTypes.find((row) => row.id === 'measured');
  if (measured?.basis === 'missing') {
    notes.push({ key: 'money.note.fewRecordings', values: { n: summary.counts.dictations + summary.counts.liveConversations } });
  }
  (uc.notes ?? []).forEach((note) => notes.push(note));
  return notes;
}

/**
 * Pure. No Date.now() (clock = ds.nowMs), no window, no React, no copy strings, no formatting.
 * Headlines shared with other pages are the core values themselves: result === summary.resultEur,
 * net === summary.income.netEur (null while Stripe is not live), creditsSpent === summary.creditsSpent.total,
 * balances / freeBalances === summary.balances.total / .free; tables.capacity comes from capacity().
 * `takeaways` holds the line under each section title (payments, credits, unit, scale) and, only when the
 * money chart must not be drawn, `moneyChart` = the sentence that replaces it.
 * @param {import('../buildDataset.js').Dataset} ds
 * @param {import('../period.js').Period} period
 * @param {import('../core/scope.js').Scope} scope
 * @param {{ pack?: 'plan'|'pack250'|'pack600'|'pack1500', scenario?: string }} [opts] page-local switches
 * @returns {import('./shared.js').AreaResult}
 */
export function computeMoney(ds, period, scope, opts = {}) {
  if (!ds || !period) return EMPTY_RESULT;
  const pack = PACK_OPTIONS.includes(opts.pack) ? opts.pack : 'plan';
  const scenario = SCENARIO_OPTIONS.includes(opts.scenario) ? opts.scenario : 'plan';
  const planning = scope?.planning ?? ds.settings?.planning;
  const plan = planningOf(planning);
  const vatPayer = Boolean(scope?.vatPayer ?? ds.settings?.vatPayer);

  const summary = summarize(ds, period, scope);
  const { income, creditsSpent, balances } = summary;
  const status = income.status;
  const incomeOk = status === 'ok';
  const inferred = status === 'off' || status === 'error' ? income.inferredLifetime : null;

  // One credit (chosen pack) and the plan pack; costs are the plan unit costs (D17) for both.
  const unit = unitEconomics(ds, period, scope, { pack });
  const planUnit = pack === 'plan' ? unit : unitEconomics(ds, period, scope, { pack: 'plan' });
  const worstUnit = unitEconomics(ds, period, scope, { pack: cheapestPack(ds), vatPayer: true });
  const uc = unitCosts(ds, plan);

  // The plan: the chosen scenario for "Scale", the plan scenario for the answer and the safe free share.
  const projection = projectScale(ds, period, scope, { scenario });
  const planProjection = scenario === 'plan' ? projection : projectScale(ds, period, scope, { scenario: 'plan' });
  const packProjection = pack === 'plan' ? planProjection : projectScale(ds, period, scope, { scenario: 'plan', pack });
  const netPerVisit = packProjection.unit.visitCredits * unit.money.netEur;
  const safeFreeShare = netPerVisit > 0 ? 1 - packProjection.unit.visitCostEur / netPerVisit : null;
  const cap = capacity(ds, { planning, scenario });

  const payments = incomeOk ? scopedPaymentsIn(ds, period, scope) : [];
  const doctorsKnown = ds.sources?.doctors?.status === 'ok' || (ds.doctorList?.length ?? 0) > 0;
  const freeBalances = doctorsKnown ? balances.free : null;
  const live15Worst = worstUnit.visitTypes.find((row) => row.id === 'live15');

  const headline = {
    incomeStatus: status,
    gross: incomeOk ? income.grossEur : null,
    net: incomeOk ? income.netEur : null,
    feeEur: incomeOk ? income.feeEur : null,
    vatEur: incomeOk ? income.vatEur : null,
    cost: summary.cost.totalEur,
    result: summary.resultEur,
    margin: summary.marginPct,
    payments: incomeOk ? income.payments : null,
    payingDoctors: incomeOk ? income.payingDoctors : null,
    inferredPurchases: inferred ? inferred.purchases : null,
    inferredEur: inferred ? inferred.eur : null,
    creditsSold: incomeOk ? income.creditsSold : null,
    creditsSpent: creditsSpent.total,
    creditsForm: creditsSpent.form,
    creditsRecording: creditsSpent.recording,
    creditsAnamnesis: creditsSpent.anamnesis,
    balances: doctorsKnown ? balances.total : null,
    freeBalances,
    freeExposureFormsEur: freeBalances === null ? null : freeBalances * planUnit.perCredit.form.costEur,
    freeExposureLiveEur: freeBalances === null ? null : freeBalances * planUnit.perCredit.live10.costEur,
    safeFreeShare,
    worstLive15LeftEur: live15Worst?.leftEur ?? null,
    notCredited: incomeOk ? ds.revenue?.webhook?.notCredited ?? 0 : null,
    otherStripeFeesEur: incomeOk ? income.otherStripeFeesEur : null,
  };

  const known = (ok, basis = 'exact') => (ok ? basis : 'missing');
  const recordingBasis = recordingBasisOf(creditsSpent);
  const basis = {
    incomeStatus: 'exact',
    gross: known(incomeOk),
    net: income.basis,
    feeEur: incomeOk ? income.basis : 'missing',
    vatEur: known(incomeOk),
    cost: summary.cost.basis,
    result: summary.resultBasis,
    margin: summary.resultBasis,
    payments: known(incomeOk),
    payingDoctors: known(incomeOk),
    inferredPurchases: known(Boolean(inferred), 'inferred'),
    inferredEur: known(Boolean(inferred), 'inferred'),
    creditsSold: known(incomeOk),
    creditsSpent: recordingBasis,
    creditsForm: 'exact',
    creditsRecording: recordingBasis,
    creditsAnamnesis: 'exact',
    balances: known(doctorsKnown),
    freeBalances: known(doctorsKnown),
    freeExposureFormsEur: known(doctorsKnown, 'estimate'),
    freeExposureLiveEur: known(doctorsKnown, 'estimate'),
    safeFreeShare: 'model',
    worstLive15LeftEur: 'model',
    notCredited: known(incomeOk),
    otherStripeFeesEur: known(incomeOk),
  };

  const answer = [];
  const status0 = answerOf({ status, summary, inferred });
  if (status0) answer.push(status0);
  if (incomeOk) {
    answer.push({
      key: 'money.answer.result',
      values: { result: ['eurSigned', summary.resultEur], net: ['eur', income.netEur], cost: ['eur', summary.cost.totalEur] },
      tone: summary.resultEur >= 0 ? 'good' : 'attention',
    });
  }
  answer.push(planSentence(planProjection));

  let paymentsLine;
  if (!incomeOk) paymentsLine = { key: status === 'test' ? 'money.a.test' : 'money.a.off' };
  else if (income.payments === 0) paymentsLine = { key: 'money.a.none' };
  else {
    paymentsLine = {
      key: income.payments === 1 ? 'money.a.headline.one' : 'money.a.headline',
      values: { gross: ['eur', income.grossEur], payments: income.payments },
    };
  }
  const liveLeft = unit.perCredit.live10;
  const takeaways = {
    payments: paymentsLine,
    credits: incomeOk
      ? { key: 'money.b.headline', values: { spent: ['credits', creditsSpent.total], sold: ['credits', income.creditsSold] } }
      : { key: 'money.b.headlineNoSold', values: { spent: ['credits', creditsSpent.total] } },
    unit: liveLeft.leftEur < 0
      ? { key: 'money.c.headlineLiveLoss', values: { formLeft: ['eurUnit', unit.perCredit.form.leftEur], formPct: ['pct', unit.perCredit.form.shareLeft], liveLoss: ['eurUnit', -liveLeft.leftEur] } }
      : {
        key: 'money.c.headline',
        values: {
          formLeft: ['eurUnit', unit.perCredit.form.leftEur],
          formPct: ['pct', unit.perCredit.form.shareLeft],
          liveLeft: ['eurUnit', liveLeft.leftEur],
          livePct: ['pct', liveLeft.shareLeft],
        },
      },
    scale: planSentence(projection),
  };

  // The money chart is replaced by a sentence when income is 0 in every bucket or not visible (§4.2 A).
  const moneySeries = moneySeriesOf(ds, period, scope, { incomeOk, planning });
  const costValue = { cost: ['eur', summary.cost.totalEur] };
  if (!incomeOk) takeaways.moneyChart = { key: 'money.moneyChart.noIncome', values: costValue };
  else if (!moneySeries.some((bucket) => isNum(bucket.income) && bucket.income !== 0)) {
    takeaways.moneyChart = { key: 'money.moneyChart.none', values: costValue };
  }

  const visitTypes = unit.visitTypes;
  return {
    empty: (ds.rows?.length ?? 0) === 0 && (ds.payments?.length ?? 0) === 0 && (ds.doctorList?.length ?? 0) === 0,
    headline,
    basis,
    answer: answer.slice(0, 3),
    series: [],
    moneySeries,
    tables: {
      payments: paymentRows(payments, { prices: ds.prices, vatPayer }),
      packs: packRows(ds, payments, { vatPayer, incomeOk }),
      creditsByFeature: [
        { key: 'form', credits: creditsSpent.form, basis: 'exact' },
        { key: 'recording', credits: creditsSpent.recording, basis: recordingBasis },
        { key: 'anamnesis', credits: creditsSpent.anamnesis, basis: 'exact' },
      ],
      balancesByClass: ['paid', 'gifted', 'free', 'internal', 'other'].map((key) => ({ key, credits: balances.byDisplayClass[key] ?? 0 })),
      anatomy: anatomyRows(unit.perCredit),
      visitTypes: visitTypes.map((row) => ({ key: row.id, ...row })),
      scaleTable: scaleRowsOf(projection, SCALE_ROWS, SCALE_COLUMNS),
      scaleSteps: scaleRowsOf(projection, STEP_ROWS, SCALE_COLUMNS),
      sensitivity: sensitivityRows(sensitivity(ds, period, scope), projection.scales[0]),
      capacity: capacityRows(cap, projection.scales),
    },
    takeaways,
    projection,
    notes: notesOf({ ds, period, summary, visitTypes, uc }),
  };
}
