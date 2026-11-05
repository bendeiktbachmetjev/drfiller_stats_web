import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAnalytics, useClinicsMetric } from '../context/AnalyticsContext.jsx';
import { useAdmin } from '../context/AdminContext.jsx';
import { Card, CardHeader, DataTable, EmptyState, ErrorBanner, KpiTile, PageLayout, Segmented } from '../ui/index.js';
import { t } from '../copy/index.js';
import { fmt } from '../format/format.js';
import { clinicReport } from '../data/clinics/report.js';
import AddDoctors from './clinics/AddDoctors.jsx';
import ClinicDoctors from './clinics/ClinicDoctors.jsx';
import ClinicForm, { PRIMARY, SECONDARY, WORK_SETTINGS_ID } from './clinics/ClinicForm.jsx';
import ClinicShare from './clinics/ClinicShare.jsx';
import { ClinicMonths, ClinicTopups } from './clinics/ClinicMoney.jsx';
import WorkView from './clinics/WorkView.jsx';
import { invoiceMonths, wholeMonths } from '../data/clinics/money.js';
import { answerItemsOf, exportTablesOf, workAnswerItemsOf, workExportTablesOf } from './clinics/text.js';
import { useClinicActions, useClinicUsage, useClinicWork } from './clinics/useClinics.js';
import { reasonOf } from './clinics/reason.js';

const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';
const PICK = `inline-flex items-center gap-2 h-10 px-4 rounded-full border text-[14px] font-bold transition-colors ${RING}`;

/** "Invoice" / "Prepaid credits" (+ "Paused") chips of a clinic. */
function ModeChips({ clinic, inverse = false }) {
  return (
    <>
      <span className={`${CHIP} ${inverse ? 'bg-white/20 text-white' : 'bg-line/40 text-ink-soft'}`}>{t(`clinics.billing.${clinic.billing}`)}</span>
      {!clinic.active && <span className={`${CHIP} bg-warn/15 text-warn`}>{t('clinics.paused')}</span>}
    </>
  );
}

