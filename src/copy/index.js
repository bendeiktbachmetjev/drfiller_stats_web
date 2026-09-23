// The copy module: every string the owner sees, by key (§3.11, OVERRIDES O1).
// Imports nothing outside copy/. A new language = a new folder `copy/<lang>/` with the same files
// and keys plus its LOCALE, registered in LANGS below.
import * as enCommon from './en/common.js';
import * as enOverview from './en/overview.js';
import * as enMoney from './en/money.js';
import * as enCosts from './en/costs.js';
import * as enRequests from './en/requests.js';
import * as enRecording from './en/recording.js';
import * as enModels from './en/models.js';
import * as enPrices from './en/prices.js';
import * as enDoctors from './en/doctors.js';
import * as enSettings from './en/settings.js';

const EMPTY = '—';

const merge = (files) => ({
  COPY: Object.assign({}, ...files.map((file) => file.COPY || {})),
  DEFS: Object.assign({}, ...files.map((file) => file.DEFS || {})),
});

/** Registered languages: `{ [lang]: { locale, COPY, DEFS, RULES, files } }`. */
export const LANGS = Object.freeze({
  en: Object.freeze({
    locale: enCommon.LOCALE,
    RULES: enCommon.RULES,
    files: { common: enCommon, overview: enOverview, money: enMoney, costs: enCosts, requests: enRequests, recording: enRecording, models: enModels, prices: enPrices, doctors: enDoctors, settings: enSettings },
    ...merge([enCommon, enOverview, enMoney, enCosts, enRequests, enRecording, enModels, enPrices, enDoctors, enSettings]),
  }),
});

export const DEFAULT_LANG = 'en';
let current = LANGS[DEFAULT_LANG];
let currentLang = DEFAULT_LANG;

/**
 * Switches the language (from `settings.lang`). Unknown languages keep the current one.
 * @param {string} lang
 * @returns {boolean} true when the language exists
 */
export function setLang(lang) {
  if (!LANGS[lang]) return false;
  current = LANGS[lang];
  currentLang = lang;
  return true;
}

/** @returns {string} the active language id ('en') */
export const getLang = () => currentLang;
/** @returns {string} the number/date locale of the active language ('en-GB') */
export const getLocale = () => current.locale;

/** @param {string} key @returns {boolean} whether COPY or DEFS has the key */
export const has = (key) => Object.hasOwn(current.COPY, key) || Object.hasOwn(current.DEFS, key);

const fill = (template, values, onMissing) =>
  template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = values?.[name];
    if (value === null || value === undefined || value === '') return onMissing(match);
    return String(value);
  });

/**
 * Text for a key with {placeholders} filled. Values must already be formatted strings (see
 * `fmt.values`). A missing value shows "—", never "{x}". A missing key falls back to `DEFS[key].short`,
 * then to the key itself (visible in development, caught by copy.test.mjs).
 * @param {string} key
 * @param {Record<string, string|number|null|undefined>} [values]
 * @returns {string}
 */
export function t(key, values) {
  const text = current.COPY[key] ?? current.DEFS[key]?.short;
  if (typeof text !== 'string') return key;
  return values ? fill(text, values, () => EMPTY) : text;
}

/**
 * Definition of a hint key (`{ short, long?, template? }`), or null.
 * @param {string} key
 */
export function def(key) {
  const entry = key ? current.DEFS[key] : null;
  if (!entry) return null;
  return typeof entry === 'string' ? { short: entry } : entry;
}

/**
 * `DEFS[key].template` with its placeholders filled; falls back to `short` when the key has no
 * template or a value is missing, so a sentence never shows a raw placeholder.
 * @param {string} key
 * @param {Record<string, string|number>} [values]
 * @returns {string}
 */
export function fillHint(key, values = {}) {
  const entry = def(key);
  if (!entry) return '';
  if (!entry.template) return entry.short ?? '';
  let complete = true;
  const text = fill(entry.template, values, (match) => {
    complete = false;
    return match;
  });
  return complete ? text : entry.short ?? '';
}

let pluralRules = null;
let pluralLocale = null;
const categoryOf = (n) => {
  if (pluralLocale !== current.locale) {
    pluralRules = new Intl.PluralRules(current.locale);
    pluralLocale = current.locale;
  }
  return pluralRules.select(Math.abs(n));
};

