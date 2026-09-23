import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiCostUsd, geminiPrice } from '../pricing/gemini.js';
import { canonicalTranscriptionModel, transcriptionCostUsd } from '../pricing/transcription.js';
import { paymentFeeEur, paypalOwnFeeEur, vatInsideEur } from '../pricing/payments.js';
import { rowCost } from '../pricing/rowCost.js';
import { incomeOf, paymentMoney } from '../core/income.js';
import { makeScope } from '../core/scope.js';
import { resolvePeriod } from '../period.js';
import { PID, payment, revenue, staticPrices } from './fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from './scenario.mjs';

// §5.3.12 pricing + Appendix C.1 sanity values. List price is the definition of "Costs" (D5, D19).

const prices = staticPrices;
const fx = { usdPerEur: 1.1463 };
const close = (a, b, eps = 1e-6, message = '') => assert.ok(Math.abs(a - b) <= eps, `${message} ${a} ≈ ${b}`.trim());

test('Gemini list prices: Appendix C.1 sanity values', () => {
  close(geminiCostUsd(prices, 'gemini-3-flash-preview', { inputTokens: 11441, outputTokens: 986 }).usd, 0.008679, 1e-6);
  const liteEu = geminiPrice(prices, 'gemini-3.5-flash-lite', { platform: 'vertex', endpoint: 'eu' });
  assert.deepEqual([liteEu.inputPerM, liteEu.outputPerM], [0.33, 2.75]);
  assert.equal(geminiPrice(prices, 'gemini-3.8-flash', { at: '2027-01-01' }).inputPerM, 1.5);
  assert.equal(geminiPrice(prices, 'gemini-3.8-flash', { at: '2026-12-31' }).inputPerM, 0.75, 'the old price until 31.12.2026');
  assert.equal(geminiPrice(prices, 'gemini-2.5-flash', { platform: 'vertex', endpoint: 'europe-west4' }).inputPerM, 0.3, 'no surcharge on 2.5');
  assert.equal(geminiPrice(prices, 'gemini-3-flash-preview', { platform: 'vertex', endpoint: 'eu' }).inputPerM, 0.5, 'no factor on trial versions');
  const unknown = geminiPrice(prices, 'gemini-9-ultra');
  assert.deepEqual([unknown.known, unknown.inputPerM, unknown.outputPerM], [false, 1.5, 9]);
});

test('transcription: OpenAI 60 s = $0.003; Soniox by the bare /config name', () => {
  close(transcriptionCostUsd(prices, 'gpt-4o-mini-transcribe-2025-12-15', 60).usd, 0.003, 1e-9);
  assert.equal(canonicalTranscriptionModel('stt-rt-v5'), 'soniox-rt:stt-rt-v5');
  assert.equal(canonicalTranscriptionModel('stt-async-v5'), 'soniox:stt-async-v5');
  assert.equal(transcriptionCostUsd(prices, 'stt-rt-v5', 60).perMinute, 0.002);
  assert.equal(transcriptionCostUsd(prices, 'stt-rt-v5', 60).known, true);
});

test('rowCost: the September form, the 3.7 Vertex-eu surcharge, OpenAI bytes → minutes', () => {
  const form = { kind: 'form', t: Date.parse('2026-09-20T08:00Z'), model: 'gemini-3-flash-preview', endpoint: 'direct', location: null, inTok: 11441, outTok: 986 };
  const cost = rowCost(form, prices, fx);
  close(cost.costUsd, 0.0086785, 1e-9);
  assert.equal(cost.costBasis, 'computed');
  const eu = rowCost({ ...form, t: Date.parse('2026-08-28T08:00Z'), model: 'gemini-3.7-flash', endpoint: 'vertex', location: 'eu' }, prices, fx);
  close(eu.costUsd, ((11441 * 0.75 + 986 * 3.75) * 1.1) / 1e6, 1e-8);
  const bytes = rowCost({ kind: 'dictation', t: 0, model: 'gpt-4o-mini-transcribe-2025-12-15', audioSec: 90, audioBasis: 'bytes_estimate' }, prices, fx);
  close(bytes.costUsd, 0.0045, 1e-9);
  assert.equal(bytes.costBasis, 'estimated');
});

