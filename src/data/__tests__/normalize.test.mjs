import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../buildDataset.js';
import { normalizeUsageRows } from '../normalize/usage.js';
import { classOf, normalizeDoctors } from '../normalize/doctors.js';
import { normalizeSettings } from '../normalize/settings.js';
import { PID, benchmark, config, dictationRow, doctor, failedRow, formRow, liveRow, localMs, meterRow, payment, rawBundle, revenue, staticPrices } from './fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from './scenario.mjs';

// §5.3.12 normalize: each row type, unknown fields, quality counters, "Doctor NN", classes, roles.

const context = { config: config(), prices: staticPrices, fx: { usdPerEur: 1.1463 } };
const one = (api) => normalizeUsageRows([api], context).rows[0];

test('each row type gets its kind, provider, Vilnius keys and audio seconds', () => {
  const form = one(formRow('2026-09-23 00:30'));
  assert.equal(form.kind, 'form');
  assert.equal(form.provider, 'gemini');
  assert.equal(form.dayKey, '2026-09-23', '00:30 Vilnius is already the 23rd');
  assert.equal(form.hour, 0);
  assert.equal(form.isoWeekday, 3);
  assert.equal(form.weekKey, '2026-09-21');
  assert.equal(form.monthKey, '2026-09');
  assert.equal(form.credits, 1);
  assert.equal(form.creditsBasis, 'rule');

  const soniox = one(dictationRow('2026-09-22 18:00', { audioSec: 120 }));
  assert.deepEqual([soniox.kind, soniox.provider, soniox.audioSec, soniox.audioBasis, soniox.costBasis], ['dictation', 'soniox', 120, 'provider', 'computed']);

  const openai = one(dictationRow('2026-08-10 09:00', { model: 'gpt-4o-mini-transcribe-2025-12-15', audioSec: undefined, audioBytes: 44 + 90 * 32000 }));
  assert.deepEqual([openai.provider, openai.audioSec, openai.audioBasis, openai.costBasis], ['openai', 90, 'bytes_estimate', 'estimated']);

  const live = one(liveRow('2026-09-23 10:05', { model: undefined }));
  assert.equal(live.kind, 'live');
  assert.equal(live.model, 'soniox-rt:stt-rt-v5', 'the bare /config name gets the price-table prefix');
  assert.ok(Math.abs(live.costUsd - 0.03) < 1e-9, '15 min × $0.002');
  assert.deepEqual(live.live, { sessionRef: 'sabcdefghj', speakers: 2, reconnects: 0 });

  const meter = one(meterRow('2026-09-23 12:00', { chargedCredits: 2, addedMs: 1200000 }));
  assert.deepEqual([meter.kind, meter.credits, meter.creditsBasis, meter.costEur], ['meter', 2, 'stored', 0]);
  assert.deepEqual(meter.meterEvent, { source: 'dictation', addedMs: 1200000, chargedCredits: 2, bankMsAfter: 60000 });

  const refusal = one(failedRow('2026-09-23 14:10', { errorKind: 'no_credits', httpStatus: 403, refunded: false }));
  assert.equal(refusal.kind, 'failure');
  assert.deepEqual(refusal.failure, { feature: 'process', errorKind: 'no_credits', group: 'refusal', httpStatus: 403, refunded: false });
  assert.equal(one(failedRow('2026-09-23 14:00', { errorKind: 'something_new' })).failure.group, 'service', 'unknown kinds count as service failures');
});

test('unknown API fields are ignored', () => {
  const row = one(formRow('2026-09-20 09:00', { secretText: 'patient', entries: 3 }));
  assert.equal('secretText' in row, false);
  assert.equal('entries' in row, false);
});

test('quality counters: before origin, duplicate id, unknown model, derived thinking, zero-byte dictation', () => {
  const { ds } = makeScenario();
  assert.deepEqual(ds.quality, {
    droppedBeforeOrigin: 1,
    duplicateIds: 1,
    unknownModels: ['gemini-9-ultra'],
    openaiRowsNoLength: 2,
    derivedThinkingRows: 1,
    zeroByteDictations: 1,
  });
  assert.ok(ds.rows.every((row, i) => i === 0 || ds.rows[i - 1].t <= row.t), 'rows are sorted by time');
  assert.ok(Object.isFrozen(ds) && Object.isFrozen(ds.rows));
});

