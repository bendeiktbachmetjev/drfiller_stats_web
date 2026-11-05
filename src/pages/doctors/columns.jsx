import React from 'react';
import { Lock, Mail, Plus } from 'lucide-react';
import { DoctorName, SignedMoney } from '../../ui/index.js';
import { classLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { doctorName } from '../../format/items.js';
import { personButtons, workCountsOf } from '../../data/normalize/workCounts.js';
import ButtonsCell from './ButtonsCell.jsx';

const DAY_MS = 86400000;
const SPECIALTY_MAX = 22;
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';
const PILL = `relative inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors after:absolute after:-inset-1.5 disabled:cursor-not-allowed ${RING}`;

/** The account type as a chip; "Mine / test" in the brand tint so it stands out in the list. */
export function TypeChip({ cls }) {
  const tone = cls === 'internal' ? 'bg-brand/10 text-brand' : 'bg-line/40 text-ink-soft';
  return <span className={`${CHIP} ${tone}`}>{classLabel(cls)}</span>;
}

/**
 * "3 days ago" with a dot: brand under 7 days, warn under 30 days, none after; the exact time in the title.
 * @param {{ ms: number|null, nowMs: number }} props
 */
export function LastActive({ ms, nowMs }) {
  if (!Number.isFinite(ms)) return <span className="text-ink-mute">{t('doctors.last.never')}</span>;
  const age = nowMs - ms;
  let dot = null;
  if (age < 7 * DAY_MS) dot = 'bg-brand';
  else if (age < 30 * DAY_MS) dot = 'bg-warn';
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap" title={t('doctors.last.title', { when: fmt.dateTime(ms) })}>
      {dot && <span aria-hidden="true" className={`w-2 h-2 rounded-full ${dot}`} />}
      {fmt.ago(ms, nowMs)}
    </span>
  );
}

/**
 * The "mine / test" checkbox of one row: locked when the server set it (env or profile), disabled while a
 * save runs; a change saves the new list of marks (PUT settings → rebuild).
 */
