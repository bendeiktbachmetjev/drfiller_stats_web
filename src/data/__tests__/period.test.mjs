import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESET, PRESET_IDS, buildBuckets, canShiftPeriod, compareCaveat, dateToMs, dayKeyOf, monthFactor, moneyGranularity,
  previousPeriod, resolvePeriod, shiftPeriod,
} from '../period.js';

// §3.3: presets, DST, stepping, comparison windows and caveats, month factor, buckets.
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
  assert.deepEqual(Object.keys(caveat).sort(), ['billingEraChanged', 'currentEra', 'era', 'modelEraChanged']);
  assert.deepEqual(compareCaveat(period, null), { modelEraChanged: false, billingEraChanged: false, era: null, currentEra: null });
});

// --- F0-DATA: DST, stepping, custom granularity, every compare kind, caveats ---------------------------

test('DST: 29 Mar has 23 hours, 25 Oct has 25; day keys stay Vilnius calendar days', () => {
  const H = 3600000;
  assert.equal(dateToMs('2026-03-30') - dateToMs('2026-03-29'), 23 * H);
  assert.equal(dateToMs('2026-10-26') - dateToMs('2026-10-25'), 25 * H);
  assert.equal(dayKeyOf(Date.parse('2026-10-24T21:00:00Z')), '2026-10-25', 'midnight at UTC+3');
  assert.equal(dayKeyOf(Date.parse('2026-10-25T21:59:00Z')), '2026-10-25', '23:59 at UTC+2');
  const week = resolvePeriod('last7', Date.parse('2026-10-27T10:00:00Z'));
  const buckets = buildBuckets(week, 'day');
  assert.equal(buckets.length, 7);
  const sunday = buckets.find((bucket) => bucket.key === '2026-10-25');
  assert.equal(sunday.toMs - sunday.fromMs, 25 * H);
  assert.equal(week.effDays, 7);
});

test('stepping: months back to 03.2026, never forward past the current period', () => {
  const september = resolvePeriod('month', NOW);
  assert.deepEqual(canShiftPeriod(september, NOW), { prev: true, next: false });
  const march = resolvePeriod('month', NOW, { offset: -6 });
  assert.equal(march.from, '2026-03-05', 'clamped to the history start');
  assert.deepEqual(canShiftPeriod(march, NOW), { prev: false, next: true });
  assert.equal(shiftPeriod(march, -1, NOW), march, 'no step before the history');
  assert.equal(shiftPeriod(march, 1, NOW).from, '2026-04-01');
  assert.equal(resolvePeriod('month', NOW, { offset: -40 }).from, '2026-03-05', 'a stored offset older than the history moves forward');
  assert.deepEqual(canShiftPeriod(resolvePeriod('year', NOW), NOW), { prev: false, next: false });
  assert.deepEqual(canShiftPeriod(resolvePeriod('last30', NOW), NOW), { prev: false, next: false });
});

test('custom granularity: ≤ 31 days → day, ≤ 120 → week, else month; invalid input → default', () => {
  const custom = (from, to) => resolvePeriod('custom', NOW, { custom: { from, to } });
  assert.equal(custom('2026-09-01', '2026-09-23').granularity, 'day');
  assert.equal(custom('2026-08-01', '2026-09-14').granularity, 'week');
  assert.equal(custom('2026-03-10', '2026-09-23').granularity, 'month');
  assert.equal(custom('2026-09-23', '2026-09-01').preset, DEFAULT_PRESET);
  const week = buildBuckets(custom('2026-08-01', '2026-09-14'));
  assert.equal(week[0].key, '2026-07-27', 'week buckets are keyed by their Monday');
  assert.equal(week[0].from, '2026-08-01', 'and cut at the period edge');
});

test('every comparison kind: prevDays, monthPart, month, year, range', () => {
  assert.deepEqual(previousPeriod(resolvePeriod('last7', NOW)).compare, { kind: 'prevDays', n: 7, from: '2026-09-10', to: '2026-09-17' });
  assert.deepEqual(previousPeriod(resolvePeriod('month', NOW)).compare, { kind: 'monthPart', from: '2026-08-01', to: '2026-08-24' });
  assert.deepEqual(previousPeriod(resolvePeriod('month', NOW, { offset: -1 })).compare, { kind: 'month', from: '2026-07-01', to: '2026-08-01' });
  const later = Date.parse('2028-02-01T10:00:00Z');
  assert.deepEqual(previousPeriod(resolvePeriod('year', later)).compare, { kind: 'year', from: '2027-01-01', to: '2027-02-02' });
  const early = resolvePeriod('custom', NOW, { custom: { from: '2026-03-10', to: '2026-03-19' } });
  assert.deepEqual(previousPeriod(early).compare, { kind: 'range', from: '2026-03-05', to: '2026-03-10' });
  assert.equal(previousPeriod(resolvePeriod('year', NOW)), null, '2026 starts before the history');
});

test('compareCaveat: a different model or billing rule in the compared window', () => {
  const last30 = resolvePeriod('last30', NOW);
  const same = compareCaveat(last30, previousPeriod(last30));
  assert.equal(same.modelEraChanged, false, 'e5 vs e1: the same main model and endpoint, only a fallback was added');
  assert.equal(same.billingEraChanged, false);
  const vertexWeek = resolvePeriod('last7', Date.parse('2026-09-01T10:00:00Z'));
  const model = compareCaveat(vertexWeek, previousPeriod(vertexWeek));
  assert.equal(model.modelEraChanged, true, 'Gemini 3.7 on Google Cloud EU vs Gemini 3 Flash direct');
  assert.equal(model.era.id, 'e1');
  const august = resolvePeriod('month', NOW, { offset: -1 });
  assert.equal(compareCaveat(august, previousPeriod(august)).modelEraChanged, false, 'e1 covers most of both months');
  const lastWeek = resolvePeriod('last7', Date.parse('2026-09-30T10:00:00Z'));
  const billing = compareCaveat(lastWeek, previousPeriod(lastWeek));
  assert.equal(billing.billingEraChanged, true);
  assert.equal(billing.modelEraChanged, false);
});
