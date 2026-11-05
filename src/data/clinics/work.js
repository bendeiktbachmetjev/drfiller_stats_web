// GET /clinics/:id/work → WorkReport: the Work & time view of a clinic (spec v1 §7.2, §10). The server works
// every number out with the clinic page's own code (backend clinicView/page/report.js) and adds the owner-only
// parts (our cost, the likely range, Health); this file only checks the shape and arranges it for the view.
// Pure and copy-free: labels come from the answer (`en`, else `lt`, else the id), the view adds its own words.
//
// Minutes: byHandMin = the work by hand, spentMin = the time it took with Dr. Filler, netMin = by hand − spent
// after the day rules (a day over 30 minutes that does not look like the worker's usual day counts 30; the cut is
// its own negative part), savedMin = max(0, netMin) ("≈ 0"). Every other figure keeps its sign.
// Days: `from` and `to` of the answer are both included (the query sends the last day, not the day after).
import { CLINIC_ID_RE, DAY_RE, PID_RE, STAFF_ROLES } from '../api/contract.js';
import { hourEurOf } from '../normalize/clinics.js';
import { addDays, bucketIndexer, buildBuckets } from '../period.js';

/**
 * Counts of totals (everything Dr. Filler did), in the order the view lists them. referralsProposed = every
 * referral draft proposed, referralsUnused = the drafts never written into an E027; rxRep = prescriptions
 * repeated with „Kartoti“ (the "Prescription renewal" activity counts them with rxNew); the abx*, ai* and
 * anaCollect counts earn no time (spec v1 §8.2: counts only).
 */
export const COUNT_KEYS = Object.freeze([
  'forms', 'formsAuto', 'formsHelper', 'regenerated', 'inserts', 'referrals', 'referralsProposed', 'referralsUnused', 'rxNew',
  'rxRep', 'rxRepSearch', 'rxSaved', 'fillRuns', 'services', 'visitsDone', 'formsSaved', 'docs', 'dx', 'skl', 'f025', 'echoPdf',
  'anamnesis', 'anaCollect', 'abxShown', 'abxTesiu', 'abxKeiciu', 'abxCancel', 'aiRx', 'aiRxHelper', 'aiRef', 'audioMin',
  'phone', 'presses',
]);
/** Counts the view lists indented under the one before them (parts of it). */
export const COUNT_PARTS = Object.freeze(['formsAuto', 'formsHelper', 'regenerated', 'referralsUnused', 'abxTesiu', 'abxKeiciu', 'abxCancel', 'aiRxHelper']);
/** The data-quality counters of Health (owner only). */
export const QUALITY_KEYS = Object.freeze(['dup', 'bad', 'later', 'skip', 'lost', 'capped']);
/** Service codes in the registry's order (one code = one service). */
export const SERVICE_CODES = Object.freeze(['1', '3665', '3199', '3200', '3201', '4255', '4257', '4258', '4259']);
/** "1 saved hour cost ≈ X" is shown only once at least this many minutes were saved. */
export const MIN_SAVED_FOR_HOUR_PRICE = 60;

const isMap = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const dayOrNull = (v) => (typeof v === 'string' && DAY_RE.test(v) ? v : null);
const list = (v) => (Array.isArray(v) ? v.filter(isMap) : []);
const roleOrNull = (v) => (STAFF_ROLES.includes(v) ? v : null);
const pidOrNull = (v) => (typeof v === 'string' && (PID_RE.test(v) || v === 'deleted') ? v : null);
const labelOf = (item, fallback) => text(item?.en) ?? text(item?.lt) ?? fallback;
const sumOf = (rows, key) => rows.reduce((s, row) => s + num(row[key]), 0);
const hasKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
/** A number the answer may hold or leave out: its value, null for the server's null, undefined when absent. */
const numIfSent = (obj, key) => (hasKey(obj, key) ? numOrNull(obj[key]) : undefined);

