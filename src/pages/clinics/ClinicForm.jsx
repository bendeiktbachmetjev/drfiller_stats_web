import React, { useState } from 'react';
import { Card, CardHeader, Segmented } from '../../ui/index.js';
import { reasonOf } from './reason.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { STAFF_ROLES, hourDraftOf, hourEurFromDraft, nationalRates, sameHourEur } from '../../data/clinics/staff.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
export const INPUT = `h-10 w-full rounded-full border border-line bg-surface px-4 text-[14px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-mute ${RING}`;
export const PRIMARY = `inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full bg-brand text-white text-[14px] font-bold hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed ${RING}`;
export const SECONDARY = `inline-flex items-center justify-center h-10 px-4 rounded-full border border-line bg-surface text-[14px] font-semibold text-ink-soft hover:bg-line/20 disabled:opacity-50 ${RING}`;
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';
const HINT = 'mt-1.5 text-xs font-medium text-ink-mute';

const MAX_CAP = 100000;
const DEFAULT_CAP = 3000;
// An invoiced clinic pays our real cost plus this markup (backend services/billing/costs.js)
const DEFAULT_MARKUP = 30;
const MAX_MARKUP = 300;

// The first day a clinic may be shown work statistics from (the server refuses earlier ones)
const STATS_FROM_MIN = '2026-01-01';
/** 'YYYY-MM-DD' of a day that exists (no 31 February). */
const realDay = (s) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  return Boolean(d) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** '30' or '32,5' → 32.5; anything else → NaN. */
const parsePercent = (text) => {
  const s = text.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
};

/**
 * The body to save, or the copy key (and values) of the first problem. The work-statistics settings go only
 * when they changed, so the form still saves against a server that does not know them yet.
 */
function check({ name, billing, markup, cap, note, active, hours, statsShown, statsFrom }, clinic) {
  const isNew = !clinic;
  const cleanName = name.replace(/\s+/g, ' ').trim();
  if (!cleanName || cleanName.length > 120) return { problem: 'clinics.form.bad.name' };
  const m = parsePercent(markup);
  if (Number.isNaN(m) || m > MAX_MARKUP) return { problem: 'clinics.form.bad.markup' };
  const c = Number(cap);
  if (!Number.isInteger(c) || c < 1 || c > MAX_CAP) return { problem: 'clinics.form.bad.cap' };
  const rates = hourEurFromDraft(hours);
  if (rates.badRole) return { problem: 'clinics.form.work.bad.hour', values: { role: t(`clinics.role.${rates.badRole}`) } };
  const body = { name: cleanName, billing, markupPct: m, monthlyCapPerDoctor: c, note: note.trim() };
  if (!isNew) body.active = active;
  // The whole map is sent: the server replaces it, and a role left out goes back to the national average
  if (!sameHourEur(rates.hourEur, clinic?.hourEur ?? {})) body.hourEur = rates.hourEur;
  if (statsShown !== (clinic?.statsShown ?? false)) body.statsShown = statsShown;
  // The first day the clinic sees them (empty: the server takes the day they are first turned on)
  const from = statsFrom.trim();
  if (from && !(realDay(from) && from >= STATS_FROM_MIN)) return { problem: 'clinics.form.work.bad.from' };
  if (from && from !== (clinic?.statsFrom ?? '')) body.statsFrom = from;
  return { body };
}

/** Id of the work-statistics settings, so the Work and time view can bring them into sight. */
export const WORK_SETTINGS_ID = 'clinic-work-settings';

/**
 * A new clinic (`clinic` null) or the chosen one's settings. `onSave(body)` saves on the server; the form
 * shows the server's refusal and stays open.
 * @param {{ clinic: object|null, onSave: (body: object) => Promise<unknown>, onCancel: () => void,
 *   rates?: object }} props rates: the work answer's national €/h (when loaded), else the site's copy of them
 */