test('quality: an OpenAI dictation with only a file size counts as "no length"; a zero thinking rest is not "worked out"', () => {
  const rows = [
    dictationRow('2026-08-10 09:00', { model: 'gpt-4o-mini-transcribe-2025-12-15', audioSec: undefined, audioBytes: 44 + 90 * 32000 }),
    formRow('2026-08-10 09:05', { thinkTok: 0, priceKnown: undefined }),
    formRow('2026-08-10 09:06', { thinkTok: 120, priceKnown: undefined }),
  ];
  const { quality } = normalizeUsageRows(rows, context);
  assert.equal(quality.openaiRowsNoLength, 1);
  assert.equal(quality.derivedThinkingRows, 1);
});

test('"Doctor NN": numbered by signup, ties by pid; deleted accounts get no number; emails pass through (O2)', () => {
  const doctors = [
    doctor('dbbbbbbbbb', { signupAt: localMs('2026-04-01 10:00') }),
    doctor('daaaaaaaaa', { signupAt: localMs('2026-04-01 10:00') }),
    doctor('dccccccccc', { signupAt: localMs('2026-03-01 10:00'), email: null }),
  ];
  const { doctorList, doctors: byPid } = normalizeDoctors({ doctors }, { rows: [{ pid: 'deleted', t: 1 }] });
  assert.deepEqual(doctorList.map((d) => [d.pid, d.noText]), [['dccccccccc', '01'], ['daaaaaaaaa', '02'], ['dbbbbbbbbb', '03'], ['deleted', null]]);
  assert.equal(byPid.get('daaaaaaaaa').email, 'daaaaaaaaa@example.test');
  assert.equal(byPid.get('dccccccccc').email, null);
  assert.equal(byPid.get('deleted').deletedAccount, true);
  const many = Array.from({ length: 100 }, (_, i) => doctor(`d${String(i).padStart(9, 'a').replace(/[0-9]/g, (c) => 'abcdefghij'[c])}`, { signupAt: i }));
  assert.equal(normalizeDoctors({ doctors: many }).doctorList[0].noText, '001', 'three digits from 100 doctors');
});

test('class precedence: internal → paid → purchase not found → API class', () => {
  assert.equal(classOf({ internal: true, class: 'free' }, { stripeLive: true, payments: 3 }), 'internal');
  assert.equal(classOf({ internal: false, class: 'free' }, { stripeLive: true, payments: 1 }), 'paid');
  assert.equal(classOf({ internal: false, class: 'bought_inferred' }, { stripeLive: true, payments: 0 }), 'bought_unverified');
  assert.equal(classOf({ internal: false, class: 'bought_inferred' }, { stripeLive: false, payments: 0 }), 'bought_inferred');

  const { ds } = makeScenario();
  const cls = (pid) => [ds.doctors.get(pid).class, ds.doctors.get(pid).displayClass];
  assert.deepEqual(cls(PID.internal), ['internal', 'internal']);
  assert.deepEqual(cls(PID.payer), ['paid', 'paid']);
  assert.deepEqual(cls(PID.bought), ['bought_unverified', 'gifted']);
  assert.deepEqual(cls(PID.top), ['legacy', 'gifted']);
  assert.deepEqual(cls(PID.free), ['free', 'free']);
  assert.deepEqual(cls(PID.noCredits), ['no_credits_doc', 'other']);

  const { ds: off } = makeScenario({ mutate: (raw) => { raw.revenue = revenue([], { status: 'off', livemode: null, reason: 'no_stripe_key' }); } });
  assert.deepEqual([off.doctors.get(PID.bought).class, off.doctors.get(PID.bought).displayClass], ['bought_inferred', 'paid'], 'Stripe off: counted as paid (inferred)');
  const { ds: test } = makeScenario({ mutate: (raw) => { raw.revenue = { ...raw.revenue, livemode: false }; } });
  assert.equal(test.doctors.get(PID.payer).class, 'bought_inferred', 'test-mode payments never make a doctor paying');
});