/** The model constants by name, from an object ({ R_type: { v, lo, hi, … } }) or a list ([{ key, v, … }]). */
function constantsOf(model) {
  const raw = model?.constants ?? model?.CONSTANTS;
  const out = {};
  const put = (key, c) => {
    if (!text(key) || !isMap(c)) return;
    out[key] = {
      key,
      v: numOrNull(c.v ?? c.value ?? c.central),
      lo: numOrNull(c.lo ?? c.low),
      hi: numOrNull(c.hi ?? c.high),
      unit: text(c.unit),
      src: text(c.src ?? c.source),
      ref: text(c.ref),
      label: labelOf(c, key),
    };
  };
  if (Array.isArray(raw)) raw.forEach((c) => put(c?.key ?? c?.name ?? c?.id, c));
  else if (isMap(raw)) Object.entries(raw).forEach(([key, c]) => put(key, c));
  return out;
}

/** €/h per role the server values minutes at (object by role, or a list of { role, … }). */
function ratesOf(raw) {
  const out = {};
  const put = (role, r) => {
    if (!roleOrNull(role) || !isMap(r)) return;
    const eur = numOrNull(r.eur ?? r.v ?? r.value);
    if (eur === null) return;
    out[role] = { eur, lo: numOrNull(r.lo), hi: numOrNull(r.hi), src: text(r.src) };
  };
  if (Array.isArray(raw)) raw.forEach((r) => put(r?.role, r));
  else if (isMap(raw)) Object.entries(raw).forEach(([role, r]) => put(role, r));
  return out;
}

/** { '3665': 40, '1': 12 } → [{ code, n }] in the registry's order, unknown codes after (most first). */
function servicesOf(raw) {
  if (!isMap(raw)) return [];
  const rows = Object.entries(raw)
    .map(([code, n]) => ({ code: String(code), n: num(n) }))
    .filter((row) => row.n > 0);
  const rank = (code) => {
    const i = SERVICE_CODES.indexOf(code);
    return i < 0 ? SERVICE_CODES.length : i;
  };
  return rows.sort((a, b) => rank(a.code) - rank(b.code) || b.n - a.n || (a.code < b.code ? -1 : 1));
}

/**
 * @typedef {ReturnType<typeof normalizeWork>} WorkReport
 */

/**
 * The work answer, checked: every number finite, every list a list, unknown fields dropped.
 * @param {unknown} api the data of GET /clinics/:id/work
 */
