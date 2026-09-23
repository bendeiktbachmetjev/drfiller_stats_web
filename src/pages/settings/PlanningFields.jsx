import React, { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import { InfoHint } from '../../ui/index.js';
import { getLocale, t } from '../../copy/index.js';
import { INPUT, LABEL, NOTE, RING, SELECT } from './parts.jsx';

const RESET = `sf-hit shrink-0 w-10 h-10 flex items-center justify-center rounded-full border border-line text-ink-soft hover:bg-line/20 transition-colors disabled:text-data-mute disabled:hover:bg-transparent disabled:cursor-default ${RING}`;
const CHOICE = `sf-hit-y inline-flex items-center h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${RING}`;
const CHOICE_ON = 'border-brand bg-brand text-white';
const CHOICE_OFF = 'border-line bg-surface text-ink-soft hover:bg-line/20 disabled:hover:bg-surface';
const CHOICE_ON_DISABLED = 'border-line bg-line/60 text-ink-soft';

/** A plain number for messages ('200,000', '0.5'), never compacted. */
export const plainNumber = (value) => new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);

/**
 * The red line under a field.
 * @param {{ code: string, min?: number, max?: number, sum?: number } | undefined} error
 */
export function errorText(error) {
  if (!error) return null;
  if (error.code === 'range') return t('settings.error.range', { min: plainNumber(error.min), max: plainNumber(error.max) });
  if (error.code === 'packSum') return t('settings.error.packSum', { sum: `${plainNumber(error.sum)}%` });
  return t('settings.error.number');
}

/**
 * One number of the forecast form: label with (i), the input, a ↺ back to the server default, then the
 * error or the grey notes (measured value, live € effect, hint).
 *   field  planningForm FIELDS entry   value  draft text   notes  ready strings
 *   defaultText  the default as draft text (↺ is off when equal)   defaultLabel  the default as read aloud ('15%')
 *   invalid  red border without a line of its own (the pack mix states its error once, under the three packs)
 */
export function NumberField({ field, value, error, invalid = false, notes = [], defaultText, defaultLabel = defaultText, onChange, onReset, disabled }) {
  const id = useId();
  const noteId = `${id}-note`;
  const label = t(`settings.field.${field.id}`);
  const lines = error ? [errorText(error)] : notes.filter(Boolean);
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        <label htmlFor={id} className={`min-w-0 ${LABEL}`}>
          {label}
        </label>
        {field.hintKey && <InfoHint hintKey={field.hintKey} label={label} />}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value ?? ''}
          disabled={disabled}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={lines.length ? noteId : undefined}
          onChange={(event) => onChange(field.id, event.target.value)}
          className={`${INPUT} ${error || invalid ? 'border-bad' : 'border-line'}`}
        />
        <button
          type="button"
          className={RESET}
          disabled={disabled || value === defaultText}
          onClick={() => onReset(field.id)}
          aria-label={t('settings.resetField', { value: defaultLabel })}
          title={t('settings.resetField', { value: defaultLabel })}
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {lines.length > 0 && (
        <p id={noteId} className={`mt-1 text-xs font-medium ${error ? 'text-bad' : 'text-ink-soft'}`}>
          {lines.join(' · ')}
        </p>
      )}
    </div>
  );
}

/** A select field (how doctors pay) with its ↺. */
export function SelectField({ field, value, notes = [], defaultText, onChange, onReset, disabled }) {
  const id = useId();
  const label = t(`settings.field.${field.id}`);
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        <label htmlFor={id} className={`min-w-0 ${LABEL}`}>
          {label}
        </label>
        {field.hintKey && <InfoHint hintKey={field.hintKey} label={label} />}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(field.id, event.target.value)} className={`w-full ${SELECT}`}>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {t(`settings.method.${option}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={RESET}
          disabled={disabled || value === defaultText}
          onClick={() => onReset(field.id)}
          aria-label={t('settings.resetField', { value: t(`settings.method.${defaultText}`) })}
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {notes.filter(Boolean).length > 0 && <p className={`mt-1 ${NOTE}`}>{notes.filter(Boolean).join(' · ')}</p>}
    </div>
  );
}

/**
 * A row of choice chips with radio behaviour that wraps on narrow screens (the Segmented kit part does
 * not wrap). `value` null = none selected.
 *   options [{ value, label }]
 */
export function ChoiceChips({ label, hintKey, options, value, onChange, disabled, note }) {
  const labelId = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5">
        <span id={labelId} className={LABEL}>
          {label}
        </span>
        {hintKey && <InfoHint hintKey={hintKey} label={label} />}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`${CHOICE} ${option.value === value ? (disabled ? CHOICE_ON_DISABLED : CHOICE_ON) : CHOICE_OFF}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {note && <p className={`mt-1 ${NOTE}`}>{note}</p>}
    </div>
  );
}
