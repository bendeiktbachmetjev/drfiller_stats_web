import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../context/useSettings.js';
import { Disclosure, InfoHint, Segmented } from '../../ui/index.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { PACK_IDS } from '../../data/constants.js';
import {
  FIELDS, PRESET_IDS, applyPreset, defaultDraft, draftOf, effectsOf, fieldById, isDirty, packSumOf, presetOf, sameDraft, validateDraft,
} from './planningForm.js';
import { ChoiceChips, NumberField, SelectField, errorText, plainNumber } from './PlanningFields.jsx';
import { LABEL, NOTE, PRIMARY, SECONDARY, SaveStatus, SettingsCard } from './parts.jsx';
import { measuredText } from './text.js';

const DEFAULTS = defaultDraft();

/** The default as the owner reads it: '15%', '$1.96', '400'. */
const defaultLabel = (field) => {
  const text = DEFAULTS[field.id];
  if (field.kind === 'percent') return `${text}%`;
  if (field.unit === 'usd') return `$${text}`;
  return text;
};

/** The grey lines under a field: measured value, live € effect, extra hint. */
function notesOf(field, headline, effects) {
  const notes = [measuredText(field, headline)];
  if (field.id === 'dictationMinutesPerVisit' && headline?.measuredOpenaiShare != null) {
    notes.push(t('settings.measured.openai', { share: fmt.pct(headline.measuredOpenaiShare) }));
  }
  if (field.effect === 'conversation' && effects.conversation !== null) notes.push(t('settings.effect.conversation', { cents: fmt.eurUnit(effects.conversation) }));
  if (field.effect === 'form' && effects.form !== null) notes.push(t('settings.effect.form', { cents: fmt.eurUnit(effects.form) }));
  if (field.effect === 'usd' && effects[field.id] !== null) notes.push(t('settings.effect.usd', { eur: fmt.eur(effects[field.id]) }));
  if (field.id === 'railway') notes.push(t('settings.hint.railway'));
  return notes;
}

const packMixText = (headline, rows) => {
  if (headline?.measuredPackMix == null) return t('settings.measured.none');
  const shareOf = (pack) => fmt.pct(rows.find((row) => row.pack === pack)?.share ?? 0);
  return t('settings.measured.packMix', { p250: shareOf('pack250'), p600: shareOf('pack600'), p1500: shareOf('pack1500'), n: fmt.int(headline.measuredPackMix) });
};

const methodText = (headline) =>
  headline?.measuredPaymentMethod
    ? t('settings.measured.method', { method: t(`settings.rawMethod.${headline.measuredPaymentMethod}`), n: fmt.int(headline.measuredPayments) })
    : t('settings.measured.none');

/**
 * 3. "Forecast assumptions" (§3.8, §4.9): group "Main" always open, "Fine-tuning" collapsed. Every field
 * shows what the last 30 days measured and a ↺; token and dollar fields show their € effect live.
 * Save → PUT → every page recounts; "Reset to defaults" fills the form, Save applies it. A failed save
 * keeps the form values and shows the reason.
 */