export default function ClinicForm({ clinic, onSave, onCancel, rates }) {
  const isNew = !clinic;
  const [form, setForm] = useState(() => ({
    name: clinic?.name ?? '',
    billing: clinic?.billing ?? 'invoice',
    markup: String(clinic?.markupPct ?? DEFAULT_MARKUP).replace('.', ','),
    cap: String(clinic?.monthlyCapPerDoctor ?? DEFAULT_CAP),
    note: clinic?.note ?? '',
    active: clinic?.active ?? true,
    hours: hourDraftOf(clinic?.hourEur),
    statsShown: clinic?.statsShown ?? false,
    statsFrom: clinic?.statsFrom ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setHour = (role) => (value) => setForm((f) => ({ ...f, hours: { ...f.hours, [role]: value } }));
  const national = nationalRates(rates);

  const submit = async (event) => {
    event.preventDefault();
    const { body, problem, values } = check(form, clinic);
    if (problem) {
      setMessage(t(problem, values));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onSave(body);
    } catch (err) {
      setMessage(t('clinics.form.error', { reason: reasonOf(err) }));
      setSaving(false);
    }
  };

  const billingOptions = [
    { value: 'invoice', label: t('clinics.form.billing.invoice') },
    { value: 'prepaid', label: t('clinics.form.billing.prepaid') },
  ];

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden">
      <CardHeader title={isNew ? t('clinics.form.newTitle') : t('clinics.form.editTitle', { name: clinic.name })} />
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-2" noValidate>
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.form.name')}</span>
          <input value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={120} placeholder={t('clinics.form.namePlaceholder')} className={INPUT} autoFocus={isNew} />
        </label>
        <div className="min-w-0">
          <span className={LABEL}>{t('clinics.form.billing')}</span>
          <Segmented options={billingOptions} value={form.billing} onChange={set('billing')} ariaLabel={t('clinics.form.billing')} />
          <p className={HINT}>{t(form.billing === 'prepaid' ? 'clinics.form.billingHint.prepaid' : 'clinics.form.billingHint.invoice')}</p>
        </div>
        {form.billing === 'invoice' && (
          <label className="block min-w-0">
            <span className={LABEL}>{t('clinics.form.markup')}</span>
            <input value={form.markup} onChange={(e) => set('markup')(e.target.value)} inputMode="decimal" className={INPUT} />
            <p className={HINT}>{t('clinics.form.markupHint')}</p>
          </label>
        )}
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.form.cap')}</span>
          <input value={form.cap} onChange={(e) => set('cap')(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={INPUT} />
          <p className={HINT}>{t('clinics.form.capHint')}</p>
        </label>
        <label className="block min-w-0 lg:col-span-2">
          <span className={LABEL}>{t('clinics.form.note')}</span>
          <input value={form.note} onChange={(e) => set('note')(e.target.value)} maxLength={500} placeholder={t('clinics.form.notePlaceholder')} className={INPUT} />
        </label>
        {!isNew && (
          <label className="flex items-start gap-3 lg:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active')(e.target.checked)} className={`mt-0.5 w-4 h-4 accent-brand ${RING}`} />
            <span>
              <span className="block text-sm font-semibold text-ink">{t('clinics.form.active')}</span>
              <span className={HINT}>{t('clinics.form.activeHint')}</span>
            </span>
          </label>
        )}
        <fieldset id={WORK_SETTINGS_ID} className="min-w-0 rounded-[16px] border border-line/60 p-4 sm:p-5 lg:col-span-2 scroll-mt-24">
          <legend className="px-1 text-sm font-bold text-ink">{t('clinics.form.work.title')}</legend>
          <p className="text-sm font-medium text-ink-soft">{t('clinics.form.work.lead')}</p>
          <p className={`${LABEL} mt-4`}>{t('clinics.form.work.hours')}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STAFF_ROLES.map((role) => (
              <label key={role} className="block min-w-0">
                <span className="mb-1.5 block text-sm font-semibold text-ink">{t(`clinics.role.${role}`)}</span>
                <input
                  value={form.hours[role]}
                  onChange={(e) => setHour(role)(e.target.value)}
                  inputMode="decimal"
                  placeholder={String(national[role].eur).replace('.', ',')}
                  aria-label={t('clinics.form.work.hour', { role: t(`clinics.role.${role}`) })}
                  className={INPUT}
                />
                <p className={HINT}>
                  {t('clinics.form.work.hourHint', { eur: fmt.eur(national[role].eur), lo: fmt.eur(national[role].lo), hi: fmt.eur(national[role].hi) })}
                </p>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium text-ink-mute">
            {t('clinics.form.work.source')}{' '}
            <a href={national.doctor.src} target="_blank" rel="noopener noreferrer" className={`font-bold text-brand underline-offset-2 hover:underline ${RING}`}>
              {t('clinics.form.work.sourceLink')}
            </a>
          </p>
          <label className="mt-4 flex items-start gap-3">
            <input type="checkbox" checked={form.statsShown} onChange={(e) => set('statsShown')(e.target.checked)} className={`mt-0.5 w-4 h-4 accent-brand ${RING}`} />
            <span>
              <span className="block text-sm font-semibold text-ink">{t('clinics.form.work.shown')}</span>
              <span className={HINT}>{t('clinics.form.work.shownHint')}</span>
            </span>
          </label>
          <label className="mt-4 block max-w-xs">
            <span className="mb-1.5 block text-sm font-semibold text-ink">{t('clinics.form.work.from')}</span>
            <input type="date" value={form.statsFrom} min={STATS_FROM_MIN} onChange={(e) => set('statsFrom')(e.target.value)} className={INPUT} />
            <p className={HINT}>{t('clinics.form.work.fromHint')}</p>
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <button type="submit" disabled={saving} className={PRIMARY}>
            {t(isNew ? 'clinics.form.create' : 'clinics.form.save')}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY}>
            {t('clinics.form.cancel')}
          </button>
          {message && (
            <p role="status" className="text-sm font-semibold text-bad">
              {message}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
