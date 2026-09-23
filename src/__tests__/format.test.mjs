import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt } from '../format/format.js';

// en-GB rules of OVERRIDES O1: "€1,234", "€12.40", "€0.43"; unit prices under €0.10 in cents; real minus.

test('fmt.eur: totals (§3.6)', () => {
  assert.equal(fmt.eur(1234), '€1,234');
  assert.equal(fmt.eur(100.4), '€100');
  assert.equal(fmt.eur(12.4), '€12.40');
  assert.equal(fmt.eur(0.43), '€0.43');
  assert.equal(fmt.eur(0), '€0');
  assert.equal(fmt.eur(-5.2), '−€5.20', 'real minus sign');
  assert.equal(fmt.eur(null), '—');
  assert.equal(fmt.eur(Number.NaN), '—');
});

test('fmt.eurUnit: unit prices under €0.10 in cents, one decimal', () => {
  assert.equal(fmt.eurUnit(0.008), '0.8¢');
  assert.equal(fmt.eurUnit(0.026), '2.6¢');
  assert.equal(fmt.eurUnit(0.01), '1¢');
  assert.equal(fmt.eurUnit(0.05), '5¢');
  assert.equal(fmt.eurUnit(0.12), '€0.12');
  assert.equal(fmt.eurUnit(null), '—');
});

test('fmt: dollars only as a pair or in price tables', () => {
  assert.equal(fmt.usd(0.0087), '$0.0087');
  assert.equal(fmt.usd(12.5), '$12.50');
  assert.equal(fmt.eurUsd(0.0076, 0.0087), '€0.0076 = $0.0087 at list price');
});

test('fmt: counts, shares and plurals', () => {
  assert.equal(fmt.int(1234), '1,234');
  assert.equal(fmt.int(-3), '−3');
  assert.equal(fmt.pct(0.64), '64%');
  assert.equal(fmt.pct(0.042), '4.2%');
  assert.equal(fmt.pct(0.0005), '<0.1%');
  assert.equal(fmt.credits(1), '1 credit');
  assert.equal(fmt.credits(2), '2 credits');
  assert.equal(fmt.credits(1234), '1,234 credits');
  assert.equal(fmt.shareText(2, 3), '2 of 3');
  assert.equal(fmt.shareText(13, 18), '72% (13 of 18)');
  assert.equal(fmt.shareText(72, 100), '72%');
  assert.equal(fmt.countOf(8, 735), '8 of 735');
});

test('fmt: tokens, pages, time (a no-break space before units)', () => {
  const NBSP = String.fromCodePoint(0xa0);
  assert.equal(fmt.tokens(11441), '11.4k');
  assert.equal(fmt.tokens(900), '900');
  assert.equal(fmt.pages(11441), '≈ 17 pages');
  assert.equal(fmt.sec(5900), `5.9${NBSP}s`);
  assert.equal(fmt.ms(820), `820${NBSP}ms`);
  assert.equal(fmt.minutes(319), `319${NBSP}min`);
  assert.equal(fmt.duration(75 * 60000), `1${NBSP}h 15${NBSP}min`);
});

test('fmt: dates in Vilnius, en-GB', () => {
  const ms = Date.parse('2026-09-23T11:05:00Z');
  assert.equal(fmt.date(ms), '23 Sep 2026');
  assert.equal(fmt.date('2026-09-23'), '23 Sep 2026');
  assert.equal(fmt.dayShort('2026-09-23'), '23 Sep');
  assert.equal(fmt.month('2026-09-01'), 'September 2026');
  assert.equal(fmt.time(ms), '14:05', 'Vilnius summer time is UTC+3');
  assert.equal(fmt.range('2026-09-01', '2026-09-24'), '1–23 Sep 2026', 'the end is exclusive');
});
