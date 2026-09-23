import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_ERAS, billingEraAt, modelEraAt, roleOf, transcriptionEraAt } from '../eras.js';
import { buildDataset } from '../buildDataset.js';
import { resolvePeriod } from '../period.js';
import { summarizeHealth } from '../core/health.js';
import { currentSetupForms } from '../core/setup.js';
import { benchmark, config, formRow, localMs, rawBundle, staticPrices } from './fixtures.mjs';
import { SCENARIO_NOW, makeScenario } from './scenario.mjs';

// §5.3.8 / §5.3.12 eras: the fallback inference, era endpoints, standard flags, D17's current setup.

test('the era table: standard flags, endpoints and lookups', () => {
  assert.deepEqual(MODEL_ERAS.map((era) => [era.id, era.standard]), [['e1', true], ['e2', false], ['e3', false], ['e4', false], ['e5', true]]);
  const vertexWeek = modelEraAt(Date.parse('2026-08-28T10:00Z'));
  assert.deepEqual([vertexWeek.id, vertexWeek.main, vertexWeek.endpoint, vertexWeek.location], ['e3', 'gemini-3.7-flash', 'vertex', 'eu']);
  assert.equal(modelEraAt(Date.parse('2026-09-23T07:00Z')).id, 'e5');
  assert.equal(modelEraAt(Date.parse('2026-01-01T00:00Z')).id, 'e1', 'earlier instants use the first era');
  assert.equal(billingEraAt(Date.parse('2026-09-23T08:22Z')).rule, 'per-visit');
  assert.equal(billingEraAt(Date.parse('2026-09-23T08:23Z')).rule, 'audio-meter');
  assert.equal(transcriptionEraAt(Date.parse('2026-09-22T14:00Z')).main, 'soniox:stt-async-v5');
});

test('fallback inference reproduces the "8 of 735" shape; the 22 lite rows of the test day are switch', () => {
  const rows = [];
  const start = localMs('2026-09-02 08:00');
  for (let i = 0; i < 735; i += 1) {
    const t = start + i * 40 * 60000; // every 40 minutes → 02.09–22.09
    const isFallback = i % 92 === 7 && rows.filter((r) => r.model === 'gemini-3.5-flash-lite').length < 8;
    rows.push(formRow(t, isFallback ? { model: 'gemini-3.5-flash-lite', durMs: 28100 } : { durMs: 5000 }));
  }
  for (let i = 0; i < 22; i += 1) rows.push(formRow(localMs('2026-09-01 10:00') + i * 60000, { model: 'gemini-3.5-flash-lite' }));
  const ds = buildDataset(rawBundle({ rows }), { nowMs: localMs('2026-09-23 10:30'), staticPrices, benchmark });
  const health = summarizeHealth(ds, resolvePeriod('allTime', ds.nowMs));
  assert.equal(health.fallbackCount, 8);
  assert.equal(health.fallbackEligible, 735);
  assert.equal(health.fallbackBasis, 'estimate', 'no fallbackUsed field yet');
  assert.equal(ds.forms.filter((row) => row.dayKey === '2026-09-01').every((row) => row.role === 'switch'), true);
  assert.equal(health.fallbackWaitP50Ms, 28100);
});

test('roleOf: not a form → null; B2 flag first; era rules otherwise', () => {
  assert.equal(roleOf({ t: Date.parse('2026-09-10T08:00Z'), action: 'transcription' }), null);
  assert.equal(roleOf({ t: Date.parse('2026-09-10T08:00Z'), action: 'ai_processing', model: 'gemini-3-flash-preview', fallbackUsed: true }), 'fallback');
  assert.equal(roleOf({ t: Date.parse('2026-09-10T08:00Z'), action: 'ai_processing', model: 'gemini-3.5-flash-lite' }), 'fallback');
  assert.equal(roleOf({ t: Date.parse('2026-09-01T06:10Z'), action: 'ai_processing', model: 'gemini-3.5-flash-lite' }), 'switch');
  assert.equal(roleOf({ t: Date.parse('2026-08-28T08:00Z'), action: 'ai_processing', model: 'gemini-3.7-flash' }), 'main');
  assert.equal(roleOf({ t: Date.parse('2026-08-28T08:00Z'), action: 'ai_processing', model: 'gemini-3-flash-preview' }), 'switch');
});

test('rows take endpoint and location from B2 fields, else from their era', () => {
  const { ds, ids } = makeScenario();
  const byKey = (key) => ds.rows.find((row) => row.key === ids[key]);
  assert.deepEqual([byKey('vertexEu').endpoint, byKey('vertexEu').location, byKey('vertexEu').eraStandard], ['vertex', 'eu', false]);
  assert.deepEqual([byKey('b2Form').endpoint, byKey('b2Form').role], ['direct', 'main']);
  assert.equal(byKey('liteSwitch').role, 'switch');
  assert.equal(byKey('liteFallback').role, 'fallback');
});

test('currentSetupForms (D17): last 30 days of the current setup, no Vertex-eu week, no test day, no conversation text', () => {
  const { ds, ids } = makeScenario();
  const keys = new Set(currentSetupForms(ds, SCENARIO_NOW).map((row) => row.key));
  ['vertexEu', 'liteSwitch', 'conversation', 'unknownModel', 'beforeOrigin'].forEach((name) => assert.equal(keys.has(ids[name]), false, name));
  ['liteFallback', 'b2Form', 'cached', 'internal'].forEach((name) => assert.equal(keys.has(ids[name]), true, name));
  const withConversation = currentSetupForms(ds, SCENARIO_NOW, { conversation: 'with' });
  assert.deepEqual(withConversation.map((row) => row.key), [ids.conversation]);
  const directOnly = buildDataset(rawBundle({ rows: [formRow('2026-09-20 09:00')], config: config({ gemini: { ...config().gemini, endpoint: 'vertex', vertexLocation: 'global' } }) }), { nowMs: SCENARIO_NOW, staticPrices, benchmark });
  assert.equal(currentSetupForms(directOnly).length, 0, 'the endpoint must match /config');
});
