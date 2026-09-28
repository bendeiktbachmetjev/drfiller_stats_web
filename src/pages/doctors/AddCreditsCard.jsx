import React, { forwardRef, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Card, CardHeader, errorText } from '../../ui/index.js';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { doctorCreditsRoute } from '../../data/api/endpoints.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

/** Quick amounts; anything else goes in "Other amount". */
const PRESETS = [300, 800];
const MAX_CREDITS = 5000;
const MAX_MATCHES = 6;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const INPUT = `h-10 w-full rounded-full border border-line bg-surface px-4 text-[14px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-mute ${RING}`;
const CHIP = `h-10 min-w-[72px] px-4 rounded-full border text-[14px] font-bold transition-colors ${RING}`;
const PRIMARY = `inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-brand text-white text-[14px] font-bold hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed ${RING}`;
const SECONDARY = `inline-flex items-center h-10 px-4 rounded-full border border-line bg-surface text-[14px] font-semibold text-ink-soft hover:bg-line/20 ${RING}`;

const reasonOf = (err) => {
  if (err?.apiCode === 'NOT_FOUND') return 'This account has no login, so credits cannot be added.';
  if (err?.apiCode === 'RATE_LIMITED') return 'Too many additions this hour.';
  if (err?.apiCode === 'INVALID_BODY') return t('doctors.credits.bad', { max: fmt.int(MAX_CREDITS) });
  return errorText(err);
};

