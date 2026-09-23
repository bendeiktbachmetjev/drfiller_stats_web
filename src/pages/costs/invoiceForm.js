// The hand-entered invoices of one month (§4.3 "Change", §5.2.3.7): the fields, the draft the form
// edits, and its validation. Pure (Node tests import it); the form component only renders it.
import { MONTH_COST_LIMITS } from '../../data/api/contract.js';

/** Money fields in form order; `usd` fields show a live "≈ €" next to them. */
export const INVOICE_FIELDS = Object.freeze([
  Object.freeze({ key: 'googleInvoiceEur', currency: 'eur' }),
  Object.freeze({ key: 'googlePromoCreditsEur', currency: 'eur' }),
  Object.freeze({ key: 'railwayUsd', currency: 'usd', hintKey: 'costs.edit.railwayHint' }),
  Object.freeze({ key: 'sonioxInvoiceUsd', currency: 'usd' }),
  Object.freeze({ key: 'openaiInvoiceUsd', currency: 'usd' }),
  Object.freeze({ key: 'otherEur', currency: 'eur' }),
]);

export const NOTE_MAX = MONTH_COST_LIMITS.noteMax;

/**
 * Text of a stored amount for an input ('' when nothing is entered).
 * @param {number|null|undefined} value
 * @returns {string}
 */
export const amountText = (value) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '');

/**
 * The editable draft of a month: every field as the text the owner typed.
 * @param {{ note?: string } & Record<string, number|null>} [row] an invoices table row (or a MonthCost)
 * @returns {Record<string, string>}
 */
export function draftOf(row = {}) {
  const draft = { note: typeof row.note === 'string' ? row.note : '' };
  INVOICE_FIELDS.forEach(({ key }) => {
    draft[key] = amountText(row[key]);
  });
  return draft;
}

/**
 * Reads an amount as typed: '' → null (no invoice); '12,5' and '12.5' → 12.5; spaces and a leading
 * currency sign are ignored. Anything else, a negative number or more than the server allows → error.
 * @param {string} text
 * @returns {{ value: number|null, error: boolean }}
 */
export function parseAmount(text) {
  const clean = String(text ?? '').replace(/[\s ]/g, '').replace(/^[€$]/, '').replace(',', '.');
  if (clean === '') return { value: null, error: false };
  if (!/^\d+(\.\d+)?$/.test(clean)) return { value: null, error: true };
  const value = Number(clean);
  const ok = Number.isFinite(value) && value >= MONTH_COST_LIMITS.min && value <= MONTH_COST_LIMITS.max;
  return ok ? { value, error: false } : { value: null, error: true };
}

/**
 * Validates a draft. `fields` is the PUT body (every money field, null when empty, and the note).
 * @param {Record<string, string>} draft
 * @returns {{ ok: boolean, fields: Record<string, number|string|null>, errors: Record<string, 'badNumber'|'noteTooLong'> }}
 */
export function validateDraft(draft) {
  const fields = {};
  const errors = {};
  INVOICE_FIELDS.forEach(({ key }) => {
    const { value, error } = parseAmount(draft?.[key]);
    if (error) errors[key] = 'badNumber';
    fields[key] = value;
  });
  const note = String(draft?.note ?? '').trim();
  if (note.length > NOTE_MAX) errors.note = 'noteTooLong';
  fields.note = note;
  return { ok: Object.keys(errors).length === 0, fields, errors };
}
