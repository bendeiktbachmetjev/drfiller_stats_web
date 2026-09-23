import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESET, PRESET_IDS, buildBuckets, compareCaveat, dayKeyOf, monthFactor, moneyGranularity, previousPeriod, resolvePeriod,
} from '../period.js';

// §3.3. Scaffold set; F0-DATA adds DST, stepping and every caveat case.
const NOW = Date.parse('2026-09-23T07:30:00Z'); // Wed 23 Sep 2026, 10:30 Vilnius

test('presets: ids, default and Vilnius day keys', () => {
  assert.deepEqual(PRESET_IDS, ['last7', 'last30', 'month', 'year', 'allTime', 'custom']);
  assert.equal(DEFAULT_PRESET, 'last30');
  assert.equal(dayKeyOf(Date.parse('2026-09-22T21:30:00Z')), '2026-09-23', '00:30 Vilnius is already the 23rd');
});

test('last30: 30 days incl. today, compared with the 30 days before', () => {
  const period = resolvePeriod('last30', NOW);
  assert.equal(period.from, '2026-08-25');
  assert.equal(period.to, '2026-09-24');
  assert.equal(period.effDays, 30);
  assert.equal(period.granularity, 'day');
  const prev = previousPeriod(period);
  assert.deepEqual(prev.compare, { kind: 'prevDays', n: 30, from: '2026-07-26', to: '2026-08-25' });
});

test('month: partial month compares with the same days of the previous one; full month with the whole', () => {
  const september = resolvePeriod('month', NOW);
  assert.equal(september.from, '2026-09-01');
  assert.equal(september.effDays, 23);
  assert.equal(previousPeriod(september).compare.kind, 'monthPart');
  const august = resolvePeriod('month', NOW, { offset: -1 });
  assert.equal(august.from, '2026-08-01');
  assert.deepEqual(previousPeriod(august).compare, { kind: 'month', from: '2026-07-01', to: '2026-08-01' });
});

test('allTime and early custom starts are clamped to the history start', () => {
  const all = resolvePeriod('allTime', NOW);
  assert.equal(all.from, '2026-03-05');
  assert.equal(previousPeriod(all), null, 'All time has nothing to compare with');
  const custom = resolvePeriod('custom', NOW, { custom: { from: '2026-01-01', to: '2026-09-01' } });
  assert.equal(custom.from, '2026-03-05');
  assert.equal(custom.startClamped, true);
});

test('month factor, money granularity and phone buckets', () => {
  const last30 = resolvePeriod('last30', NOW);
  assert.ok(Math.abs(monthFactor(last30) - 30.4375 / 30) < 1e-12);
  assert.equal(moneyGranularity(last30), 'week');
  assert.equal(moneyGranularity(resolvePeriod('allTime', NOW)), 'month');
  const phone = resolvePeriod('last30', NOW, { maxBuckets: 14 });
  assert.equal(phone.chart.granularity, 'week');
  assert.ok(buildBuckets(phone).length <= 14);
});

test('compareCaveat has the frozen shape', () => {
  const period = resolvePeriod('last7', NOW);
  const caveat = compareCaveat(period, previousPeriod(period));
  assert.deepEqual(Object.keys(caveat).sort(), ['billingEraChanged', 'era', 'modelEraChanged']);
  assert.deepEqual(compareCaveat(period, null), { modelEraChanged: false, billingEraChanged: false, era: null });
});
