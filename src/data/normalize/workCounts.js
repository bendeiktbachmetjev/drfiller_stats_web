// GET /work-counts → WorkCounts: what every person did with Dr. Filler in one period (button presses, Express
// forms, prescriptions, „Užpildyti visus“ runs, services …), by pid. The server sums the rows of every clinic and
// the personal ones (backend services/stats/peopleCounts.js); this file checks the answer, drops what is broken
// and arranges it for the Doctors table and the Overview card. Pure and copy-free: button labels come from the
// answer (`en`, else `lt`, else the id).
//
// The answer is not part of the dataset: it is already summed over its days, so it is loaded for the period on
// screen (context/useWorkCounts.js), never sliced in memory.
import { DAY_RE, PID_RE, WORK_COUNT_KEYS, validate } from '../api/contract.js';

/**
 * @typedef {Record<'forms'|'formsAuto'|'inserts'|'referrals'|'rxNew'|'rxRep'|'rxSaved'|'fillRuns'|'services'|
 *   'servicesAuto'|'visitsDone'|'formsSaved'|'docs'|'dx'|'presses', number>} WorkCountValues
 * @typedef {WorkCountValues & { pid: string, days: number, buttons: Array<{ id: string, n: number }>, mainPresses: number|null }} WorkPerson
 *   buttons: the person's presses per button, most first
 *   mainPresses: their presses of the main buttons (`main`), null when the server does not mark them
 * @typedef {{
 *   fromDay: string|null, toDay: string|null, firstDay: string|null, rows: number,
 *   people: WorkPerson[], byPid: Map<string, WorkPerson>,
 *   deleted: (WorkCountValues & { days: number }) | null,
 *   totals: WorkCountValues & { people: number, days: number },
 *   buttons: Array<{ id: string, label: string, n: number, main: boolean }>,
 *   labels: Map<string, string>,
 *   main: Set<string>|null,
 *   valid: boolean, errors: string[]
 * }} WorkCounts
 *   people   most presses first (then forms, then pid), like the server
 *   deleted  erased accounts' counts (never a person), null when there are none
 *   totals   the server's totals (people, person-days, every count), erased accounts included
 *   buttons  every button pressed in the period, most first, with its English label
 *   labels   button id → its label, for a person's own list
 *   main     the ids of the main buttons pressed in the period: the ones that do the work for the doctor (Express,
 *            „Užpildyti visus“, services, TLK codes, ŠKL, F025 … and the answers to Dr. Filler's warnings; the backend's
 *            registry MAIN_BUTTONS marks them). null = an older server that does not mark them ("—" on the page)
 *   valid    the answer matched the contract (api/contract.js workCounts); a broken entry is dropped either way
 */

const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const whole = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const dayOrNull = (v) => (typeof v === 'string' && DAY_RE.test(v) ? v : null);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** A person's pid: a real pseudonym, or 'anonymous' (a row without an account). Erased accounts are never people. */
const personPid = (v) => (typeof v === 'string' && (PID_RE.test(v) || v === 'anonymous') ? v : null);

const zeroValues = () => Object.fromEntries(WORK_COUNT_KEYS.map((key) => [key, 0]));
const valuesOf = (raw) => Object.fromEntries(WORK_COUNT_KEYS.map((key) => [key, count(raw?.[key])]));
const addValues = (into, add) => {
  WORK_COUNT_KEYS.forEach((key) => {
    into[key] += add[key] ?? 0;
  });
  return into;
};

/** { gen: 5, fill: 1 } → [{ id: 'gen', n: 5 }, { id: 'fill', n: 1 }] (most first, then by id). */
const buttonList = (raw) =>
  (isMap(raw) ? Object.entries(raw) : [])
    .map(([id, n]) => ({ id: String(id), n: count(n) }))
    .filter((b) => text(b.id) && b.n > 0)
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));

const mergeButtons = (a, b) => {
  const sums = new Map();
  [...a, ...b].forEach(({ id, n }) => sums.set(id, (sums.get(id) ?? 0) + n));
  return [...sums.entries()].map(([id, n]) => ({ id, n })).sort((x, y) => y.n - x.n || (x.id < y.id ? -1 : 1));
};

/** Does any count hold something? */
export const hasWorkCounts = (values) => Boolean(values) && WORK_COUNT_KEYS.some((key) => count(values[key]) > 0);

