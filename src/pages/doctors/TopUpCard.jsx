import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Card, CardHeader, Segmented } from '../../ui/index.js';
import { useAdmin } from '../../context/AdminContext.jsx';
import { useAnalytics } from '../../context/AnalyticsContext.jsx';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { doctorMoney } from '../../data/clinics/money.js';
import CreditsForm, { parseEur } from '../clinics/CreditsForm.jsx';
import { INPUT, PRIMARY } from '../clinics/ClinicForm.jsx';
import { priceText, reasonOf } from '../clinics/reason.js';
import { useClinicActions } from '../clinics/useClinics.js';

const MAX_MATCHES = 6;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-wide text-ink-mute';
const SELECT = `h-10 w-full max-w-[420px] rounded-full border border-line bg-surface px-4 text-[14px] font-semibold text-ink ${RING}`;

/** The last 12 Vilnius months, this one first ('YYYY-MM'). */
function recentMonths(nowMs) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit' }).format(new Date(nowMs)).split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const total = y * 12 + (m - 1) - i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

/** Doctors that can get credits: they have a login account. Sorted by name. */
function useCandidates(ds) {
  return useMemo(
    () =>
      (ds?.doctorList ?? [])
        .filter((d) => d.exists?.auth && !d.deletedAccount)
        .map((d) => ({ pid: d.pid, code: d.code, name: doctorLabel(d), clinicId: d.clinicId ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ds],
  );
}

/** What one doctor bought and used, all time, in one line. */
function DoctorFigures({ ds, pid }) {
  const m = doctorMoney(ds, pid);
  const parts = [
    t('doctors.topup.bought', { n: fmt.int(m.boughtCredits), eur: fmt.eur(m.paidEur) }),
    m.avgEur === null ? null : t('doctors.topup.avg', { price: priceText(m.avgEur) }),
    m.freeCredits ? t('doctors.topup.free', { n: fmt.int(m.freeCredits) }) : null,
    m.usedCredits === null ? null : t('doctors.topup.used', { n: fmt.int(m.usedCredits) }),
    m.availableCredits === null ? null : t('doctors.topup.left', { n: fmt.int(m.availableCredits) }),
  ].filter(Boolean);
  return <p className="mt-2 text-xs font-semibold text-ink-mute">{parts.join(' · ')}</p>;
}

/** What an invoiced clinic paid for a month: pick the month, type the euros. */
function MonthForm({ clinic, nowMs, onSave }) {
  const months = useMemo(() => recentMonths(nowMs), [nowMs]);
  const [month, setMonth] = useState(months[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const eur = parseEur(amount);
  const record = clinic.payments.find((p) => p.month === month) ?? null;
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(month, eur, note.trim());
      setMessage({ tone: 'good', text: t('doctors.topup.monthDone', { month: fmt.month(`${month}-01`), eur: fmt.eur(eur) }) });
      setAmount('');
      setNote('');
    } catch (err) {
      setMessage({ tone: 'bad', text: t('clinics.money.error', { reason: reasonOf(err) }) });
    }
    setBusy(false);
  };
  return (
    <div className="min-w-0">
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block min-w-0">
          <span className={LABEL}>{t('doctors.topup.month')}</span>
          <select value={month} onChange={(e) => { setMonth(e.target.value); setMessage(null); }} className={SELECT}>
            {months.map((m) => (
              <option key={m} value={m}>
                {fmt.month(`${m}-01`)}
              </option>
            ))}
          </select>
          {record && <span className="mt-1.5 block text-xs font-medium text-ink-mute">{t('doctors.topup.monthHas', { eur: fmt.eur(record.amountEur) })}</span>}
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.months.amount')}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={t('clinics.money.pricePlaceholder')} className={INPUT} />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>{t('clinics.money.note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t('clinics.months.notePlaceholder')} className={INPUT} />
        </label>
      </div>
      {amount !== '' && eur === null && <p className="mt-2 text-xs font-semibold text-bad">{t('clinics.money.badPrice')}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || eur === null} onClick={save} className={PRIMARY}>
          {t('doctors.topup.monthSave', { month: fmt.month(`${month}-01`) })}
        </button>
        {message && (
          <p role="status" className={`text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "Top up" (owner actions), with a switch:
 *   Doctor  a doctor who pays us directly: any number of credits with what was paid (0 = free); not for a
 *           doctor whose clinic pays (then the clinic is the one to top up). Shows what the doctor bought so far.
 *   Clinic  a prepaid clinic: credits with what it paid; a clinic paying by invoice: what it paid for a month.
 * `pid` / `onPick` let a table row pre-select a doctor.
 * @param {{ pid: string|null, onPick: (pid: string|null) => void }} props
 */
const TopUpCard = forwardRef(function TopUpCard({ pid, onPick }, ref) {
  const { isDemo } = useAdmin();
  const { dataset: ds } = useAnalytics();
  const actions = useClinicActions();
  const candidates = useCandidates(ds);
  const clinics = ds?.clinics ?? [];
  const [tab, setTab] = useState('doctor');
  const [query, setQuery] = useState('');
  const [clinicId, setClinicId] = useState('');

  // A table row's "Add" opens the doctor tab
  useEffect(() => {
    if (pid) setTab('doctor');
  }, [pid]);

  const chosen = candidates.find((c) => c.pid === pid) ?? null;
  const q = query.trim().toLowerCase();
  const matches = q ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, MAX_MATCHES) : [];
  const payingClinic = chosen?.clinicId ? ds?.clinicById?.get?.(chosen.clinicId) ?? null : null;
  const clinicPays = Boolean(payingClinic && payingClinic.active);
  const clinic = clinics.find((c) => c.id === clinicId) ?? clinics[0] ?? null;

  const tabs = [
    { value: 'doctor', label: t('doctors.topup.tab.doctor') },
    { value: 'clinic', label: t('doctors.topup.tab.clinic') },
  ];

  return (
    <Card ref={ref} padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden" id="add-credits">
      <CardHeader title={t('doctors.topup.title')} right={<Segmented options={tabs} value={tab} onChange={setTab} ariaLabel={t('doctors.topup.title')} />} />
      <p className="-mt-2 mb-5 text-sm font-medium text-ink-soft">{t(tab === 'doctor' ? 'doctors.topup.leadDoctor' : 'doctors.topup.leadClinic')}</p>
      {isDemo && <p className="mb-4 text-sm font-semibold text-ink-mute">{t('doctors.credits.demo')}</p>}

      {tab === 'doctor' && (
        <div className="flex flex-col gap-5">
          <div className="min-w-0 max-w-[520px]">
            <span className={LABEL}>{t('doctors.credits.doctor')}</span>
            {chosen ? (
              <div className="rounded-[16px] border border-line/60 bg-line/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-ink">{chosen.name}</p>
                    <p className="text-xs font-semibold text-ink-mute">{chosen.code}</p>
                  </div>
                  <button type="button" onClick={() => { onPick(null); setQuery(''); }} className={`inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline ${RING}`}>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('doctors.credits.change')}
                  </button>
                </div>
                <DoctorFigures ds={ds} pid={chosen.pid} />
              </div>
            ) : (
              <div className="relative">
                <label className="relative block">
                  <span className="sr-only">{t('doctors.credits.search')}</span>
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('doctors.credits.search')} className={`${INPUT} pl-10`} />
                </label>
                {q && (
                  <ul className="mt-2 overflow-hidden rounded-[16px] border border-line/60 bg-surface">
                    {matches.length === 0 && <li className="px-4 py-3 text-sm font-medium text-ink-mute">{t('doctors.credits.none', { q: query.trim() })}</li>}
                    {matches.map((c) => (
                      <li key={c.pid} className="border-t border-line/40 first:border-t-0">
                        <button type="button" onClick={() => { onPick(c.pid); setQuery(''); }} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-line/20 ${RING}`}>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
                          <span className="text-xs font-semibold text-ink-mute">{c.clinicId ? ds?.clinicById?.get?.(c.clinicId)?.name ?? c.code : c.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {chosen && clinicPays && (
            <p className="text-sm font-semibold text-ink-soft">
              {t('doctors.topup.clinicPays', { clinic: payingClinic.name })}{' '}
              <button type="button" onClick={() => { setClinicId(payingClinic.id); setTab('clinic'); }} className={`font-bold text-brand hover:underline ${RING}`}>
                {t('doctors.topup.toClinic')}
              </button>
            </p>
          )}
          {chosen && !clinicPays && !isDemo && (
            <CreditsForm
              key={chosen.pid}
              presets={[300, 800]}
              target={chosen.name}
              onSubmit={async (credits, priceEur, note) => {
                const data = await actions.addDoctorCredits(chosen.pid, credits, priceEur, note);
                return t('doctors.credits.done', { n: fmt.int(credits), name: chosen.name, balance: fmt.int(data.credits.available) });
              }}
            />
          )}
        </div>
      )}

      {tab === 'clinic' && (
        <div className="flex flex-col gap-5">
          {clinics.length === 0 ? (
            <p className="text-sm font-semibold text-ink-mute">{t('doctors.topup.noClinics')}</p>
          ) : (
            <>
              <label className="block min-w-0">
                <span className={LABEL}>{t('doctors.topup.clinic')}</span>
                <select value={clinic?.id ?? ''} onChange={(e) => setClinicId(e.target.value)} className={SELECT}>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {t(`clinics.billing.${c.billing}`)}
                    </option>
                  ))}
                </select>
                {clinic?.billing === 'prepaid' && (
                  <span className="mt-1.5 block text-xs font-medium text-ink-mute">{t('doctors.topup.clinicLeft', { n: fmt.int(clinic.credits.available) })}</span>
                )}
              </label>
              {clinic && !isDemo && clinic.billing === 'prepaid' && (
                <CreditsForm
                  key={clinic.id}
                  presets={[500, 1500, 5000]}
                  target={clinic.name}
                  onSubmit={async (credits, priceEur, note) => {
                    const data = await actions.addCredits(clinic.id, credits, priceEur, note);
                    return t('clinics.money.done', { n: fmt.int(credits), left: fmt.int(data.credits.available) });
                  }}
                />
              )}
              {clinic && !isDemo && clinic.billing === 'invoice' && (
                <MonthForm key={clinic.id} clinic={clinic} nowMs={ds?.nowMs ?? Date.now()} onSave={(month, eur, note) => actions.savePayment(clinic.id, month, eur, note)} />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
});

export default TopUpCard;
