import React, { useMemo, useState } from 'react';
import { Card, CardHeader, DataTable, DoctorName } from '../../ui/index.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { STAFF_ROLES, guessRole, markOf } from '../../data/clinics/staff.js';
import { doctorOf } from './ClinicDoctors.jsx';
import { reasonOf } from './reason.js';
import { PRIMARY } from './ClinicForm.jsx';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const SELECT = `h-9 min-w-0 max-w-full rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink disabled:opacity-50 ${RING}`;
const BOX = `w-4 h-4 accent-brand disabled:opacity-50 ${RING}`;
export const GUESSED_CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap bg-warn/15 text-warn';
const TAG = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-line/40 text-ink-soft';

/** The role picker of one person: "Not set (guess …)" or one of the four roles, with a "guessed" chip. */
function RoleSelect({ mark, name, disabled, onChange }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-2">
      <select
        value={mark.guessed ? '' : mark.role}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={t('clinics.staff.roleAria', { name })}
        className={SELECT}
      >
        <option value="">{t('clinics.role.notSet')}</option>
        {STAFF_ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`clinics.role.${role}`)}
          </option>
        ))}
      </select>
      {mark.guessed && (
        <span className={GUESSED_CHIP} title={t('clinics.role.guessedTitle')}>
          {t('clinics.role.guessed')}: {t(`clinics.role.${mark.role}`)}
        </span>
      )}
    </span>
  );
}

/**
 * The staff list of work statistics (spec v1 §10): each person's role (with a "guessed" chip until it is set),
 * "Shared login: no time saved", "Worker objected: stop work statistics", and "Set for selected" for the role
 * of several people at once. Past workers of the period (from the work answer) can be marked too.
 * Each change is one PATCH /clinics/:id/staff/:pid; the page's data takes it at once.
 * @param {{ clinic: object, ds: object, past?: Array<{ pid: string, role: string|null, guessed: boolean, spec: string|null, ex: boolean, statsOff: boolean }>,
 *   onSet: (pid: string, change: object, specialization: string|null) => Promise<unknown> }} props
 */
