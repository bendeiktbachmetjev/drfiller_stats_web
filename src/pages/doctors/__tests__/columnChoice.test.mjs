import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICE_VERSION, COLUMNS_KEY, EMPTY_CHOICE, isDefaultChoice, isShown, pageStorage, parseChoice, readColumnChoice, shownKeys, withColumn,
  writeColumnChoice,
} from '../columnChoice.js';

// "Columns" on the Doctors table: the owner's ticks over each column's default, kept on this device; blocked
// storage never breaks the table (the defaults, and the choice lasts for the visit). A new version of the stored
// choice brings everyone the new default once.

const COLUMNS = [
  { key: 'doctor' },
  { key: 'class' },
  { key: 'specialty', defaultHidden: true },
  { key: 'forms' },
  { key: 'presses' },
  { key: 'inserts', defaultHidden: true },
  { key: 'costEur' },
];

const stored = (choice, v = CHOICE_VERSION) => JSON.stringify({ v, ...choice });

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
  assert.deepEqual(shownKeys(COLUMNS, choice), ['doctor', 'class', 'forms', 'presses', 'inserts'], 'in the table’s order');
  choice = withColumn(choice, COLUMNS, 'inserts', false);
  assert.deepEqual(choice, { on: [], off: ['costEur'] }, 'back to its default: off the list');
  assert.equal(withColumn(choice, COLUMNS, 'doctor', false), choice, 'locked');
  assert.equal(withColumn(choice, COLUMNS, 'nope', true), choice, 'unknown');
  assert.equal(isDefaultChoice(withColumn(choice, COLUMNS, 'costEur', true)), true);
  // A column the table does not have now (e.g. "Costs per month" in a short period) keeps its tick for later
  assert.deepEqual(shownKeys(COLUMNS, { on: ['costPerMonthEur'], off: [] }), ['doctor', 'class', 'forms', 'presses', 'costEur']);
});

test('a stored choice is checked: its version, broken text, the doctor dropped, on wins over off', () => {
  assert.equal(CHOICE_VERSION, 2);
  assert.deepEqual(parseChoice(stored({ on: ['inserts', 'inserts', 7, '', 'doctor'], off: ['costEur', 'inserts'] })), { on: ['inserts'], off: ['costEur'] });
  assert.equal(parseChoice(stored({ on: ['inserts'], off: [] }, 1)), null, 'a choice of the first version: the new default instead');
  assert.equal(parseChoice(JSON.stringify({ on: ['inserts'], off: [] })), null, 'no version');
  ['', 'not json', '[]', '{"v":2,"on":"x","off":[]}', '{"v":2,"on":[]}', 'null', '42'].forEach((text) => assert.equal(parseChoice(text), null, text));
  assert.equal(parseChoice(null), null);
  assert.equal(parseChoice(undefined), null);
  assert.deepEqual(parseChoice(stored({ on: ['x'.repeat(41)], off: [] })), { on: [], off: [] }, 'an overlong key is not a column');
});

test('read and write: the choice round-trips with its version; an older choice is the defaults', () => {
  const storage = memoryStorage();
  assert.deepEqual(readColumnChoice(storage), EMPTY_CHOICE, 'nothing stored: the defaults');
  assert.equal(writeColumnChoice(storage, { on: ['inserts'], off: ['costEur'] }), true);
  assert.deepEqual(JSON.parse(storage.data.get(COLUMNS_KEY)), { v: CHOICE_VERSION, on: ['inserts'], off: ['costEur'] });
  assert.deepEqual(readColumnChoice(storage), { on: ['inserts'], off: ['costEur'] });
  writeColumnChoice(storage, EMPTY_CHOICE);
  assert.deepEqual(readColumnChoice(storage), EMPTY_CHOICE, '"Show default" stays the default after a reload');

  const older = memoryStorage({ [COLUMNS_KEY]: stored({ on: ['specialty'], off: ['costEur'] }, 1), 'drfiller.admin.doctors.allColumns': '1' });
  assert.deepEqual(readColumnChoice(older), EMPTY_CHOICE, 'the first version and the old "More columns" switch: the new default, once');
  writeColumnChoice(older, { on: ['specialty'], off: [] });
  assert.deepEqual(readColumnChoice(older), { on: ['specialty'], off: [] }, 'a new tick is kept again');
  assert.deepEqual(readColumnChoice(memoryStorage({ [COLUMNS_KEY]: 'garbage' })), EMPTY_CHOICE);
});

test('blocked or missing storage: the defaults, and a write says it was not kept', () => {
  const blocked = memoryStorage({ [COLUMNS_KEY]: stored({ on: ['inserts'], off: [] }) }, { fail: true });
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
