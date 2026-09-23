import test from 'node:test';
import assert from 'node:assert/strict';
import { packLabel, planChipsText, scenarioLabel } from '../planText.js';
import { axisFormat, chart } from '../../charts/theme.js';

// §3.8: the assumption chips under every projection are built from ScaleResult.scenario in the UI.

const plan = {
  visitsPerDoctorMonth: 400, liveShare: 1, liveMin: 15, dictMin: 0, pack: 'plan',
  packMix: { pack250: 0, pack600: 0, pack1500: 1 }, vatPayer: false, freeShare: 0,
};

test('scenario label follows the fields (§3.8)', () => {
  assert.equal(scenarioLabel(plan), '15 min conversation');
  assert.equal(scenarioLabel({ liveShare: 0, dictMin: 1 }), '1 min dictation');
  assert.equal(scenarioLabel({ liveShare: 0, dictMin: 0 }), 'typing only');
  assert.equal(scenarioLabel({ liveShare: 0.4, liveMin: 15 }), '15 min conversation in 40% of visits');
});

test('pack label: one pack by name, a real mix as "packs as planned"', () => {
  assert.equal(packLabel(plan), 'pack 1500');
  assert.equal(packLabel({ ...plan, pack: 'pack250' }), 'pack 250');
  assert.equal(packLabel({ ...plan, packMix: { pack250: 0.5, pack600: 0, pack1500: 0.5 } }), 'packs as planned');
});

test('assumption line', () => {
  assert.equal(planChipsText(plan), '400 visits · 15 min conversation · pack 1500 · no VAT · 0% free');
  assert.equal(planChipsText({ ...plan, vatPayer: true }).includes('with VAT'), true);
  assert.equal(planChipsText(null), '');
});

test('signed money axis: one step on both sides of zero, whole euros', () => {
  const scale = chart.signedScale(-12.3, 45);
  assert.equal(scale.domain[0] <= -12.3 && scale.domain[1] >= 45, true);
  assert.equal(scale.ticks.includes(0), true);
  const steps = scale.ticks.slice(1).map((v, i) => Math.round((v - scale.ticks[i]) * 1e6) / 1e6);
  assert.equal(new Set(steps).size, 1, `even steps: ${scale.ticks}`);
  assert.equal(axisFormat('eur')(60), '€60');
  assert.equal(axisFormat('eur')(-20), '−\u2060€20');
  assert.equal(axisFormat('sec')(15000), '15\u00A0s');
  assert.deepEqual(chart.signedScale(0, 0).domain, [0, 1]);
});