export default function StaffEditor({ clinic, ds, past = [], onSet }) {
  const [picked, setPicked] = useState([]);
  const [bulkRole, setBulkRole] = useState('doctor');
  const [busy, setBusy] = useState(null); // pid | 'bulk' | null
  const [message, setMessage] = useState(null); // { tone, text }

  const rows = useMemo(() => {
    const members = clinic.members.map((pid) => {
      const doctor = doctorOf(ds, pid);
      return { key: pid, pid, doctor, member: true, mark: markOf(clinic, pid, doctor) };
    });
    // Past workers: the ones the owner marked here (the clinic's staff list) and the ones with work in the period
    const fromWork = new Map(past.filter((w) => w.pid !== 'deleted').map((w) => [w.pid, w]));
    const pastPids = [...new Set([...Object.keys(clinic.staff ?? {}), ...fromWork.keys()])].filter((pid) => !clinic.members.includes(pid)).sort();
    const former = pastPids.map((pid) => {
      const doctor = doctorOf(ds, pid);
      const w = fromWork.get(pid);
      const mark = clinic.staff?.[pid] || !w
        ? markOf(clinic, pid, doctor)
        : { ...markOf(clinic, pid, doctor), role: w.role ?? guessRole(doctor.specialization), guessed: w.role ? w.guessed : true, spec: w.spec, ex: w.ex, statsOff: w.statsOff, known: true };
      return { key: pid, pid, doctor, member: false, mark };
    });
    return [...members, ...former];
  }, [clinic, ds, past]);

  const nameOf = (row) => doctorLabel(row.doctor);
  const specializationOf = (row) => (typeof row.doctor?.specialization === 'string' ? row.doctor.specialization : null);

  const change = async (row, value) => {
    setBusy(row.pid);
    setMessage(null);
    try {
      await onSet(row.pid, value, specializationOf(row));
      setMessage({ tone: 'good', text: t('clinics.staff.done') });
    } catch (err) {
      setMessage({ tone: 'bad', text: t('clinics.staff.error', { reason: reasonOf(err) }) });
    } finally {
      setBusy(null);
    }
  };

  const toggleObjected = (row, on) => {
    const question = on ? 'clinics.staff.objectedConfirm' : 'clinics.staff.resumeConfirm';
    if (!window.confirm(t(question, { name: nameOf(row) }))) return;
    change(row, { statsOff: on });
  };

  const setForPicked = async () => {
    const targets = rows.filter((row) => picked.includes(row.pid));
    if (!targets.length) return;
    setBusy('bulk');
    setMessage(null);
    let done = 0;
    let failure = null;
    // One request per person, one after another: the server's change limit and the log stay per person
    for (const row of targets) {
      try {
        await onSet(row.pid, { role: bulkRole }, specializationOf(row));
        done += 1;
      } catch (err) {
        failure = failure ?? err;
      }
    }
    setBusy(null);
    if (failure) setMessage({ tone: 'bad', text: t('clinics.staff.doneSome', { done: fmt.int(done), total: fmt.int(targets.length), reason: reasonOf(failure) }) });
    else {
      setPicked([]);
      setMessage({ tone: 'good', text: t('clinics.staff.done') });
    }
  };

  const allPicked = rows.length > 0 && picked.length === rows.length;
  const columns = [
    {
      // The tick box sits in the person's cell, so a phone card (titled by the first column) keeps it
      key: 'person',
      header: t('clinics.staff.col.person'),
      type: 'node',
      priority: 1,
      sortValue: (row) => nameOf(row),
      render: (row) => (
        <span className="flex min-w-[200px] items-start gap-3">
          <input
            type="checkbox"
            checked={picked.includes(row.pid)}
            disabled={busy !== null}
            onChange={() => setPicked((list) => (list.includes(row.pid) ? list.filter((p) => p !== row.pid) : [...list, row.pid]))}
            aria-label={t('clinics.staff.pickAria', { name: nameOf(row) })}
            className={`mt-0.5 shrink-0 print:hidden ${BOX}`}
          />
          <span className="min-w-0">
            <DoctorName doctor={row.doctor} stacked />
            {!row.member && <span className={`${TAG} mt-1`}>{t('clinics.staff.left')}</span>}
          </span>
        </span>
      ),
    },
    { key: 'spec', header: t('clinics.staff.col.spec'), type: 'node', priority: 2, sortValue: (row) => row.mark.spec ?? '', render: (row) => row.mark.spec ?? fmt.empty },
    {
      key: 'role',
      header: t('clinics.staff.col.role'),
      type: 'node',
      priority: 1,
      sortValue: (row) => (row.mark.guessed ? 'z' : STAFF_ROLES.indexOf(row.mark.role)),
      render: (row) => <RoleSelect mark={row.mark} name={nameOf(row)} disabled={busy !== null} onChange={(role) => change(row, { role })} />,
    },
    {
      key: 'ex',
      header: t('clinics.staff.col.shared'),
      type: 'node',
      priority: 1,
      sortValue: (row) => (row.mark.ex ? 1 : 0),
      render: (row) => (
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={row.mark.ex} disabled={busy !== null} onChange={(e) => change(row, { ex: e.target.checked })} aria-label={t('clinics.staff.sharedAria', { name: nameOf(row) })} className={BOX} />
          <span className="hidden xl:inline">{t('clinics.staff.shared')}</span>
        </label>
      ),
    },
    {
      key: 'statsOff',
      header: t('clinics.staff.col.objected'),
      type: 'node',
      priority: 1,
      sortValue: (row) => (row.mark.statsOff ? 1 : 0),
      render: (row) => (
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={row.mark.statsOff} disabled={busy !== null} onChange={(e) => toggleObjected(row, e.target.checked)} aria-label={t('clinics.staff.objectedAria', { name: nameOf(row) })} className={BOX} />
          <span className="hidden xl:inline">{t('clinics.staff.objected')}</span>
        </label>
      ),
    },
  ];

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.staff.title')} hintKey="clinics.staff" />
      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] border border-line/60 bg-line/10 px-4 py-3 print:hidden">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={allPicked} disabled={busy !== null} onChange={() => setPicked(allPicked ? [] : rows.map((row) => row.pid))} className={BOX} />
            {t('clinics.staff.selectAll')}
          </label>
          <span className="text-sm font-medium text-ink-soft">{t('clinics.staff.selected', { n: fmt.int(picked.length) })}</span>
          <span className="inline-flex flex-wrap items-center gap-2 sm:ml-auto">
            <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} disabled={busy !== null} aria-label={t('clinics.staff.roleFor')} className={SELECT}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`clinics.role.${role}`)}
                </option>
              ))}
            </select>
            <button type="button" onClick={setForPicked} disabled={busy !== null || picked.length === 0} className={PRIMARY}>
              {busy === 'bulk' ? t('clinics.staff.saving') : t('clinics.staff.setFor')}
            </button>
          </span>
        </div>
      )}
      {message && (
        <p role="status" className={`mb-3 text-sm font-semibold ${message.tone === 'bad' ? 'text-bad' : 'text-ink-soft'}`}>
          {message.text}
        </p>
      )}
      <DataTable columns={columns} rows={rows} limit={25} emptyText={t('clinics.staff.empty')} caption={t('clinics.staff.title')} />
      <p className="mt-3 text-xs font-medium text-ink-mute">{t('clinics.staff.auto')}</p>
    </Card>
  );
}
