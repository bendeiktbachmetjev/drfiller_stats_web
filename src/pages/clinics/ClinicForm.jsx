import React, { useState } from 'react';
import { Card, CardHeader, Segmented } from '../../ui/index.js';
import { reasonOf } from './reason.js';
import { t } from '../../copy/index.js';

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

/** '30' or '32,5' → 32.5; anything else → NaN. */
const parsePercent = (text) => {
  const s = text.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
};

/** The body to save, or the copy key of the first problem. */
function check({ name, billing, markup, cap, note, active }, isNew) {
  const cleanName = name.replace(/\s+/g, ' ').trim();
  if (!cleanName || cleanName.length > 120) return { problem: 'clinics.form.bad.name' };
  const m = parsePercent(markup);
  if (Number.isNaN(m) || m > MAX_MARKUP) return { problem: 'clinics.form.bad.markup' };
  const c = Number(cap);
  if (!Number.isInteger(c) || c < 1 || c > MAX_CAP) return { problem: 'clinics.form.bad.cap' };
  const body = { name: cleanName, billing, markupPct: m, monthlyCapPerDoctor: c, note: note.trim() };
  if (!isNew) body.active = active;
  return { body };
}

/**
 * A new clinic (`clinic` null) or the chosen one's settings. `onSave(body)` saves on the server; the form
 * shows the server's refusal and stays open.
 * @param {{ clinic: object|null, onSave: (body: object) => Promise<unknown>, onCancel: () => void }} props
 */
export default function ClinicForm({ clinic, onSave, onCancel }) {
  const isNew = !clinic;
  const [form, setForm] = useState(() => ({
    name: clinic?.name ?? '',
    billing: clinic?.billing ?? 'invoice',
    markup: String(clinic?.markupPct ?? DEFAULT_MARKUP).replace('.', ','),
    cap: String(clinic?.monthlyCapPerDoctor ?? DEFAULT_CAP),
    note: clinic?.note ?? '',
    active: clinic?.active ?? true,
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const { body, problem } = check(form, isNew);
    if (problem) {
      setMessage(t(problem));
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