/** Doctors that can get credits: they have a login account. Sorted by name. */
function useCandidates(ds) {
  return useMemo(() => {
    const list = ds?.doctorList ?? [];
    return list
      .filter((d) => d.exists?.auth && !d.deletedAccount)
      .map((d) => ({ pid: d.pid, code: d.code, name: doctorLabel(d), balance: d.credits?.available ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ds]);
}

/**
 * "Add credits" (owner action): pick a doctor, pick 300 / 800 or type an amount, confirm → POST, then the
 * doctor's balance in the dataset is updated in place. `pid` / `onPick` let a table row pre-select a doctor.
 * @param {{ pid: string|null, onPick: (pid: string|null) => void }} props
 */
const AddCreditsCard = forwardRef(function AddCreditsCard({ pid, onPick }, ref) {
  const { client, isDemo } = useAdmin();
  const { dataset: ds, rebuild } = useAnalytics();
  const candidates = useCandidates(ds);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState(PRESETS[0]);
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); // edit | confirm | saving
  const [message, setMessage] = useState(null); // { tone, text }
  const [focusSearch, setFocusSearch] = useState(false);

  const chosen = candidates.find((c) => c.pid === pid) ?? null;
  const q = query.trim().toLowerCase();
  const matches = q ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, MAX_MATCHES) : [];
  const n = other !== '' ? Number(other) : amount;
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_CREDITS;

  const pick = (next) => {
    onPick(next);
    setQuery('');
    setStep('edit');
    setMessage(null);
  };

  const applyBalance = (targetPid, credits) =>
    rebuild((raw) => ({
      ...raw,
      doctors: {
        ...raw.doctors,
        doctors: raw.doctors.doctors.map((d) => (d.pid === targetPid ? { ...d, credits: { ...d.credits, ...credits, consistent: true } } : d)),
      },
    }));

  const submit = async () => {
    if (!chosen || !valid) return;
    setStep('saving');
    setMessage(null);
    try {
      let credits;
      if (isDemo) {
        const before = chosen.balance ?? 0;
        credits = { available: before + n };
      } else {
        const data = await client.post(doctorCreditsRoute(chosen.pid), { credits: n, note: note.trim() });
        credits = data.credits;
      }
      applyBalance(chosen.pid, credits);
      const done = t('doctors.credits.done', { n: fmt.int(n), name: chosen.name, balance: fmt.int(credits.available) });
      setMessage({ tone: 'good', text: isDemo ? `${done} ${t('doctors.credits.demo')}` : done });
      setNote('');
      setOther('');
      setStep('edit');
    } catch (err) {
      setMessage({ tone: 'bad', text: t('doctors.credits.error', { reason: reasonOf(err) }) });
      setStep('edit');
    }
  };

  return (
    <Card ref={ref} padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden" id="add-credits">
      <CardHeader title={t('doctors.credits.title')} />
      <p className="-mt-2 mb-5 text-sm font-medium text-ink-soft">{t('doctors.credits.lead')}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Doctor */}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('doctors.credits.doctor')}</p>
          {chosen ? (
            <div className="flex items-center gap-3 rounded-[16px] border border-line/60 bg-line/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{chosen.name}</p>
                <p className="text-xs font-semibold text-ink-mute">
                  {chosen.code} · {t('doctors.credits.balance', { n: chosen.balance == null ? fmt.empty : fmt.int(chosen.balance) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  pick(null);
                  setFocusSearch(true);
                }}
                className={`inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline ${RING}`}>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                {t('doctors.credits.change')}
              </button>
            </div>
          ) : (
            <div className="relative">
              <label className="relative block">
                <span className="sr-only">{t('doctors.credits.search')}</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
                <input type="search" autoFocus={focusSearch} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('doctors.credits.search')} className={`${INPUT} pl-10`} />
              </label>
              {q && (
                <ul className="mt-2 overflow-hidden rounded-[16px] border border-line/60 bg-surface">
                  {matches.length === 0 && <li className="px-4 py-3 text-sm font-medium text-ink-mute">{t('doctors.credits.none', { q: query.trim() })}</li>}
                  {matches.map((c) => (
                    <li key={c.pid} className="border-t border-line/40 first:border-t-0">
                      <button type="button" onClick={() => pick(c.pid)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-line/20 ${RING}`}>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
                        <span className="text-xs font-semibold text-ink-mute">{c.code}</span>
                        <span className="text-xs font-semibold tabular-nums text-ink-soft">{c.balance == null ? fmt.empty : fmt.int(c.balance)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 2. Amount + note */}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('doctors.credits.amount')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((value) => {
              const on = other === '' && amount === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setAmount(value);
                    setOther('');
                    setStep('edit');
                  }}
                  className={`${CHIP} ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-line/20'}`}
                >
                  {fmt.int(value)}
                </button>
              );
            })}
            <label className="min-w-[140px] flex-1 basis-[140px]">
              <span className="sr-only">{t('doctors.credits.other')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CREDITS}
                step={1}
                value={other}
                onChange={(e) => {
                  setOther(e.target.value);
                  setStep('edit');
                }}
                placeholder={t('doctors.credits.other')}
                className={`${INPUT} ${other !== '' ? 'border-brand' : ''}`}
              />
            </label>
          </div>
          {other !== '' && !valid && <p className="mt-2 text-sm font-semibold text-bad">{t('doctors.credits.bad', { max: fmt.int(MAX_CREDITS) })}</p>}
          <label className="mt-3 block">
            <span className="sr-only">{t('doctors.credits.note')}</span>
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${t('doctors.credits.note')}: ${t('doctors.credits.notePlaceholder')}`} className={INPUT} />
          </label>
        </div>
      </div>

      {/* 3. Confirm */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {step === 'edit' && (
          <button type="button" disabled={!chosen || !valid} onClick={() => setStep('confirm')} className={PRIMARY}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('doctors.credits.add', { n: valid ? fmt.int(n) : '' }).replace('  ', ' ')}
          </button>
        )}
        {step !== 'edit' && chosen && (
          <>
            <p className="text-[15px] font-bold text-ink">{t('doctors.credits.confirm', { n: fmt.int(n), name: chosen.name })}</p>
            <button type="button" disabled={step === 'saving'} onClick={submit} className={PRIMARY}>
              {t('doctors.credits.yes')}
            </button>
            <button type="button" disabled={step === 'saving'} onClick={() => setStep('edit')} className={SECONDARY}>
              {t('doctors.credits.cancel')}
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className={`mt-4 text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
          {message.text}
        </p>
      )}
    </Card>
  );
});

export default AddCreditsCard;