export default function PlanningSection({ data, readOnly }) {
  const { settings, save, status, error } = useSettings();
  const planning = settings?.planning ?? null;
  const [draft, setDraft] = useState(() => draftOf(planning ?? {}));
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const savedDraft = useRef(draftOf(planning ?? {}));

  // Saved settings changed (a save here, or a refresh): follow them unless the owner is editing.
  useEffect(() => {
    if (!planning) return;
    const next = draftOf(planning);
    setDraft((current) => (sameDraft(current, savedDraft.current) ? next : current));
    savedDraft.current = next;
  }, [planning]);

  const headline = data?.headline ?? {};
  const rates = data?.tables?.rates?.[0] ?? null;
  const effects = useMemo(() => effectsOf(draft, rates), [draft, rates]);
  const dirty = planning ? isDirty(draft, planning) : false;
  const disabled = readOnly || !settings;
  const saving = status === 'saving';

  const change = (id, value) => {
    setDraft((current) => ({ ...current, [id]: value }));
    setNotice(null);
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      if (PACK_IDS.includes(id)) PACK_IDS.forEach((pack) => next[pack]?.code === 'packSum' && delete next[pack]);
      return next;
    });
  };
  const resetField = (id) => change(id, DEFAULTS[id]);

  const submit = async (event) => {
    event.preventDefault();
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (!result.ok || disabled) return;
    try {
      await save({ ...settings, planning: result.planning });
      const saved = draftOf(result.planning);
      savedDraft.current = saved;
      setDraft(saved);
      setNotice(null);
    } catch {
      // SaveStatus shows the reason; the form keeps the owner's values.
    }
  };

  const resetAll = () => {
    setDraft(DEFAULTS);
    setErrors({});
    setNotice('reset');
  };

  const numberField = (id) => {
    const field = fieldById(id);
    return (
      <NumberField
        key={id}
        field={field}
        value={draft[id]}
        error={errors[id]}
        notes={notesOf(field, headline, effects)}
        defaultText={DEFAULTS[id]}
        defaultLabel={defaultLabel(field)}
        onChange={change}
        onReset={resetField}
        disabled={disabled}
      />
    );
  };

  // Field names for the summary; the three packs are one question ("Which packs doctors buy").
  const errorFields = [
    ...new Set(FIELDS.filter((field) => errors[field.id]).map((field) => t(PACK_IDS.includes(field.id) ? 'settings.field.packMix' : `settings.field.${field.id}`))),
  ];
  const packSum = packSumOf(draft);
  const packError = PACK_IDS.map((pack) => errors[pack]).find(Boolean);
  const preset = presetOf(draft);
  const fine = FIELDS.filter((field) => field.group === 'fine');

  return (
    <SettingsCard id="planning" title={t('settings.planning.title')} hint={t('settings.planning.intro')} hintKey="settings.planning">
      <form onSubmit={submit} noValidate>
        <h4 className="text-sm font-extrabold text-ink">{t('settings.group.main')}</h4>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {numberField('visitsPerDoctorMonth')}
          {numberField('scale0')}
          {numberField('scale1')}
        </div>
        <div className="mt-5">
          <ChoiceChips
            label={t('settings.field.howDoctorsWork')}
            hintKey="settings.howDoctorsWork"
            options={PRESET_IDS.map((id) => ({ value: id, label: t(`common.scenario.${id}`) }))}
            value={preset}
            onChange={(id) => {
              setDraft((current) => applyPreset(current, id));
              setNotice(null);
            }}
            disabled={disabled}
            note={preset ? null : t('settings.field.howDoctorsWork.custom')}
          />
        </div>
        <fieldset className="mt-5 min-w-0">
          <legend className={`flex items-center gap-1.5 ${LABEL}`}>
            {t('settings.field.packMix')}
            <InfoHint hintKey="settings.packMix" label={t('settings.field.packMix')} />
          </legend>
          <div className="mt-1 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            {PACK_IDS.map((pack) => (
              <NumberField
                key={pack}
                field={fieldById(pack)}
                value={draft[pack]}
                error={errors[pack]?.code === 'packSum' ? undefined : errors[pack]}
                invalid={errors[pack]?.code === 'packSum'}
                defaultText={DEFAULTS[pack]}
                defaultLabel={`${DEFAULTS[pack]}%`}
                onChange={change}
                onReset={resetField}
                disabled={disabled}
              />
            ))}
          </div>
          <p className={`mt-1 text-xs font-medium ${packError?.code === 'packSum' ? 'text-bad' : 'text-ink-soft'}`}>
            {packError?.code === 'packSum'
              ? errorText(packError)
              : [packSum !== null ? t('settings.packs.sum', { sum: `${plainNumber(packSum)}%` }) : null, packMixText(headline, data?.tables?.packMix ?? [])]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </fieldset>
        <p className={`mt-5 ${NOTE}`}>
          <span className="font-semibold text-ink">
            {t('settings.field.vat')}: {t(settings?.vatPayer ? 'settings.vat.on' : 'settings.vat.off')}
          </span>{' '}
          ·{' '}
          <Link to="/settings#calc" className="font-bold text-brand hover:text-brand-strong">
            {t('settings.field.vatLink')}
          </Link>
        </p>

        <Disclosure id="settings.fine" label={t('settings.group.fine')} className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fine.map((field) => {
              if (field.id === 'formCostBasis') {
                return (
                  <div key={field.id} className="min-w-0">
                    <p className={`flex items-start gap-1.5 ${LABEL}`}>
                      {t('settings.field.formCostBasis')}
                      <InfoHint hintKey="settings.formCostBasis" label={t('settings.field.formCostBasis')} />
                    </p>
                    <Segmented
                      className="mt-1.5"
                      ariaLabel={t('settings.field.formCostBasis')}
                      options={field.options.map((option) => ({ value: option, label: t(`settings.formCost.${option}`) }))}
                      value={draft.formCostBasis}
                      onChange={(value) => change('formCostBasis', value)}
                      disabled={disabled}
                    />
                  </div>
                );
              }
              if (field.id === 'paymentMethod') {
                return (
                  <SelectField
                    key={field.id}
                    field={field}
                    value={draft.paymentMethod}
                    notes={[methodText(headline)]}
                    defaultText={DEFAULTS.paymentMethod}
                    onChange={change}
                    onReset={resetField}
                    disabled={disabled}
                  />
                );
              }
              return numberField(field.id);
            })}
          </div>
        </Disclosure>

        {errorFields.length > 0 && (
          <p role="alert" className="mt-5 text-sm font-semibold text-bad">
            {t('settings.error.summary', { fields: errorFields.join('; ') })}
          </p>
        )}
        {readOnly && <p className="mt-5 text-sm font-semibold text-bad">{t('settings.readOnly')}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="submit" className={PRIMARY} disabled={disabled || saving || !dirty}>
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
          <button type="button" className={SECONDARY} onClick={resetAll} disabled={disabled || saving}>
            {t('settings.resetAll')}
          </button>
          {dirty && !saving && <span className={NOTE}>{notice === 'reset' ? t('settings.resetAll.done') : t('settings.unsaved')}</span>}
        </div>
        <SaveStatus status={dirty && status === 'saved' ? 'idle' : status} error={error} className="mt-3" />
      </form>
    </SettingsCard>
  );
}
