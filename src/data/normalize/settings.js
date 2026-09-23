// /settings → Settings with every missing key taken from the defaults (the server does the same).
import { DEFAULT_PLANNING, DEFAULT_SETTINGS } from '../api/contract.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const mergeDeep = (base, over) => {
  if (!isObject(over)) return base;
  const out = { ...base };
  Object.keys(base).forEach((key) => {
    if (!(key in over) || over[key] === undefined || over[key] === null) return;
    out[key] = isObject(base[key]) && isObject(over[key]) ? mergeDeep(base[key], over[key]) : over[key];
  });
  return out;
};

/**
 * @param {{ settings?: object } | object | null} api the /settings data (`{ settings }`) or a Settings object
 * @returns {import('../api/contract.js').Settings}
 */
export function normalizeSettings(api) {
  const raw = isObject(api?.settings) ? api.settings : isObject(api) ? api : {};
  const planning = mergeDeep({ ...DEFAULT_PLANNING, doctorScales: [...DEFAULT_PLANNING.doctorScales] }, raw.planning);
  if (!Array.isArray(planning.doctorScales) || planning.doctorScales.length !== 2) planning.doctorScales = [...DEFAULT_PLANNING.doctorScales];
  return {
    internalPids: Array.isArray(raw.internalPids) ? raw.internalPids.filter((pid) => typeof pid === 'string') : [],
    vatPayer: typeof raw.vatPayer === 'boolean' ? raw.vatPayer : DEFAULT_SETTINGS.vatPayer,
    lang: raw.lang === 'en' || raw.lang === 'ru' ? raw.lang : DEFAULT_SETTINGS.lang,
    planning,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}