export function normalizeWork(api) {
  const a = isMap(api) ? api : {};
  const c = isMap(a.clinic) ? a.clinic : {};
  const t = isMap(a.totals) ? a.totals : {};
  const totals = {
    savedMin: num(t.savedMin),
    // Signed: by hand − spent after the day rules (an older answer has only savedMin)
    netMin: numOrNull(t.netMin) ?? num(t.savedMin),
    spentMin: num(t.spentMin),
    byHandMin: num(t.byHandMin),
    valueEur: numOrNull(t.valueEur),
    paidEur: numOrNull(t.paidEur),
    ourCostEur: numOrNull(t.ourCostEur),
    ...Object.fromEntries(COUNT_KEYS.map((key) => [key, num(t[key])])),
    // Inserts are known only on days the extension sent its counts: null = not known at all
    inserts: numOrNull(t.inserts),
    services: num(t.services),
    servicesByCode: servicesOf(t.servicesByCode),
    // Person-days with minutes (0 = nothing measured: no time, not "nothing saved"); null = an older answer
    workDays: numOrNull(t.workDays),
    // Signed value of the minutes (the tile's valueEur stops at 0); null = no role set, or an older answer
    netValueEur: numOrNull(t.netValueEur),
    // Person-days with counts only (before the extension reported), and of them the ones on or after the
    // clinic's first day with minutes (someone's extension does not report yet)
    countsOnlyDays: num(t.countsOnlyDays),
    countsOnlyAfterFirst: num(t.countsOnlyAfterFirst),
  };

  const daily = new Map();
  list(a.daily).forEach((d) => {
    const day = dayOrNull(d.day);
    if (!day) return;
    const row = daily.get(day) ?? { day, savedMin: 0, spentMin: 0, byHandMin: 0 };
    row.savedMin += num(d.savedMin);
    row.spentMin += num(d.spentMin);
    // By hand = saved + spent, unless the answer says otherwise
    row.byHandMin += Number.isFinite(d.byHandMin) ? d.byHandMin : num(d.savedMin) + num(d.spentMin);
    daily.set(day, row);
  });

  const range = isMap(a.range) && Number.isFinite(a.range.lowMin) && Number.isFinite(a.range.highMin)
    ? {
        lowMin: a.range.lowMin,
        highMin: a.range.highMin,
        drivers: list(a.range.drivers)
          .filter((d) => text(d.key) && Number.isFinite(d.swingMin))
          .map((d) => ({ key: d.key, label: text(d.en) ?? text(d.lt), swingMin: Math.abs(d.swingMin) }))
          .sort((x, y) => y.swingMin - x.swingMin),
      }
    : null;

  const health = isMap(a.health) ? a.health : {};
  const quality = isMap(health.quality) ? health.quality : {};
  const checks = isMap(health.checks) ? health.checks : {};

  return {
    clinic: {
      id: CLINIC_ID_RE.test(c.id ?? '') ? c.id : null,
      name: text(c.name) ?? '',
      billing: c.billing === 'prepaid' ? 'prepaid' : 'invoice',
      statsShown: c.statsShown === true,
      statsFrom: dayOrNull(c.statsFrom),
      hourEur: hourEurOf(c.hourEur),
      markupPct: numOrNull(c.markupPct),
    },
    from: dayOrNull(a.from),
    to: dayOrNull(a.to),
    today: dayOrNull(a.today),
    // The clinic's first day with minutes, and the first day its extension reported (inserts known from
    // then); an older answer has only the first, which then stands for both
    firstWorkDay: dayOrNull(a.firstWorkDay),
    firstReportDay: hasKey(a, 'firstReportDay') ? dayOrNull(a.firstReportDay) : dayOrNull(a.firstWorkDay),
    model: { version: text(a.model?.version ?? a.model?.v), since: dayOrNull(a.model?.since), constants: constantsOf(a.model) },
    rates: ratesOf(a.rates),
    totals,
    parts: list(a.parts)
      .filter((p) => (p.side === 'hand' || p.side === 'df') && Number.isFinite(p.min))
      .map((p) => ({ key: text(p.key) ?? '', label: labelOf(p, text(p.key) ?? ''), side: p.side, min: p.min })),
    byRole: list(a.byRole)
      .map((r) => ({
        role: roleOrNull(r.role),
        workers: num(r.workers),
        savedMin: num(r.savedMin),
        // null = no person-day of the role with minutes (undefined: an answer without it)
        perWorkerDayMin: numIfSent(r, 'perWorkerDayMin'),
        rateEur: numOrNull(r.rateEur),
        rateOwn: typeof r.rateOwn === 'boolean' ? r.rateOwn : null,
        guessed: num(r.guessed),
        valueEur: numOrNull(r.valueEur),
      }))
      .sort((x, y) => (x.role === null) - (y.role === null) || STAFF_ROLES.indexOf(x.role) - STAFF_ROLES.indexOf(y.role)),
    bySpecialty: list(a.bySpecialty)
      .map((r) => ({ spec: text(r.spec) ?? 'Kita', workers: num(r.workers), savedMin: num(r.savedMin), perWorkerDayMin: numIfSent(r, 'perWorkerDayMin'), valueEur: numOrNull(r.valueEur) }))
      .sort((x, y) => y.savedMin - x.savedMin || y.workers - x.workers || x.spec.localeCompare(y.spec)),
    byWorker: list(a.byWorker)
      .filter((w) => pidOrNull(w.pid))
      .map((w) => ({
        pid: w.pid,
        email: text(w.email),
        role: roleOrNull(w.role),
        guessed: w.guessed === true,
        spec: text(w.spec),
        ex: w.ex === true,
        statsOff: w.statsOff === true,
        // my or test account, the store review account: counted, never timed
        nt: w.nt === true,
        member: w.member !== false,
        days: num(w.days),
        forms: num(w.forms),
        formsAuto: num(w.formsAuto),
        referrals: num(w.referrals),
        rxNew: num(w.rxNew),
        rxSaved: num(w.rxSaved),
        services: num(w.services),
        // null = no time for this person
        savedMin: numOrNull(w.savedMin),
        valueEur: numOrNull(w.valueEur),
        paidEur: numOrNull(w.paidEur),
      }))
      .sort((x, y) => (y.savedMin ?? -Infinity) - (x.savedMin ?? -Infinity) || y.forms - x.forms || (x.pid < y.pid ? -1 : 1)),
    byActivity: list(a.byActivity)
      .filter((r) => text(r.key))
      .map((r) => {
        const count = numOrNull(r.count);
        const savedMin = num(r.savedMin);
        // The server's null = no measured unit of it (no "0 min"); worked out only when an older answer has none
        const perUnitMin = hasKey(r, 'perUnitMin') ? numOrNull(r.perUnitMin) : count > 0 ? savedMin / count : null;
        return { key: r.key, label: labelOf(r, r.key), count, savedMin, perUnitMin };
      })
      // An activity nothing happened in has no line
      .filter((r) => (r.count ?? 0) > 0 || r.savedMin !== 0),
    daily: [...daily.values()].sort((x, y) => (x.day < y.day ? -1 : 1)),
    buttons: list(a.buttons)
      .filter((b) => text(b.id) && num(b.n) > 0)
      .map((b) => ({ id: b.id, label: labelOf(b, b.id), n: num(b.n) }))
      .sort((x, y) => y.n - x.n || x.label.localeCompare(y.label)),
    range,
    health: {
      versions: list(health.versions)
        .filter((v) => pidOrNull(v.pid))
        .map((v) => ({ pid: v.pid, app: text(v.app), lastDay: dayOrNull(v.lastDay) }))
        .sort((x, y) => ((y.lastDay ?? '') < (x.lastDay ?? '') ? -1 : (y.lastDay ?? '') > (x.lastDay ?? '') ? 1 : x.pid < y.pid ? -1 : 1)),
      quality: Object.fromEntries(QUALITY_KEYS.map((key) => [key, num(quality[key])])),
      checks: {
        formsVsBilling: list(checks.formsVsBilling)
          .filter((r) => dayOrNull(r.day) && pidOrNull(r.pid))
          .map((r) => ({ day: r.day, pid: r.pid, gen: num(r.gen), billed: num(r.billed) }))
          .sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : x.pid < y.pid ? -1 : 1)),
        insertsOverForms: num(checks.insertsOverForms),
        daysCapped: num(checks.daysCapped),
      },
    },
  };
}

