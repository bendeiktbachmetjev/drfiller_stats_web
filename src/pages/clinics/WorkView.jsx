import React, { useMemo } from 'react';
import { AlertTriangle, Info, Timer } from 'lucide-react';
import { BarList, Card, CardHeader, ChartCard, EmptyState, ErrorBanner, KpiTile, PeriodPicker } from '../../ui/index.js';
import SavedSpentColumns from '../../charts/SavedSpentColumns.jsx';
import { COLORS, SERIES } from '../../charts/theme.js';
import { doctorLabel, t } from '../../copy/index.js';
import { fmt } from '../../format/format.js';
import { STAFF_ROLES, markOf, nationalRates } from '../../data/clinics/staff.js';
import { countingNotes, dailyRows, driverRows, guessedWorkers, hasWork, partsOf, workTiles } from '../../data/clinics/work.js';
import WorkersPicker from './WorkersPicker.jsx';
import StaffEditor from './StaffEditor.jsx';
import WorkHealth from './WorkHealth.jsx';
import { ActivityTable, ButtonsTable, CountsCard, PeopleTable, RoleTable, SpecialtyTable, aboutText, minutesText, signedMinutes } from './WorkTables.jsx';
import { doctorOf } from './ClinicDoctors.jsx';
import { reasonOf } from './reason.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const NOTE = 'flex items-start gap-2 text-sm font-medium text-ink-soft';
const LINK_BUTTON = `ml-1 font-bold text-brand underline-offset-2 hover:underline ${RING}`;
const CARD = 'min-w-0 p-4 sm:p-6 lg:p-8';

/** One line of the parts list: the label, a bar on its side of zero, the signed minutes. */
function PartRow({ label, contribution, max, strong = false }) {
  const width = `${max > 0 ? Math.min(100, (Math.abs(contribution) / max) * 100) : 0}%`;
  return (
    <li className={`grid grid-cols-[minmax(110px,1.1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(160px,260px)_minmax(0,1fr)_auto] items-center gap-x-4 ${strong ? 'min-h-11 border-t border-line py-1.5' : 'min-h-9 py-1'}`}>
      <span className={`text-sm ${strong ? 'font-extrabold text-ink' : 'font-semibold text-ink-soft'} sf-wrap-any`}>{label}</span>
      <span aria-hidden="true" className="relative flex h-2.5">
        <span className="flex flex-1 justify-end">{contribution < 0 && <span className="h-full rounded-l-[4px] bg-cost" style={{ width, minWidth: 2 }} />}</span>
        <span className="-mt-[3px] h-4 w-px bg-ink-mute" />
        <span className="flex flex-1">{contribution > 0 && <span className="h-full rounded-r-[4px] bg-brand" style={{ width, minWidth: 2 }} />}</span>
      </span>
      <span className={`min-w-[96px] text-right text-sm tabular-nums ${strong ? 'font-extrabold text-ink' : 'font-bold text-ink'}`}>{signedMinutes(contribution)}</span>
    </li>
  );
}

/**
 * "Where time was saved and where it was spent" (minutes on both sides of zero): what the work would take by
 * hand on the right, what it took with Dr. Filler on the left, then the time saved.
 */
function PartsCard({ work }) {
  const parts = partsOf(work);
  const max = Math.max(parts.maxAbs, Math.abs(parts.dayRuleMin), 1);
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.parts.title')} hintKey="clinics.work.parts" />
      {/* nothing measured in the period: no rows of "0 min" */}
      {work.parts.length === 0 || work.totals.workDays === 0 ? (
        <p className="text-sm font-medium text-ink-mute">{t('clinics.work.parts.empty')}</p>
      ) : (
        <>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('clinics.work.parts.hand')}</p>
          <ul role="list">
            {parts.hand.map((p) => (
              <PartRow key={p.key} label={p.label} contribution={p.min} max={max} />
            ))}
          </ul>
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('clinics.work.parts.df')}</p>
          <ul role="list">
            {parts.df.map((p) => (
              <PartRow key={p.key} label={p.label} contribution={-p.min} max={max} />
            ))}
            {parts.dayRuleMin !== 0 && <PartRow label={t('clinics.work.parts.dayRule')} contribution={parts.dayRuleMin} max={max} />}
          </ul>
          <ul role="list" className="mt-2">
            <PartRow label={t('clinics.work.parts.net')} contribution={parts.netMin} max={max} strong />
          </ul>
        </>
      )}
    </Card>
  );
}

