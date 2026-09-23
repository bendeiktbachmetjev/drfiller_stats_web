// Words for the Settings page. The metric returns copy keys with raw values (§4.0); the shared resolver
// (format/items.js) handles nested items and doctors; this page adds one kind of its own:
//   ['sources', ['revenue', …]]     names of data sources, joined
import { endpointLabel, getLocale, modelLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { itemText as sharedItemText } from '../../format/items.js';


/** Joins words in the page language: 'a', 'a and b', 'a, b and c'. */
export const joinWords = (words) => new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(words);

/** @param {string} name a source id of SOURCE_ORDER */
export const sourceLabel = (name) => t(`settings.source.${name}`);

/** Page-only value kinds of Settings: ['sources', ['revenue', …]] → "Stripe and Soniox". */
const HINTS = { sources: (list) => joinWords((list ?? []).map(sourceLabel)) };

/**
 * Text of one metric item (answer, note): nested items, doctors and source lists resolved.
 * @param {{ key: string, values?: object } | null} item
 * @param {object|null} ds
 * @returns {string}
 */
export const itemText = (item, ds = null) => sharedItemText(item, { ds, hints: HINTS });

/**
 * The AnswerBlock sentences.
 * @param {import('../../data/metrics/shared.js').AreaResult|null} data
 * @param {object|null} ds
 * @returns {Array<{ text: string, tone: string }>|undefined}
 */
export const answerItemsOf = (data, ds) => (data?.answer?.length ? data.answer.map((item) => ({ text: itemText(item, ds), tone: item.tone })) : undefined);

/** '0.8724' — the exchange rate with four decimals (fmt rounds money to cents). */
export const rateText = (value) =>
  Number.isFinite(value) ? new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value) : fmt.empty;

/**
 * "What" of a setup-history row: which model / transcription service / billing rule.
 * @param {{ kind: string, main?: string, fallback?: string|null, endpoint?: string, location?: string|null, rule?: string }} row
 */
export function eraWhat(row) {
  if (row.kind === 'billing') return t(`settings.era.billing.${row.rule}`);
  const values = { main: modelLabel(row.main), fallback: row.fallback ? modelLabel(row.fallback) : null };
  if (row.kind === 'transcription') return t(row.fallback ? 'settings.era.transcriptionFallback' : 'settings.era.transcription', values);
  return t(row.fallback ? 'settings.era.modelFallback' : 'settings.era.model', { ...values, where: endpointLabel(row.endpoint, row.location) });
}

/** Note of a setup-history row ('a 6-minute test' …) or ''. */
export function eraNote(row) {
  if (!row.note) return '';
  if (row.note === 'timeout') return t('settings.eraNote.timeout', { sec: fmt.int(row.timeoutMs / 1000) });
  return t(`settings.eraNote.${row.note}`);
}

/**
 * The one sentence under "Setup history": the current model, backup, dictation and billing rule.
 * @param {Array<object>} rows metric `tables.eras`
 * @param {{ gemini?: object, transcription?: object } | null} config /config (wins over the static eras for "now")
 */
export function eraNowText(rows, config) {
  const current = (kind) => rows.find((row) => row.kind === kind && row.current) ?? null;
  const model = current('model');
  const transcription = current('transcription');
  const billing = current('billing');
  const gemini = config?.gemini ?? null;
  const main = gemini?.main ?? model?.main;
  const fallback = gemini ? gemini.fallback : model?.fallback;
  const where = gemini ? endpointLabel(gemini.endpoint, gemini.endpoint === 'vertex' ? gemini.vertexLocation : null) : endpointLabel(model?.endpoint, model?.location);
  return t('settings.eras.now', {
    main: modelLabel(main),
    where,
    fallback: fallback ? modelLabel(fallback) : t('settings.eras.noFallback'),
    dictation: transcription ? modelLabel(transcription.main) : fmt.empty,
    billing: billing ? t(`settings.billingNow.${billing.rule}`) : '',
  });
}

/**
 * The owner-facing reason of a failed save (DataError), one sentence.
 * @param {{ code?: string, apiCode?: string|null } | null} error
 */
export function saveReason(error) {
  if (error?.apiCode === 'INVALID_BODY') return t('settings.reason.invalid');
  switch (error?.code) {
    case 'NETWORK':
      return t('settings.reason.network');
    case 'TIMEOUT':
      return t('settings.reason.timeout');
    case 'AUTH':
      return t('settings.reason.auth');
    default:
      return t('settings.reason.server');
  }
}

/**
 * "measured: …" under a planning field.
 * @param {{ measured?: string, measuredFormat?: string, id: string }} field
 * @param {Record<string, unknown>} headline metric headline
 */
export function measuredText(field, headline) {
  if (!field.measured) return null;
  const value = headline?.[field.measured];
  if (field.measured === 'serverStreamLimit') return value == null ? null : t('settings.measured.server', { value: fmt.int(value) });
  if (value == null) return t('settings.measured.none');
  // Whole numbers are written out in full ('11,269'), like the number in the input next to them.
  const text = field.measuredFormat === 'whole' ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 }).format(value) : fmt.value(value, field.measuredFormat ?? 'int');
  return t('settings.measured', { value: text });
}
