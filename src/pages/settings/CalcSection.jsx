import React, { useId } from 'react';
import { useSettings } from '../../context/useSettings.js';
import { InfoHint, Segmented } from '../../ui/index.js';
import { LANGS, t } from '../../copy/index.js';
import { LABEL, NOTE, SELECT, SaveStatus, SettingsCard } from './parts.jsx';

/**
 * 1. "How we count" (§3.5, §4.9, O4): the VAT switch and the language. Each change saves at once
 * (PUT the whole settings object, then every page recounts).
 */
export default function CalcSection({ readOnly }) {
  const { settings, save, status, error } = useSettings();
  const langId = useId();
  const busy = readOnly || !settings || status === 'saving';
  const saveWith = (change) => {
    if (busy) return;
    save({ ...settings, ...change }).catch(() => {});
  };

  return (
    <SettingsCard id="calc" title={t('settings.calc.title')} hintKey="settings.vat">
      <div className="flex flex-col gap-5">
        <div>
          <p className={`flex items-center gap-2 ${LABEL}`}>
            {t('settings.vat.label')}
            <InfoHint hintKey="settings.vat" label={t('settings.vat.label')} />
          </p>
          <Segmented
            className="mt-1.5"
            size="md"
            ariaLabel={t('settings.vat.label')}
            options={[
              { value: 'off', label: t('settings.vat.off') },
              { value: 'on', label: t('settings.vat.on') },
            ]}
            value={settings?.vatPayer ? 'on' : 'off'}
            onChange={(value) => {
              if (value !== (settings?.vatPayer ? 'on' : 'off')) saveWith({ vatPayer: value === 'on' });
            }}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={langId} className={`flex items-center gap-2 ${LABEL}`}>
            {t('settings.lang.label')}
          </label>
          <select
            id={langId}
            className={`mt-1.5 ${SELECT}`}
            value={settings?.lang ?? 'en'}
            disabled={busy || Object.keys(LANGS).length < 2}
            onChange={(event) => saveWith({ lang: event.target.value })}
          >
            {Object.keys(LANGS).map((lang) => (
              <option key={lang} value={lang}>
                {t(`settings.lang.${lang}`)}
              </option>
            ))}
          </select>
          {Object.keys(LANGS).length < 2 && <p className={`mt-1 ${NOTE}`}>{t('settings.lang.only')}</p>}
        </div>
        <SaveStatus status={status} error={error} />
      </div>
    </SettingsCard>
  );
}