export function MineToggle({ row, name, busy, onToggle }) {
  if (row.internal && (row.internalSource === 'env' || row.internalSource === 'profile')) {
    return (
      <span className={`${CHIP} gap-1 bg-line/40 text-ink-soft`} title={t('doctors.mine.lockedTitle')}>
        <Lock className="w-3 h-3" aria-hidden="true" />
        {t('doctors.mine.locked')}
      </span>
    );
  }
  if (row.deletedAccount) return <span className="text-ink-mute">{fmt.empty}</span>;
  const on = row.internal;
  return (
    <label className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full after:absolute after:-inset-1.5 ${busy ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-line/20'}`} title={t(on ? 'doctors.mine.onTitle' : 'doctors.mine.offTitle')}>
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={() => onToggle(row.pid, !on)}
        aria-label={t('doctors.mine.aria', { name })}
        className={`w-4 h-4 accent-brand ${busy ? 'cursor-not-allowed' : 'cursor-pointer'} ${RING}`}
      />
    </label>
  );
}

/** "Show email" (click mode): asks the server once; the answer is kept until the page is left. */
export function EmailButton({ pid, state, onReveal }) {
  if (state?.email) return null;
  return (
    <button
      type="button"
      disabled={state?.loading}
      title={state?.error ? t('doctors.email.error', { reason: state.error }) : undefined}
      onClick={() => onReveal(pid)}
      className={`${PILL} border-line bg-surface text-ink-soft hover:bg-line/20`}
    >
      <Mail className="w-3.5 h-3.5" aria-hidden="true" />
      {t('doctors.email.show')}
    </button>
  );
}

const shortText = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const SELECT = `h-8 max-w-[200px] rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-ink disabled:opacity-50 ${RING}`;

/**
 * Which clinic pays for the doctor: "Own credits" or a clinic. A change asks first, then saves (the page's
 * onChange); a cancelled question leaves the list as it was.
 */
export function ClinicSelect({ pid, name, clinicId, clinics, busy, onChange }) {
  return (
    <select
      value={clinicId ?? ''}
      disabled={busy}
      onChange={(event) => onChange(pid, event.target.value || null)}
      aria-label={t('doctors.clinic.aria', { name })}
      className={SELECT}
    >
      <option value="">{t('doctors.clinic.none')}</option>
      {clinics.map((clinic) => (
        <option key={clinic.id} value={clinic.id}>
          {clinic.name}
        </option>
      ))}
    </select>
  );
}

const MUTED = 'text-ink-mute';

/**
 * The Dr. Filler columns (GET /work-counts, matched by pid): the count each one shows, its phone priority, and
 * whether it starts hidden ("Columns" ticks it on). Their header tooltip says what is counted.
 */
const workColumnList = () => [
  { key: 'presses', header: t('doctors.col.presses'), title: t('doctors.col.presses.title'), priority: 1 },
  { key: 'formsAuto', header: t('doctors.col.formsAuto'), title: t('doctors.col.formsAuto.title') },
  { key: 'inserts', header: t('doctors.col.inserts'), title: t('doctors.col.inserts.title'), defaultHidden: true },
  { key: 'referrals', header: t('doctors.col.referrals'), title: t('doctors.col.referrals.title'), defaultHidden: true },
  { key: 'rxNew', header: t('doctors.col.rxNew'), title: t('doctors.col.rxNew.title') },
  { key: 'rxRep', header: t('doctors.col.rxRep'), title: t('doctors.col.rxRep.title'), defaultHidden: true },
  { key: 'rxSaved', header: t('doctors.col.rxSaved'), title: t('doctors.col.rxSaved.title') },
  { key: 'fillRuns', header: t('doctors.col.fillRuns'), title: t('doctors.col.fillRuns.title') },
  { key: 'services', header: t('doctors.col.services'), title: t('doctors.col.services.title') },
  { key: 'servicesAuto', header: t('doctors.col.servicesAuto'), title: t('doctors.col.servicesAuto.title'), defaultHidden: true },
  { key: 'visitsDone', header: t('doctors.col.visitsDone'), title: t('doctors.col.visitsDone.title'), defaultHidden: true },
  { key: 'formsSaved', header: t('doctors.col.formsSaved'), title: t('doctors.col.formsSaved.title'), defaultHidden: true },
  { key: 'docs', header: t('doctors.col.docs'), title: t('doctors.col.docs.title'), defaultHidden: true },
  { key: 'dx', header: t('doctors.col.dx'), title: t('doctors.col.dx.title'), defaultHidden: true },
  { key: 'workDays', count: 'days', header: t('doctors.col.workDays'), title: t('doctors.col.workDays.title'), defaultHidden: true },
];

/**
 * The Dr. Filler columns, ready for the table: right-aligned numbers, sorted like the other numbers (no count
 * sinks to the bottom). A cell shows "…" while the counts load and "—" without them (not loaded, or nothing
 * counted for this person: the page's note says why). "Buttons" opens the person's list of buttons.
 * @param {{ status: string, counts: import('../../data/normalize/workCounts.js').WorkCounts|null }|null} work useWorkCounts()
 * @param {(row: object) => string} nameOf
 */
function workColumns(work, nameOf) {
  const counts = work?.counts ?? null;
  const loading = !counts && (!work || work.status === 'loading' || work.status === 'idle');
  return workColumnList().map(({ key, count = key, header, title, priority = 2, defaultHidden = false }) => ({
    key,
    header,
    title,
    type: 'int',
    priority,
    group: 'work',
    ...(defaultHidden ? { defaultHidden: true } : {}),
    sortValue: (row) => workCountsOf(counts, row.pid)?.[count] ?? null,
    render: (row) => {
      if (loading) return <span className={MUTED}>…</span>;
      const person = workCountsOf(counts, row.pid);
      if (!person) return <span className={MUTED}>{fmt.empty}</span>;
      if (key === 'presses') return <ButtonsCell total={person.presses} buttons={personButtons(counts, row.pid)} name={nameOf(row)} />;
      return fmt.int(person[count]);
    },
  }));
}

/**
 * Columns of the Doctors table (§4.8) with their phone priorities: p1 = Doctor · Costs · Income · Result ·
 * Last active · Buttons (the phone card lines); p2 and p3 sit behind "More details" on phones. Which columns
 * show is the "Columns" choice (columnChoice.js); `defaultHidden` columns start unticked (the old p3 ones, and
 * the rarer Dr. Filler counts). The Dr. Filler columns (`group: 'work'`) follow Forms.
 * @param {{ ds: object, rows: object[], emailMode: 'off'|'click'|'list', emails: Map<string, object>,
 *   onReveal: (pid: string) => void, busy: boolean, onToggle: (pid: string, on: boolean) => void,
 *   showMonth: boolean, allColumns: boolean, onAddCredits?: (pid: string) => void,
 *   clinic?: { list: object[], busy: boolean, onChange: (pid: string, clinicId: string|null) => void } | null,
 *   work?: { status: string, counts: object|null } | null }} context
 *   allColumns: every column (the picker filters them); false = only the ones shown by default
 *   clinic: the "Clinic" column (left out while the clinic list is not loaded)
 *   work: the period's Dr. Filler counts (useWorkCounts); without it the Dr. Filler columns show "…"
 */
export function doctorColumns({ ds, rows, emailMode, emails, onReveal, busy, onToggle, showMonth, allColumns, onAddCredits, clinic = null, work = null }) {
  const revealed = new Map([...emails].filter(([, state]) => state.email).map(([pid, state]) => [pid, state.email]));
  const nameOf = (row) => doctorName(ds, row.pid, revealed);
  const doctorOf = (row) => {
    const doctor = ds?.doctors?.get?.(row.pid);
    if (!doctor) return { code: row.code, noText: null, email: null, deletedAccount: true };
    const email = revealed.get(row.pid);
    return email ? { ...doctor, email } : doctor;
  };
  const maxShare = Math.max(0, ...rows.map((row) => row.costShare ?? 0));

  const columns = [
    {
      key: 'doctor',
      header: t('doctors.col.doctor'),
      type: 'node',
      priority: 1,
      sortValue: nameOf,
      // A floor width keeps an email on one or two lines when every column is shown; the table scrolls instead.
      render: (row) => (
        <span className="block min-w-[176px]">{row.pid === 'anonymous' ? t('common.doctor.noAccount') : <DoctorName doctor={doctorOf(row)} stacked />}</span>
      ),
    },
    { key: 'class', header: t('doctors.col.type'), type: 'node', priority: 2, sortValue: (row) => classLabel(row.class), render: (row) => <TypeChip cls={row.class} /> },
    {
      key: 'specialty',
      header: t('doctors.col.specialty'),
      type: 'text',
      priority: 3,
      defaultHidden: true,
      render: (row) => (row.specialty ? <span title={row.specialty}>{shortText(row.specialty, SPECIALTY_MAX)}</span> : fmt.empty),
    },
    { key: 'forms', header: t('doctors.col.forms'), type: 'int', priority: 2 },
    ...workColumns(work, nameOf),
    { key: 'recordingMin', header: t('doctors.col.recording'), type: 'minutes', priority: 3, defaultHidden: true },
    { key: 'anamnesisRuns', header: t('doctors.col.runs'), type: 'int', priority: 3, defaultHidden: true },
    { key: 'costEur', header: t('doctors.col.cost'), type: 'eur', priority: 1 },
    ...(showMonth ? [{ key: 'costPerMonthEur', header: t('doctors.col.costMonth'), type: 'eur', priority: 3, defaultHidden: true }] : []),
    { key: 'costShare', header: t('doctors.col.costShare'), type: 'bar', format: 'pct', max: maxShare || 1, priority: 3, defaultHidden: true },
    { key: 'paidNetEur', header: t('doctors.col.income'), type: 'eur', priority: 1 },
    { key: 'resultEur', header: t('doctors.col.result'), type: 'eurSigned', priority: 1, render: (row) => <SignedMoney value={row.resultEur} /> },
    { key: 'balance', header: t('doctors.col.balance'), type: 'int', priority: 3, defaultHidden: true },
    { key: 'audioBankMin', header: t('doctors.col.counter'), type: 'minutes', priority: 3, defaultHidden: true },
    {
      key: 'lastActiveMs',
      header: t('doctors.col.last'),
      type: 'node',
      align: 'right',
      priority: 1,
      sortValue: (row) => row.lastActiveMs,
      render: (row) => <LastActive ms={row.lastActiveMs} nowMs={ds?.nowMs} />,
    },
    { key: 'signupAt', header: t('doctors.col.since'), type: 'date', align: 'right', priority: 3, defaultHidden: true },
    {
      key: 'mine',
      header: t('doctors.col.mine'),
      type: 'node',
      priority: 2,
      sortable: false,
      printHide: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <MineToggle row={row} name={nameOf(row)} busy={busy} onToggle={onToggle} />
          {emailMode === 'click' && !row.deletedAccount && <EmailButton pid={row.pid} state={emails.get(row.pid)} onReveal={onReveal} />}
        </span>
      ),
    },
  ];
  if (clinic) {
    columns.push({
      key: 'clinic',
      header: t('doctors.col.clinic'),
      type: 'node',
      priority: 2,
      printHide: true,
      sortValue: (row) => ds?.clinicById?.get?.(ds?.doctors?.get?.(row.pid)?.clinicId)?.name ?? '',
      render: (row) => {
        const doctor = ds?.doctors?.get?.(row.pid);
        if (!doctor?.exists?.auth) return <span className="text-ink-mute">{fmt.empty}</span>;
        return <ClinicSelect pid={row.pid} name={nameOf(row)} clinicId={doctor.clinicId ?? null} clinics={clinic.list} busy={clinic.busy} onChange={clinic.onChange} />;
      },
    });
  }
  if (onAddCredits) {
    columns.push({
      key: 'addCredits',
      header: t('doctors.col.add'),
      type: 'node',
      priority: 2,
      sortable: false,
      printHide: true,
      render: (row) =>
        ds?.doctors?.get?.(row.pid)?.exists?.auth ? (
          <button
            type="button"
            onClick={() => onAddCredits(row.pid)}
            aria-label={t('doctors.credits.rowAria', { name: nameOf(row) })}
            className={`${PILL} border-line bg-surface text-brand hover:bg-line/20`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('doctors.credits.rowButton')}
          </button>
        ) : (
          <span className="text-ink-mute">{fmt.empty}</span>
        ),
    });
  }
  return allColumns ? columns : columns.filter((column) => !column.defaultHidden);
}
