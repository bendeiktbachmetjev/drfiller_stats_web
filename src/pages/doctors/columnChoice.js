// Which columns the Doctors table shows ("Columns"): the owner's ticks on top of each column's default, kept on this
// device. Only the ticks that differ from a default are stored, so a column added later still starts as its default
// says. Pure: the storage is passed in (window.localStorage on the page), and every read and write is wrapped, so
// blocked storage only means the choice lasts for this visit and the table falls back to the defaults.

export const COLUMNS_KEY = 'drfiller.admin.doctors.columns';
/**
 * The stored choice's version. A choice of another version is not read, so a new default reaches everyone once:
 * 2 = the order and defaults of 06.11.2026 (With us since, Credits left, Recording, History summaries shown).
 */
export const CHOICE_VERSION = 2;
/** Always shown, never in the choice: the column that names the doctor. */
export const LOCKED_COLUMNS = Object.freeze(['doctor']);

/**
 * @typedef {{ on: string[], off: string[] }} ColumnChoice the columns ticked on, and off, against their default
 * @typedef {{ key: string, defaultHidden?: boolean }} ChoiceColumn
 */
export const EMPTY_CHOICE = Object.freeze({ on: Object.freeze([]), off: Object.freeze([]) });

const MAX_KEY = 40;
const keyList = (v) => (Array.isArray(v) ? [...new Set(v.filter((key) => typeof key === 'string' && key && key.length <= MAX_KEY && !LOCKED_COLUMNS.includes(key)))] : []);

/**
 * A stored choice, checked: `{ v: CHOICE_VERSION, on: [...], off: [...] }`; a key in both lists counts as on.
 * @param {string|null|undefined} textValue
 * @returns {ColumnChoice|null} null when there is nothing usable (also a choice of an older version)
 */
export function parseChoice(textValue) {
  if (typeof textValue !== 'string' || !textValue) return null;
  let raw;
  try {
    raw = JSON.parse(textValue);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== CHOICE_VERSION || !Array.isArray(raw.on) || !Array.isArray(raw.off)) return null;
  const on = keyList(raw.on);
  return { on, off: keyList(raw.off).filter((key) => !on.includes(key)) };
}

const defaultShown = (column) => !column?.defaultHidden;

/**
 * Is this column shown? The lock first, then the owner's tick, then the column's default.
 * @param {ChoiceColumn} column
 * @param {ColumnChoice} choice
 */
export function isShown(column, choice = EMPTY_CHOICE) {
  if (LOCKED_COLUMNS.includes(column.key)) return true;
  if (choice.on.includes(column.key)) return true;
  if (choice.off.includes(column.key)) return false;
  return defaultShown(column);
}

/**
 * The keys of the columns shown, in the table's order.
 * @param {ChoiceColumn[]} columns
 * @param {ColumnChoice} choice
 * @returns {string[]}
 */
export const shownKeys = (columns, choice = EMPTY_CHOICE) => columns.filter((column) => isShown(column, choice)).map((column) => column.key);

/**
 * The choice after ticking one column on or off. A tick that equals the column's default leaves the lists;
 * the locked column never changes; an unknown key is ignored.
 * @param {ColumnChoice} choice
 * @param {ChoiceColumn[]} columns
 * @param {string} key
 * @param {boolean} show
 * @returns {ColumnChoice}
 */
export function withColumn(choice, columns, key, show) {
  const column = columns.find((c) => c.key === key);
  if (!column || LOCKED_COLUMNS.includes(key)) return choice;
  const on = choice.on.filter((k) => k !== key);
  const off = choice.off.filter((k) => k !== key);
  if (show !== defaultShown(column)) (show ? on : off).push(key);
  return { on, off };
}

/** Nothing ticked against a default ("Show default" has nothing to do). */
export const isDefaultChoice = (choice) => !choice || (choice.on.length === 0 && choice.off.length === 0);

/** window.localStorage, or null where reading it throws (blocked storage) or there is none (tests, Node). */
export function pageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The stored choice; anything unreadable, or kept by an older version, is the defaults.
 * @param {Storage|null} storage
 * @returns {ColumnChoice}
 */
export function readColumnChoice(storage) {
  try {
    return parseChoice(storage?.getItem(COLUMNS_KEY)) ?? EMPTY_CHOICE;
  } catch {
    // Blocked storage: the defaults
    return EMPTY_CHOICE;
  }
}

/**
 * Keeps the choice on this device.
 * @param {Storage|null} storage
 * @param {ColumnChoice} choice
 * @returns {boolean} false when it could not be kept (the choice then lasts for this visit)
 */
export function writeColumnChoice(storage, choice) {
  if (!storage) return false;
  try {
    storage.setItem(COLUMNS_KEY, JSON.stringify({ v: CHOICE_VERSION, on: keyList(choice?.on), off: keyList(choice?.off) }));
    return true;
  } catch {
    return false;
  }
}
