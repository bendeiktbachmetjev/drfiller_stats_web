import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { INPUT, PRIMARY, SECONDARY } from './ClinicForm.jsx';
import { priceText, reasonOf } from './reason.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const CHIP = `h-10 min-w-[72px] px-4 rounded-full border text-[14px] font-bold transition-colors ${RING}`;
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';
export const MAX_CREDITS = 100000;

/** '28', '28,5', '0' → euros (2 decimals at most); '' or anything else → null. */
export const parseEur = (text) => {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 1000000 ? n : null;
};

/**
 * Credits added by hand with what was paid for them: pick an amount (presets or any), type the euros
 * (0 = free), an optional note, confirm. `onSubmit(credits, priceEur, note)` saves and resolves to the
 * success text; a refusal shows its reason and keeps the form.
 * @param {{ presets: number[], target: string, disabled?: boolean,
 *   onSubmit: (credits: number, priceEur: number, note: string) => Promise<string> }} props
 *   target: who gets them, for the question ("Add 700 credits to Kauno klinika for €28?")
 */
export default function CreditsForm({ presets, target, disabled = false, onSubmit }) {
  const [amount, setAmount] = useState(presets[0]);
  const [other, setOther] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); // edit | confirm | saving
  const [message, setMessage] = useState(null); // { tone, text }
  const n = other !== '' ? Number(other) : amount;
  const validN = Number.isInteger(n) && n >= 1 && n <= MAX_CREDITS;
  const priceEur = parseEur(price);
  const validPrice = priceEur !== null;
  const edit = () => {
    setStep('edit');
    setMessage(null);
  };

  const submit = async () => {
    setStep('saving');
    setMessage(null);
    try {
      const text = await onSubmit(n, priceEur, note.trim());
      setMessage({ tone: 'good', text });
      setOther('');
      setPrice('');
      setNote('');
    } catch (err) {
      setMessage({ tone: 'bad', text: t('clinics.money.error', { reason: reasonOf(err) }) });
    }
    setStep('edit');
  };

  const perCredit = validN && validPrice && priceEur > 0 ? priceText(priceEur / n) : null;

  return (
    <div className="min-w-0">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <span className={LABEL}>{t('clinics.money.credits')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => {
              const on = other === '' && amount === p;
              return (
                <button key={p} type="button" aria-pressed={on} disabled={disabled} onClick={() => { setAmount(p); setOther(''); edit(); }} className={`${CHIP} ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-line/20'}`}>
                  {fmt.int(p)}
                </button>
              );
            })}
            <input value={other} disabled={disabled} onChange={(e) => { setOther(e.target.value.replace(/\D/g, '')); edit(); }} inputMode="numeric" placeholder={t('clinics.money.other')} aria-label={t('clinics.money.other')} className={`${INPUT} max-w-[160px] ${other !== '' ? 'border-brand' : ''}`} />
          </div>
          {other !== '' && !validN && <p className="mt-2 text-xs font-semibold text-bad">{t('clinics.money.badCredits', { max: fmt.int(MAX_CREDITS) })}</p>}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className={LABEL}>{t('clinics.money.price')}</span>
            <input value={price} disabled={disabled} onChange={(e) => { setPrice(e.target.value); edit(); }} inputMode="decimal" placeholder={t('clinics.money.pricePlaceholder')} className={INPUT} />
            <span className="mt-1.5 block text-xs font-medium text-ink-mute">
              {perCredit ? t('clinics.money.perCredit', { price: perCredit }) : t('clinics.money.priceHint')}
            </span>
          </label>
          <label className="block min-w-0">
            <span className={LABEL}>{t('clinics.money.note')}</span>
            <input value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('clinics.money.notePlaceholder')} className={INPUT} />
          </label>
        </div>
      </div>
      {price !== '' && !validPrice && <p className="mt-2 text-xs font-semibold text-bad">{t('clinics.money.badPrice')}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step === 'edit' && (
          <button type="button" disabled={disabled || !validN || !validPrice} onClick={() => setStep('confirm')} className={PRIMARY}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('clinics.money.add', { n: validN ? fmt.int(n) : fmt.empty })}
          </button>
        )}
        {step !== 'edit' && (
          <>
            <p className="text-sm font-semibold text-ink">
              {t(priceEur > 0 ? 'clinics.money.confirm' : 'clinics.money.confirmFree', { n: fmt.int(n), name: target, price: priceText(priceEur) })}
            </p>
            <button type="button" disabled={step === 'saving'} onClick={submit} className={PRIMARY}>
              {t('clinics.money.yes')}
            </button>
            <button type="button" disabled={step === 'saving'} onClick={edit} className={SECONDARY}>
              {t('clinics.money.cancel')}
            </button>
          </>
        )}
        {message && (
          <p role="status" className={`text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
