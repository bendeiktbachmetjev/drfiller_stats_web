// The forecast assumptions form (§3.8, §4.9): the fields, the draft the form edits (the text the owner
// typed), validation that mirrors the server (§5.2.3.7), the "How doctors work" presets and the live €
// effects. Pure (the Node tests import it); the React components only render it.
import { DEFAULT_PLANNING, PLANNING_LIMITS } from '../../data/api/contract.js';
import { PACK_IDS, PAYMENT_METHODS } from '../../data/constants.js';
import { SCENARIOS } from '../../data/core/projection.js';

/**
 * @typedef {{ id: string, group: 'main'|'fine', kind: 'number'|'percent'|'choice', path: Array<string|number>,
 *   limits?: [number, number], options?: string[], measured?: string, measuredFormat?: string, hintKey?: string,
 *   effect?: 'conversation'|'form'|'usd', unit?: 'usd' }} Field
 *   measured: the computeSettings headline key shown as "measured: …"; measuredFormat: a fmt key, or 'whole'
 *   (a whole number written out in full, like the input next to it)
 */

const limitsOf = (key) => PLANNING_LIMITS[key];

/** Every field of the form, in display order. `path` points into Settings['planning']. */
export const FIELDS = Object.freeze([
  { id: 'visitsPerDoctorMonth', group: 'main', kind: 'number', path: ['visitsPerDoctorMonth'], limits: limitsOf('visitsPerDoctorMonth'), measured: 'measuredVisitsPerDoctorMonth', measuredFormat: 'whole', hintKey: 'settings.visitsPerDoctorMonth' },
  { id: 'scale0', group: 'main', kind: 'number', path: ['doctorScales', 0], limits: limitsOf('doctorScales'), hintKey: 'settings.doctorScales' },
  { id: 'scale1', group: 'main', kind: 'number', path: ['doctorScales', 1], limits: limitsOf('doctorScales'), hintKey: 'settings.doctorScales' },
  ...PACK_IDS.map((pack) => ({ id: pack, group: 'main', kind: 'percent', path: ['packMix', pack], limits: limitsOf('packMix') })),
  { id: 'liveShareOfVisits', group: 'fine', kind: 'percent', path: ['liveShareOfVisits'], limits: limitsOf('liveShareOfVisits'), measured: 'measuredLiveShare', measuredFormat: 'pct', hintKey: 'settings.liveShareOfVisits' },
  { id: 'liveMinutesPerVisit', group: 'fine', kind: 'number', path: ['liveMinutesPerVisit'], limits: limitsOf('liveMinutesPerVisit'), measured: 'measuredLiveMin', measuredFormat: 'minutes', hintKey: 'settings.liveMinutesPerVisit' },
  { id: 'dictationMinutesPerVisit', group: 'fine', kind: 'number', path: ['dictationMinutesPerVisit'], limits: limitsOf('dictationMinutesPerVisit'), measured: 'measuredDictationMin', measuredFormat: 'minutes', hintKey: 'settings.dictationMinutesPerVisit' },
  { id: 'conversationTokensPerMinute', group: 'fine', kind: 'number', path: ['conversationTokensPerMinute'], limits: limitsOf('conversationTokensPerMinute'), measured: 'measuredConvTokensPerMin', measuredFormat: 'whole', hintKey: 'settings.conversationTokensPerMinute', effect: 'conversation' },
  { id: 'formCostBasis', group: 'fine', kind: 'choice', path: ['formCostBasis'], options: ['measured', 'assumed'], hintKey: 'settings.formCostBasis' },
  { id: 'assumedIn', group: 'fine', kind: 'number', path: ['assumedFormTokens', 'in'], limits: limitsOf('assumedFormTokens'), measured: 'measuredFormIn', measuredFormat: 'whole', hintKey: 'settings.assumedFormTokens' },
  { id: 'assumedOut', group: 'fine', kind: 'number', path: ['assumedFormTokens', 'out'], limits: limitsOf('assumedFormTokens'), measured: 'measuredFormOut', measuredFormat: 'whole', hintKey: 'settings.assumedFormTokens', effect: 'form' },
  { id: 'anamnesisRunsPerDoctorMonth', group: 'fine', kind: 'number', path: ['anamnesisRunsPerDoctorMonth'], limits: limitsOf('anamnesisRunsPerDoctorMonth'), measured: 'measuredAnamnesisRuns', measuredFormat: 'dec', hintKey: 'settings.anamnesisRunsPerDoctorMonth' },
  { id: 'paymentMethod', group: 'fine', kind: 'choice', path: ['paymentMethod'], options: [...PAYMENT_METHODS], hintKey: 'settings.paymentMethod' },
  { id: 'freeShare', group: 'fine', kind: 'percent', path: ['freeShare'], limits: limitsOf('freeShare'), measured: 'measuredFreeShare', measuredFormat: 'pct', hintKey: 'settings.freeShare' },
  { id: 'railway', group: 'fine', kind: 'number', path: ['fixedMonthlyUsd', 'railway'], limits: limitsOf('fixedMonthlyUsd'), hintKey: 'settings.railwayShare', effect: 'usd', unit: 'usd' },
  { id: 'other', group: 'fine', kind: 'number', path: ['fixedMonthlyUsd', 'other'], limits: limitsOf('fixedMonthlyUsd'), hintKey: 'settings.otherFixed', effect: 'usd', unit: 'usd' },
  { id: 'workdaysPerMonth', group: 'fine', kind: 'number', path: ['workdaysPerMonth'], limits: limitsOf('workdaysPerMonth'), hintKey: 'settings.workdaysPerMonth' },
  { id: 'peakHourShare', group: 'fine', kind: 'percent', path: ['peakHourShare'], limits: limitsOf('peakHourShare'), measured: 'measuredPeakHourShare', measuredFormat: 'pct', hintKey: 'settings.peakHourShare' },
  { id: 'sonioxStreamLimit', group: 'fine', kind: 'number', path: ['sonioxStreamLimit'], limits: limitsOf('sonioxStreamLimit'), measured: 'serverStreamLimit', measuredFormat: 'int', hintKey: 'settings.sonioxStreamLimit' },
].map((field) => Object.freeze(field)));

