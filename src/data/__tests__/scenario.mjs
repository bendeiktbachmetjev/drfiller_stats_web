// A small, hand-made history with every data defect exactly once (§5.3.12), commented inline.
// SCENARIO_NOW is 23.09.2026 14:30 Vilnius — after METER_SINCE (11:23), so meter and failure rows can
// exist (SPEC names 10:30, which lies before the meter began; see the F0 notes).
import { buildDataset } from '../buildDataset.js';
import {
  PID, adjustment, anamnesisRow, benchmark, config, dictationRow, doctor, failedRow, formRow, liveRow, localMs, meterRow,
  payment, rawBundle, revenue, settings, staticPrices,
} from './fixtures.mjs';

export const SCENARIO_NOW = localMs('2026-09-23 14:30');

/**
 * @returns {{ raw: import('../buildDataset.js').RawBundle, ids: Record<string, string> }}
 */
export function makeScenarioRaw() {
  const ids = {};
  const keep = (name, row) => {
    ids[name] = row.id;
    return row;
  };

  const rows = [
    // Ordinary spring forms of the top doctor (era e1, direct).
    formRow('2026-04-14 08:05', { inTok: 5500, visTok: 450, outTok: 600 }),
    formRow('2026-04-14 16:20', { inTok: 5600, visTok: 450, outTok: 620 }),
    // Derived thinking: thinkTok present on an old row without B2 fields.
    keep('derivedThinking', formRow('2026-05-05 08:10', { inTok: 5400, visTok: 400, outTok: 700, thinkTok: 300 })),
    // OpenAI legacy dictation with no length and 0 bytes → cost 0, counted in quality.zeroByteDictations.
    keep('openaiZero', dictationRow('2026-06-02 09:00', { model: 'gpt-4o-mini-transcribe-2025-03-20', audioSec: undefined, audioBytes: 0 })),
    // OpenAI legacy dictation with bytes only → minutes estimated from the file size.
    keep('openaiBytes', dictationRow('2026-08-10 09:00', { model: 'gpt-4o-mini-transcribe-2025-12-15', audioSec: undefined, audioBytes: 44 + 90 * 32000 })),
    // 3.7 Flash in the Vertex-eu week (era e3): priced on Vertex eu with ×1.1.
    keep('vertexEu', formRow('2026-08-28 10:00', { model: 'gemini-3.7-flash', inTok: 9000, outTok: 900, durMs: 8400 })),
    // Lite on the test day before 06:26 UTC → role switch (era e4 is "mixed").
    keep('liteSwitch', formRow('2026-09-01 09:10', { model: 'gemini-3.5-flash-lite', durMs: 4000 })),
    // Lite after 02.09 → the backup model answered (role fallback, 28 s).
    keep('liteFallback', formRow('2026-09-10 08:30', { model: 'gemini-3.5-flash-lite', durMs: 28000 })),
    // Ordinary September forms.
    formRow('2026-09-10 09:00'),
    formRow('2026-09-11 16:30', { durMs: 16500 }),
    // A B2 form: fallbackUsed false decides the role; the stored costUsd must be ignored (D19).
    keep('b2Form', formRow('2026-09-20 08:15', { fallbackUsed: false, costUsd: 0.5, priceKnown: true, endpoint: 'direct', primaryModel: 'gemini-3-flash-preview', thinkTok: 250 })),
    // Cached tokens: listed as a saving, never subtracted from the cost.
    keep('cached', formRow('2026-09-21 08:20', { cachedTok: 8000 })),
    // Conversation text inside the form (excluded from currentSetupForms).
    keep('conversation', formRow('2026-09-23 10:10', { convChars: 9000, inTok: 15200 })),
    // Medical history summary with its stored cost (the stored cost wins for anamnesis only).
    keep('anamnesis', anamnesisRow('2026-09-15 11:00', { costUsd: 0.012, credits: 2 })),
    anamnesisRow('2026-09-15 11:03', { action: 'anamnesis_narrative', model: 'gemini-3.5-flash', costUsd: 0.03, credits: 3, tier: null, docs: undefined, facts: undefined }),
    // A deleted account keeps its rows under pid 'deleted'.
    keep('deleted', formRow('2026-09-05 12:00', { pid: 'deleted' })),
    // The internal (own/test) account.
    keep('internal', formRow('2026-09-22 09:00', { pid: PID.internal })),
    formRow('2026-09-22 09:30', { pid: PID.internal }),
    // A model missing from the price table → priced as 3.5 Flash, basis estimated.
    keep('unknownModel', formRow('2026-09-19 10:00', { model: 'gemini-9-ultra' })),
    // Soniox dictation after 22.09 17:00.
    keep('soniox', dictationRow('2026-09-22 18:00', { audioSec: 120 })),
    // A live conversation (15 min) on the new card.
    keep('live', liveRow('2026-09-23 10:05', { audioSec: 900 })),
    // B2 events after METER_SINCE: one meter charge, one service failure, one refusal.
    keep('meter', meterRow('2026-09-23 12:00', { source: 'live_finish', addedMs: 1200000, chargedCredits: 2, bankMsAfter: 0 })),
    keep('serviceFailure', failedRow('2026-09-23 14:00', { errorKind: 'timeout', feature: 'process' })),
    keep('refusal', failedRow('2026-09-23 14:10', { errorKind: 'no_credits', feature: 'dictation', httpStatus: 403, refunded: false })),
    // Other doctors.
    formRow('2026-09-12 08:00', { pid: PID.payer }),
    formRow('2026-09-12 08:30', { pid: PID.gifted }),
    formRow('2026-07-01 08:00', { pid: PID.bought }),
    formRow('2026-06-01 08:00', { pid: PID.free }),
    // Before the history start (05.03.2026) → dropped and counted.
    keep('beforeOrigin', formRow('2026-03-01 10:00')),
  ];
  // The same id twice → the second is dropped and counted.
  const duplicate = formRow('2026-09-12 09:00');
  ids.duplicate = duplicate.id;
  rows.push(duplicate, { ...duplicate, t: duplicate.t + 1000 });

  const doctors = [
    doctor(PID.top, { class: 'legacy', legacyFields: true, credits: { available: 11045, used: 5297, total: 750, consistent: false }, signupAt: localMs('2026-03-01 08:00') }),
    // Internal from the server env (uid-based; shown locked).
    doctor(PID.internal, { internal: true, internalSource: 'env', signupAt: localMs('2026-03-02 08:00') }),
    doctor(PID.payer, { class: 'bought_inferred', credits: { available: 552, used: 112, total: 615, consistent: false }, inferredPacks: { pack250: 0, pack600: 1, pack1500: 0 }, signupAt: localMs('2026-04-01 08:00') }),
    // Looks bought, but Stripe has no payment for it → "purchase not found" (bought_unverified).
    doctor(PID.bought, { class: 'bought_inferred', credits: { available: 236, used: 29, total: 265, consistent: true }, inferredPacks: { pack250: 1, pack600: 0, pack1500: 0 }, signupAt: localMs('2026-05-01 08:00') }),
    // Inconsistent credits (available + used > total).
    doctor(PID.gifted, { class: 'gifted', credits: { available: 7262, used: 362, total: 15, consistent: false }, signupAt: localMs('2026-06-01 08:00') }),
    doctor(PID.free, { signupAt: localMs('2026-09-15 08:00') }),
    doctor(PID.noCredits, { class: 'no_credits_doc', credits: null, exists: { auth: true, credits: false, profile: false }, signupAt: localMs('2026-09-16 08:00') }),
  ];

  const paid = payment('2026-09-02 10:00', { pid: PID.payer });
  const refunded = payment('2026-09-10 10:00', { pid: PID.payer, packId: 'pack250', credits: 250, grossCents: 1250, subtotalCents: 1250, feeCents: 44, netCents: 1206, refundedCents: 1250, refundedAt: localMs('2026-09-11 10:00') });
  const notCredited = payment('2026-09-20 10:00', { pid: PID.payer, credited: 'no' });
  ids.paid = paid.id;
  const rev = revenue([paid, refunded, notCredited], {
    adjustments: [
      // A dispute on its own date, charged to the paying doctor through paymentId.
      adjustment('2026-09-21 10:00', { type: 'dispute', amountCents: -2400, paymentId: paid.id }),
      // An account-level Stripe fee: listed, never subtracted.
      adjustment('2026-09-15 10:00', { type: 'stripe_fee', amountCents: -150 }),
    ],
    webhook: { checkedFromMs: localMs('2026-08-24 14:30'), notCredited: 1, pending: 0, unknown: 0 },
  });

  return { raw: rawBundle({ rows, doctors, revenue: rev, config: config(), settings: settings() }), ids };
}

/**
 * The scenario as a Dataset.
 * @param {{ mutate?: (raw: object) => void }} [options] a hook to change the raw bundle first
 */
export function makeScenario({ mutate } = {}) {
  const { raw, ids } = makeScenarioRaw();
  if (mutate) mutate(raw);
  const ds = buildDataset(raw, { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  return { ds, ids, raw };
}
