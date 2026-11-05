import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, DataTable, DoctorName } from '../../ui/index.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { QUALITY_KEYS, healthOf } from '../../data/clinics/work.js';
import { markOf } from '../../data/clinics/staff.js';
import { doctorOf } from './ClinicDoctors.jsx';

const SUBTITLE = 'mb-2 text-sm font-bold text-ink';

/**
 * Health of the work statistics (owner only, spec v1 §7.2): which extension version each person runs and
 * when it last sent its counts, who sent nothing, what the server refused or capped, and the checks against
 * billing (forms booked = form credits per person-day, inserts never above forms, days kept at 30 minutes).
 * @param {{ work: import('../../data/clinics/work.js').WorkReport, clinic: object, ds: object, workers?: string[] }} props
 *   workers: the picked people (empty = everyone): only they can be named as silent
 */
export default function WorkHealth({ work, clinic, ds, workers = [] }) {
  const picked = new Set(workers);
  const members = workers.length ? clinic.members.filter((pid) => picked.has(pid)) : clinic.members;
  // A worker who objected sends nothing, rightly: the clinic's staff marks say so for everyone
  const objectors = clinic.members.filter((pid) => markOf(clinic, pid, doctorOf(ds, pid)).statsOff);
  const health = healthOf(work, members, objectors);
  const person = (pid) => (pid === 'deleted' ? t('clinics.work.tag.deleted') : <DoctorName doctor={doctorOf(ds, pid)} stacked />);
  const nameOf = (pid) => (pid === 'deleted' ? t('clinics.work.tag.deleted') : doctorLabel(doctorOf(ds, pid)));

  const versionColumns = [
    { key: 'pid', header: t('clinics.work.col.person'), type: 'node', priority: 1, sortValue: (row) => nameOf(row.pid), render: (row) => person(row.pid) },
    { key: 'app', header: t('clinics.work.col.version'), type: 'text', priority: 1 },
    { key: 'lastDay', header: t('clinics.work.col.lastDay'), type: 'date', priority: 1 },
  ];
  const mismatchColumns = [
    { key: 'day', header: t('clinics.work.col.day'), type: 'date', priority: 1 },
    { key: 'pid', header: t('clinics.work.col.person'), type: 'node', priority: 1, sortValue: (row) => nameOf(row.pid), render: (row) => person(row.pid) },
    { key: 'gen', header: t('clinics.work.col.gen'), type: 'int', priority: 1 },
    { key: 'billed', header: t('clinics.work.col.billed'), type: 'int', priority: 1 },
  ];

  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.work.health.title')} hintKey="clinics.work.health" />
      {health.allClear && (
        <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <CheckCircle2 className="w-4 h-4 text-brand" aria-hidden="true" />
          {t('clinics.work.health.ok')}
        </p>
      )}
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="min-w-0">
          <h3 className={SUBTITLE}>{t('clinics.work.health.versions')}</h3>
          <DataTable columns={versionColumns} rows={health.versions.map((row) => ({ ...row, key: row.pid }))} limit={10} defaultSort={{ key: 'lastDay', dir: 'desc' }} emptyText={t('common.list.empty')} caption={t('clinics.work.health.versions')} />
          {health.silent.length > 0 && (
            <p className="mt-3 text-sm font-medium text-warn sf-wrap-any">{t('clinics.work.health.silent', { names: health.silent.map(nameOf).join(', ') })}</p>
          )}
        </section>
        <section className="min-w-0">
          <h3 className={SUBTITLE}>{t('clinics.work.health.quality')}</h3>
          <dl className="grid gap-y-1.5">
            {QUALITY_KEYS.map((key) => (
              <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1.5">
                <dt className="text-sm font-medium text-ink-soft">{t(`clinics.work.q.${key}`)}</dt>
                <dd className={`text-sm font-bold tabular-nums ${health.quality[key] > 0 && key !== 'dup' ? 'text-warn' : 'text-ink'}`}>{fmt.int(health.quality[key])}</dd>
              </div>
            ))}
          </dl>
          <h3 className={`${SUBTITLE} mt-6`}>{t('clinics.work.health.checks')}</h3>
          <ul className="grid gap-1.5 text-sm font-medium text-ink-soft" role="list">
            <li className={health.mismatches.length ? 'text-warn font-semibold' : undefined}>
              {health.mismatches.length ? t('clinics.work.health.formsDiffer', { n: fmt.int(health.mismatches.length) }) : t('clinics.work.health.formsMatch')}
            </li>
            <li className={health.insertsOverForms ? 'text-warn font-semibold' : undefined}>{t('clinics.work.health.inserts', { n: fmt.int(health.insertsOverForms) })}</li>
            <li>{t('clinics.work.health.daysCapped', { n: fmt.int(health.daysCapped) })}</li>
          </ul>
          {health.mismatches.length > 0 && (
            <div className="mt-3">
              <DataTable columns={mismatchColumns} rows={health.mismatches.map((row, i) => ({ ...row, key: `${row.day}|${row.pid}|${i}` }))} limit={5} emptyText={t('common.list.empty')} caption={t('clinics.work.health.checks')} />
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
