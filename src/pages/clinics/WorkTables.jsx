import React from 'react';
import { Card, CardHeader, DataTable, DoctorName } from '../../ui/index.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { COUNT_PARTS, countItems, roleRows, specialtyRows, workerFrom } from '../../data/clinics/work.js';
import { doctorOf } from './ClinicDoctors.jsx';
import { GUESSED_CHIP } from './StaffEditor.jsx';

const TAG = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-line/40 text-ink-soft';
const CARD = 'min-w-0 p-4 sm:p-6 lg:p-8';

// A no-break space between the parts of a duration: '6 h 38 min' never breaks inside a table cell
const keep = (text) => text.replace(/ /g, '\u00a0');

/** Minutes as a duration: '13 h 12 min', '45 min', '<1 min'; the sign kept ('−5 min'). */
export const minutesText = (min) => (Number.isFinite(min) ? keep(`${min < 0 ? '−' : ''}${fmt.duration(Math.abs(min) * 60000)}`) : fmt.empty);
/** '≈ 13 h 12 min'; never below zero ('≈ 0'), as every headline time (spec v1 §8.4). */
export const aboutText = (min) => (Number.isFinite(min) && min > 0 ? `≈ ${minutesText(min)}` : '≈ 0');
/** Minutes of one part, with their sign: '+12 min', '−5 min'. */
export const signedMinutes = (min) => (Number.isFinite(min) ? keep(`${min > 0 ? '+' : min < 0 ? '−' : ''}${fmt.duration(Math.abs(min) * 60000)}`) : fmt.empty);

const roleText = (role) => (role ? t(`clinics.role.${role}`) : t('clinics.role.none'));

/**
 * A role and where it comes from: a "guessed" chip (no specialty in the profile: hours, no €), "Set by you" under
 * a role the owner set; the profile's role, the usual case, has no mark.
 */
function RoleCell({ role, guessed, from }) {
  return (
    <span className="block">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span>{roleText(role)}</span>
        {(guessed || from === 'guess') && (
          <span className={GUESSED_CHIP} title={t('clinics.role.guessedTitle')}>
            {t('clinics.role.guessed')}
          </span>
        )}
      </span>
      {from === 'owner' && <span className="block text-xs font-medium text-ink-mute">{t('clinics.role.from.owner')}</span>}
    </span>
  );
}

/** "By role": people, minutes saved, per person a work day, the hour's value, the value. */
export function RoleTable({ work }) {
  const rows = roleRows(work);
  const columns = [
    {
      key: 'role',
      header: t('clinics.work.col.role'),
      type: 'node',
      priority: 1,
      sortValue: (row) => row.role ?? '',
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>{roleText(row.role)}</span>
          {row.guessed > 0 && (
            <span className={GUESSED_CHIP} title={t('clinics.role.guessedTitle')}>
              {t('clinics.work.role.guessedN', { n: fmt.int(row.guessed) })}
            </span>
          )}
        </span>
      ),
    },
    { key: 'workers', header: t('clinics.work.col.workers'), type: 'int', priority: 2 },
    { key: 'savedMin', header: t('clinics.work.col.saved'), type: 'minutes', format: minutesText, priority: 1 },
    { key: 'perWorkerDayMin', header: t('clinics.work.col.perDay'), type: 'minutes', format: minutesText, priority: 2 },
    {
      key: 'rateEur',
      header: t('clinics.work.col.rate'),
      type: 'node',
      align: 'right',
      priority: 2,
      sortValue: (row) => row.rateEur,
      render: (row) => (
        <span>
          {fmt.eur(row.rateEur)}
          {row.own && <span className="block whitespace-nowrap text-xs font-medium text-ink-mute">{t('clinics.work.rate.own')}</span>}
        </span>
      ),
    },
    { key: 'valueEur', header: t('clinics.work.col.value'), type: 'eur', priority: 1 },
  ];
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.roles.title')} />
      <DataTable columns={columns} rows={rows} limit={0} emptyText={t('common.list.empty')} caption={t('clinics.work.roles.title')} />
    </Card>
  );
}

/** "By specialty" ("—" where nobody of the specialty had a measured day). */
export function SpecialtyTable({ work }) {
  const columns = [
    { key: 'spec', header: t('clinics.work.col.spec'), type: 'text', priority: 1 },
    { key: 'workers', header: t('clinics.work.col.workers'), type: 'int', priority: 2 },
    { key: 'savedMin', header: t('clinics.work.col.saved'), type: 'minutes', format: minutesText, priority: 1 },
    { key: 'valueEur', header: t('clinics.work.col.value'), type: 'eur', priority: 1 },
  ];
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.specs.title')} />
      <DataTable columns={columns} rows={specialtyRows(work)} limit={10} emptyText={t('common.list.empty')} caption={t('clinics.work.specs.title')} />
    </Card>
  );
}

