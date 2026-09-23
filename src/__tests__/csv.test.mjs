import test from 'node:test';
import assert from 'node:assert/strict';
import * as csvModule from '../export/csv.js';
import { resolvePeriod, dateToMs } from '../data/period.js';

const { toCsv, csvFilename, downloadCsv } = csvModule;

// Vilnius wall clock 'YYYY-MM-DD HH:mm' → epoch ms (the tests run with TZ=Europe/Vilnius).
const localMs = (text) => {
  const [day, time = '00:00'] = text.split(' ');
  const [h, m] = time.split(':').map(Number);
  return dateToMs(day) + (h * 60 + m) * 60000;
};

const COLUMNS = [
  { key: 'doctor', header: 'doctor', type: 'text' },
  { key: 'forms', header: 'forms', type: 'int' },
  { key: 'costEur', header: 'cost_eur', type: 'num' },
  { key: 'share', header: 'share_pct', type: 'pct' },
  { key: 'day', header: 'date', type: 'date' },
];

test('toCsv: ";" delimiter, decimal comma, CRLF, no BOM', () => {
  const csv = toCsv([{ doctor: 'Doctor 07', forms: 9, costEur: 12.5, share: 56.3, day: '2026-09-15' }], COLUMNS);
  assert.equal(csv, 'doctor;forms;cost_eur;share_pct;date\r\nDoctor 07;9;12,5;56,3;2026-09-15\r\n');
  assert.notEqual(csv.charCodeAt(0), 0xfeff, 'the BOM belongs to downloadCsv');
  assert.equal(csv.replace(/\r\n/g, '').includes('\n'), false, 'every line break is CRLF');
});

test('toCsv: quoting and the formula guard', () => {
  const rows = [
    { doctor: 'A; B', forms: 1 },
    { doctor: 'The "old" plan', forms: 2 },
    { doctor: 'two\nlines', forms: 3 },
    { doctor: "=cmd|' /C calc'!A0", forms: 4 },
    { doctor: '+370 600 00000', forms: 5 },
    { doctor: '-1', forms: 6 },
    { doctor: '@SUM(A1)', forms: 7 },
    { doctor: '\tTabbed', forms: 8 },
    { doctor: '=1;2', forms: 9 },
  ];
  const lines = toCsv(rows, COLUMNS.slice(0, 2)).split('\r\n');
  assert.equal(lines[1], '"A; B";1');
  assert.equal(lines[2], '"The ""old"" plan";2');
  assert.equal(lines[3], '"two\nlines";3');
  assert.equal(lines[4], "'=cmd|' /C calc'!A0;4");
  assert.equal(lines[5], "'+370 600 00000;5");
  assert.equal(lines[6], "'-1;6");
  assert.equal(lines[7], "'@SUM(A1);7");
  assert.equal(lines[8], "'\tTabbed;8");
  assert.equal(lines[9], '"\'=1;2";9', 'guarded first, quoted second');
  assert.equal(lines.length, 11);
});

test('toCsv: numbers stay numbers, empty values stay empty, instants become Vilnius days', () => {
  const rows = [
    { doctor: 'A', forms: -4, costEur: -4.5, share: 0, day: localMs('2026-09-15 23:30') },
    { doctor: null, forms: null, costEur: undefined, share: NaN, day: null },
    { doctor: 'B', forms: 12.6, costEur: 1234.5, share: '—', day: '2026-09-15T21:30:00Z' },
    { doctor: 'C', forms: 0, costEur: 0.0000001, share: 100, day: new Date(2026, 0, 5) },
  ];
  const lines = toCsv(rows, COLUMNS).split('\r\n');
  assert.equal(lines[1], 'A;-4;-4,5;0;2026-09-15');
  assert.equal(lines[2], ';;;;');
  assert.equal(lines[3], 'B;13;1234,5;—;2026-09-16');
  assert.equal(lines[4], 'C;0;0,0000001;100;2026-01-05');
});

test('toCsv: other column types, options and empty input', () => {
  const columns = [
    { key: 'start', header: 'start', type: 'datetime' },
    { key: 'models', header: 'models', type: 'text' },
    { key: 'internal', header: 'internal', type: 'text' },
  ];
  const csv = toCsv([{ start: localMs('2026-09-15 09:05'), models: ['a', 'b'], internal: true }], columns);
  assert.equal(csv.split('\r\n')[1], '2026-09-15 09:05;a, b;yes');
  assert.equal(toCsv([{ models: -2.5 }], [columns[1]]), 'models\r\n-2,5\r\n');
  assert.equal(toCsv([], COLUMNS.slice(0, 2)), 'doctor;forms\r\n');
  assert.equal(toCsv(null, COLUMNS.slice(0, 2)), 'doctor;forms\r\n');
  assert.equal(
    toCsv([{ doctor: 'a,b', forms: 1.5 }], [COLUMNS[0], { key: 'forms', header: 'forms', type: 'num' }], { delimiter: ',', decimal: '.', eol: '\n' }),
    'doctor,forms\n"a,b",1.5\n',
  );
});

test('csvFilename: drfiller_ prefix and the INCLUSIVE last day', () => {
  const now = localMs('2026-09-23 10:30');
  assert.equal(csvFilename('Overview', 'summary', resolvePeriod('custom', now, { custom: { from: '2026-09-07', to: '2026-09-18' } })), 'drfiller_overview_summary_2026-09-07_2026-09-18.csv');
  assert.equal(csvFilename('doctors', 'doctors', { from: '2026-02-01', to: '2026-03-01' }), 'drfiller_doctors_doctors_2026-02-01_2026-02-28.csv');
});

test('csv.js is import-safe in Node: nothing touches the browser until downloadCsv runs', () => {
  assert.equal(typeof downloadCsv, 'function');
  assert.deepEqual(Object.keys(csvModule).sort(), ['csvFilename', 'downloadCsv', 'toCsv']);
});
