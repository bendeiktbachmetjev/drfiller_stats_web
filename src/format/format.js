// Number, money, duration and date formatters (§5.3.6, OVERRIDES O1: en-GB).
// Pure: no React, no window, no clock. Dates are shown in Europe/Vilnius time.
// Metrics return raw base units (€, ms, tokens, counts, shares 0..1); rounding happens only here.
import { CHARS_PER_PAGE, CHARS_PER_TOKEN, TIMEZONE } from '../data/constants.js';
import { getLocale, modelLabel, plural, t } from '../copy/index.js';

const NBSP = ' ';
const MINUS = '−';
// A word joiner after the sign of money keeps '−€440' on one line ('−' and '€' may otherwise split).
const WJ = '\u2060';
const EN_DASH = '–';
const EMPTY = '—';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const round1 = (n) => Math.round(n * 10) / 10;
const signOf = (n) => (n < 0 ? MINUS : '');
const moneySign = (n) => (n < 0 ? MINUS + WJ : '');

// --- Number formats, cached per locale --------------------------------------------------------------

let cacheLocale = null;
let NF = null;
const nf = () => {
  const locale = getLocale();
  if (locale !== cacheLocale) {
    cacheLocale = locale;
    NF = {
      int: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
      d1: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      d1max: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      d2: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    };
  }
  return NF;
};

/** Two significant digits for tiny amounts: 0.0087 → '0.0087', 0.00016 → '0.00016'. */
const smallText = (abs) => {
  const digits = Math.min(8, Math.max(2, 1 - Math.floor(Math.log10(abs))));
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits, maximumSignificantDigits: 2 }).format(abs);
};

const intText = (n, ref = n) => {
  const rounded = Math.round(n);
  if (rounded === 0) return '0';
  const abs = Math.abs(rounded);
  const text = Math.abs(Math.round(ref)) < 10000 ? nf().int.format(abs) : compactText(abs);
  return `${signOf(rounded)}${text}`;
};

const compactText = (abs) => {
  if (abs < 1000) return nf().int.format(abs);
  if (abs < 1e6) return `${nf().d1max.format(abs / 1000)}${t('common.unit.thousand')}`;
  return `${nf().d1max.format(abs / 1e6)}${t('common.unit.million')}`;
};

// --- Money ---------------------------------------------------------------------------------------

const moneyText = (v, symbol) => {
  const abs = Math.abs(v);
  if (abs === 0) return `${symbol}0`;
  let body;
  if (abs >= 100) body = nf().int.format(Math.round(abs));
  else body = nf().d2.format(abs);
  if (body === nf().d2.format(0) || body === '0') return `${symbol}0`;
  return `${moneySign(v)}${symbol}${body}`;
};

/** Totals in €: ≥ 100 → '€1,234'; ≥ 1 → '€12.40'; < 1 → '€0.43'; 0 → '€0'. */
const eur = (v) => (isNum(v) ? moneyText(v, '€') : EMPTY);

/** Signed € for results and deltas: '+€1,460', '−€12.40', '€0'. */
const eurSigned = (v) => {
  if (!isNum(v)) return EMPTY;
  const text = moneyText(v, '€');
  return v > 0 && text !== '€0' ? `+${WJ}${text}` : text;
};

/** USD for cost tooltips and vendor tables: '$1.96', '$0.0087' (2 significant digits under $0.01). */
const usd = (v) => {
  if (!isNum(v)) return EMPTY;
  const abs = Math.abs(v);
  if (abs === 0) return '$0';
  if (abs < 0.01) return `${moneySign(v)}$${smallText(abs)}`;
  return moneyText(v, '$');
};

/** € with 2 significant digits under €0.01 (tooltips next to `usd`). */
const eurPrecise = (v) => {
  if (!isNum(v)) return EMPTY;
  const abs = Math.abs(v);
  if (abs === 0) return '€0';
  if (abs < 0.01) return `${moneySign(v)}€${smallText(abs)}`;
  return moneyText(v, '€');
};