/** @param {string} id @returns {Field|undefined} */
export const fieldById = (id) => FIELDS.find((field) => field.id === id);

/** The "How doctors work" buttons (§3.8), in order; each fills the recording fields of Fine-tuning. */
export const PRESET_IDS = Object.freeze(['typed', 'dictation1', 'live15', 'live25']);

/** Allowed difference of the pack mix from 100 % (the server allows ±0.001 of 1). */
export const PACK_SUM_TOLERANCE = 0.001;

const getAt = (object, path) => path.reduce((value, key) => (value == null ? undefined : value[key]), object);

/** Up to 4 decimals, no trailing zeros: 0.15 × 100 → '15', 1.96 → '1.96'. */
const numberText = (value) => (Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : '');

/**
 * The editable draft of a planning object: every field as text (percent fields in %).
 * @param {object} planning Settings['planning']
 * @returns {Record<string, string>}
 */
export function draftOf(planning) {
  const draft = {};
  FIELDS.forEach((field) => {
    const value = getAt(planning, field.path) ?? getAt(DEFAULT_PLANNING, field.path);
    if (field.kind === 'choice') draft[field.id] = String(value);
    else draft[field.id] = numberText(field.kind === 'percent' ? value * 100 : value);
  });
  return draft;
}

/** The draft of the server defaults (reset). */
export const defaultDraft = () => draftOf(DEFAULT_PLANNING);

/**
 * Reads a number as typed: '12,5' and '12.5' → 12.5; spaces, a leading € or $ and a trailing % are ignored.
 * @param {string} text
 * @returns {number|null} null when it is not a number
 */