test('stored cost wins only for medical history summaries; forms are recomputed; cached tokens are not subtracted', () => {
  const { ds, ids } = makeScenario();
  const row = (name) => ds.rows.find((r) => r.key === ids[name]);
  assert.equal(row('anamnesis').costUsd, 0.012);
  assert.equal(row('anamnesis').costBasis, 'stored');
  close(row('b2Form').costUsd, 0.0086785, 1e-9, 'the stored $0.50 is ignored');
  close(row('cached').costUsd, 0.0086785, 1e-9, 'the 8,000 cached tokens are billed at the full price');
  assert.equal(row('unknownModel').costBasis, 'estimated');
  assert.equal(row('openaiZero').costUsd, 0, 'no length and no bytes → 0');
});

test('payment fees and VAT: EEA card, PayPal, VAT on (gross − refunded)', () => {
  assert.equal(paymentFeeEur(prices, 12.5), 0.44);
  assert.equal(paymentFeeEur(prices, 45), 0.93);
  assert.equal(paymentFeeEur(prices, 24), 0.61);
  assert.equal(paymentFeeEur(prices, 12.5, 'paypal'), 0.9);
  assert.equal(paymentFeeEur(prices, 12.5, 'card'), 0.44, 'card is an alias of the EEA standard card');
  assert.equal(paypalOwnFeeEur(prices, 12.5), 0.78);
  close(vatInsideEur(prices, { grossEur: 24, refundEur: 12 }), (12 * 21) / 121, 1e-9);
  assert.equal(vatInsideEur(prices, { grossEur: 24, taxEur: 4.17 }), 4.17, 'Stripe Tax wins when filled');
  const paypal = paymentMoney(payment('2026-09-20 10:00', { method: 'paypal', grossCents: 1250, feeCents: 12 }), { prices, vatPayer: false });
  close(paypal.feeEur, 0.12 + 0.78, 1e-9);
  assert.equal(paypal.feeEstimated, true, "PayPal's own fee comes from the price table");
  const missingFee = paymentMoney(payment('2026-09-20 10:00', { feeCents: null }), { prices, vatPayer: true });
  assert.equal(missingFee.feeEur, 0.61);
  close(missingFee.vatEur, (24 * 21) / 121, 1e-9);
});

test('income: refunds on the payment, disputes on their own date, account fees listed not subtracted', () => {
  const { ds } = makeScenario();
  const scope = makeScope({ excludeInternal: true, settings: ds.settings });
  const september = resolvePeriod('month', SCENARIO_NOW);
  const income = incomeOf(ds, september, scope);
  close(income.grossEur, 24 + 12.5 + 24, 1e-9);
  close(income.refundEur, 12.5, 1e-9);
  close(income.feeEur, 0.61 + 0.44 + 0.61, 1e-9);
  close(income.disputeEur, -24, 1e-9);
  close(income.netEur, 60.5 - 12.5 - 1.66 - 24, 1e-9);
  close(income.otherStripeFeesEur, 1.5, 1e-9);
  assert.equal(income.creditsSold, 1450);
  assert.equal(income.basis, 'exact');
  close(income.byPid[PID.payer], income.netEur, 1e-9);

  const beforeDispute = resolvePeriod('custom', SCENARIO_NOW, { custom: { from: '2026-09-01', to: '2026-09-20' } });
  close(incomeOf(ds, beforeDispute, scope).disputeEur, 0, 1e-9, 'the dispute of 21.09 is outside');

  const vat = incomeOf(ds, september, { ...scope, vatPayer: true });
  close(vat.vatEur, ((24 - 0) * 21) / 121 + ((12.5 - 12.5) * 21) / 121 + (24 * 21) / 121, 1e-9);
});

test('Stripe in test mode or off: income not ok, result unknown, lifetime purchases inferred', () => {
  const { ds } = makeScenario({ mutate: (raw) => { raw.revenue = { ...raw.revenue, livemode: false }; } });
  const scope = makeScope({ settings: ds.settings });
  const income = incomeOf(ds, resolvePeriod('month', SCENARIO_NOW), scope);
  assert.equal(income.status, 'test');
  assert.equal(income.netEur, 0);
  assert.equal(income.basis, 'missing');
  const { ds: off } = makeScenario({ mutate: (raw) => { raw.revenue = revenue([], { status: 'off', livemode: null, reason: 'no_stripe_key' }); } });
  const offIncome = incomeOf(off, resolvePeriod('month', SCENARIO_NOW), scope);
  assert.equal(offIncome.status, 'off');
  assert.deepEqual(offIncome.inferredLifetime, { purchases: 2, eur: 36.5 }, '1 × 600 + 1 × 250 from the balances');
});