/** The report has something to show: any minute, any count, any press. */
export const hasWork = (work) =>
  Boolean(work) && (work.totals.byHandMin !== 0 || work.totals.spentMin !== 0 || COUNT_KEYS.some((key) => num(work.totals[key]) > 0) || work.byWorker.some((w) => w.forms > 0));

/**
 * The four tiles: time saved ≈ (never below 0), its value, what the clinic paid, our cost per saved hour.
 * The two "per saved hour" prices appear only once at least an hour was saved.
 * @param {WorkReport} work
 */
export function workTiles(work) {
  const t = work.totals;
  const savedMin = Math.max(0, t.savedMin);
  const perSavedHour = (eur) => (savedMin >= MIN_SAVED_FOR_HOUR_PRICE && eur !== null ? eur / (savedMin / 60) : null);
  // No person-day with minutes: nothing was measured, which is not a measured zero
  const measured = t.workDays !== 0;
  return {
    savedMin,
    measured,
    isZero: measured && t.savedMin <= 0,
    byHandMin: t.byHandMin,
    spentMin: t.spentMin,
    valueEur: t.valueEur === null ? null : Math.max(0, t.valueEur),
    paidEur: t.paidEur,
    paidPerSavedHourEur: perSavedHour(t.paidEur),
    ourCostEur: t.ourCostEur,
    costPerSavedHourEur: perSavedHour(t.ourCostEur),
    lowMin: work.range ? Math.max(0, Math.min(work.range.lowMin, work.range.highMin)) : null,
    highMin: work.range ? Math.max(0, work.range.lowMin, work.range.highMin) : null,
  };
}

/**
 * "Where time was saved and where it was spent": by hand on the right of zero, with Dr. Filler on the left,
 * each part with its minutes, ending on the net (signed). The backend's parts already hold the day rules' cuts
 * as negative "by hand" parts, so they add up to the net; when an answer's parts do not (an older server),
 * `dayRuleMin` carries the difference so the list still ends on the answer's own number.
 * @param {WorkReport} work
 */