/**
 * "By person": the person with their role (and where it comes from) and tags, days, forms (automatic under it),
 * referrals, prescriptions, services, minutes saved, value and what the clinic paid. A worker who objected shows
 * that line instead of the work columns; the billing columns stay.
 * @param {{ work: object, ds: object, clinic?: { staff?: Record<string, object> }|null }} props clinic: its staff
 *   marks tell where a role comes from when the work answer does not say it
 */
export function PeopleTable({ work, ds, clinic = null }) {
  const nameOf = (row) => (row.pid === 'deleted' ? t('clinics.work.tag.deleted') : doctorLabel(doctorOf(ds, row.pid)));
  const off = (row, node) => (row.statsOff ? <span className="text-ink-mute">{fmt.empty}</span> : node);
  // Prescriptions: those made by renewing, as the clinic page's column; the saved ones under them, not
  // added — „Užpildyti visus“ saves the same prescriptions a renewal made, so a sum would count them twice.
  // Erased accounts are one line per role and shared-login mark the owner had set, all with pid 'deleted'
  const rows = work.byWorker.map((row) => ({ ...row, key: row.pid === 'deleted' ? `deleted|${row.role ?? ''}|${row.ex ? 'ex' : ''}` : row.pid }));
  const columns = [
    {
      key: 'person',
      header: t('clinics.work.col.person'),
      type: 'node',
      priority: 1,
      sortValue: nameOf,
      render: (row) =>
        row.isTotal ? (
          row.person
        ) : (
          <span className="block min-w-[176px]">
            {row.pid === 'deleted' ? nameOf(row) : <DoctorName doctor={doctorOf(ds, row.pid)} stacked />}
            <span className="mt-1 flex flex-wrap gap-1">
              {!row.member && row.pid !== 'deleted' && <span className={TAG}>{t('clinics.work.tag.left')}</span>}
              {row.ex && <span className={TAG}>{t('clinics.work.tag.shared')}</span>}
              {row.nt && <span className={TAG}>{t('clinics.work.tag.noTime')}</span>}
            </span>
          </span>
        ),
    },
    { key: 'role', header: t('clinics.work.col.role'), type: 'node', priority: 2, sortValue: (row) => row.role ?? '', render: (row) => (row.isTotal ? null : <RoleCell role={row.role} guessed={row.guessed} from={workerFrom(row, clinic?.staff)} />) },
    { key: 'spec', header: t('clinics.work.col.spec'), type: 'text', priority: 3 },
    { key: 'days', header: t('clinics.work.col.days'), type: 'int', priority: 3 },
    {
      key: 'forms',
      header: t('clinics.work.col.forms'),
      type: 'node',
      align: 'right',
      priority: 1,
      sortValue: (row) => row.forms,
      render: (row) => (
        <span>
          {fmt.int(row.forms)}
          {!row.statsOff && row.formsAuto > 0 && <span className="block whitespace-nowrap text-xs font-medium text-ink-mute">{t('clinics.work.col.auto')}: {fmt.int(row.formsAuto)}</span>}
        </span>
      ),
    },
    { key: 'referrals', header: t('clinics.work.col.referrals'), type: 'node', align: 'right', priority: 3, sortValue: (row) => row.referrals, render: (row) => off(row, fmt.int(row.referrals)) },
    {
      key: 'rx',
      header: t('clinics.work.col.rx'),
      type: 'node',
      align: 'right',
      priority: 3,
      sortValue: (row) => row.rxNew,
      render: (row) =>
        off(
          row,
          <span>
            {fmt.int(row.rxNew)}
            {row.rxSaved > 0 && <span className="block whitespace-nowrap text-xs font-medium text-ink-mute">{t('clinics.work.col.rxSaved')}: {fmt.int(row.rxSaved)}</span>}
          </span>,
        ),
    },
    { key: 'services', header: t('clinics.work.col.services'), type: 'node', align: 'right', priority: 3, sortValue: (row) => row.services, render: (row) => off(row, fmt.int(row.services)) },
    {
      key: 'savedMin',
      header: t('clinics.work.col.saved'),
      type: 'node',
      align: 'right',
      priority: 1,
      sortValue: (row) => (row.statsOff ? null : row.savedMin),
      render: (row) =>
        row.statsOff ? (
          <span className="block max-w-[200px] text-xs font-semibold text-ink-mute">{t('clinics.work.tag.off')}</span>
        ) : row.ex ? (
          <span className="text-ink-mute">{fmt.empty}</span>
        ) : (
          minutesText(row.savedMin)
        ),
    },
    { key: 'valueEur', header: t('clinics.work.col.value'), type: 'eur', priority: 2 },
    { key: 'paidEur', header: t('clinics.work.col.paid'), type: 'eur', priority: 2 },
  ];
  const sum = (key) => work.byWorker.reduce((s, row) => s + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  const valued = work.byWorker.filter((row) => Number.isFinite(row.valueEur));
  const footerRow = {
    isTotal: true,
    person: t('clinics.work.total'),
    role: null,
    spec: null,
    days: null,
    forms: sum('forms'),
    formsAuto: sum('formsAuto'),
    referrals: sum('referrals'),
    // the column's own key (it draws rxNew, with rxSaved under it)
    rx: sum('rxNew'),
    rxNew: sum('rxNew'),
    rxSaved: sum('rxSaved'),
    services: sum('services'),
    // The people's minutes add up to the signed net (the tiles show it as ≈ 0 when below zero); nothing
    // measured in the period is "—", not "0 min"
    savedMin: work.totals.workDays === 0 ? null : work.totals.netMin,
    // Signed too, as the rows: the tile's value stops at 0, this line does not
    valueEur: work.totals.netValueEur ?? (valued.length ? Math.round(sum('valueEur') * 100) / 100 : null),
    // The tile's number: the rounded people would drift by a cent
    paidEur: work.totals.paidEur,
  };
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.people.title')} hintKey="clinics.work.people" />
      <DataTable
        columns={columns}
        rows={rows}
        limit={25}
        defaultSort={{ key: 'savedMin', dir: 'desc' }}
        footerRow={rows.length ? footerRow : undefined}
        emptyText={t('common.list.empty')}
        caption={t('clinics.work.people.title')}
      />
    </Card>
  );
}

