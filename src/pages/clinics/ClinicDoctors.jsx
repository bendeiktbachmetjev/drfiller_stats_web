import React, { useMemo, useState } from 'react';
import { UserMinus } from 'lucide-react';
import { Card, CardHeader, DataTable, DoctorName } from '../../ui/index.js';
import { reasonOf } from './reason.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const PILL = `relative inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-line bg-surface text-xs font-semibold text-ink-soft whitespace-nowrap hover:bg-line/20 disabled:opacity-50 after:absolute after:-inset-1.5 ${RING}`;

/** The dataset's doctor of a pid, or a stand-in for a deleted account. */
export const doctorOf = (ds, pid) => ds?.doctors?.get?.(pid) ?? { pid, code: pid === 'deleted' ? '—' : pid, email: null, noText: null, deletedAccount: true };

/** The person's role and work-statistics marks in one quiet line (set in Work and time → Staff). */
function StaffLine({ mark }) {
  if (!mark?.role) return null;
  const parts = [`${t(`clinics.role.${mark.role}`)}${mark.guessed ? ` (${t('clinics.role.guessed')})` : ''}`];
  if (mark.ex) parts.push(t('clinics.staff.shared'));
  if (mark.statsOff) parts.push(t('clinics.work.tag.off'));
  return <span className="block text-xs font-medium text-ink-mute">{parts.join(' · ')}</span>;
}

/**
 * The clinic's doctors in the period: credits by kind, what an invoiced clinic pays for each, and "Take out".
 * @param {{ clinic: object, report: object, ds: object, onRemove: (pid: string) => Promise<unknown> }} props
 */
export default function ClinicDoctors({ clinic, report, ds, onRemove }) {
  const [busyPid, setBusyPid] = useState(null);
  const [message, setMessage] = useState(null);
  const priced = clinic.billing === 'invoice';

  const remove = async (row) => {
    const name = doctorLabel(doctorOf(ds, row.pid));
    if (!window.confirm(t('clinics.removeConfirm', { name, clinic: clinic.name }))) return;
    setBusyPid(row.pid);
    setMessage(null);
    try {
      await onRemove(row.pid);
    } catch (err) {
      setMessage(t('clinics.add.error', { reason: reasonOf(err) }));
    } finally {
      setBusyPid(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'doctor',
        header: t('clinics.col.doctor'),
        type: 'node',
        priority: 1,
        sortValue: (row) => doctorLabel(doctorOf(ds, row.pid)),
        render: (row) =>
          row.isTotal ? (
            row.doctor
          ) : (
            <span className="block min-w-[176px]">
              <DoctorName doctor={doctorOf(ds, row.pid)} stacked />
              {!row.member && <span className="block text-xs font-medium text-ink-mute">{t('clinics.doctors.formerly')}</span>}
              <StaffLine mark={clinic.staff?.[row.pid]} />
            </span>
          ),
      },
      { key: 'forms', header: t('clinics.col.forms'), type: 'int', priority: 1 },
      { key: 'audioMin', header: t('clinics.col.recording'), type: 'minutes', priority: 2 },
      { key: 'audioCredits', header: t('clinics.col.recordingCredits'), type: 'int', priority: 2 },
      { key: 'anamnesisCredits', header: t('clinics.col.history'), type: 'int', priority: 2 },
      { key: 'refunded', header: t('clinics.col.refunded'), type: 'int', priority: 3 },
      { key: 'activeDays', header: t('clinics.col.days'), type: 'int', priority: 3 },
      { key: 'credits', header: t('clinics.col.credits'), type: 'int', priority: 1 },
      ...(priced ? [{ key: 'amountEur', header: t('clinics.col.amount'), type: 'eur', priority: 1 }] : []),
      {
        key: 'remove',
        header: t('clinics.col.remove'),
        type: 'node',
        priority: 2,
        sortable: false,
        printHide: true,
        render: (row) =>
          row.member ? (
            <button
              type="button"
              disabled={busyPid !== null}
              onClick={() => remove(row)}
              aria-label={t('clinics.removeAria', { name: doctorLabel(doctorOf(ds, row.pid)) })}
              className={PILL}
            >
              <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('clinics.remove')}
            </button>
          ) : (
            <span className="text-ink-mute">{fmt.empty}</span>
          ),
      },
    ],
    // `remove` reads the latest busy state through busyPid
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds, priced, busyPid, clinic],
  );

  const t0 = report.totals;
  // The doctor column renders the totals row through its own render: isTotal tells it apart
  const footerRow = {
    isTotal: true,
    doctor: t('clinics.doctors.total'),
    forms: t0.forms,
    audioMin: t0.audioMin,
    audioCredits: t0.audioCredits,
    anamnesisCredits: t0.anamnesisCredits,
    refunded: t0.refunded,
    activeDays: null,
    credits: t0.credits,
    amountEur: t0.amountEur,
    remove: null,
  };

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.doctors.title')} hintKey="clinics.doctors" />
      {message && (
        <p role="status" className="mb-3 text-sm font-semibold text-bad">
          {message}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={report.doctors.map((row) => ({ ...row, key: row.pid }))}
        limit={50}
        defaultSort={{ key: 'credits', dir: 'desc' }}
        footerRow={report.doctors.length ? footerRow : undefined}
        emptyText={t('clinics.doctors.empty')}
        caption={t('clinics.doctors.title')}
      />
    </Card>
  );
}