export function partsOf(work) {
  const hand = work.parts.filter((p) => p.side === 'hand');
  let df = work.parts.filter((p) => p.side === 'df');
  // Time spent comes as minutes (positive); a server that sends it signed (all ≤ 0) means the same
  if (df.length && df.every((p) => p.min <= 0) && df.some((p) => p.min < 0)) df = df.map((p) => ({ ...p, min: -p.min }));
  const handMin = sumOf(hand, 'min');
  const dfMin = sumOf(df, 'min');
  const partsNet = handMin - dfMin;
  const netMin = work.totals.netMin;
  const gap = netMin - partsNet;
  return {
    hand,
    df,
    handMin,
    dfMin,
    netMin,
    // Under half a minute is rounding, not a rule
    dayRuleMin: work.parts.length && Math.abs(gap) >= 0.5 ? gap : 0,
    maxAbs: Math.max(0, ...work.parts.map((p) => Math.abs(p.min))),
  };
}

/**
 * Chart rows of the time per day (or week, month): saved above zero, spent below (as a negative number), so
 * the whole column is the time by hand. Buckets tile the period; future ones carry nulls.
 * @param {WorkReport} work
 * @param {{ from: string, to: string, today?: string, chart?: { granularity: string } }|null} [period] the page's
 *   period (its nominal end and chart granularity); without it the answer's own from/to and days
 */
export function dailyRows(work, period = null) {
  const from = period?.from ?? work.from;
  // The page's period ends the day before `to`; the answer's `to` is its last day
  let to = period?.to ?? (work.to ? addDays(work.to, 1) : null);
  if (!from || !to) return [];
  const last = work.daily.at(-1)?.day;
  if (last && last >= to) to = addDays(last, 1);
  const today = period?.today ?? work.today ?? addDays(to, -1);
  const granularity = period?.chart?.granularity ?? 'day';
  const buckets = buildBuckets({ from, to, today, effTo: to }, granularity);
  const index = bucketIndexer(buckets);
  const rows = buckets.map((b) => ({
    key: b.key,
    granularity: b.granularity,
    isPartial: b.isPartial,
    isFuture: b.isFuture,
    savedMin: b.isFuture ? null : 0,
    spentMin: b.isFuture ? null : 0,
  }));
  const hand = rows.map((row) => (row.isFuture ? null : 0));
  work.daily.forEach((d) => {
    const i = index(d.day);
    if (i < 0 || rows[i].isFuture) return;
    rows[i].savedMin += d.savedMin;
    rows[i].spentMin += d.spentMin;
    hand[i] += d.byHandMin;
  });
  return rows.map((row, i) => ({ ...row, spentNeg: row.spentMin === null ? null : -row.spentMin, byHandMin: hand[i] }));
}

/**
 * Rows of "By role": the role, how many people, minutes saved, per person a work day, the €/h it is valued at
 * (`own` = the clinic's own rate) and the value (null when every person of the role has a guessed role).
 * @param {WorkReport} work
 */
export const roleRows = (work) =>
  work.byRole.map((r) => ({
    ...r,
    key: r.role ?? 'none',
    own: r.rateOwn ?? (r.role !== null && Number.isFinite(work.clinic.hourEur[r.role])),
    // No person-day of the role with minutes: nothing measured ("—"), not "0 min" saved
    savedMin: r.perWorkerDayMin === null ? null : r.savedMin,
  }));

/**
 * "By specialty", with the same rule: a specialty without any measured person-day shows "—", not "0 min".
 * @param {WorkReport} work
 */
export const specialtyRows = (work) =>
  work.bySpecialty.map((r) => ({ ...r, key: r.spec, savedMin: r.perWorkerDayMin === null ? null : r.savedMin }));

/**
 * People of the report who have a guessed role and minutes (their hours count, not their euros).
 * @param {WorkReport} work
 */
export const guessedWorkers = (work) =>
  work.byWorker.filter((w) => w.guessed && !w.ex && !w.statsOff && !w.nt && w.pid !== 'deleted' && w.savedMin !== null);

/**
 * The likely range's drivers, largest swing first, named by the model's constants.
 * @param {WorkReport} work
 * @returns {Array<{ key: string, label: string, swingMin: number }>}
 */
export const driverRows = (work) => (work.range?.drivers ?? []).map((d) => ({ ...d, label: d.label ?? work.model.constants[d.key]?.label ?? d.key }));