/** The likely range of the time saved, and the assumptions that move it most (owner only). */
function RangeCard({ work, tiles }) {
  const drivers = driverRows(work).filter((d) => d.swingMin > 0);
  return (
    <Card padding="none" className={CARD}>
      <CardHeader title={t('clinics.work.range.title')} hintKey="clinics.work.range" />
      {work.range && tiles.highMin > 0 ? (
        <>
          <p className="text-base font-bold text-ink">{t('clinics.work.range.line', { low: aboutText(tiles.lowMin), high: aboutText(tiles.highMin) })}</p>
          {drivers.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('clinics.work.range.drivers')}</p>
              <BarList items={drivers.map((d) => ({ key: d.key, label: d.label, value: d.swingMin }))} format={(v) => `± ${minutesText(v)}`} maxRows={6} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm font-medium text-ink-mute">{t('clinics.work.range.none')}</p>
      )}
    </Card>
  );
}

/** "An hour is valued at: Doctor €38.56 · Nurse €20.00 (the clinic's own) …" with a link to the settings. */
function RatesLine({ work, clinic, onEditSettings }) {
  const rates = nationalRates(work?.rates);
  const own = clinic.hourEur ?? {};
  const roles = STAFF_ROLES.filter((role) => (work?.byRole ?? []).some((r) => r.role === role) || Number.isFinite(own[role]));
  const shown = roles.length ? roles : STAFF_ROLES;
  const list = shown
    .map((role) =>
      Number.isFinite(own[role])
        ? t('clinics.work.rates.own', { role: t(`clinics.role.${role}`), eur: fmt.eur(own[role]) })
        : t('clinics.work.rates.national', { role: t(`clinics.role.${role}`), eur: fmt.eur(rates[role].eur) }),
    )
    .join(' · ');
  return (
    <p className={NOTE}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
      <span>
        {t('clinics.work.rates', { list })}
        {onEditSettings && (
          <button type="button" onClick={onEditSettings} className={LINK_BUTTON}>
            {t('clinics.work.rates.edit')}
          </button>
        )}
      </span>
    </p>
  );
}

/**
 * The Work and time view of a clinic (spec v1 §10): the period and the staff to show, the early-estimate
 * banner, the tiles, the likely range, the parts, the chart, the tables (role, specialty, person, activity),
 * what Dr. Filler did, the main buttons, every button, Health, and the staff editor (roles and marks).
 * @param {{ clinic: object, ds: object, period: object, usageReport: object|null,
 *   state: { status: string, work: object|null, error: Error|null, reload: () => void },
 *   workers: string[], onWorkersChange: (pids: string[]) => void, onEditSettings: () => void,
 *   onSetStaff: (pid: string, change: object, specialization: string|null) => Promise<unknown> }} props
 */
