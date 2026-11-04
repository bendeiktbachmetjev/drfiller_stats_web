import React, { useState } from 'react';
import { Card, CardHeader } from '../../ui/index.js';
import { reasonOf } from './reason.js';
import { t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { INPUT, PRIMARY, SECONDARY } from './ClinicForm.jsx';

const PRESETS = [500, 1500, 5000];
const MAX_CREDITS = 100000;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const CHIP = `h-10 min-w-[72px] px-4 rounded-full border text-[14px] font-bold transition-colors ${RING}`;
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';

/**
 * A prepaid clinic's purchase: pick an amount, confirm, the server adds it to the clinic's credits.
 * @param {{ clinic: object, onAdd: (credits: number, note: string) => Promise<{ credits: { available: number } }> }} props
 */
export default function TopUpCard({ clinic, onAdd }) {
  const [amount, setAmount] = useState(PRESETS[1]);
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); // edit | confirm | saving
  const [message, setMessage] = useState(null);
  const n = other !== '' ? Number(other) : amount;
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_CREDITS;

  const submit = async () => {
    setStep('saving');
    setMessage(null);
    try {
      const data = await onAdd(n, note.trim());
      setMessage({ tone: 'good', text: t('clinics.topup.done', { n: fmt.int(n), left: fmt.int(data.credits.available) }) });
      setNote('');
      setOther('');
    } catch (err) {
      setMessage({ tone: 'bad', text: t('clinics.topup.error', { reason: reasonOf(err) }) });
    }
    setStep('edit');
  };

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden">
      <CardHeader title={t('clinics.topup.title')} />
      <p className="-mt-2 mb-5 text-sm font-medium text-ink-soft">{t('clinics.topup.lead')}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <span className={LABEL}>{t('clinics.topup.amount')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const on = other === '' && amount === p;
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => { setAmount(p); setOther(''); setStep('edit'); }} className={`${CHIP} ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-line/20'}`}>
                  {fmt.int(p)}
                </button>
              );
            })}
            <input value={other} onChange={(e) => { setOther(e.target.value.replace(/\D/g, '')); setStep('edit'); }} inputMode="numeric" placeholder={t('clinics.topup.other')} aria-label={t('clinics.topup.other')} className={`${INPUT} max-w-[160px]`} />
          </div>
          {!valid && other !== '' && <p className="mt-2 text-xs font-semibold text-bad">{t('clinics.topup.bad', { max: fmt.int(MAX_CREDITS) })}</p>}
        </div>
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.topup.note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('clinics.topup.notePlaceholder')} className={INPUT} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step === 'edit' && (
          <button type="button" disabled={!valid} onClick={() => setStep('confirm')} className={PRIMARY}>
            {t('clinics.topup.add', { n: valid ? fmt.int(n) : fmt.empty })}
          </button>
        )}
        {step !== 'edit' && (
          <>
            <p className="text-sm font-semibold text-ink">{t('clinics.topup.confirm', { n: fmt.int(n), name: clinic.name })}</p>
            <button type="button" disabled={step === 'saving'} onClick={submit} className={PRIMARY}>
              {t('clinics.topup.yes')}
            </button>
            <button type="button" disabled={step === 'saving'} onClick={() => setStep('edit')} className={SECONDARY}>
              {t('clinics.topup.cancel')}
            </button>
          </>
        )}
        {message && (
          <p role="status" className={`text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