export function parseNumber(text) {
  const clean = String(text ?? '').replace(/[\s  ]/g, '').replace(/^[€$]/, '').replace(/%$/, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean) && !/^-?\.\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

const setAt = (object, path, value) => {
  let target = object;
  path.slice(0, -1).forEach((key) => {
    target = target[key];
  });
  target[path[path.length - 1]] = value;
};

const freshPlanning = () => ({
  ...DEFAULT_PLANNING,
  doctorScales: [...DEFAULT_PLANNING.doctorScales],
  assumedFormTokens: { ...DEFAULT_PLANNING.assumedFormTokens },
  packMix: { ...DEFAULT_PLANNING.packMix },
  fixedMonthlyUsd: { ...DEFAULT_PLANNING.fixedMonthlyUsd },
});

/**
 * @typedef {{ code: 'number'|'range'|'packSum'|'choice', min?: number, max?: number, sum?: number }} FieldError
 *   min / max / sum are in the unit the owner types (percent fields in %)
 */

/**
 * Validates a draft like the server does (§5.2.3.7): every number finite and in range, the pack mix
 * adding up to 100 %, the choices known. `planning` is the object to PUT (only when ok).
 * @param {Record<string, string>} draft
 * @returns {{ ok: boolean, planning: object|null, errors: Record<string, FieldError> }}
 */
export function validateDraft(draft) {
  const planning = freshPlanning();
  const errors = {};
  FIELDS.forEach((field) => {
    const text = draft?.[field.id];
    if (field.kind === 'choice') {
      if (field.options.includes(text)) setAt(planning, field.path, text);
      else errors[field.id] = { code: 'choice' };
      return;
    }
    const typed = parseNumber(text);
    const scale = field.kind === 'percent' ? 100 : 1;
    const [min, max] = field.limits;
    if (typed === null) {
      errors[field.id] = { code: 'number' };
      return;
    }
    const value = typed / scale;
    if (value < min - 1e-12 || value > max + 1e-12) {
      errors[field.id] = { code: 'range', min: min * scale, max: max * scale };
      return;
    }
    setAt(planning, field.path, Math.min(max, Math.max(min, value)));
  });
  const packsOk = PACK_IDS.every((pack) => !errors[pack]);
  if (packsOk) {
    const sum = PACK_IDS.reduce((acc, pack) => acc + planning.packMix[pack], 0);
    if (Math.abs(sum - 1) > PACK_SUM_TOLERANCE) PACK_IDS.forEach((pack) => (errors[pack] = { code: 'packSum', sum: sum * 100 }));
  }
  const ok = Object.keys(errors).length === 0;
  return { ok, planning: ok ? planning : null, errors };
}

/**
 * The pack mix of a draft in %, or null when a pack is not a number.
 * @param {Record<string, string>} draft
 */
export function packSumOf(draft) {
  const values = PACK_IDS.map((pack) => parseNumber(draft?.[pack]));
  return values.some((value) => value === null) ? null : values.reduce((a, b) => a + b, 0);
}

/**
 * Fills the three recording fields from a "How doctors work" preset. A conversation preset keeps the
 * dictation minutes (they do not count when every visit has a conversation).
 * @param {Record<string, string>} draft
 * @param {'typed'|'dictation1'|'live15'|'live25'} id
 * @returns {Record<string, string>}
 */
export function applyPreset(draft, id) {
  const preset = SCENARIOS[id];
  if (!preset) return draft;
  const next = { ...draft, liveShareOfVisits: numberText(preset.liveShare * 100) };
  if (preset.liveShare > 0) next.liveMinutesPerVisit = numberText(preset.liveMin);
  else next.dictationMinutesPerVisit = numberText(preset.dictMin);
  return next;
}

/**
 * Which preset the draft's recording fields match, or null for the owner's own mix.
 * @param {Record<string, string>} draft
 * @returns {string|null}
 */
export function presetOf(draft) {
  const share = parseNumber(draft?.liveShareOfVisits);
  const liveMin = parseNumber(draft?.liveMinutesPerVisit);
  const dictMin = parseNumber(draft?.dictationMinutesPerVisit);
  return (
    PRESET_IDS.find((id) => {
      const preset = SCENARIOS[id];
      if (share === null || share / 100 !== preset.liveShare) return false;
      return preset.liveShare > 0 ? liveMin === preset.liveMin : dictMin === preset.dictMin;
    }) ?? null
  );
}

/**
 * Live € effects of the token and dollar fields (§3.8), from the current model's list price.
 * @param {Record<string, string>} draft
 * @param {{ inputPerM: number, outputPerM: number, usdPerEur: number } | null} rates
 * @returns {{ conversation: number|null, form: number|null, railway: number|null, other: number|null }}
 *   conversation = extra € of a visit with a conversation; form = € of one form of the assumed size
 */
export function effectsOf(draft, rates) {
  const fx = rates?.usdPerEur > 0 ? rates.usdPerEur : null;
  const n = (id) => {
    const value = parseNumber(draft?.[id]);
    return value !== null && value >= 0 ? value : null;
  };
  const eur = (usd) => (fx && usd !== null ? usd / fx : null);
  const tokensPerMin = n('conversationTokensPerMinute');
  const liveMin = n('liveMinutesPerVisit') || DEFAULT_PLANNING.liveMinutesPerVisit;
  const inTok = n('assumedIn');
  const outTok = n('assumedOut');
  const inputPerM = Number.isFinite(rates?.inputPerM) ? rates.inputPerM : null;
  const outputPerM = Number.isFinite(rates?.outputPerM) ? rates.outputPerM : null;
  return {
    conversation: tokensPerMin !== null && inputPerM !== null ? eur((tokensPerMin * liveMin * inputPerM) / 1e6) : null,
    form: inTok !== null && outTok !== null && inputPerM !== null && outputPerM !== null ? eur((inTok * inputPerM + outTok * outputPerM) / 1e6) : null,
    railway: eur(n('railway')),
    other: eur(n('other')),
  };
}

/**
 * Whether the draft differs from a saved planning object.
 * @param {Record<string, string>} draft
 * @param {object} planning
 */
export function isDirty(draft, planning) {
  return !sameDraft(draft, draftOf(planning));
}

/**
 * Whether two drafts hold the same text in every field.
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
 */
export const sameDraft = (a, b) => FIELDS.every((field) => (a?.[field.id] ?? '') === (b?.[field.id] ?? ''));