export default function WorkView({ clinic, ds, period, usageReport, state, workers, onWorkersChange, onEditSettings, onSetStaff }) {
  const { work, status, error, reload } = state;
  const firstLoad = status === 'loading' && !work;

  // The picker lists the clinic's people now, and the ones who worked here in the period
  const options = useMemo(() => {
    const pids = new Set(clinic.members);
    (usageReport?.doctors ?? []).forEach((row) => {
      if (row.pid !== 'deleted' && row.activeDays > 0) pids.add(row.pid);
    });
    (work?.byWorker ?? []).forEach((row) => {
      if (row.pid !== 'deleted') pids.add(row.pid);
    });
    return [...pids]
      .map((pid) => {
        const doctor = doctorOf(ds, pid);
        const mark = markOf(clinic, pid, doctor);
        const detail = [
          `${t(`clinics.role.${mark.role}`)}${mark.guessed ? ` (${t('clinics.role.guessed')})` : ''}`,
          mark.spec,
          doctor.code && doctor.code !== '—' ? doctor.code : null,
          clinic.members.includes(pid) ? null : t('clinics.staff.left'),
        ].filter(Boolean).join(' · ');
        return { pid, label: doctorLabel(doctor), code: doctor.code ?? null, role: mark.role, detail };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [clinic, ds, usageReport, work]);

  const tiles = work ? workTiles(work) : null;
  const rows = useMemo(() => (work ? dailyRows(work, period) : []), [work, period]);
  const granularity = rows[0]?.granularity ?? period.chart?.granularity ?? 'day';
  const guessed = work ? guessedWorkers(work) : [];
  const counting = work ? countingNotes(work) : null;
  // The saved tile: "—" and its reason when no day of the period was measured (not a measured "≈ 0")
  const savedSub = !tiles
    ? undefined
    : !tiles.measured
      ? t('clinics.work.tile.saved.none')
      : tiles.isZero
        ? t('clinics.work.tile.saved.zero')
        : t('clinics.work.tile.saved.sub', { hand: minutesText(tiles.byHandMin), spent: minutesText(tiles.spentMin) });
  const valueSub = !tiles
    ? undefined
    : !tiles.measured
      ? t('clinics.work.tile.saved.none')
      : t(tiles.valueEur === null || (guessed.length > 0 && !tiles.valueEur) ? 'clinics.work.tile.value.none' : 'clinics.work.tile.value.sub');
  const notOnServer = status === 'error' && error?.status === 404;
  const past = (work?.byWorker ?? []).filter((w) => !w.member);

  const legend = [
    { key: 'hand', label: t('clinics.work.daily.byHand'), color: COLORS.brand, shape: 'rect' },
    { key: 'spent', label: t('clinics.work.daily.spent'), color: SERIES.cost, shape: 'rect' },
    { key: 'saved', label: t('clinics.work.daily.saved'), color: SERIES.result, shape: 'line' },
  ];
  const tableRows = rows.filter((row) => !row.isFuture).map((row) => ({ ...row, when: fmt.bucketTitle(row.key, row.granularity) }));
  const tableColumns = [
    { key: 'when', header: t('clinics.work.daily.col.when'), type: 'text', priority: 1 },
    { key: 'byHandMin', header: t('clinics.work.daily.byHand'), type: 'minutes', format: minutesText, priority: 1 },
    { key: 'spentMin', header: t('clinics.work.daily.spent'), type: 'minutes', format: (v) => minutesText(-v), priority: 1 },
    { key: 'savedMin', header: t('clinics.work.daily.saved'), type: 'minutes', format: signedMinutes, priority: 1 },
  ];

  let body = null;
  if (notOnServer) {
    body = (
      <Card>
        <EmptyState icon={Timer} title={t('clinics.work.empty.title')} hint={t('clinics.work.notOnServer')} />
      </Card>
    );
  } else if (status === 'error' && !work) {
    body = <ErrorBanner message={t('clinics.work.error', { reason: reasonOf(error) })} error={error} onRetry={reload} />;
  } else if (work && !hasWork(work)) {
    body = (
      <Card>
        <EmptyState icon={Timer} title={t('clinics.work.empty.title')} hint={t('clinics.work.empty.hint')} />
      </Card>
    );
  } else if (work || firstLoad) {
    body = (
      <>
        {status === 'error' && work && <ErrorBanner message={t('clinics.work.error', { reason: reasonOf(error) })} error={error} onRetry={reload} />}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          <KpiTile
            label={t('clinics.work.tile.saved')}
            value={tiles && tiles.measured ? tiles.savedMin * 60000 : null}
            valueText={tiles && !tiles.measured ? fmt.empty : tiles?.isZero ? '≈ 0' : undefined}
            format="duration"
            hintKey="clinics.work.tile.saved"
            sub={savedSub}
            wide
            firstLoad={firstLoad}
          />
          <KpiTile
            label={t('clinics.work.tile.value')}
            value={tiles && tiles.measured ? tiles.valueEur ?? null : null}
            valueText={tiles && (!tiles.measured || tiles.valueEur === null) ? fmt.empty : undefined}
            format="eur"
            hintKey="clinics.work.tile.value"
            sub={valueSub}
            firstLoad={firstLoad}
          />
          <KpiTile
            label={t('clinics.work.tile.paid')}
            value={tiles?.paidEur ?? null}
            valueText={tiles && tiles.paidEur === null ? fmt.empty : undefined}
            format="eur"
            hintKey="clinics.work.tile.paid"
            sub={tiles ? (tiles.paidEur === null ? t('clinics.work.tile.paid.free') : tiles.paidPerSavedHourEur !== null ? t('clinics.work.tile.paid.sub', { eur: fmt.eur(tiles.paidPerSavedHourEur) }) : t('clinics.work.tile.paid.subShort')) : undefined}
            firstLoad={firstLoad}
          />
          <KpiTile
            label={t('clinics.work.tile.cost')}
            value={tiles?.costPerSavedHourEur ?? null}
            valueText={tiles && tiles.costPerSavedHourEur === null ? fmt.empty : undefined}
            format="eur"
            hintKey="clinics.work.tile.cost"
            sub={tiles ? t(tiles.costPerSavedHourEur === null ? 'clinics.work.tile.cost.short' : 'clinics.work.tile.cost.sub', { eur: fmt.eur(tiles.ourCostEur) }) : undefined}
            firstLoad={firstLoad}
          />
        </div>

        {work && (
          <>
            <div className="grid gap-6 md:gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <PartsCard work={work} />
              <RangeCard work={work} tiles={tiles} />
            </div>
            <ChartCard
              title={t(`clinics.work.daily.title.${granularity}`)}
              hintKey="clinics.work.daily"
              rows={rows}
              series={[{ key: 'byHandMin', label: t('clinics.work.daily.byHand') }, { key: 'spentMin', label: t('clinics.work.daily.spent') }]}
              dropZeroSeries={false}
              legend={legend}
              table={{ columns: tableColumns, rows: tableRows }}
            >
              <SavedSpentColumns
                rows={rows}
                labels={{ byHand: t('clinics.work.daily.byHand'), spent: t('clinics.work.daily.spent'), saved: t('clinics.work.daily.saved') }}
                ariaLabel={t('clinics.work.daily.aria', { saved: aboutText(tiles.savedMin), spent: minutesText(tiles.spentMin) })}
              />
            </ChartCard>
            {/* The two widest tables get the whole width; the narrow ones share a row */}
            <RoleTable work={work} />
            <PeopleTable work={work} ds={ds} clinic={clinic} />
            <div className="grid gap-6 md:gap-8 xl:grid-cols-2">
              <SpecialtyTable work={work} />
              <ActivityTable work={work} />
            </div>
            <CountsCard work={work} />
            <ButtonsTable work={work} main />
            <ButtonsTable work={work} />
            <WorkHealth work={work} clinic={clinic} ds={ds} workers={workers} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <Card padding="none" className="min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('clinics.work.filters')}>
          <PeriodPicker namesPeriod />
          <WorkersPicker options={options} value={workers} onChange={onWorkersChange} />
          {status === 'loading' && work && <span className="text-xs font-medium text-ink-mute" role="status">{t('clinics.work.loading')}</span>}
        </div>
        <div className="mt-4 grid gap-2">
          <p className="flex items-start gap-2 rounded-[12px] bg-warn-tint px-3 py-2 text-sm font-semibold text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('clinics.work.banner')}
          </p>
          <p className={NOTE}>
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
            <span>
              {clinic.statsShown && clinic.statsFrom
                ? t('clinics.work.shown.from', { date: fmt.date(clinic.statsFrom) })
                : t(clinic.statsShown ? 'clinics.work.shown.on' : 'clinics.work.shown.off')}
              {!clinic.statsShown && (
                <button type="button" onClick={onEditSettings} className={LINK_BUTTON}>
                  {t('clinics.head.edit')}
                </button>
              )}
            </span>
          </p>
          <RatesLine work={work} clinic={clinic} onEditSettings={onEditSettings} />
          {state.clampedFrom && <p className={NOTE}>{t('clinics.work.clamped', { date: fmt.date(state.clampedFrom) })}</p>}
          {work && counting.none && hasWork(work) && <p className={NOTE}>{t('clinics.work.noEvents')}</p>}
          {work && counting.before && <p className={NOTE}>{t('clinics.work.oldDays', { date: fmt.date(work.firstWorkDay) })}</p>}
          {work && counting.notYet && <p className={NOTE}>{t('clinics.work.notYet', { n: fmt.int(work.totals.countsOnlyAfterFirst) })}</p>}
          {guessed.length > 0 && <p className={NOTE}>{t('clinics.work.guessed', { n: fmt.int(guessed.length) })}</p>}
        </div>
      </Card>
      {body}
      <StaffEditor clinic={clinic} ds={ds} past={past} onSet={onSetStaff} />
    </div>
  );
}
