import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Card, CardHeader } from '../../ui/index.js';
import { reasonOf } from './reason.js';
import { doctorLabel, t } from '../../copy/index.js';
import { INPUT } from './ClinicForm.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const PILL = `relative inline-flex items-center gap-1 h-8 px-3 rounded-full border border-line bg-surface text-xs font-bold text-brand whitespace-nowrap hover:bg-line/20 disabled:opacity-50 after:absolute after:-inset-1 ${RING}`;
const MAX_MATCHES = 8;

/**
 * Search the doctor list and put a doctor into this clinic. A doctor of another clinic is moved, after a
 * question. Only accounts that can sign in are offered.
 * @param {{ clinic: object, ds: object, onAdd: (pid: string) => Promise<unknown> }} props
 */
export default function AddDoctors({ clinic, ds, onAdd }) {
  const [query, setQuery] = useState('');
  const [busyPid, setBusyPid] = useState(null);
  const [message, setMessage] = useState(null);

  const candidates = useMemo(
    () =>
      (ds?.doctorList ?? [])
        .filter((d) => d.exists?.auth && !d.deletedAccount && d.clinicId !== clinic.id)
        .map((d) => ({ pid: d.pid, code: d.code, name: doctorLabel(d), clinicId: d.clinicId ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ds, clinic.id],
  );
  const q = query.trim().toLowerCase();
  const matches = q ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, MAX_MATCHES) : [];
  const clinicName = (id) => ds?.clinicById?.get?.(id)?.name ?? id;

  const add = async (c) => {
    if (c.clinicId && !window.confirm(t('clinics.add.moveConfirm', { name: c.name, from: clinicName(c.clinicId), to: clinic.name }))) return;
    setBusyPid(c.pid);
    setMessage(null);
    try {
      await onAdd(c.pid);
      setMessage({ tone: 'good', text: t('clinics.add.done', { name: c.name }) });
      setQuery('');
    } catch (err) {
      setMessage({ tone: 'bad', text: t('clinics.add.error', { reason: reasonOf(err) }) });
    } finally {
      setBusyPid(null);
    }
  };

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8 print:hidden">
      <CardHeader title={t('clinics.add.title')} />
      <p className="-mt-2 mb-4 text-sm font-medium text-ink-soft">{t('clinics.add.lead')}</p>
      <label className="relative block max-w-[420px]">
        <span className="sr-only">{t('clinics.add.search')}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('clinics.add.search')} className={`${INPUT} pl-10`} />
      </label>
      {q && (
        <ul className="mt-2 max-w-[640px] overflow-hidden rounded-[16px] border border-line/60 bg-surface">
          {matches.length === 0 && <li className="px-4 py-3 text-sm font-medium text-ink-mute">{t('clinics.add.none', { q: query.trim() })}</li>}
          {matches.map((c) => (
            <li key={c.pid} className="flex items-center gap-3 border-t border-line/40 px-4 py-2.5 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                <span className="block text-xs font-medium text-ink-mute">
                  {c.code}
                  {c.clinicId ? ` · ${t('clinics.add.inOther', { clinic: clinicName(c.clinicId) })}` : ''}
                </span>
              </span>
              <button type="button" disabled={busyPid !== null} onClick={() => add(c)} className={PILL}>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t(c.clinicId ? 'clinics.add.move' : 'clinics.add.button')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className={`mt-3 text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
          {message.text}
        </p>
      )}
    </Card>
  );
}