/** The clinic's name, mode, price, limit and note, with Edit, Pause / Switch on and Delete. */
function ClinicHead({ clinic, onEdit, onToggleActive, onDelete, busy }) {
  const details = [
    clinic.billing === 'invoice' ? t('clinics.head.markup', { pct: fmt.int(clinic.markupPct) }) : null,
    t('clinics.head.cap', { n: fmt.int(clinic.monthlyCapPerDoctor) }),
    t('clinics.members', { n: fmt.int(clinic.members.length) }),
  ].filter(Boolean);
  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-ink">
            <span className="min-w-0 break-words">{clinic.name}</span>
            <ModeChips clinic={clinic} />
            {clinic.statsShown && <span className={`${CHIP} bg-brand/10 text-brand`}>{t('clinics.head.statsShown')}</span>}
          </h2>
          <p className="mt-1 text-sm font-medium text-ink-soft">{details.join(' · ')}</p>
          {clinic.note && <p className="mt-1 text-sm font-medium text-ink-mute break-words">{clinic.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={onEdit} className={SECONDARY}>
            <Pencil className="mr-1.5 w-3.5 h-3.5" aria-hidden="true" />
            {t('clinics.head.edit')}
          </button>
          <button type="button" disabled={busy} onClick={onToggleActive} className={SECONDARY}>
            {t(clinic.active ? 'clinics.head.pause' : 'clinics.head.resume')}
          </button>
          <button type="button" disabled={busy} onClick={onDelete} className={`${SECONDARY} text-bad`}>
            <Trash2 className="mr-1.5 w-3.5 h-3.5" aria-hidden="true" />
            {t('clinics.head.delete')}
          </button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Tiles: credits used · to invoice (or credits left) · doctors · our cost. The cost and the amount come from the
 * clinic's own rows (fixed per request by the server); paidEur: what the period's months got paid.
 */
function ClinicTiles({ clinic, report, firstLoad, paidEur }) {
  const tt = report.totals;
  const invoice = clinic.billing === 'invoice';
  const amount = tt.amountEur;
  const costEur = tt.costEur;
  const result = invoice ? amount - costEur : null;
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
      <KpiTile
        label={t('clinics.tile.credits')}
        value={tt.credits}
        format="int"
        hintKey="clinics.tile.credits"
        sub={t('clinics.tile.credits.sub', { forms: fmt.int(tt.forms), minutes: fmt.minutes(tt.audioMin) })}
        firstLoad={firstLoad}
      />
      {clinic.billing === 'prepaid' ? (
        <KpiTile
          label={t('clinics.tile.left')}
          value={clinic.credits.available}
          format="int"
          hintKey="clinics.tile.left"
          sub={t('clinics.tile.left.sub', { used: fmt.int(clinic.credits.used), total: fmt.int(clinic.credits.total) })}
          tone={clinic.credits.available <= 0 ? 'bad' : undefined}
        />
      ) : (
        <KpiTile
          label={t('clinics.tile.amount')}
          value={amount}
          format="eur"
          hintKey="clinics.tile.amount"
          sub={t('clinics.tile.amount.sub', { pct: fmt.int(clinic.markupPct), paid: fmt.eur(paidEur) })}
          firstLoad={firstLoad}
        />
      )}
      <KpiTile
        label={t('clinics.tile.doctors')}
        value={clinic.members.length}
        format="int"
        sub={t('clinics.tile.doctors.sub', { n: fmt.int(tt.doctorsWithUsage) })}
      />
      <KpiTile
        label={t('clinics.tile.cost')}
        value={costEur}
        format="eur"
        hintKey="clinics.tile.cost"
        sub={result === null ? undefined : t('clinics.tile.cost.sub', { result: fmt.eurSigned(result) })}
        firstLoad={firstLoad}
      />
    </div>
  );
}

/** The period day by day (the invoice's detail). */
function ClinicDays({ report, priced }) {
  const columns = [
    { key: 'day', header: t('clinics.col.day'), type: 'date', priority: 1 },
    { key: 'doctors', header: t('clinics.col.dayDoctors'), type: 'int', priority: 2 },
    { key: 'forms', header: t('clinics.col.forms'), type: 'int', priority: 2 },
    { key: 'audioMin', header: t('clinics.col.recording'), type: 'minutes', priority: 3 },
    { key: 'credits', header: t('clinics.col.credits'), type: 'int', priority: 1 },
    ...(priced ? [{ key: 'amountEur', header: t('clinics.col.amount'), type: 'eur', priority: 1 }] : []),
  ];
  return (
    <Card padding="none" className="min-w-0 p-4 sm:p-6 lg:p-8">
      <CardHeader title={t('clinics.days.title')} />
      <DataTable columns={columns} rows={report.days.map((row) => ({ ...row, key: row.day }))} defaultSort={{ key: 'day', dir: 'desc' }} limit={14} emptyText={t('common.list.empty')} caption={t('clinics.days.title')} />
    </Card>
  );
}

/**
 * Clinics: the clinics that pay for their doctors. Pick a clinic → its doctors' usage in the period on screen
 * (from the server's per-day rows, the basis of the invoice), add or take out doctors, change the settings,
 * add credits to a prepaid clinic. Who pays and how credits are counted: backend services/billing/README.md.
 */
export default function ClinicsPage() {
  const { isDemo } = useAdmin();
  const { dataset: ds, status } = useAnalytics();
  const metric = useClinicsMetric();
  const { period } = metric;
  const actions = useClinicActions();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(null); // null | 'new' | 'edit'
  const [busy, setBusy] = useState(false);
  const [headError, setHeadError] = useState(null);
  const [picks, setPicks] = useState({}); // clinic id → the people picked in Work and time ([] = everyone)

  const clinics = useMemo(() => ds?.clinics ?? [], [ds]);
  const wanted = params.get('clinic');
  const clinic = clinics.find((c) => c.id === wanted) ?? (clinics.length === 1 ? clinics[0] : null);
  // The clinic's view: usage and invoice (as before) or work and time; kept in the address like the clinic
  const view = params.get('view') === 'work' ? 'work' : 'usage';
  const setView = useCallback(
    (next) =>
      setParams((p) => {
        const out = new URLSearchParams(p);
        if (next === 'work') out.set('view', 'work');
        else out.delete('view');
        return out;
      }, { replace: true }),
    [setParams],
  );
  const workers = useMemo(() => (clinic ? picks[clinic.id] ?? [] : []), [clinic, picks]);
  const pick = useCallback(
    (id) => {
      setMode(null);
      setHeadError(null);
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('clinic', id);
        return next;
      }, { replace: true });
    },
    [setParams],
  );

  const usage = useClinicUsage(clinic?.id ?? null, period.from, period.effTo);
  const report = useMemo(
    () => (clinic && usage.status !== 'idle' ? clinicReport(usage.rows, { members: clinic.members }) : null),
    [clinic, usage.rows, usage.status],
  );
  // An invoice is for whole months: the months card reads every month the period touches in full
  const monthRange = useMemo(() => wholeMonths(period), [period]);
  const monthUsage = useClinicUsage(clinic?.billing === 'invoice' ? clinic.id : null, monthRange.from, monthRange.to);
  const monthReport = useMemo(
    () => (clinic && monthUsage.status !== 'idle' ? clinicReport(monthUsage.rows, { members: clinic.members }) : null),
    [clinic, monthUsage.rows, monthUsage.status],
  );
  const paidEur = clinic && monthReport ? invoiceMonths(monthReport.days, clinic).paidEur : 0;

  // Work statistics load only while their view is open; new marks, rates or members load them again
  const workVersion = useMemo(() => (clinic ? JSON.stringify([clinic.staff, clinic.hourEur, clinic.members]) : ''), [clinic]);
  const workState = useClinicWork(view === 'work' ? clinic?.id ?? null : null, period.from, period.effTo, workers, workVersion);

  const answerItems = useMemo(
    () =>
      view === 'work' && clinic && clinic.active
        ? workAnswerItemsOf({ clinic, work: workState.work, status: workState.status, error: workState.error, period })
        : answerItemsOf({ clinics, clinic, report: usage.status === 'ready' ? report : null, period }),
    [view, clinics, clinic, report, usage.status, period, workState.work, workState.status, workState.error],
  );
  const exportTables = useMemo(
    () => (view === 'work' ? workExportTablesOf({ clinic, work: workState.work, period, ds }) : exportTablesOf({ clinic, report, period, ds })),
    [view, clinic, report, period, ds, workState.work],
  );
  const editSettings = useCallback(() => {
    setMode('edit');
    // The form opens at the top of the clinic: bring its work-statistics part into sight
    setTimeout(() => document.getElementById(WORK_SETTINGS_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }, []);
  // A period longer than the routes take (MAX_QUERY_DAYS) is read from its last 400 days: the line says so
  const readFrom = (view === 'work' ? workState.clampedFrom : usage.clampedFrom) ?? period.from;
  const scopeLine = t('clinics.scopeLine', { range: fmt.range(readFrom, period.isFuture ? period.to : period.effTo), clinic: clinic?.name ?? t('clinics.title') });

  const save = async (body) => {
    if (mode === 'new') {
      const created = await actions.createClinic(body);
      pick(created.id);
    } else {
      await actions.updateClinic(clinic.id, body);
      setMode(null);
    }
  };

  const remove = async () => {
    setHeadError(null);
    if (clinic.members.length) {
      setHeadError(t('clinics.head.deleteHasDoctors', { n: fmt.int(clinic.members.length) }));
      return;
    }
    const left = clinic.billing === 'prepaid' && clinic.credits.available > 0 ? t('clinics.head.deleteCreditsLeft', { n: fmt.int(clinic.credits.available) }) : '';
    if (!window.confirm(`${t('clinics.head.deleteConfirm', { name: clinic.name })}${left ? ` ${left}` : ''}`)) return;
    setBusy(true);
    try {
      await actions.deleteClinic(clinic.id);
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('clinic');
        return next;
      }, { replace: true });
    } catch (err) {
      setHeadError(t('clinics.form.error', { reason: reasonOf(err) }));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    if (clinic.active && !window.confirm(t('clinics.head.pauseConfirm', { name: clinic.name }))) return;
    setBusy(true);
    setHeadError(null);
    try {
      await actions.updateClinic(clinic.id, { active: !clinic.active });
    } catch (err) {
      setHeadError(t('clinics.form.error', { reason: reasonOf(err) }));
    } finally {
      setBusy(false);
    }
  };

  const sourceFailed = ds?.sources?.clinics?.status === 'error';
  let body;
  if (isDemo) {
    body = (
      <Card>
        <EmptyState icon={Building2} title={t('clinics.title')} hint={t('clinics.demo')} />
      </Card>
    );
  } else if (sourceFailed) {
    body = <ErrorBanner message={t('clinics.loadError')} />;
  } else {
    body = (
      <div className="flex flex-col gap-6 md:gap-8">
        {/* Clinic picker */}
        <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label={t('clinics.pick.label')}>
          {clinics.map((c) => {
            const on = clinic?.id === c.id;
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => pick(c.id)} className={`${PICK} ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:bg-line/20'}`}>
                <span className="max-w-[240px] truncate">{c.name}</span>
                <ModeChips clinic={c} inverse={on} />
              </button>
            );
          })}
          <button type="button" onClick={() => setMode('new')} className={`${PRIMARY} ${clinics.length ? 'sm:ml-auto' : ''}`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('clinics.new')}
          </button>
        </div>

        {mode === 'new' && <ClinicForm clinic={null} onSave={save} onCancel={() => setMode(null)} />}

        {!clinics.length && mode !== 'new' && status !== 'loading' && (
          <Card>
            <EmptyState icon={Building2} title={t('clinics.empty.title')} hint={t('clinics.empty.hint')} action={{ label: t('clinics.new'), onClick: () => setMode('new') }} />
          </Card>
        )}

        {clinic && mode !== 'new' && (
          <>
            <ClinicHead clinic={clinic} busy={busy} onEdit={() => setMode(mode === 'edit' ? null : 'edit')} onToggleActive={toggleActive} onDelete={remove} />
            {headError && <p role="status" className="-mt-3 text-sm font-semibold text-bad">{headError}</p>}
            {mode === 'edit' && <ClinicForm key={clinic.id} clinic={clinic} rates={workState.work?.rates} onSave={save} onCancel={() => setMode(null)} />}
            <div className="print:hidden">
              <Segmented
                size="md"
                ariaLabel={t('clinics.view.label')}
                options={[
                  { value: 'usage', label: t('clinics.view.usage') },
                  { value: 'work', label: t('clinics.view.work') },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
            {view === 'work' ? (
              <WorkView
                key={clinic.id}
                clinic={clinic}
                ds={ds}
                period={period}
                usageReport={report}
                state={workState}
                workers={workers}
                onWorkersChange={(pids) => setPicks((all) => ({ ...all, [clinic.id]: pids }))}
                onEditSettings={editSettings}
                onSetStaff={(pid, change, specialization) => actions.setStaff(clinic.id, pid, change, specialization)}
              />
            ) : (
              <>
                {usage.status === 'error' && (
                  <ErrorBanner error={usage.error} onRetry={usage.reload} />
                )}
                {report && <ClinicTiles clinic={clinic} report={report} paidEur={paidEur} firstLoad={usage.status === 'loading' && !usage.rows.length} />}
                {report && <ClinicDoctors clinic={clinic} report={report} ds={ds} onRemove={(pid) => actions.removeMember(clinic.id, pid)} />}
                <AddDoctors clinic={clinic} ds={ds} onAdd={(pid) => actions.addMember(clinic.id, pid)} />
                {clinic.billing === 'prepaid' && (
                  <ClinicTopups clinic={clinic} report={report} grants={ds?.grants ?? []} period={period} onAdd={(n, priceEur, note) => actions.addCredits(clinic.id, n, priceEur, note)} />
                )}
                {clinic.billing === 'invoice' && monthReport && (
                  <ClinicMonths
                    clinic={clinic}
                    report={monthReport}
                    onSave={(month, eur, note) => actions.savePayment(clinic.id, month, eur, note)}
                    onRemove={(month) => actions.removePayment(clinic.id, month)}
                  />
                )}
                <ClinicShare key={clinic.id} clinic={clinic} onCreate={actions.shareClinic} onStop={actions.stopSharing} />
                {report && <ClinicDays report={report} priced={clinic.billing === 'invoice'} />}
                <p className="text-xs font-medium text-ink-mute">{t('clinics.footnote')}</p>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <PageLayout id="clinics" metric={metric} answerItems={answerItems} hiddenNote={null} sources={['clinics']} exportTables={exportTables} scopeLine={scopeLine} scopeSwitch={false}>
      {body}
    </PageLayout>
  );
}
