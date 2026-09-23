import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { INVOICE_FIELDS, NOTE_MAX, draftOf, parseAmount, validateDraft } from './invoiceForm.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const INPUT = `h-10 w-full rounded-[12px] border bg-surface px-3 text-sm font-semibold text-ink tabular-nums ${RING}`;
const INPUT_OK = 'border-line';
const INPUT_BAD = 'border-bad';
const BUTTON = `inline-flex items-center h-10 px-4 rounded-full text-[13px] font-bold transition-colors ${RING}`;
const PRIMARY = `${BUTTON} bg-brand text-white hover:bg-brand-strong disabled:opacity-60`;
const SECONDARY = `${BUTTON} border border-line bg-surface text-ink hover:bg-line/20`;

/** One money field: label, input, error or the live "≈ €" of a dollar amount, and its hint. */
function AmountField({ field, value, error, usdPerEur, onChange }) {
  const id = useId();
  const noteId = `${id}-note`;
  const parsed = parseAmount(value);
  const approx = field.currency === 'usd' && parsed.value !== null && !parsed.error ? t('costs.edit.approx', { eur: fmt.eur(parsed.value / usdPerEur) }) : null;
  const note = error ? t('costs.edit.badNumber') : [approx, field.hintKey ? t(field.hintKey) : null].filter(Boolean).join(' · ');
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-ink-soft">
        {t(`costs.edit.${field.key}`)}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => onChange(field.key, event.target.value)}
        className={`mt-1 ${INPUT} ${error ? INPUT_BAD : INPUT_OK}`}
      />
      {note && (
        <p id={noteId} className={`mt-1 text-xs font-medium ${error ? 'text-bad' : 'text-ink-soft'}`}>
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Inline form for the invoices of one month (§4.3 "Change"): numbers ≥ 0 or empty, $ fields with a live
 * "≈ €", a note of up to 500 characters. `onSave(fields)` resolves when the server took it and the data
 * was rebuilt; it rejects to keep the form open with an error line.
 */
export default function InvoiceEditor({ row, usdPerEur, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => draftOf(row));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const formRef = useRef(null);
  const noteId = useId();

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    formRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);

  const change = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (!result.ok) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(result.fields);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  const noteLength = draft.note.length;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mt-4 rounded-[16px] border border-line/60 bg-line/10 p-4 sm:p-6">
      <h4 className="text-base font-extrabold text-ink">{t('costs.edit.title', { month: fmt.month(row.month) })}</h4>
      <p className="mt-1 text-sm font-medium text-ink-soft">{t('costs.edit.lead')}</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INVOICE_FIELDS.map((field) => (
          <AmountField key={field.key} field={field} value={draft[field.key]} error={errors[field.key]} usdPerEur={usdPerEur} onChange={change} />
        ))}
      </div>
      <div className="mt-4">
        <label htmlFor={noteId} className="block text-xs font-semibold text-ink-soft">
          {t('costs.edit.note')}
        </label>
        <textarea
          id={noteId}
          rows={2}
          value={draft.note}
          aria-invalid={errors.note ? true : undefined}
          onChange={(event) => change('note', event.target.value)}
          className={`mt-1 w-full rounded-[12px] border bg-surface px-3 py-2 text-sm font-medium text-ink ${RING} ${errors.note ? INPUT_BAD : INPUT_OK}`}
        />
        <p className={`mt-1 text-xs font-medium ${errors.note ? 'text-bad' : 'text-ink-mute'}`}>
          {errors.note ? t('costs.edit.noteTooLong', { max: fmt.int(NOTE_MAX) }) : t('costs.edit.noteCount', { n: fmt.int(noteLength), max: fmt.int(NOTE_MAX) })}
        </p>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm font-semibold text-bad">
          {t('common.error.saveFailed')}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className={PRIMARY} disabled={saving}>
          {saving ? t('costs.edit.saving') : t('costs.edit.save')}
        </button>
        <button type="button" className={SECONDARY} onClick={onCancel}>
          {t('costs.edit.cancel')}
        </button>
      </div>
    </form>
  );
}