/**
 * Health, ready for the view: versions (newest day first), the members that sent no counts in the period
 * (an older extension, or not used), the quality counters and the checks.
 * @param {WorkReport} work
 * @param {string[]} [memberPids] the clinic's members now - only the ones the answer is about (with a worker
 *   filter: the picked ones), since the versions are those of the people shown
 * @param {string[]} [objectorPids] members who objected (the clinic's staff marks): they send nothing, rightly
 */
export function healthOf(work, memberPids = [], objectorPids = []) {
  const { versions, quality, checks } = work.health;
  const seen = new Set(versions.map((v) => v.pid));
  const off = new Set([...objectorPids, ...work.byWorker.filter((w) => w.statsOff).map((w) => w.pid)]);
  const silent = memberPids.filter((pid) => !seen.has(pid) && !off.has(pid));
  const qualityTotal = QUALITY_KEYS.reduce((s, key) => s + quality[key], 0);
  const problems = checks.formsVsBilling.length + checks.insertsOverForms + qualityTotal;
  return {
    versions,
    silent,
    quality,
    qualityTotal,
    mismatches: checks.formsVsBilling,
    insertsOverForms: checks.insertsOverForms,
    daysCapped: checks.daysCapped,
    allClear: problems === 0,
  };
}

/**
 * Whether the extension's counts (inserts) are known in the period: it reported on or before its last day
 * (as the clinic's page decides it). Shared logins and our own accounts report too, without minutes.
 * @param {WorkReport} work
 */
export const reported = (work) => Boolean(work.firstReportDay) && (!work.to || work.firstReportDay <= work.to);

/**
 * The counts of "What Dr. Filler did": every non-zero count (forms always), in COUNT_KEYS order. Inserts are
 * `null` when no day of the period had the extension's counts (shown as "–").
 * @param {WorkReport} work
 * @returns {Array<{ key: string, value: number|null }>}
 */
export function countItems(work) {
  return COUNT_KEYS.map((key) => ({ key, value: key === 'inserts' && (work.totals.inserts === null || !reported(work)) ? null : work.totals[key] })).filter(
    (item) => item.key === 'forms' || item.value === null || item.value > 0,
  );
}

/**
 * The notes on when time is counted (as the clinic's page words them): `before` = some days of the period
 * come before the clinic's first day with minutes (counts only), `notYet` = some days on or after it still
 * have counts only (someone's extension does not report yet), `none` = no day of the period has the
 * extension's counts at all.
 * @param {WorkReport} work
 */
export function countingNotes(work) {
  const t = work.totals;
  return {
    none: !reported(work),
    before: Boolean(work.firstWorkDay) && t.countsOnlyDays > t.countsOnlyAfterFirst,
    notYet: Boolean(work.firstWorkDay) && t.countsOnlyAfterFirst > 0,
  };
}

// The usage and work routes take at most this many days at once (backend MAX_USAGE_DAYS, MAX_WORK_DAYS)
export const MAX_QUERY_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first day a query of [from, to) may ask: `from`, or MAX_QUERY_DAYS before `to` when the period is longer
 * ("All time" grows past it in April 2027) — the routes refuse more.
 * @param {string|null} from 'YYYY-MM-DD'
 * @param {string|null} to 'YYYY-MM-DD', exclusive
 */
export function queryFrom(from, to) {
  if (!from || !to) return from;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
  return days > MAX_QUERY_DAYS ? addDays(to, -MAX_QUERY_DAYS) : from;
}

/**
 * The `workers` query of GET work: the picked pids, sorted, comma-joined; undefined = everyone.
 * @param {string[]|null|undefined} pids
 */
export const workersParam = (pids) => (Array.isArray(pids) && pids.length ? [...new Set(pids.filter((p) => PID_RE.test(p)))].sort().join(',') || undefined : undefined);

/**
 * The worker picker's list after its search and role chip.
 * @param {Array<{ pid: string, label: string, code?: string|null, role: string|null }>} options
 * @param {{ query?: string, role?: string|null }} [filter] role null/undefined = every role
 */
export function filterWorkers(options, { query = '', role = null } = {}) {
  const q = query.trim().toLowerCase();
  return options.filter(
    (o) => (!role || o.role === role) && (!q || o.label.toLowerCase().includes(q) || String(o.code ?? '').toLowerCase().includes(q)),
  );
}