/** Unit prices: under €0.10 in cents with one decimal ('0.8¢', '2.6¢', '1¢'); otherwise like `eur`. */
const eurUnit = (v) => {
  if (!isNum(v)) return EMPTY;
  const abs = Math.abs(v);
  if (abs >= 0.1) return eur(v);
  const cents = round1(abs * 100);
  if (cents === 0) return `0${t('common.unit.cent')}`;
  return `${signOf(v)}${nf().d1max.format(cents)}${t('common.unit.cent')}`;
};

/** Tooltip pair: '€0.0076 = $0.0087 at list price'. */
const eurUsd = (eurValue, usdValue) => t('common.fmt.eurUsd', { eur: eurPrecise(eurValue), usd: usd(usdValue) });

// --- Counts and shares ------------------------------------------------------------------------------

const int = (v) => (isNum(v) ? intText(v) : EMPTY);
const dec = (v) => (isNum(v) ? `${signOf(v)}${nf().d1.format(round1(Math.abs(v)))}` : EMPTY);
const compact = (v) => (isNum(v) ? `${signOf(v)}${compactText(Math.abs(Math.round(v)))}` : EMPTY);

const pctNum = (share, ref = share) => {
  const p = Math.abs(share) * 100;
  const refP = Math.abs(ref) * 100;
  if (p === 0) return '0';
  if (round1(refP) >= 10) return `${signOf(share)}${nf().int.format(Math.round(p))}`;
  if (p < 0.1) return `${signOf(share)}${t('common.unit.lessThan', { x: nf().d1.format(0.1) })}`;
  return `${signOf(share)}${nf().d1max.format(round1(p))}`;
};

/** Shares 0..1: ≥ 10% → '64%'; < 10% → '4.2%'; < 0.1% → '<0.1%'. */
const pct = (v) => (isNum(v) ? `${pctNum(v)}%` : EMPTY);

/** Percentage points (already ×100): '+3 pp', '−0.5 pp'. */
const pp = (v) => {
  if (!isNum(v)) return EMPTY;
  const abs = round1(Math.abs(v));
  if (abs === 0) return `0${NBSP}${t('common.unit.pp')}`;
  return `${v > 0 ? '+' : MINUS}${nf().d1max.format(abs)}${NBSP}${t('common.unit.pp')}`;
};

/** '1 credit' · '2 credits' · '1,234 credits'. */
const credits = (n) => (isNum(n) ? `${intText(n)} ${plural(Math.round(n), 'common.unit.credit')}` : EMPTY);

/** Tokens: plain up to 9,999, compact from 10,000 ('11.4k'). */
const tokens = (n) => {
  if (!isNum(n)) return EMPTY;
  const abs = Math.abs(Math.round(n));
  return `${signOf(n)}${abs < 10000 ? nf().int.format(abs) : compactText(abs)}`;
};

/** Pages of text for a token count: tokens × 2.72 ÷ 1,800 → '≈ 17 pages'. */
const pages = (tokenCount) => {
  if (!isNum(tokenCount)) return EMPTY;
  const n = Math.max(0, Math.round((tokenCount * CHARS_PER_TOKEN) / CHARS_PER_PAGE));
  return t('common.unit.approx', { x: `${nf().int.format(n)} ${plural(n, 'common.unit.page')}` });
};

/** Small groups read as counts, large ones as a share: '2 of 3' · '72% (13 of 18)' · '72%'. */
const shareText = (n, N) => {
  if (!isNum(n) || !isNum(N) || N <= 0) return EMPTY;
  if (N < 5) return t('common.unit.of', { n: int(n), total: int(N) });
  if (N < 20) return t('common.unit.shareOf', { share: pct(n / N), n: int(n), total: int(N) });
  return pct(n / N);
};

/** Always counts: '8 of 735'. */
const countOf = (n, N) => (isNum(n) && isNum(N) ? t('common.unit.of', { n: int(n), total: int(N) }) : EMPTY);

// --- Durations ---------------------------------------------------------------------------------------