test('roles: B2 fields first; the last era takes main/fallback from /config after the server started', () => {
  const cfg = config({ gemini: { ...config().gemini, main: 'gemini-3.8-flash', fallback: 'gemini-3.5-flash-lite' }, serverStartedAt: localMs('2026-09-23 06:00') });
  const rows = normalizeUsageRows(
    [
      formRow('2026-09-23 05:00', { model: 'gemini-3.8-flash' }), // before the restart: the static era says main = 3 Flash → switch
      formRow('2026-09-23 07:00', { model: 'gemini-3.8-flash' }), // after: /config says main
      formRow('2026-09-23 07:10', { model: 'gemini-3-flash-preview' }), // after: no longer main or backup → switch
      formRow('2026-09-23 07:20', { model: 'gemini-3-flash-preview', fallbackUsed: true }), // B2 decides
      formRow('2026-09-23 07:30', { model: 'gemini-3.5-flash-lite', fallbackUsed: false }),
    ],
    { config: cfg, prices: staticPrices, fx: { usdPerEur: 1.1463 } },
  ).rows;
  assert.deepEqual(rows.map((row) => row.role), ['switch', 'main', 'switch', 'fallback', 'main']);
  assert.equal(normalizeUsageRows([dictationRow('2026-09-23 07:00')], context).rows[0].role, null, 'only forms have a role');
});

test('settings: missing keys come from the defaults (English, no VAT)', () => {
  const settings = normalizeSettings({ settings: { planning: { visitsPerDoctorMonth: 250, packMix: { pack600: 1, pack1500: 0 } } } });
  assert.equal(settings.lang, 'en');
  assert.equal(settings.vatPayer, false);
  assert.equal(settings.planning.visitsPerDoctorMonth, 250);
  assert.deepEqual(settings.planning.packMix, { pack250: 0, pack600: 1, pack1500: 0 });
  assert.deepEqual(settings.planning.doctorScales, [100, 300]);
});

test('buildDataset: sources, revenue mode, B2 logging start, prices origin', () => {
  const ds = buildDataset(rawBundle({ rows: [formRow('2026-09-20 09:00')], revenue: revenue([payment('2026-09-20 10:00')], { livemode: false }) }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  assert.equal(ds.revenueMode, 'test');
  assert.equal(ds.sources.revenue.status, 'test');
  assert.equal(ds.pricesOrigin, 'server');
  assert.deepEqual(ds.v2LoggingSince, { forms: null, dictation: null, events: null });
  const noConfig = buildDataset(rawBundle({ config: null }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  assert.equal(noConfig.pricesOrigin, 'static');
  assert.equal(noConfig.fx.usdPerEur, 1.1463);
});

test('internal marks: env/profile stay; UI marks follow the freshly loaded settings (a save shows at once)', () => {
  const doctors = [
    doctor(PID.internal, { internal: true, internalSource: 'env' }),
    doctor(PID.top, { internal: true, internalSource: 'settings' }),
    doctor(PID.free),
  ];
  const build = (internalPids, settingsStatus = 'ok') =>
    buildDataset(
      rawBundle({ doctors, settings: { ...rawBundle().settings.settings, internalPids }, sources: { settings: { status: settingsStatus, fetchedAt: 0, cacheAgeMs: 0 } } }),
      { nowMs: SCENARIO_NOW, staticPrices, benchmark },
    );
  const marks = (ds) => Object.fromEntries(ds.doctorList.map((d) => [d.pid, [d.internal, d.internalSource]]));
  assert.deepEqual(marks(build([PID.free])), { [PID.internal]: [true, 'env'], [PID.top]: [false, null], [PID.free]: [true, 'settings'] });
  assert.deepEqual(marks(build([], 'error')), { [PID.internal]: [true, 'env'], [PID.top]: [true, 'settings'], [PID.free]: [false, null] }, 'settings failed: the /doctors marks stay');
});