/** "By activity": times, minutes saved, minutes each time. */
export function ActivityTable({ work }) {
  const columns = [
    { key: 'label', header: t('clinics.work.col.activity'), type: 'text', priority: 1 },
    { key: 'count', header: t('clinics.work.col.count'), type: 'int', priority: 1 },
    { key: 'savedMin', header: t('clinics.work.col.saved'), type: 'minutes', format: minutesText, priority: 1 },
    { key: 'perUnitMin', header: t('clinics.work.col.perUnit'), type: 'minutes', format: (v) => signedMinutes(v), priority: 2 },
  ];
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.activities.title')} />
      <DataTable columns={columns} rows={work.byActivity.map((row) => ({ ...row, key: row.key }))} limit={0} defaultSort={{ key: 'savedMin', dir: 'desc' }} emptyText={t('common.list.empty')} caption={t('clinics.work.activities.title')} />
    </Card>
  );
}

/** "What Dr. Filler did": every count of the period, and the service codes one by one. */
export function CountsCard({ work }) {
  const items = countItems(work);
  const valueOf = (item) => {
    if (item.value === null) return '–';
    if (item.key === 'audioMin') return minutesText(item.value);
    return fmt.int(item.value);
  };
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.counts.title')} />
      <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1.5">
            <dt className={`text-sm font-medium ${COUNT_PARTS.includes(item.key) ? 'pl-3 text-ink-mute' : 'text-ink-soft'}`}>{t(`clinics.work.count.${item.key}`)}</dt>
            <dd className="text-sm font-bold tabular-nums text-ink">{valueOf(item)}</dd>
          </div>
        ))}
      </dl>
      {work.totals.servicesByCode.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-soft">{t('clinics.work.counts.services')}</p>
          <ul className="mt-2 flex flex-wrap gap-2" role="list">
            {work.totals.servicesByCode.map((row) => (
              <li key={row.code} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-line/40 text-xs font-semibold text-ink-soft">
                <span className="text-ink">{row.code}</span>
                <span>· {fmt.int(row.n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * "Every Dr. Filler button": the ten pressed most, then "Show all". With `main`, "Main buttons": only the buttons
 * that do the work for the person (the server marks them), the same way.
 */
export function ButtonsTable({ work, main = false }) {
  const list = main ? work.buttons.filter((button) => button.main) : work.buttons;
  const copy = main ? 'clinics.work.mainButtons' : 'clinics.work.buttons';
  const max = list[0]?.n ?? 0;
  const columns = [
    {
      key: 'label',
      header: t('clinics.work.col.button'),
      type: 'node',
      priority: 1,
      sortValue: (row) => row.label,
      render: (row) => (
        <span className="block min-w-[160px]">
          {row.label}
          <span className="block font-mono text-xs font-medium text-ink-mute">{row.id}</span>
        </span>
      ),
    },
    { key: 'n', header: t('clinics.work.col.presses'), type: 'bar', format: 'int', max, priority: 1 },
  ];
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t(`${copy}.title`)} hintKey={copy} />
      <DataTable columns={columns} rows={list.map((row) => ({ ...row, key: row.id }))} limit={10} defaultSort={{ key: 'n', dir: 'desc' }} emptyText={t(`${copy}.empty`)} caption={t(`${copy}.title`)} />
    </Card>
  );
}
