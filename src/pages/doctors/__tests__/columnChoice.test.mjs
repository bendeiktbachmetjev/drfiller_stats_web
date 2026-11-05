import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS_KEY, EMPTY_CHOICE, LEGACY_ALL_KEY, LEGACY_MORE_COLUMNS, isDefaultChoice, isShown, pageStorage, parseChoice, readColumnChoice, shownKeys,
  withColumn, writeColumnChoice,
} from '../columnChoice.js';

// "Columns" on the Doctors table: the owner's ticks over each column's default, kept on this device; blocked
// storage never breaks the table (the defaults, and the choice lasts for the visit).

const COLUMNS = [
  { key: 'doctor' },
  { key: 'class' },
  { key: 'specialty', defaultHidden: true },
  { key: 'forms' },
  { key: 'presses' },
  { key: 'inserts', defaultHidden: true },
  { key: 'costEur' },
];

/** A Storage stand-in; `fail` makes every call throw (blocked storage, Safari private mode). */
const memoryStorage = (initial = {}, { fail = false } = {}) => {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (fail) throw new Error('SecurityError: storage is blocked');
  };
  return {
    data,
    getItem: (key) => (guard(), data.has(key) ? data.get(key) : null),
    setItem: (key, value) => (guard(), data.set(key, String(value))),
    removeItem: (key) => (guard(), data.delete(key)),
  };
};

test('defaults: the default columns show, the doctor always', () => {
  assert.deepEqual(shownKeys(COLUMNS, EMPTY_CHOICE), ['doctor', 'class', 'forms', 'presses', 'costEur']);
  assert.deepEqual(shownKeys(COLUMNS), ['doctor', 'class', 'forms', 'presses', 'costEur']);
  assert.ok(isShown({ key: 'doctor' }, { on: [], off: ['doctor'] }), 'the doctor column cannot be turned off');
  assert.ok(isDefaultChoice(EMPTY_CHOICE) && isDefaultChoice(null));
});

test('ticks: only what differs from a default is kept; the doctor and unknown keys never change', () => {
  let choice = withColumn(EMPTY_CHOICE, COLUMNS, 'inserts', true);
  assert.deepEqual(choice, { on: ['inserts'], off: [] });
  choice = withColumn(choice, COLUMNS, 'costEur', false);
  assert.deepEqual(choice, { on: ['inserts'], off: ['costEur'] });
  assert.deepEqual(shownKeys(COLUMNS, choice), ['doctor', 'class', 'forms', 'presses', 'inserts']);
  choice = withColumn(choice, COLUMNS, 'inserts', false);
  assert.deepEqual(choice, { on: [], off: ['costEur'] }, 'back to its default: off the list');
  assert.equal(withColumn(choice, COLUMNS, 'doctor', false), choice, 'locked');
  assert.equal(withColumn(choice, COLUMNS, 'nope', true), choice, 'unknown');
  assert.equal(isDefaultChoice(withColumn(choice, COLUMNS, 'costEur', true)), true);
  // A column the table does not have now (e.g. "Costs per month" in a short period) keeps its tick for later
  assert.deepEqual(shownKeys(COLUMNS, { on: ['costPerMonthEur'], off: [] }), ['doctor', 'class', 'forms', 'presses', 'costEur']);
});

test('a stored choice is checked: broken text is the defaults, the doctor is dropped, on wins over off', () => {
  assert.deepEqual(parseChoice(JSON.stringify({ v: 1, on: ['inserts', 'inserts', 7, '', 'doctor'], off: ['costEur', 'inserts'] })), { on: ['inserts'], off: ['costEur'] });
  ['', 'not json', '[]', '{"on":"x","off":[]}', '{"on":[]}', 'null', '42'].forEach((text) => assert.equal(parseChoice(text), null, text));
  assert.equal(parseChoice(null), null);
  assert.equal(parseChoice(undefined), null);
  assert.deepEqual(parseChoice(JSON.stringify({ on: ['x'.repeat(41)], off: [] })), { on: [], off: [] }, 'an overlong key is not a column');
});

test('read and write: the choice round-trips; the old "More columns" switch becomes its columns, then goes', () => {
  const storage = memoryStorage();
  assert.deepEqual(readColumnChoice(storage), EMPTY_CHOICE, 'nothing stored: the defaults');
  assert.equal(writeColumnChoice(storage, { on: ['inserts'], off: ['costEur'] }), true);
  assert.deepEqual(JSON.parse(storage.data.get(COLUMNS_KEY)), { v: 1, on: ['inserts'], off: ['costEur'] });
  assert.deepEqual(readColumnChoice(storage), { on: ['inserts'], off: ['costEur'] });

  const legacy = memoryStorage({ [LEGACY_ALL_KEY]: '1' });
  assert.deepEqual(readColumnChoice(legacy), { on: [...LEGACY_MORE_COLUMNS], off: [] }, 'the table looks as it did with “More columns”');
  assert.deepEqual(readColumnChoice(memoryStorage({ [LEGACY_ALL_KEY]: '0' })), EMPTY_CHOICE);
  writeColumnChoice(legacy, EMPTY_CHOICE);
  assert.equal(legacy.data.has(LEGACY_ALL_KEY), false, 'the old switch is dropped once a choice is kept');
  assert.deepEqual(readColumnChoice(legacy), EMPTY_CHOICE, '"Show default" stays the default after a reload');
  assert.deepEqual(readColumnChoice(memoryStorage({ [COLUMNS_KEY]: 'garbage', [LEGACY_ALL_KEY]: '1' })), { on: [...LEGACY_MORE_COLUMNS], off: [] });
});

test('blocked or missing storage: the defaults, and a write says it was not kept', () => {
  const blocked = memoryStorage({ [COLUMNS_KEY]: JSON.stringify({ v: 1, on: ['inserts'], off: [] }) }, { fail: true });
  assert.deepEqual(readColumnChoice(blocked), EMPTY_CHOICE);
  assert.equal(writeColumnChoice(blocked, { on: ['inserts'], off: [] }), false);
  assert.deepEqual(readColumnChoice(null), EMPTY_CHOICE);
  assert.equal(writeColumnChoice(null, EMPTY_CHOICE), false);
  assert.equal(pageStorage(), globalThis.localStorage ?? null, 'Node has no localStorage: null, never a throw');
  const full = memoryStorage();
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(writeColumnChoice(full, EMPTY_CHOICE), false);
});