/**
 * The plural form for a count.
 * @param {number} n
 * @param {string | Record<string, string> | [string, string]} forms a key prefix
 *   ('common.unit.credit' → '.one' / '.other' / '.few' …), an object by Intl.PluralRules category,
 *   or a pair [one, other]
 * @returns {string} the word only (no number)
 */
export function plural(n, forms) {
  const category = categoryOf(Number.isFinite(n) ? n : 0);
  if (typeof forms === 'string') {
    const key = `${forms}.${category}`;
    return has(key) ? t(key) : t(`${forms}.other`);
  }
  if (Array.isArray(forms)) return category === 'one' ? forms[0] : forms[1];
  if (forms && typeof forms === 'object') return forms[category] ?? forms.other ?? '';
  return '';
}

const MODEL_PREFIX = 'common.model.';

/**
 * Friendly model name: exact id, then the longest known prefix (dated snapshots such as
 * 'gpt-4o-mini-transcribe-2025-12-15'); unknown → the raw id.
 * @param {string|null|undefined} id
 */
export function modelLabel(id) {
  if (!id) return EMPTY;
  const exact = `${MODEL_PREFIX}${id}`;
  if (Object.hasOwn(current.COPY, exact)) return current.COPY[exact];
  let best = null;
  Object.keys(current.COPY).forEach((key) => {
    if (!key.startsWith(MODEL_PREFIX)) return;
    const known = key.slice(MODEL_PREFIX.length);
    if (id.startsWith(known) && (!best || known.length > best.length)) best = known;
  });
  return best ? current.COPY[`${MODEL_PREFIX}${best}`] : String(id);
}

/**
 * Friendly name of where a model runs.
 * @param {'direct'|'vertex'|string|null} endpoint
 * @param {string|null} [location] Vertex location ('global', 'eu', 'europe-west3' …)
 */
export function endpointLabel(endpoint, location = null) {
  if (endpoint === 'direct' || (!endpoint && !location)) return t('common.endpoint.direct');
  const where = location || 'global';
  const key = `common.endpoint.${where}`;
  return Object.hasOwn(current.COPY, key) ? current.COPY[key] : t('common.endpoint.other', { location: where });
}

/**
 * Friendly thinking setting.
 * @param {{ thinkingLevel?: string|null, thinkingBudget?: number|null } | null} config
 */
export function thinkingLabel(config) {
  if (!config) return EMPTY;
  if (config.thinkingBudget === 0) return t('common.thinking.budget0');
  const level = config.thinkingLevel;
  if (!level) return EMPTY;
  const key = `common.thinking.${level}`;
  return Object.hasOwn(current.COPY, key) ? current.COPY[key] : t('common.thinking.other', { level });
}

/** @param {'preview'|'stable'|'short-term'|'legacy-limited'|string} status */
export function statusLabel(status) {
  const key = `common.status.${status}`;
  return Object.hasOwn(current.COPY, key) ? current.COPY[key] : status ? String(status) : EMPTY;
}

/** @param {string} kind an errorKind of §5.2.5 */
export function errorKindLabel(kind) {
  const key = `errorKind.${kind}`;
  return Object.hasOwn(current.COPY, key) ? current.COPY[key] : t('errorKind.unknown');
}

/** @param {string} cls a Doctor.class value */
export const classLabel = (cls) => t(`common.class.${cls}`);
/** @param {string} cls a Doctor.displayClass value */
export const displayClassLabel = (cls) => t(`common.displayClass.${cls}`);

/**
 * How a doctor is shown (OVERRIDES O2): the email when the server sent one, else "Doctor NN",
 * else "Deleted account". The short code (D-XXXX) is shown next to it by the caller.
 * @param {{ email?: string|null, noText?: string|null } | null} doctor
 */
export function doctorLabel(doctor) {
  if (!doctor) return EMPTY;
  if (doctor.email) return doctor.email;
  if (doctor.noText) return t('common.doctor.name', { no: doctor.noText });
  return t('common.doctor.deleted');
}

/** The language table currently in use (tests and the Settings page). */
export const currentTable = () => current;