/** '5.9 s' (one decimal under 100 s), '124 s'. */
const sec = (ms) => {
  if (!isNum(ms)) return EMPTY;
  const s = ms / 1000;
  const text = Math.abs(s) < 100 ? nf().d1.format(round1(Math.abs(s))) : nf().int.format(Math.round(Math.abs(s)));
  return `${signOf(s)}${text}${NBSP}${t('common.unit.sec')}`;
};

/** '820 ms'. */
const ms = (v) => (isNum(v) ? `${intText(v)}${NBSP}${t('common.unit.ms')}` : EMPTY);

/** '319 min'; under 10 minutes one decimal ('2.5 min'). */
const minutes = (min) => {
  if (!isNum(min)) return EMPTY;
  const abs = Math.abs(min);
  const text = abs < 10 && abs > 0 ? nf().d1max.format(round1(abs)) : nf().int.format(Math.round(abs));
  return `${signOf(min)}${text}${NBSP}${t('common.unit.min')}`;
};

const durationParts = (msValue) => {
  const totalMin = Math.round(Math.abs(msValue) / 60000);
  if (totalMin === 0) return [{ num: Math.abs(msValue) > 0 ? t('common.unit.lessThan', { x: '1' }) : '0', unit: t('common.unit.min') }];
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (hours > 0) parts.push({ num: `${signOf(msValue)}${nf().int.format(hours)}`, unit: t('common.unit.hour') });
  if (mins > 0) parts.push({ num: hours > 0 ? String(mins) : `${signOf(msValue)}${mins}`, unit: t('common.unit.min') });
  return parts;
};

const joinParts = (list) => list.map(({ num, unit }) => (unit ? (unit === '%' ? `${num}%` : `${num}${NBSP}${unit}`) : num)).join(' ');

/** '1 h 15 min', '45 min', '<1 min' (input in ms). */
const duration = (msValue) => (isNum(msValue) ? joinParts(durationParts(msValue)) : EMPTY);

// --- Dates (Vilnius) --------------------------------------------------------------------------------

let wallFormatter = null;
/** @returns {{ y: number, m: number, d: number, hh: number, mm: number, wd: number } | null} */
const wallOf = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && DAY_KEY.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return { y, m, d, hh: 0, mm: 0, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 };
  }
  if (typeof v === 'string' && MONTH_KEY.test(v)) {
    const [y, m] = v.split('-').map(Number);
    return { y, m, d: 1, hh: 0, mm: 0, wd: new Date(Date.UTC(y, m - 1, 1)).getUTCDay() || 7 };
  }
  const msValue = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(msValue)) return null;
  wallFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
  const parts = wallFormatter.formatToParts(new Date(msValue));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh: Number(get('hour')), mm: Number(get('minute')), wd };
};

const monthShort = (m) => t('common.months.short').split('|')[m - 1];
const monthLong = (m) => t('common.months.long').split('|')[m - 1];
const weekdayShort = (wd) => t('common.weekdays.short').split('|')[wd - 1];
const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

const withWall = (render) => (v) => {
  const w = wallOf(v);
  return w ? render(w) : EMPTY;
};

/** '23 Sep 2026'. */
const date = withWall((w) => `${w.d} ${monthShort(w.m)} ${w.y}`);
/** '23 Sep'. */
const dayShort = withWall((w) => `${w.d} ${monthShort(w.m)}`);
/** 'Wed 23 Sep 2026'. */
const dayLong = withWall((w) => `${weekdayShort(w.wd)} ${w.d} ${monthShort(w.m)} ${w.y}`);
/** 'September 2026'. */
const month = withWall((w) => `${monthLong(w.m)} ${w.y}`);
/** 'Sep 2026'. */
const monthShortYear = withWall((w) => `${monthShort(w.m)} ${w.y}`);
/** 'September' (compare labels inside the same year). */
const monthName = withWall((w) => monthLong(w.m));
/** '14:05'. */
const time = withWall((w) => `${pad2(w.hh)}:${pad2(w.mm)}`);
/** '23 Sep 2026, 14:05'. */
const dateTime = withWall((w) => `${w.d} ${monthShort(w.m)} ${w.y}, ${pad2(w.hh)}:${pad2(w.mm)}`);