/**
 * The /work-counts answer, checked: every count a number ≥ 0, every list a list, broken entries left out, a pid
 * listed twice added up. Unknown fields are dropped.
 * @param {unknown} api the data of GET /work-counts
 * @returns {WorkCounts|null} null when the answer is not usable at all (no people list)
 */
export function normalizeWorkCounts(api) {
  if (!isMap(api) || !Array.isArray(api.people)) return null;
  const { ok, errors } = validate('workCounts', api);

  const byPid = new Map();
  api.people.forEach((raw) => {
    const pid = isMap(raw) ? personPid(raw.pid) : null;
    if (!pid) return;
    const person = { pid, days: whole(raw.days), ...valuesOf(raw), buttons: buttonList(raw.buttons) };
    const before = byPid.get(pid);
    if (!before) {
      byPid.set(pid, person);
      return;
    }
    // A pid twice (never from the server): one person, the counts added up
    addValues(before, person);
    before.days += person.days;
    before.buttons = mergeButtons(before.buttons, person.buttons);
  });
  const people = [...byPid.values()].sort((a, b) => b.presses - a.presses || b.forms - a.forms || (a.pid < b.pid ? -1 : 1));

  const deletedRaw = isMap(api.deleted) ? { days: whole(api.deleted.days), ...valuesOf(api.deleted) } : null;
  const deleted = deletedRaw && (deletedRaw.days > 0 || hasWorkCounts(deletedRaw)) ? deletedRaw : null;

  // The server's totals; an answer without them gets the sum of its people and erased accounts
  let totals;
  if (isMap(api.totals)) {
    totals = { people: whole(api.totals.people), days: whole(api.totals.days), ...valuesOf(api.totals) };
  } else {
    totals = people.reduce((sum, person) => addValues(sum, person), { people: people.length, days: 0, ...zeroValues() });
    totals.days = people.reduce((n, person) => n + person.days, 0) + (deleted?.days ?? 0);
    if (deleted) addValues(totals, deleted);
  }

  const labels = new Map();
  const listed = (Array.isArray(api.buttons) ? api.buttons : []).filter((b) => isMap(b) && text(b.id) && count(b.n) > 0);
  // The server marks every button it lists (true or false); an answer whose buttons carry no mark is an older
  // server's. Nothing pressed: nothing to mark, so every count of main buttons is 0
  const main = !listed.length || listed.some((b) => typeof b.main === 'boolean') ? new Set(listed.filter((b) => b.main === true).map((b) => b.id)) : null;
  const buttons = listed
    .map((b) => {
      const label = text(b.en) ?? text(b.lt) ?? b.id;
      labels.set(b.id, label);
      return { id: b.id, label, n: count(b.n), main: Boolean(main?.has(b.id)) };
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  people.forEach((person) => {
    person.mainPresses = main ? person.buttons.reduce((n, b) => n + (main.has(b.id) ? b.n : 0), 0) : null;
  });

  return {
    fromDay: dayOrNull(api.fromDay),
    toDay: dayOrNull(api.toDay),
    firstDay: dayOrNull(api.firstDay),
    rows: whole(api.rows),
    people,
    byPid,
    deleted,
    totals,
    buttons,
    labels,
    main,
    valid: ok,
    errors,
  };
}

/**
 * The query of GET /work-counts for a period: its Vilnius days [from, effTo) as instants (the server reads the
 * day before `to` as the last one, like /usage). A period that still runs (its end is after `nowMs`) asks without
 * `to`: the server then counts up to now, and a `to` at tomorrow's midnight could be more than the one day ahead
 * it accepts on the 25-hour day of October. null when the period has no day that has begun.
 * @param {{ fromMs: number, effToMs: number }|null} period
 * @param {number} [nowMs] the clock; without it the period's end is always sent
 * @returns {{ from: string, to?: string }|null}
 */
export function workCountsQuery(period, nowMs) {
  if (!period || !Number.isFinite(period.fromMs) || !Number.isFinite(period.effToMs) || !(period.effToMs > period.fromMs)) return null;
  const from = new Date(period.fromMs).toISOString();
  if (Number.isFinite(nowMs) && period.effToMs > nowMs) return { from };
  return { from, to: new Date(period.effToMs).toISOString() };
}

/**
 * The counts of one row of the Doctors table: a person, the erased accounts' line ('deleted'), or null (no counts
 * from them in the period).
 * @param {WorkCounts|null} counts
 * @param {string} pid
 * @returns {(WorkCountValues & { days: number, buttons?: Array<{ id: string, n: number }> })|null}
 */
export function workCountsOf(counts, pid) {
  if (!counts) return null;
  if (pid === 'deleted') return counts.deleted;
  return counts.byPid.get(pid) ?? null;
}

/**
 * A button's label: the answer's English label, else the id itself.
 * @param {WorkCounts|null} counts
 * @param {string} id
 */
export const buttonLabel = (counts, id) => counts?.labels?.get(id) ?? id;

/**
 * Which buttons a person pressed, most first, labelled. Empty for the erased accounts' line (no list) and for
 * someone without counts.
 * @param {WorkCounts|null} counts
 * @param {string} pid
 * @returns {Array<{ id: string, label: string, n: number }>}
 */
export function personButtons(counts, pid) {
  const person = pid === 'deleted' ? null : counts?.byPid?.get(pid);
  return (person?.buttons ?? []).map(({ id, n }) => ({ id, label: buttonLabel(counts, id), n }));
}

/**
 * Which main buttons a person pressed (`main`), most first, labelled. Empty when the server does not mark them, for
 * the erased accounts' line and for someone without counts.
 * @param {WorkCounts|null} counts
 * @param {string} pid
 * @returns {Array<{ id: string, label: string, n: number }>}
 */
export function personMainButtons(counts, pid) {
  const main = counts?.main;
  return main ? personButtons(counts, pid).filter((button) => main.has(button.id)) : [];
}

/**
 * The period's totals in the business scope: the server's totals minus the people `hidden` says to leave out (my
 * and test accounts while the switch hides them), so erased accounts stay counted. Buttons likewise: the server's
 * list minus the hidden people's presses.
 * @param {WorkCounts|null} counts
 * @param {((pid: string) => boolean)|null} [hidden] null = nobody is hidden
 * @returns {(WorkCountValues & { people: number, days: number, buttons: Array<{ id: string, label: string, n: number }> })|null}
 */
export function scopedWorkTotals(counts, hidden = null) {
  if (!counts) return null;
  const left = typeof hidden === 'function' ? counts.people.filter((person) => hidden(person.pid)) : [];
  if (!left.length) return { ...counts.totals, buttons: counts.buttons };
  const out = { ...counts.totals };
  left.forEach((person) => {
    WORK_COUNT_KEYS.forEach((key) => {
      out[key] = Math.max(0, out[key] - person[key]);
    });
    out.days = Math.max(0, out.days - person.days);
  });
  out.people = Math.max(0, out.people - left.length);
  const minus = new Map();
  left.forEach((person) => person.buttons.forEach(({ id, n }) => minus.set(id, (minus.get(id) ?? 0) + n)));
  out.buttons = counts.buttons
    .map((b) => ({ ...b, n: Math.max(0, b.n - (minus.get(b.id) ?? 0)) }))
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return out;
}

/**
 * What the counts can say for the period on screen, as one word for the page's note:
 *   'loading'   not here yet                    'tooMany'  413: too many rows for one answer
 *   'badRange'  the server refused the period   'notYet'   404: the server does not have the route yet
 *   'failed'    any other failure               'none'     loaded, nothing counted in the period
 *   'partial'   counts start after the period's first day (people outside clinics count from their update)
 *   'ok'        nothing to say
 * @param {{ status: string, counts?: WorkCounts|null, error?: { code?: string, status?: number|null }|null }|null} state
 *   the useWorkCounts() result
 * @param {{ from: string }|null} period
 * @param {object|null} [totals] the totals shown (scopedWorkTotals), default the answer's own
 * @returns {'loading'|'tooMany'|'badRange'|'notYet'|'failed'|'none'|'partial'|'ok'}
 */
export function workCountsStatus(state, period, totals = undefined) {
  if (!state || state.status === 'idle' || state.status === 'loading') return 'loading';
  if (state.status === 'error' || !state.counts) {
    const code = state.error?.code;
    if (code === 'TOO_MANY_ROWS') return 'tooMany';
    if (code === 'BAD_RANGE') return 'badRange';
    if (state.error?.status === 404) return 'notYet';
    return 'failed';
  }
  const shown = totals === undefined ? state.counts.totals : totals;
  // Nothing counted at all (a person-day without any of these counts, say a recording only, is still a day)
  if (!hasWorkCounts(shown) && !(shown?.people > 0) && !(shown?.days > 0)) return 'none';
  const first = state.counts.firstDay;
  if (first && period?.from && first > period.from) return 'partial';
  return 'ok';
}
