import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useSettings } from '../../context/useSettings.js';
import { useScope } from '../../context/AnalyticsContext.jsx';
import { DoctorName } from '../../ui/index.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { ChoiceChips } from './PlanningFields.jsx';
import { LABEL, NOTE, RING, SECONDARY, SaveStatus, SettingsCard } from './parts.jsx';

/** Rows shown before "Show all": the busiest accounts plus every marked one. */
const FIRST_ROWS = 5;

const CHECKBOX = `w-5 h-5 shrink-0 rounded-[6px] accent-brand ${RING} disabled:cursor-not-allowed`;
const CHIP = 'inline-flex items-center h-5 px-2 rounded-full bg-warn-tint text-[11px] font-bold text-warn whitespace-nowrap';

/** One account: tick box, name + code, forms and costs of all time. The whole row is the label. */
function AccountRow({ row, doctor, disabled, onToggle }) {
  const name = doctorLabel(doctor);
  const locked = row.locked;
  return (
    <li>
      <label className={`flex items-start gap-3 py-3 ${locked || disabled ? 'cursor-default' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className={`mt-0.5 ${CHECKBOX}`}
          checked={row.internal}
          disabled={locked || disabled}
          onChange={() => onToggle(row.pid)}
          aria-label={t('settings.internal.markAria', { name })}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
            <DoctorName doctor={doctor ?? { code: row.code }} />
            {row.suggested && <span className={CHIP}>{t('settings.internal.probably')}</span>}
            {locked && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                <Lock className="w-3 h-3" aria-hidden="true" />
                {t('common.doctor.lockedByServer')}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-ink-soft sm:hidden">
            {t('settings.internal.phoneLine', { forms: fmt.int(row.forms), cost: fmt.eur(row.costEur) })}
          </span>
        </span>
        <span className="hidden sm:block w-28 text-right text-sm font-semibold text-ink tabular-nums">{fmt.int(row.forms)}</span>
        <span className="hidden sm:block w-28 text-right text-sm font-semibold text-ink tabular-nums">{fmt.eur(row.costEur)}</span>
      </label>
    </li>
  );
}

/**
 * The "All accounts | Without my and test accounts" switch (§3.4) as chips that wrap on a 320 px phone
 * (the kit's Segmented does not wrap). Same state as the filter row's switch (useScope).
 */
function ScopeChips() {
  const { scope, setExcludeInternal, internalCount } = useScope();
  const none = internalCount === 0;
  return (
    <ChoiceChips
      label={t('settings.internal.switch')}
      options={[
        { value: 'all', label: t('common.scope.all') },
        { value: 'noInternal', label: none ? t('common.scope.noInternalShort') : t('common.scope.noInternal', { n: internalCount }) },
      ]}
      value={scope.excludeInternal && !none ? 'noInternal' : 'all'}
      onChange={(value) => setExcludeInternal(value === 'noInternal')}
      disabled={none}
      note={none ? t('settings.internal.switchOff') : null}
    />
  );
}

/**
 * 2. "My and test accounts" (§3.4, §4.9, O3): tick an account to mark it as your own or a test account.
 * Each tick saves at once (settings.internalPids); marks set on the server are locked. Below: the scope
 * switch the marks feed, and the read-only email mode (O2).
 */
export default function AccountsSection({ data, dataset, readOnly }) {
  const { settings, save, status, error } = useSettings();
  const [showAll, setShowAll] = useState(false);
  const rows = data?.tables?.internalCandidates ?? [];
  const visible = showAll ? rows : rows.filter((row, index) => index < FIRST_ROWS || row.internal);
  const disabled = readOnly || !settings || status === 'saving';

  const toggle = (pid) => {
    if (disabled) return;
    const marked = new Set(settings.internalPids ?? []);
    if (marked.has(pid)) marked.delete(pid);
    else marked.add(pid);
    save({ ...settings, internalPids: [...marked] }).catch(() => {});
  };

  const emailMode = data?.headline?.emailMode ?? 'off';

  return (
    <SettingsCard id="doctors" title={t('settings.internal.title')} hintKey="settings.internal">
      <div className="hidden sm:flex items-end gap-3 pb-2 border-b border-line/60">
        <span className={`flex-1 pl-8 ${LABEL}`}>{t('settings.col.doctor')}</span>
        <span className={`w-28 text-right ${LABEL}`}>{t('settings.col.forms')}</span>
        <span className={`w-28 text-right ${LABEL}`}>{t('settings.col.cost')}</span>
      </div>
      <ul role="list" className="divide-y divide-line/40">
        {visible.map((row) => (
          <AccountRow key={row.pid} row={row} doctor={dataset?.doctors?.get?.(row.pid)} disabled={disabled} onToggle={toggle} />
        ))}
      </ul>
      {rows.length > visible.length || showAll ? (
        <button type="button" className={`mt-2 ${SECONDARY}`} onClick={() => setShowAll((value) => !value)}>
          {showAll ? t('common.list.showFewer') : t('common.list.showAll', { n: fmt.int(rows.length) })}
        </button>
      ) : null}
      <SaveStatus status={status} error={error} className="mt-3" />
      <div className="mt-5">
        <ScopeChips />
      </div>
      <p className={`mt-5 ${NOTE}`}>
        <span className="font-semibold text-ink">{t(`settings.email.${emailMode}`)}</span> {t('settings.email.how')}
      </p>
    </SettingsCard>
  );
}