const addDaysKey = (key, n) => {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/**
 * A day range with an exclusive end, shown inclusive: '1–23 Sep 2026' · '25 Aug – 23 Sep 2026' ·
 * '29 Dec 2025 – 4 Jan 2026' · '23 Sep 2026' (one day).
 * @param {string} from day key
 * @param {string} toExcl day key (exclusive)
 */
const range = (from, toExcl) => {
  if (!DAY_KEY.test(from ?? '') || !DAY_KEY.test(toExcl ?? '')) return EMPTY;
  const last = addDaysKey(toExcl, -1);
  if (last <= from) return date(from);
  const a = wallOf(from);
  const b = wallOf(last);
  if (a.y !== b.y) return `${date(from)} ${EN_DASH} ${date(last)}`;
  if (a.m !== b.m) return `${a.d} ${monthShort(a.m)} ${EN_DASH} ${date(last)}`;
  return `${a.d}${EN_DASH}${b.d} ${monthShort(b.m)} ${b.y}`;
};

/** '3 min ago', '2 h ago', '4 days ago', 'just now'. */
const ago = (msValue, nowMs) => {
  if (!isNum(msValue) || !isNum(nowMs)) return EMPTY;
  const minutesAgo = Math.floor((nowMs - msValue) / 60000);
  if (minutesAgo < 1) return t('common.unit.ago.now');
  if (minutesAgo < 60) return t('common.unit.ago.min', { n: minutesAgo });
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return t('common.unit.ago.hour', { n: hoursAgo });
  return t('common.unit.ago.day', { n: Math.floor(hoursAgo / 24) });
};

/** Axis label of a chart bucket: day/week '23 Sep', month 'Sep' (+ ’26 on the first and at a year change). */
const bucketLabel = (key, granularity, previousKey = null) => {
  if (granularity === 'month' || MONTH_KEY.test(key)) {
    const w = wallOf(key);
    if (!w) return EMPTY;
    const prevYear = previousKey ? Number(String(previousKey).slice(0, 4)) : null;
    return prevYear === w.y ? monthShort(w.m) : `${monthShort(w.m)} ’${pad2(w.y % 100)}`;
  }
  return dayShort(key);
};

/** Tooltip title of a chart bucket: 'Wed 23 Sep 2026' · 'Week of 21 Sep 2026' · 'September 2026'. */
const bucketTitle = (key, granularity) => {
  if (granularity === 'month' || MONTH_KEY.test(key)) return month(key);
  if (granularity === 'week') return t('common.fmt.weekOf', { date: date(key) });
  return dayLong(key);
};

// --- Deltas ----------------------------------------------------------------------------------------

/**
 * A makeDelta result as text: pct '+18%', pp '−3 pp', abs '+4', eur '+€1.20'.
 * @param {{ kind: 'pct'|'pp'|'abs'|'eur', value: number, dir: 'up'|'down'|'flat' } | null} d
 */
const delta = (d) => {
  if (!d || !isNum(d.value)) return EMPTY;
  if (d.kind === 'eur') return d.dir === 'flat' ? '€0' : eurSigned(d.value);
  if (d.kind === 'pp') return d.dir === 'flat' ? pp(0) : pp(d.value);
  const suffix = d.kind === 'pct' ? '%' : '';
  const abs = Math.abs(d.value);
  const keepDecimal = d.kind === 'abs' && !Number.isInteger(d.value);
  const rounded = keepDecimal ? round1(abs) : Math.round(abs);
  if (d.dir === 'flat' || rounded === 0) return `0${suffix}`;
  const body = Number.isInteger(rounded) ? nf().int.format(rounded) : nf().d1.format(rounded);
  return `${d.value > 0 ? '+' : MINUS}${body}${suffix}`;
};

// --- Dispatcher ----------------------------------------------------------------------------------------

/** Format keys usable in tiles, tables, charts and `values` maps (§5.3.6). */
export const FORMAT_KEYS = Object.freeze([
  'int', 'dec', 'pct', 'pp', 'eur', 'eurSigned', 'eurUnit', 'usd', 'credits', 'tokens', 'pages', 'sec', 'ms',
  'minutes', 'duration', 'date', 'dayShort', 'month', 'time', 'dateTime', 'compact', 'text', 'model',
]);

/** A model id → its friendly name ('gemini-3-flash-preview' → 'Gemini 3 Flash (trial version)'). */
const model = (id) => modelLabel(id);

const FORMATTERS = {
  int, dec, pct, pp, eur, eurSigned, eurUnit, usd, credits, tokens, pages, sec, ms, minutes, duration,
  date, dayShort, month, time, dateTime, compact, model,
};

/** Formats that take a string input (day keys, model ids) instead of passing strings through. */
const STRING_INPUT = new Set(['date', 'dayShort', 'month', 'time', 'dateTime', 'model']);

/**
 * Formats one value. `format` is a key of FORMAT_KEYS or a function. Strings pass through (a cell can
 * carry ready text such as '2 of 3'); null/undefined/NaN → '—'.
 * @param {unknown} v
 * @param {string|Function} [format]
 * @returns {string}
 */
const value = (v, format = 'int') => {
  if (v == null || v === '') return EMPTY;
  if (typeof format === 'function') return format(v);
  if (typeof v === 'string' && !STRING_INPUT.has(format)) return v;
  if (typeof v === 'number' && !Number.isFinite(v)) return EMPTY;
  const formatter = FORMATTERS[format];
  return formatter ? formatter(v) : String(v);
};

/**
 * A value split into number and unit, so a tile can set the unit in a smaller size. `ref` decides the
 * notation (the count-up passes the final value so the digits keep one notation on the way up).
 * @returns {Array<{ num: string, unit: string }>}
 */
const parts = (v, format = 'int', ref = v) => {
  if (v == null || v === '') return [{ num: EMPTY, unit: '' }];
  if (typeof v === 'string') return [{ num: v, unit: '' }];
  if (!isNum(v)) return [{ num: EMPTY, unit: '' }];
  const anchor = isNum(ref) ? ref : v;
  switch (format) {
    case 'int':
      return [{ num: intText(v, anchor), unit: '' }];
    case 'pct':
      return [{ num: pctNum(v, anchor), unit: '%' }];
    case 'duration':
      return durationParts(v);
    case 'sec':
      return [{ num: sec(v).split(NBSP)[0], unit: t('common.unit.sec') }];
    case 'minutes':
      return [{ num: minutes(v).split(NBSP)[0], unit: t('common.unit.min') }];
    case 'credits':
      return [{ num: intText(v, anchor), unit: plural(Math.round(anchor), 'common.unit.credit') }];
    default:
      return [{ num: value(v, format), unit: '' }];
  }
};

/**
 * Formats a `values` map of an AreaResult item: `{ cost: ['eur', 12.3], n: 5, name: 'x' }` →
 * `{ cost: '€12.30', n: '5', name: 'x' }`. Plain numbers use `int`.
 * @param {Record<string, unknown>} [values]
 * @returns {Record<string, string>}
 */
const values = (input) => {
  const out = {};
  if (!input) return out;
  Object.entries(input).forEach(([key, raw]) => {
    if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === 'string') out[key] = value(raw[1], raw[0]);
    else if (typeof raw === 'number') out[key] = int(raw);
    else if (raw == null) out[key] = EMPTY;
    else out[key] = String(raw);
  });
  return out;
};

/**
 * Text of an AreaResult item (`answer`, `facts`, `notes`, `takeaways`): `t(key, values(values))`.
 * @param {{ key: string, values?: object } | null} item
 */
const textOf = (item) => (item?.key ? t(item.key, values(item.values)) : '');

export const fmt = {
  int, dec, compact, pct, pp, eur, eurSigned, eurUnit, eurPrecise, usd, eurUsd, credits, tokens, pages,
  shareText, countOf, sec, ms, minutes, duration, date, dayShort, dayLong, month, monthShortYear,
  monthName, time, dateTime, range, ago, bucketLabel, bucketTitle, delta, value, parts, values, textOf,
  plural, model, empty: EMPTY,
};

export default fmt;
